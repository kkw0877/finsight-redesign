# Step 1: analysis-routes

## 배경

Finsight phase `1-api-skeleton`의 목표는 `docs/ARCHITECTURE.md`의 "API 인터페이스" 표에
정의된 라우트들을 실제 Supabase/Claude 호출 없이 고정 mock 데이터로 응답하는 스켈레톤으로
구현하는 것이다. 이전 step(0번, `types-fixtures`)에서 도메인 타입(`src/types/analysis.ts`,
`src/types/usage.ts`, `src/types/api.ts`)과 mock 데이터/상태 fixture 모듈
(`src/lib/fixtures/analysisFixture.ts`, `src/lib/fixtures/usageFixture.ts`)을 이미 만들어
뒀다 — 이 step에서는 그 위에 실제 업로드/분석/이용현황 API 라우트 4개를 구현한다.

이 프로젝트는 아직 로그인이 완전히 mock이라(실제 세션 없음), 이번 phase의 API 라우트들은
별도 인증 체크 없이 항상 동일한 mock 유저를 대상으로 응답한다 — 실제 Supabase Auth 세션
검증은 다음 phase(실제 외부 서비스 연동) 범위다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 특히 "API 인터페이스" 표(`/api/upload`, `/api/analysis/start`,
  `/api/analysis/latest`, `/api/usage` 행)와 "데이터 흐름" 절의 1~3번(업로드/추출+분석/결과
  조회)
- `/docs/ADR.md` — ADR-013(동시 분석 요청 방지), ADR-017(동기 처리, `maxDuration=300`,
  processing job 지연 확인 lazy check)
- `/docs/feature-spec.md` — F-ILFWKT(업로드 검증), F-KCOAUD(분석 실행), F-ILHNGA(무료 횟수),
  F-PAOWJD/F-RPFVZX(이용 현황)
- `/CLAUDE.md`의 "아키텍처 규칙" 절 — 특히 "내부 예외 메시지·스택 트레이스를 사용자에게
  그대로 노출하지 않는다" CRITICAL 규칙
- `src/types/analysis.ts`, `src/types/usage.ts`, `src/types/api.ts` — 이전 step에서 만든
  타입. 정확한 필드명은 이 파일들을 직접 읽고 확인하라(이 문서에 적은 이름과 실제 구현이
  다를 수 있으니 소스가 항상 우선).
- `src/lib/fixtures/analysisFixture.ts`, `src/lib/fixtures/usageFixture.ts` — 이전 step에서
  만든 fixture 모듈의 실제 export 함수 시그니처를 확인하고 그대로 사용하라.

## 작업

Next.js App Router의 Route Handler 관례에 따라 아래 4개 파일을 만든다. 각 파일은
`export async function GET(request: Request)` 또는 `POST(request: Request)`를 export한다.

### 1. `src/app/api/upload/route.ts` (POST)

- `request.formData()`로 업로드된 파일을 받는다(필드명은 `file`로 가정).
- 검증(F-ILFWKT): 확장자가 `.csv` 또는 `.pdf`가 아니면 400, 파일 크기가 20MB(`20 * 1024 *
  1024` 바이트)를 초과하면 400 — 두 경우 모두 사용자에게 "지원 형식 안내"에 해당하는 이해
  가능한 한글 메시지를 `{ error: string }` 형태로 응답한다(feature-spec 원문처럼 CSV/PDF
  지원, 20MB 제한을 언급하는 문구).
- 실제 Storage 저장은 하지 않는다(다음 phase 범위) — 검증만 통과하면 `crypto.randomUUID()`
  등으로 만든 `jobId`와 원본 `fileName`을 `{ jobId, fileName }` (`UploadResponse` 타입)로
  200 응답한다.
- 이 라우트는 `analysisFixture`의 processing/latest 상태를 건드리지 않는다 — 그건
  `/api/analysis/start`의 책임이다.

### 2. `src/app/api/analysis/start/route.ts` (POST)

ADR-017에 따라 이 라우트는 실행 시간이 길어질 수 있다는 전제로 설계됐다(실제로는 mock이라
즉시 끝나지만, 계약을 맞추기 위해 `export const maxDuration = 300`을 파일에 선언한다).

처리 순서:
1. `usageFixture`의 `hasRemainingAnalysis()`로 잔여 횟수를 확인한다 — `false`면 402
   Payment Required로 `{ error: string }` 응답("무료/구독 분석 횟수를 모두 사용했습니다" 취지
   의 한글 메시지, F-ILHNGA/F-RPFVZX).
2. `analysisFixture`의 `isProcessing()`으로 이미 처리 중인 job이 있는지 확인한다 — `true`면
   409 Conflict로 `{ error: string }` 응답("이미 처리 중인 분석이 있습니다", ADR-013/CLAUDE.md
   에 나온 정확히 그 예시 문구를 참고).
3. 통과하면 `startProcessing()`을 호출하고, `analysisFixture`의 `MOCK_ANALYSIS_RESULT`를
   기반으로 결과를 만든다(매 호출 `generatedAt`은 현재 시각으로 갱신 — 다른 필드는 고정
   mock 값 그대로 둬도 된다).
4. `usageFixture`의 `consumeOneAnalysis()`로 사용 횟수를 차감한다 — **정상 완료된 경우에만**
   차감한다(F-ILHNGA, F-BLDQBC의 "정상 완료 시에만" 규칙을 지킨다. 1·2번에서 이미
   return했다면 여기 도달하지 않으므로 자동으로 지켜진다).
5. `analysisFixture`의 `setLatestResult(result)`로 최신 결과를 저장한다(ADR-007: 새 분석
   완료 시 이전 결과를 덮어씀).
