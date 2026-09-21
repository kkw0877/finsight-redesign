# Step 4: analysis-start-route

## 배경

이 step은 이번 phase에서 가장 복잡한 step이다. `POST /api/analysis/start`를 실제 Claude API
호출(거래 추출 + 소비 분석)과 실제 DB 쓰기로 교체한다. Step 3에서 업로드는 `analysis_jobs`
row를 `status='pending'`으로 만들어뒀다 — 이 step은 그 row를 받아 `pending→processing→
completed|failed`로 전환시키는 흐름 전체를 책임진다.

**시작하기 전에 `claude-api` skill을 먼저 로드하라** — 이 step은 Anthropic Claude API로
PDF/이미지/CSV에서 구조화된 데이터를 추출하고 분석하는 작업이다. 정확한 모델 ID, 문서/이미지
입력 파라미터 형태, vision 사용법은 학습 데이터가 아니라 그 skill(또는 현재 번들된 문서)이
최신 기준이다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "데이터 흐름 2. 추출 + 분석" 절(순서가 그대로 이 step의 처리
  순서다), "API 인터페이스" 표의 `/api/analysis/start` 행, "도메인 타입" 절의
  `AnalysisResult`.
- `/docs/ADR.md` — ADR-004(추출: 텍스트+이미지 PDF, CSV 인코딩 자동 감지, 결제수단 식별자
  제외), ADR-005(고정 12개 카테고리, 통계 임계값 없는 LLM 판단 기반 이상탐지), ADR-013(부분
  유니크 인덱스), ADR-014(signed URL), ADR-017(동기 처리, 300초, lazy stuck-job 확인 — 이
  ADR을 **정확히** 다시 읽어라, 이 step의 핵심 로직이다).
- `/docs/feature-spec.md` — F-KCOAUD(AI 분석 실행 관리), F-VZZTMF(카테고리별 지출),
  F-LRPAYO(이상 지출 탐지), F-BLDQBC(절약 추천), F-ILHNGA(무료 횟수 차감 규칙).
- `/CLAUDE.md`의 "아키텍처 규칙" — 특히 service role 쿼리 `user_id` 명시 필터, 내부 예외
  비노출.
- `phases/2-real-integrations/index.json`의 step 0/1/3 `summary` — 클라이언트 함수, 정확한
  테이블/컬럼명, `analysis_jobs` insert 시 쓴 컬럼(`source_file_path`,
  `source_file_type` 등)을 확인한다.
- `src/types/analysis.ts`(phase 1에서 생성) — `AnalysisResult`, `Category` 타입 정확한
  필드명.
- `src/app/api/analysis/start/route.ts` — 현재 mock 구현(응답 status 코드 체계 402/409/200을
  그대로 유지한다).

## 작업

### 1. `src/types/api.ts`에 요청 타입 추가

```ts
export interface AnalysisStartRequestBody {
  jobId: string;
}
```

(mock 버전은 요청 바디가 없었다 — 실제 버전은 어떤 업로드된 파일을 분석할지 알아야 하므로
`jobId`가 필요하다. 이 인터페이스 추가 외에 `src/types/api.ts`의 다른 내용은 건드리지
마라.)

### 2. Claude 서비스 래퍼 (`src/services/claude/`)

- `src/services/claude/client.ts`: `createClaudeClient()` 팩토리(step 0의 Supabase
  클라이언트들과 동일한 원칙 — 싱글턴 금지, `ANTHROPIC_API_KEY` 없으면 명확한 에러).
- `src/services/claude/extractTransactions.ts`: 파일(signed URL 또는 바이트)을 받아 거래
  내역 배열(거래일/가맹점명/금액/거래 유형만 — 카드번호·계좌번호 등 결제수단 식별자는 절대
  포함하지 않는다, ADR-004)을 반환하는 함수. CSV는 UTF-8로 먼저 디코드를 시도하고 실패하면
  EUC-KR/CP949로 재시도한다(새 의존성 추가 없이 Node의 `TextDecoder`로 시도 — 그래도 안
  되면 `iconv-lite`를 추가해도 된다, 다만 새 의존성은 정말 필요할 때만 추가). PDF(텍스트
  기반/이미지 스캔본 모두)는 Claude의 문서/vision 입력으로 처리한다.
- `src/services/claude/analyzeSpending.ts`: 추출된 거래 내역을 받아 `AnalysisResult`의
  `summary`/`categoryBreakdown`/`anomalies`/`recommendations`를 생성하는 함수(`generatedAt`은
  라우트에서 채운다). 카테고리는 `Category` 타입의 고정 12개 중에서만 나오도록 프롬프트로
  강제하고, 응답을 파싱할 때도 그 12개 밖의 값이 오면 방어적으로 처리한다(예: `기타`로
  귀속). 이상 지출이 없으면 빈 배열, 추천은 최소 1개 이상 생성하도록 프롬프트에 명시한다
  (F-BLDQBC — 분석 대상 거래가 아예 없으면 이 함수가 억지로 추천을 만들지 않고 그 사실을
  알 수 있는 형태로 반환해도 된다, 호출부에서 처리).

