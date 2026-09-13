# Step 3: dashboard-integration

## 배경

Finsight phase `1-api-skeleton`의 목표는 `docs/ARCHITECTURE.md`에 정의된 API 라우트들을
mock 스켈레톤으로 구현하고, 화면의 `setTimeout` 시뮬레이션을 실제 `fetch` 호출로 교체해
API 계약(요청/응답 shape)이 화면과 맞는지 검증하는 것이다. 이전 step들에서:

- step 0: `src/types/{analysis,usage,api}.ts` 도메인 타입, `src/lib/fixtures/{analysisFixture,
  usageFixture}.ts` mock 상태 모듈을 만들었다.
- step 1: `src/app/api/{upload,analysis/start,analysis/latest,usage}/route.ts` 라우트를
  만들었다.
- step 2: `src/app/api/subscription/{checkout,cancel}/route.ts` 라우트를 만들었다.

이 step에서는 `src/app/dashboard/page.tsx`(현재 클라이언트 컴포넌트, 하드코딩 mock 데이터 +
`setTimeout`으로 업로드→분석중→결과 흐름을 시뮬레이션 중)를 실제 `fetch` 호출로 교체한다.

**중요한 설계 상 결정**: 현재 `dashboard/page.tsx`의 mock 데이터(`CATEGORIES`, `ANOMALIES`,
`RECOMMENDATIONS` 등)는 영문 필드명(`name`, `pct`, `title`, `desc`)과 영문 카테고리명을
쓰지만, `docs/ARCHITECTURE.md`가 확정한 `AnalysisResult` 타입(그리고 step 0에서 그대로
이식한 `src/types/analysis.ts`)은 한글 12개 고정 카테고리와 `ratio`/`description`/
`relatedTransactions`/`reason`/`note`/`text`/`basis` 필드명을 쓴다. 이번 phase에서는 문서
타입을 그대로 채택하기로 이미 결정했으므로, **이 step에서 렌더링 코드를 그 필드명/카테고리
표기에 맞게 갱신한다** — 별도 영→한 매핑 레이어를 만들지 않는다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "데이터 흐름" 절 1~3번(업로드/분석/결과 조회), "상태 관리" 절
  ("클라이언트는 요청이 끝날 때까지 단일 스피너로 대기 상태를 표시한다", "별도 폴링 없음")
- `/docs/feature-spec.md` — F-PAUYQW(대시보드 업로드/초기 상태), F-ANJCJR(분석 진행 상태 및
  결과), F-RPFVZX(이용 현황/결제 전환 안내), F-ILFWKT(업로드 검증 예외 케이스)
- `src/types/analysis.ts`, `src/types/usage.ts`, `src/types/api.ts` — step 0에서 만든 정확한
  타입 정의(필드명은 이 파일을 직접 읽고 확인하라).
- `src/app/api/upload/route.ts`, `src/app/api/analysis/start/route.ts`,
  `src/app/api/analysis/latest/route.ts`, `src/app/api/usage/route.ts` — step 1에서 만든
  라우트의 정확한 요청 형식(예: `/api/upload`가 `FormData`의 어떤 필드명을 기대하는지)과
  응답 status 코드(200/400/402/404/409/500)를 확인하고 그대로 맞춰 호출한다.
- `src/app/dashboard/page.tsx`, `src/app/dashboard/page.module.css` — 현재 구현. 아래
  "작업" 절에서 언급하는 상수/함수/JSX 블록의 정확한 현재 줄 번호는 이 파일을 직접 읽고
  확인하라(다른 step 작업으로 줄 번호가 달라졌을 수 있다).

## 작업

`src/app/dashboard/page.tsx`를 아래와 같이 수정한다. **컴포넌트의 전체 구조(뷰 상태 머신,
JSX 레이아웃, CSS 클래스)는 그대로 유지**하고, 데이터 소스와 상태 전환 로직만 fetch 기반으로
바꾼다.

### 1. mock 상수 제거, 실시간 fetch로 대체

`CATEGORIES`, `CATEGORY_COLORS`, `ANOMALIES`, `RECOMMENDATIONS`, `FREE_LIMIT` 하드코딩
상수를 제거한다. 대신:

- 컴포넌트에 `analysisResult: AnalysisResult | null`, `usage: UsageStatus | null` 같은 state를
  둔다(타입은 `src/types/analysis.ts`, `src/types/usage.ts`에서 import).
- `CATEGORY_COLORS`(카테고리 차트 6색 순환 배열)는 카테고리 **이름**이 아니라 **배열
  인덱스**를 기준으로 순환시키는 용도이므로 그대로 유지해도 된다 — 다만 이제
  `analysisResult.categoryBreakdown[i]`를 순회하며 `i % CATEGORY_COLORS.length`로 색을
  고른다.