6. `finishProcessing()`을 호출해 processing 플래그를 해제한다.
7. 만든 `AnalysisResult`를 그대로 200 응답한다.

**중요**: 3~6번 사이에서 예외가 발생하더라도(이번 mock 구현에서는 사실상 발생하지 않지만)
`finishProcessing()`이 반드시 호출되도록 `try/finally`로 감싸라 — 그렇지 않으면 processing
플래그가 영원히 `true`로 남아 이후 모든 요청이 409를 받게 된다(ADR-017이 실제 DB 버전에서
"지연 확인으로 실패 처리"라는 안전장치를 두는 것과 같은 이유).

### 3. `src/app/api/analysis/latest/route.ts` (GET)

- `analysisFixture`의 `getLatestResult()`를 호출한다.
- 결과가 있으면 `AnalysisResult`를 200으로 응답.
- 없으면 404로 `{ error: string }` 응답("아직 분석 결과가 없습니다" 취지).

### 4. `src/app/api/usage/route.ts` (GET)

- `usageFixture`의 `getUsageStatus()`를 호출해 `UsageStatus`를 그대로 200 응답한다.

### 공통 규칙

- 모든 라우트는 예외를 잡아 사용자 이해 가능한 메시지로 응답해야 한다 — 내부 에러 객체나
  스택 트레이스를 그대로 응답 바디에 넣지 않는다(CLAUDE.md CRITICAL 규칙). `try/catch`로
  감싸고 실패 시 500 + `{ error: '분석 처리 중 문제가 발생했습니다' }` 같은 일반화된 메시지를
  쓴다.
- 응답은 모두 `Response.json(...)` (또는 Next.js의 `NextResponse.json(...)`, 기존 프로젝트에
  Next.js 버전이 App Router 최신이므로 `next/server`의 `NextResponse`를 써도 무방하다 —
  일관되게 하나만 골라 4개 라우트에 동일하게 적용한다) + 적절한 `status` 코드로 만든다.

### 5. 테스트 작성 (TDD)

CLAUDE.md CRITICAL 규칙에 따라 각 라우트의 Route Handler 함수를 직접 호출하는 테스트를
작성한다(`vitest` + `Request` 객체를 직접 만들어 호출, Next.js 서버를 띄우지 않고 export된
함수를 단위 테스트하듯 호출). 최소한 아래를 검증한다:

- `/api/upload`: 확장자가 잘못된 파일 → 400, 20MB 초과 파일 → 400, 유효한 `.csv` 파일 →
  200 + `jobId` 존재.
- `/api/analysis/start`: 잔여 횟수가 있을 때 → 200 + `AnalysisResult` shape, 호출 후
  `/api/usage`에 해당하는 fixture 함수가 차감된 값을 반환하는지, 잔여 0일 때 → 402, 이미
  processing 중일 때 → 409.
- `/api/analysis/latest`: 아직 결과 없을 때 → 404, `analysisFixture.setLatestResult()`로
  값을 심어둔 뒤 → 200 + 그 값.
- `/api/usage`: 200 + `UsageStatus` shape(필드 존재 여부).

각 테스트 파일에서 `usageFixture`/`analysisFixture`의 in-memory 상태가 테스트 간에 공유되어
서로 간섭하지 않도록, 필요하면 fixture 모듈에 테스트 전용 리셋 함수를 추가하거나(예:
`__resetForTest()`) `beforeEach`에서 모듈을 다시 import하는 방식(vitest의 `vi.resetModules()`)
을 쓴다 — 이전 step에서 그런 리셋 함수가 없다면 이 step에서 최소한으로 추가해도 된다(테스트
전용 유틸이므로 프로덕션 코드 경로에는 영향 없음).

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # ESLint 통과
npm test        # vitest 통과 (이번 step에서 추가한 라우트 테스트 포함, 이전 step 테스트도 계속 통과)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/app/api/upload/`, `src/app/api/analysis/start/`, `src/app/api/analysis/latest/`,
     `src/app/api/usage/`에만 새 파일을 추가했는가?
   - `/api/analysis/start`에 `maxDuration = 300`이 선언되어 있는가(ADR-017)?
   - 모든 응답이 내부 예외를 그대로 노출하지 않고 사용자 이해 가능한 메시지로 매핑되어
     있는가(CLAUDE.md CRITICAL)?
   - 정상 완료된 분석에 대해서만 사용 횟수가 차감되는가(F-ILHNGA)?
3. 결과에 따라 `phases/1-api-skeleton/index.json`의 step 1 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 만든 라우트 파일 목록과 각 라우트의
     성공/실패 응답 status 코드를 한 줄로 요약(다음 step에서 프론트가 이 status 코드로
     분기해야 한다).
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- Supabase/Claude API를 실제로 호출하는 코드를 넣지 마라. 이유: 이번 phase는 mock 스켈레톤
  단계이고, 실제 외부 서비스 연동은 다음 phase 범위다.
- 로그인 세션(쿠키/JWT 등)을 검증하는 코드를 넣지 마라. 이유: 로그인 자체가 아직 완전히
  fake라 검증할 실제 세션이 없다 — 인증 체크는 다음 phase에서 실제 Supabase Auth와 함께
  추가한다.
- `src/app/dashboard/`, `src/app/billing/`, `src/app/api/subscription/`,
  `src/app/api/webhooks/`를 이 step에서 건드리지 마라. 이유: 화면 연동은 step 3~4, 구독
  라우트는 step 2 범위다.
- 응답 바디에 `error.message`나 `error.stack`을 그대로 넣지 마라. 이유: CLAUDE.md CRITICAL
  규칙 위반 — 내부 예외를 사용자에게 노출하면 안 된다.
- 기존 테스트(step 0에서 만든 fixture 테스트 포함)를 깨뜨리지 마라.