두 함수 모두 Claude 응답이 기대한 JSON 구조와 다르면(파싱 실패) 에러를 던진다 — 호출부가
잡아서 job을 `failed`로 처리한다.

### 3. `src/app/api/analysis/start/route.ts` 처리 순서

`export const maxDuration = 300`은 유지한다. 순서는 ADR-017을 그대로 따른다:

1. `createServerSupabaseClient()`로 `auth.getUser()`. 없으면 401.
2. 요청 바디를 `AnalysisStartRequestBody`로 파싱. `jobId` 없으면 400.
3. **잔여 횟수 확인**(무료/구독 잔여 계산 로직은 4번 항목 참고) — 0이면 402 +
   `{ error: '무료/구독 분석 횟수를 모두 사용했습니다' }`(기존 mock 메시지 유지).
4. admin 클라이언트로 `analysis_jobs`에서 `id=jobId AND user_id=user.id`인 row를 조회한다.
   - 없으면 404 `{ error: '업로드된 파일을 찾을 수 없습니다. 다시 업로드해 주세요' }`.
   - 있는데 `status !== 'pending'`이면 409 `{ error: '이미 처리되었거나 처리 중인
     파일입니다' }`.
5. **동시 요청 방지(ADR-013/ADR-017)**: 같은 `user_id`로 `status='processing'`인 다른 row가
   있는지 조회한다.
   - 있고 `updated_at`이 300초 이상 지났으면 → 그 row를 `status='failed'`,
     `error_message='처리 시간 초과'`로 갱신하고 계속 진행한다(lazy 재수거, ADR-017).
   - 있고 300초 이내면 → 409 `{ error: '이미 처리 중인 분석이 있습니다' }`(CLAUDE.md에
     나온 정확히 그 문구).
6. 4번에서 찾은 job을 `status='processing'`, `updated_at=now()`로 UPDATE한다. 이 UPDATE가
   ADR-013의 부분 유니크 인덱스 위반(Postgres unique_violation, 에러 코드 `23505`)으로
   실패하면 — 5번 사이에 경합이 있었다는 뜻이다 — 409로 동일한 메시지를 응답한다(다른
   에러는 500으로 일반화).
7. admin 클라이언트로 `card-statements` 버킷의 `job.source_file_path`에 대해 짧은 만료
   시간(예: 60초)의 signed URL을 발급한다(ADR-014 — 이미 4번에서 `user_id` 소유권을
   확인했으므로 이 시점엔 추가 확인 불필요).
8. `extractTransactions(...)` → `analyzeSpending(...)`을 순서대로 호출한다. 거래 내역이
   비어 있으면(F-BLDQBC의 "분석할 지출 내역이 없습니다" 케이스) 그 사실이 드러나는 결과를
   만들되 실패로 처리하지 않는다(정상 완료로 취급 — 사용 횟수는 정상 차감).
9. 성공 시:
   - `analysis_results`에 `user_id`(PK) 기준 upsert(`job_id`, `summary`,
     `category_breakdown`, `anomalies`, `recommendations`, `generated_at` = now()) —
     ADR-007(새 결과가 이전 결과를 덮어씀).
   - `analysis_jobs` row를 `status='completed'`, `updated_at=now()`로 갱신.
   - 사용 횟수 차감(아래 4번 로직) — **이 지점 이후에만** 차감한다.
   - `AnalysisResult`를 200으로 응답.
10. 실패(Claude 호출/파싱 예외, signed URL 발급 실패 등) 시:
    - `analysis_jobs` row를 `status='failed'`, `error_message=<사용자에게 보여줄 일반화된
      메시지>`, `updated_at=now()`로 갱신을 **시도**한다(이 갱신 자체가 실패해도 무시하고
      계속 진행 — 다음 요청의 lazy 재수거가 최종 안전장치다, ADR-017).
    - 사용 횟수는 차감하지 않는다.
    - 500 `{ error: '분석 처리 중 문제가 발생했습니다' }`로 응답한다(내부 예외 메시지를
      그대로 넣지 않는다, CLAUDE.md CRITICAL).

### 4. 사용 횟수 확인/차감 로직 — `src/lib/usage.ts` 공용 모듈로 만든다

이 로직은 다음 step(5번, `GET /api/usage`)에서도 그대로 재사용해야 하므로, route.ts에
인라인으로 넣지 말고 `src/lib/usage.ts`에 아래 함수들로 뽑아낸다(phase 1 mock
fixture(`usageFixture.ts`)의 함수 이름과 의도적으로 맞췄다 — 이번엔 in-memory 대신 실제
`usage_monthly`/`subscriptions` 테이블을 조회/갱신한다):

