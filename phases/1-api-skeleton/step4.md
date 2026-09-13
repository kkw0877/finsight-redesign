# Step 4: billing-integration

## 배경

Finsight phase `1-api-skeleton`의 목표는 `docs/ARCHITECTURE.md`에 정의된 API 라우트들을
mock 스켈레톤으로 구현하고, 화면의 `setTimeout` 시뮬레이션을 실제 `fetch` 호출로 교체해
API 계약(요청/응답 shape)이 화면과 맞는지 검증하는 것이다. 이전 step들에서:

- step 0: `src/types/{analysis,usage,api}.ts` 도메인 타입, `src/lib/fixtures/{analysisFixture,
  usageFixture}.ts` mock 상태 모듈을 만들었다.
- step 1: 분석/업로드/이용현황 라우트를 만들었다.
- step 2: `src/app/api/subscription/{checkout,cancel}/route.ts` 라우트를 만들었다 —
  `checkout`은 `{ simulateFailure?: boolean }` 바디를 받아 `true`면 실패를, 아니면 즉시
  구독을 활성화하고 `{ subscriptionStatus: 'active', currentPeriodEnd, billedAt }`를
  반환한다.
- step 3: `src/app/dashboard/page.tsx`를 fetch 기반으로 교체했다.

이 step에서는 `src/app/billing/page.tsx`(현재 클라이언트 컴포넌트, `setTimeout`으로 결제중
→성공/실패를 시뮬레이션 중)를 실제 `fetch` 호출로 교체한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "API 인터페이스" 표의 `/api/subscription/checkout` 행, "데이터
  흐름" 절 5번(결제)
- `/docs/ADR.md` — ADR-008(월 ₩9,900), ADR-012(웹훅이 신뢰 소스 — 이번 phase 단순화 배경은
  `phases/1-api-skeleton/step2.md`에 이미 적혀 있으니 그 파일도 참고하면 이해가 빠르다)
- `/docs/feature-spec.md` — F-UXSBGF(월간 구독 결제 진행)
- `src/types/usage.ts`, `src/types/api.ts` — `CheckoutRequestBody`, `CheckoutSuccessResponse`
  타입. 정확한 필드명은 이 파일을 직접 읽고 확인하라.
- `src/app/api/subscription/checkout/route.ts` (step 2에서 생성) — 정확한 요청/응답 형식과
  status 코드(200/402 또는 500)를 확인하고 그대로 맞춰 호출한다.
- `src/app/billing/page.tsx`, `src/app/billing/page.module.css` — 현재 구현. 아래 "작업"
  절에서 언급하는 함수/JSX 블록의 정확한 현재 줄 번호는 이 파일을 직접 읽고 확인하라.

## 작업

`src/app/billing/page.tsx`를 아래와 같이 수정한다. **뷰 상태 머신(`"plan" | "paying" |
"success" | "error"`)과 전체 레이아웃/CSS는 그대로 유지**하고, 결제 처리 로직만 fetch 기반
으로 바꾼다.

### 1. 결제 버튼 핸들러를 실제 fetch로 교체

현재 `handlePay`(클릭 시 `"paying"`으로 전환 후 900ms `setTimeout`으로 `"success"`로
전환)를 아래로 바꾼다:

1. `view`를 `"paying"`으로 전환한다(기존처럼 오버레이 스피너를 그대로 보여준다).
2. `POST /api/subscription/checkout`을 바디 없이(또는 `{}`) 호출한다.
3. 응답이 200이면 `CheckoutSuccessResponse`(`subscriptionStatus`, `currentPeriodEnd`,
   `billedAt`)를 state에 저장하고 `view`를 `"success"`로 전환한다.
4. 응답이 실패(402/500 등)면 서버가 준 `{ error }` 메시지를 저장하고 `view`를 `"error"`로
   전환한다.
5. 네트워크 예외(fetch 자체가 throw)도 동일하게 `"error"` + 일반화된 재시도 안내 문구로
   처리한다.

`useRef` 기반 `payTimeoutRef`와 그걸 정리하는 cleanup 로직은 더 이상 필요 없으므로 제거한다
(fetch는 컴포넌트 unmount 시 별도 클린업 없이 응답을 기다렸다가 상태를 갱신해도 이 mock
스켈레톤 단계에서는 충분하다 — `AbortController`까지 도입할 필요는 없다).

### 2. 데모 실패 버튼을 실제 API 실패 경로로 전환

현재 `handlePreviewFailure`(클라이언트 로컬 state만 바꿔 `"error"`로 강제 전환하는 데모
버튼, F-UXSBGF 주석이 달려 있다)를 아래로 바꾼다:

- `view`를 `"paying"`으로 전환한 뒤 `POST /api/subscription/checkout`을
  `{ simulateFailure: true }` 바디로 호출한다.
- 응답은 항상 실패이므로(step 2에서 그렇게 만들었다) 서버가 준 `{ error }` 메시지로
  `view`를 `"error"`로 전환한다.
- 이렇게 하면 이 버튼이 더 이상 "화면만 흉내내는 데모"가 아니라 실제 API의 실패 응답
  경로를 그대로 태우는 버튼이 된다 — 여전히 버튼 라벨/위치는 유지해도 되고, 원한다면
  "결제 실패 미리보기" 같은 기존 데모 문구를 유지해도 무방하다(이 버튼의 목적 자체는
  달라지지 않았다 — 이제 진짜 API를 거칠 뿐이다).

### 3. 성공 화면의 날짜 계산을 서버 응답 기준으로 교체

현재 성공 화면(영수증 카드)이 `new Date()`로 오늘 날짜와 다음 달 날짜를 클라이언트에서
직접 계산하고 있다. 이를 제거하고 `POST /api/subscription/checkout` 응답의 `billedAt`
(결제일)과 `currentPeriodEnd`(다음 결제일)를 그대로 표시하도록 바꾼다 — 클라이언트가 날짜를
다시 계산하지 않는다(서버가 유일한 진실 소스라는 원칙을 지킨다).

### 4. 해지(cancel) UI는 이번 step에서 추가하지 않는다

`/api/subscription/cancel` 라우트는 이미 step 2에서 만들어져 있지만, 이번 billing
화면에는 애초에 "이미 구독 중"이거나 "해지" 관련 뷰/버튼 자체가 존재하지 않는다(현재
`BillingView`는 `"plan" | "paying" | "success" | "error"`뿐이다). 이 step의 목적은 "이미
있는 화면의 setTimeout을 fetch로 교체해 계약을 검증하는 것"이지 새 화면 상태를 설계/추가
하는 것이 아니므로, 해지 UI는 이번 phase에서 만들지 않고 다음 phase로 남긴다.

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # ESLint 통과
npm test        # vitest 통과 (기존 테스트 + 이번 step에서 추가한 테스트)
```

추가로 컴포넌트 테스트(vitest + @testing-library/react)를 최소 1~2개 작성한다 —
`global.fetch`를 mock해서: (a) 결제 버튼 클릭 → 성공 응답 시 영수증에 서버가 준
`billedAt`/`currentPeriodEnd`가 표시되는지, (b) 실패 미리보기 버튼 클릭 → `"error"` 뷰로
전환되고 서버 메시지가 보이는지. 기존에 이 페이지에 대한 테스트 파일이 있다면 그 관례를
따르고, 없다면 `src/app/billing/page.test.tsx`로 새로 만든다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/app/billing/page.tsx`(그리고 필요 시 `page.test.tsx`) 외의 파일을 건드리지
     않았는가?
   - `setTimeout` 기반 시뮬레이션 코드가 모두 제거되고 실제 `fetch` 호출로 대체됐는가?
   - 성공 화면의 날짜가 클라이언트 계산이 아니라 서버 응답값을 쓰는가?
   - 실패 시 서버가 준 이해 가능한 메시지가 그대로 노출되는가(F-UXSBGF)?
3. 결과에 따라 `phases/1-api-skeleton/index.json`의 step 4 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 무엇을 fetch로 교체했는지 한 줄로 요약.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- `src/app/dashboard/page.tsx`, `src/app/api/`, `src/types/`, `src/lib/fixtures/`를 이 step
  에서 건드리지 마라. 이유: dashboard 연동은 이미 step 3에서 끝났고, API/타입/fixture는
  이전 step들의 완성된 산출물이다.
- 구독 해지(cancel) 버튼이나 "이미 구독 중" 상태 화면을 새로 만들지 마라. 이유: 이번 step은
  기존 화면의 setTimeout을 fetch로 교체하는 것이 목적이며, 새 UI 상태 추가는 범위를 벗어난
  다 — 필요해지면 별도 phase/step에서 설계부터 다시 논의한다.
- Polar SDK나 실제 결제수단 입력 폼을 추가하지 마라. 이유: 실제 Polar 연동은 다음 phase
  범위다 — 이 화면은 여전히 mock `/api/subscription/checkout`을 호출할 뿐이다.
- 기존 테스트를 깨뜨리지 마라.