### 2. 마운트 시 이용 현황 + 기존 결과 조회

컴포넌트 마운트 시(`useEffect`) 아래를 순서와 무관하게 병렬로 조회한다:

- `GET /api/usage` → 성공하면 `usage` state를 채우고, 헤더의 `UsageBadge` 텍스트를
  `freeRemaining`/`freeLimit`(그리고 필요하면 `subscriptionStatus`)에서 계산해서 쓴다.
  지금처럼 "Free analyses N/2 left" 형태 문구는 유지하되 숫자는 fetch한 값을 쓴다.
- `GET /api/analysis/latest` → 200이면 `analysisResult`를 채우고 `view`를 `"result"`로
  전환한다(ADR-007: 새로고침해도 최신 결과가 남아있어야 한다는 계약을 검증하기 위함). 404면
  아무것도 하지 않고 기존처럼 `"empty"`로 둔다.
- 두 요청 모두 네트워크 실패(예외)가 나면 화면을 깨뜨리지 말고 조용히 무시하고 기존 초기값
  (예: `freeRemaining` 표시 없이 로딩 상태 유지 또는 0/2로 안전한 기본값)으로 폴백한다 —
  이 단계에서 정교한 전역 에러 배너까지 만들 필요는 없다(mock API라 사실상 실패하지 않는다).

### 3. 업로드 → 분석 시작 흐름을 실제 fetch로 교체

현재 파일 선택은 클라이언트 사이드 검증(`extractError` 상태로 전환하는 부분)만 하고 실제
업로드는 안 하고 있다. 이제:

- "분석 시작" 액션(`handleStartAnalysis`에 해당하는 핸들러)에서:
  1. 먼저 `freeRemaining <= 0`이고 활성 구독도 아니면(즉 `usage`에서 더 이상 잔여가 없으면)
     지금처럼 `/billing`으로 라우팅한다(기존 로직 유지 — 이건 클라이언트 사이드 UX 단축
     경로이고, 서버도 어차피 402를 낼 것이므로 이중 방어다).
  2. `POST /api/upload`를 `FormData`(선택된 `File` 객체)로 호출한다. 400이면 응답의
     `{ error }`를 화면에 보여주고 `view`를 `"upload-error"`로 전환한다(기존 문구 스타일
     유지, 서버 메시지를 그대로 표시).
  3. 업로드가 성공하면 `view`를 `"analyzing"`으로 전환하고 `POST /api/analysis/start`를
     호출한다(기존 `setTimeout` 로직과 `useRef` 타임아웃 관리 코드는 제거 — fetch 응답이
     오면 바로 다음 상태로 전환하면 된다. ADR-017: 클라이언트는 요청이 끝날 때까지 단일
     스피너로 대기).
  4. 응답이 200이면 그 `AnalysisResult`를 `analysisResult` state에 저장하고 `view`를
     `"result"`로 전환한다. 이어서 `GET /api/usage`를 다시 호출해(또는 응답 status만으로
     로컬에서 1 차감해도 되지만, **서버가 진실 소스이므로 재조회를 권장한다**) `usage`
     state를 최신화한다.
  5. 응답이 402면 `/billing`으로 라우팅한다.
  6. 응답이 409면 `view`를 `"analysis-error"`로 전환하고 서버가 준 `{ error }` 메시지를
     보여준다("이미 처리 중인 분석이 있습니다" 같은 문구가 그대로 노출되어야 한다).
  7. 그 외 실패(네트워크 에러, 5xx)도 `"analysis-error"`로 전환하고 일반화된 재시도 안내
     문구를 보여준다.

### 4. 데모용 수동 에러 트리거 버튼

기존에 있는 두 개의 데모 전용 버튼(빈 상태에서 강제로 `"extract-error"`로 보내는 버튼,
분석 중 상태에서 강제로 `"analysis-error"`로 보내는 버튼 — 각각 F-ILFWKT/F-KCOAUD 주석이
달려 있다)은 **그대로 둔다**. 이유: 실제 추출 실패를 유발할 방법이 이번 mock API에는 없고
(항상 성공하는 fixture이므로), 이 버튼들은 여전히 그 에러 화면 UI를 검토할 수 있는 유일한
수단이다 — 로컬 state만 건드리는 코드이므로 fetch 로직과 무관하게 남겨둬도 된다.

### 5. 결과 렌더링을 도메인 타입 필드명에 맞게 갱신