```ts
export function getCurrentPeriodMonth(): string   // KST 기준 'YYYY-MM' (하드코딩 금지)
export async function getUsageStatus(
  supabase: SupabaseClient, userId: string
): Promise<UsageStatus>   // src/types/usage.ts의 UsageStatus 그대로 채워 반환
export async function consumeOneAnalysis(
  supabase: SupabaseClient, userId: string
): Promise<void>   // 정상 완료된 분석에 대해서만 호출 — 무료 우선 차감, 없으면 구독분 차감
```

`getCurrentPeriodMonth()`는 `Date`에 KST 오프셋(UTC+9)을 직접 적용하거나
`Intl.DateTimeFormat`의 `timeZone: 'Asia/Seoul'`로 계산한다.

`getUsageStatus()` 내부 로직:
- `usage_monthly`에서 `(user_id, period_month)` row를 조회한다(없으면 `free_used_count=0`,
  `subscription_used_count=0`으로 취급).
- `subscriptions`에서 `user_id`의 `status`/`current_period_end`를 조회한다.
- `UsageStatus`의 `freeRemaining`/`subscriptionRemaining`/`subscriptionStatus`/
  `currentPeriodEnd` 등 모든 필드를 계산해 채운다(`subscriptionLimit`은 `status==='active'`
  일 때 2, 아니면 0 — F-UXSBGF).

`route.ts`에서는 `getUsageStatus(...)` 결과의 `freeRemaining + subscriptionRemaining <= 0`이면
잔여 없음(402)으로 판단한다. `consumeOneAnalysis()`는 내부적으로 `free_used_count < 2`면
`free_used_count`를 +1, 아니면 `subscription_used_count`를 +1 하고 `usage_monthly` row가
없으면 upsert로 새로 만든다 — **정상 완료된 경우에만** route.ts가 이 함수를 호출한다.

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

테스트는 `@/services/supabase/{server,admin}`와 `@/services/claude/{extractTransactions,
analyzeSpending}`을 `vi.mock`으로 모킹해서(실제 Claude/Supabase 네트워크 호출 없이) 아래를
검증한다:

- 인증 없음 → 401. `jobId` 없음 → 400.
- 잔여 횟수 0 → 402, job/사용량 테이블에 아무 쓰기도 없었는지.
- 존재하지 않는 jobId → 404. 이미 `completed`인 job → 409.
- 다른 job이 `processing`이고 `updated_at`이 최근(< 300초) → 409, 대상 job은 여전히
  `pending`인지.
- 다른 job이 `processing`이고 `updated_at`이 오래됨(≥ 300초) → 그 job이 `failed`로
  갱신된 뒤 대상 job이 정상 진행되는지.
- Claude 호출 성공 → 200 + `AnalysisResult` shape, `analysis_results` upsert와 `analysis_jobs`
  `completed` 갱신, 사용 횟수 차감이 모두 호출됐는지.
- Claude 호출 실패(mock이 reject) → 500, `analysis_jobs`가 `failed`로 갱신 시도되는지, 사용
  횟수는 차감되지 않는지.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 처리 순서가 ADR-017과 정확히 일치하는가(잔여 확인 → job 조회 → lazy stuck-job 확인 →
     processing 전환 → 추출/분석 → 결과 저장/차감)?
   - 추출 결과에 카드번호/계좌번호 등 결제수단 식별자가 절대 포함되지 않는가(ADR-004)?
   - 실패 시 사용 횟수가 차감되지 않는가(F-ILHNGA)?
   - 모든 admin 클라이언트 쿼리가 `user_id`를 명시적으로 필터링하는가(CLAUDE.md CRITICAL)?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 4 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 새로 만든 서비스 파일 경로와 사용 모델을
     한 줄로 요약.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요(예: `ANTHROPIC_API_KEY` 인증 실패) → `"status": "blocked"`,
     `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- 거래 추출 결과에 카드번호·계좌번호 등 결제수단 식별자를 포함하지 마라. 이유: ADR-004
  데이터 최소화 원칙 위반.
- `Category`를 고정 12개 밖의 값으로 저장하지 마라. 이유: 대시보드 카테고리 색상 순환
  로직(ADR-005)이 정확히 12개를 전제한다.
- `src/app/api/analysis/latest/`, `src/app/api/usage/`, `src/app/dashboard/`를 이 step에서
  건드리지 마라. 이유: 그건 각각 step 5, step 6 범위다.
- Storage 통계 임계값 기반 이상 탐지 로직(표준편차 등)을 추가하지 마라. 이유: ADR-005가
  "별도 통계 로직 없이 LLM이 직접 판단"하기로 명시적으로 결정했다.
- 기존 테스트를 깨뜨리지 마라.
