# Step 5: analysis-usage-read-routes

## 배경

Step 4에서 `POST /api/analysis/start`를 실제 구현으로 교체하면서, 사용 횟수 조회/차감
로직을 `src/lib/usage.ts`(`getCurrentPeriodMonth`, `getUsageStatus`, `consumeOneAnalysis`)로
분리해뒀다. 이 step은 나머지 두 개의 단순 조회 라우트 `GET /api/analysis/latest`,
`GET /api/usage`를 실제 DB 조회로 교체한다 — 이 step은 쓰기(write)가 없는, 이번 phase에서
가장 단순한 step이다.

이 두 라우트는 **본인 데이터만 읽으므로 RLS를 우회할 이유가 없다** — `createAdminSupabaseClient()`
가 아니라 `createServerSupabaseClient()`(RLS 적용, step 0)를 쓴다. `docs/ARCHITECTURE.md`가
"분석 처리 라우트와 웹훅 핸들러"만 service role을 쓴다고 명시한 것도 이런 이유다 — 단순 조회는
DB 레벨 RLS가 방어선 역할을 하게 두는 게 더 안전하다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "API 인터페이스" 표의 `/api/analysis/latest`, `/api/usage` 행,
  "데이터 모델" 절의 `analysis_results` 테이블 정의.
- `/docs/feature-spec.md` — F-ANJCJR(분석 결과 조회), F-PAOWJD/F-RPFVZX(이용 현황 조회, 특히
  "조회 실패 시 권한을 임의 표시하지 않고 새로고침/재시도 안내" Exception).
- `phases/2-real-integrations/index.json`의 step 0/1/4 `summary` — `src/lib/usage.ts`의
  정확한 함수 시그니처와 `analysis_results` 컬럼명을 확인한다.
- `src/types/analysis.ts`, `src/types/usage.ts` — `AnalysisResult`, `UsageStatus` 타입.
- `src/app/api/analysis/latest/route.ts`, `src/app/api/usage/route.ts` — 현재 mock 구현
  (응답 status 코드 체계는 그대로 유지한다: latest는 없으면 404, usage는 항상 200).

## 작업

### 1. `src/app/api/analysis/latest/route.ts` (GET)

1. `createServerSupabaseClient()`로 `auth.getUser()`. 없으면 401.
2. 같은 클라이언트로 `analysis_results`에서 `user_id = user.id`(PK)인 row를 조회한다(RLS가
   이미 본인 행만 보이도록 강제하지만, 쿼리에도 `.eq('user_id', user.id)`를 명시적으로
   쓴다 — 방어적 이중화).
3. 없으면 404 `{ error: '아직 분석 결과가 없습니다' }`. 있으면 DB 컬럼(snake_case)을
   `AnalysisResult`(camelCase) 형태로 매핑해 200 응답한다(`category_breakdown` →
   `categoryBreakdown`, `generated_at` → `generatedAt` 등).

### 2. `src/app/api/usage/route.ts` (GET)

1. `createServerSupabaseClient()`로 `auth.getUser()`. 없으면 401.
2. `src/lib/usage.ts`의 `getUsageStatus(supabase, user.id)`를 호출해 결과를 그대로 200
   응답한다.

### 공통 규칙

두 라우트 모두 DB 쿼리 실패(네트워크 오류 등)는 `try/catch`로 잡아 500 +
`{ error: '조회 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요' }`로 응답한다(F-PAOWJD
Exception — 실패를 임의의 권한 상태로 보여주지 않는다, CLAUDE.md CRITICAL).

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

`@/services/supabase/server`, `@/lib/usage`를 `vi.mock`으로 모킹해서:

- `/api/analysis/latest`: 인증 없음 → 401. 결과 없음 → 404. 결과 있음 → 200 +
  `AnalysisResult` shape(camelCase 필드 확인).
- `/api/usage`: 인증 없음 → 401. `getUsageStatus`가 반환한 값이 그대로 200 응답되는지.
- 두 라우트 모두 DB 조회가 예외를 던지면 500 + 일반화된 메시지인지.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 두 라우트 모두 admin이 아니라 `createServerSupabaseClient()`(RLS 적용)를 쓰는가?
   - `AnalysisResult` 응답 필드가 camelCase로 정확히 매핑됐는가?
   - 내부 예외를 그대로 노출하지 않는가?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 5 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 두 라우트가 어떤 클라이언트/함수를
     쓰는지 한 줄로 요약.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- `createAdminSupabaseClient()`(service role)를 이 두 라우트에 쓰지 마라. 이유: 위 "배경"에서
  설명했듯 단순 본인 데이터 조회는 RLS로 충분히 방어되고, 불필요하게 RLS를 우회하면 실수로
  다른 사용자 데이터를 노출할 위험만 커진다.
- `src/app/api/analysis/start/`, `src/lib/usage.ts`를 이 step에서 건드리지 마라(둘 다 이미
  완성된 이전 step의 산출물이다 — 재사용만 한다).
- `src/app/dashboard/`를 이 step에서 건드리지 마라. 이유: 화면 연동은 step 6 범위다.
- 기존 테스트를 깨뜨리지 마라.