결과 화면(`view === "result"`) JSX를 아래처럼 고친다:

- 헤더의 하드코딩된 요약 텍스트("August Card Statement Analysis", "Total spend
  ₩1,847,600 · 42 transactions · just analyzed")를 `analysisResult.summary`
  (`totalAmount`, `periodStart`, `periodEnd`)를 기반으로 동적으로 생성한 문구로 바꾼다(거래
  건수는 `AnalysisResult`에 없으므로 제거하거나 "분석 결과" 정도로 단순화 — 없는 데이터를
  지어내지 않는다).
- 카테고리 목록 렌더링을 `analysisResult.categoryBreakdown`을 순회하도록 바꾸고, 각 항목의
  `category`(한글 카테고리명), `amount`, `ratio`(0~1 소수 — 기존에 `pct`가 정수 퍼센트였다면
  표시할 때 `Math.round(ratio * 100)`으로 변환), `description`을 쓴다.
- 이상 지출 목록을 `analysisResult.anomalies`를 순회하도록 바꾸고, 각 항목의
  `relatedTransactions`(배열 — 화면에 나열하거나 개수만 표시해도 된다), `reason`, `note`를
  쓴다.
- 절약 추천 목록을 `analysisResult.recommendations`를 순회하도록 바꾸고, 각 항목의 `text`,
  `basis`를 쓴다.
- CSS 모듈 클래스명은 바꾸지 않는다 — 데이터 바인딩만 교체한다.

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # ESLint 통과
npm test        # vitest 통과 (기존 테스트 + 이번 step에서 추가한 테스트)
```

추가로 컴포넌트 테스트(vitest + @testing-library/react, 프로젝트에 이미 devDependency로
설치돼 있다)를 최소 1~2개 작성한다 — `global.fetch`를 mock해서: (a) 업로드→분석 성공 흐름을
거치면 `analysisResult`가 화면에 반영되는지, (b) `/api/analysis/start`가 402를 반환하면
`/billing`으로 이동을 시도하는지(라우팅 함수 mock으로 검증). 기존에 이 페이지에 대한 테스트
파일이 있다면 그 관례(파일 위치, 렌더/이벤트 시뮬레이션 방식)를 따르고, 없다면
`src/app/dashboard/page.test.tsx`로 새로 만든다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/app/dashboard/page.tsx`(그리고 필요 시 `page.test.tsx`) 외의 파일을 건드리지
     않았는가?
   - `setTimeout` 기반 시뮬레이션 코드(analyzing 타임아웃 `useRef`/`useEffect`)가 모두
     제거되고 실제 `fetch` 호출로 대체됐는가?
   - 렌더링이 `src/types/analysis.ts`의 `AnalysisResult` 필드명(한글 카테고리,
     `ratio`/`description` 등)을 정확히 쓰는가?
   - 402/409/네트워크 실패 각각에 대해 화면이 명확한 상태로 전환되는가(F-ANJCJR의 "실패
     원인 + 재시도 안내" 규칙)?
3. 결과에 따라 `phases/1-api-skeleton/index.json`의 step 3 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 어떤 fetch 흐름을 추가했는지와 남겨둔
     데모 버튼 유무를 한 줄로 요약.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- `src/app/billing/page.tsx`, `src/app/api/`, `src/types/`, `src/lib/fixtures/`를 이 step에서
  건드리지 마라. 이유: billing 화면 연동은 step 4 범위이고, API/타입/fixture는 이미 완성된
  이전 step 산출물이다 — 계약을 바꾸려면 그 전 step으로 돌아가야 하는데, 이번 step에서 API
  쪽을 응답 shape와 다르게 임의로 손대면 계약 불일치가 생긴다.
- 새로운 전역 상태 관리 라이브러리(Redux, Zustand 등)를 도입하지 마라. 이유:
  `docs/ARCHITECTURE.md`의 "상태 관리" 절이 `useState`/`useReducer`로 충분하다고 이미
  명시했다.
- 폴링(setInterval로 분석 상태를 주기적으로 조회하는 방식)을 만들지 마라. 이유: ADR-017에
  따라 분석은 동기 처리이고 클라이언트는 단일 요청-응답으로 결과를 받는다 — 폴링은 이미
  폐기된 설계(ADR-006)다.
- 없는 데이터를 화면에 지어내지 마라(예: `AnalysisResult`에 없는 "거래 건수"를 임의 숫자로
  유지). 이유: 화면과 실제 API 응답 shape가 정확히 일치하는지 검증하는 게 이 step의 목적
  이다.
- 기존 테스트를 깨뜨리지 마라.
