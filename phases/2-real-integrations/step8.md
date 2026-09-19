# Step 8: billing-integration

## 배경

Step 7에서 `/api/subscription/checkout`은 더 이상 즉시 영수증을 주지 않고 Polar 결제 페이지
URL(`CheckoutStartResponse.checkoutUrl`)을 준다 — 실제 결제는 그 페이지로 이동해서
진행되고(F-UXSBGF), 결제가 실제로 완료됐는지는 웹훅(step 9)만이 확정한다(ADR-012). 이 step은
`src/app/billing/page.tsx`를 이 새 흐름에 맞게 다시 연결한다.

**설계 단순화(의도적, ADR-012 근거)**: Polar가 결제 후 우리 앱으로 돌려보내는 리다이렉트는
"UX 목적일 뿐 상태 확정에 쓰지 않는다"(ADR-012). 그래서 이 화면은 돌아왔을 때 쿼리 파라미터를
파싱해서 결제 성공 여부를 판단하지 않는다 — 대신 화면 진입 시 항상 `GET /api/usage`(step
5에서 이미 실제 구현됨)로 현재 구독 상태를 확인해서 그 결과로 화면을 그린다. 웹훅 처리는
보통 초 단위로 끝나므로, 결제 완료 직후 돌아왔을 때 아직 `active`가 아니면(웹훅이 막
처리 중) 조급하게 실패로 취급하지 않고 그냥 "구독하기" 화면을 다시 보여준다 — 사용자가
대시보드로 이동하거나 새로고침하면 그 사이 웹훅이 끝나 반영된다. 폴링/재시도 로직을 새로
만들지 않는다(MVP 범위 최소화 — 필요해지면 나중에 재검토).

**이 step의 의도적 범위 제외**: 이미 구독 중인 사용자를 위한 "해지" 버튼/UI는 이 step에서
만들지 않는다(백엔드 `/api/subscription/cancel`은 이미 step 7에 있지만, 어디에 어떤 모양으로
노출할지는 UI 설계가 필요한 별도 논의 대상이다 — phase 1에서도 동일한 이유로 미뤄뒀다). 이미
구독 중이면 단순 안내만 보여준다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — ADR-012(웹훅이 유일한 신뢰 소스, 리다이렉트는 UX 목적일 뿐).
- `/docs/feature-spec.md` — F-UXSBGF(월간 구독 결제 진행, 특히 "결제는 Polar 결제 화면으로
  이동해 진행한다"), F-PAOWJD(Exception: "구독 상태 갱신 중이면 마지막 확정 상태 또는 갱신
  중 상태 표시").
- `phases/2-real-integrations/index.json`의 step 5/7 `summary` — `UsageStatus` 응답 필드,
  `CheckoutStartResponse` 정확한 형태.
- `src/types/usage.ts`, `src/types/api.ts` — `UsageStatus`, `CheckoutStartResponse`,
  `CancelResponse` 정확한 필드명(값은 이 파일들을 직접 읽고 확인하라).
- `src/app/billing/page.tsx`, `src/app/billing/page.module.css`,
  `src/app/billing/page.test.tsx` — 현재 구현 전체.

## 작업

`src/app/billing/page.tsx`의 뷰 상태를 아래로 재정의한다(기존
`"plan" | "paying" | "success" | "error"`에서 변경 — 이유는 위 "배경" 참고, `SectionCard`/
`Button`/`StatusIconCircle`/`Spinner` 등 기존 UI 컴포넌트는 그대로 재사용한다):

```ts
type BillingView = "loading" | "plan" | "redirecting" | "subscribed" | "error";
```

1. **마운트 시(`"loading"`)**: `GET /api/usage`를 호출한다. 실패하면 `"plan"`으로 대체
   표시(조회 실패로 결제 자체를 막지 않는다 — F-PAOWJD Exception의 "새로고침/재시도 안내"
   취지와 다르게, 결제 시작 자체는 이 조회에 의존하지 않아도 되므로). 성공하면:
   - `subscriptionStatus`가 `'active'` 또는 `'cancel_scheduled'`면 `"subscribed"`로 전환.
   - 그 외(`'none'`/`'inactive'`)면 `"plan"`으로 전환.
2. **`"plan"` 뷰**: 기존 요금제 소개 카드(`Finsight Premium`, ₩9,900, 혜택 목록)를 그대로
   유지한다. "Pay ₩9,900" 버튼 클릭 시(`handlePay`):
   - `view`를 `"redirecting"`으로 전환(기존 `overlay`/`Spinner` UI 재사용, 문구는 "Redirecting
     to payment..." 같은 걸로 자연스럽게 바꿔도 된다).
   - `POST /api/subscription/checkout`을 바디 없이 호출한다.
   - 200이면 `const { checkoutUrl } = await response.json();` 후
     `window.location.href = checkoutUrl`로 브라우저를 Polar 결제 페이지로 이동시킨다(SPA
     네비게이션이 아니라 전체 페이지 이동이어야 한다).
   - 실패하면 서버의 `{ error }` 메시지로 `view`를 `"error"`로 전환.
3. **`"subscribed"` 뷰**: "You're already subscribed" 취지의 안내 + (있다면)
   `usage.currentPeriodEnd`를 "다음 결제일"로 표시 + `/dashboard`로 돌아가는 버튼. 새 결제를
   유도하는 카드는 보여주지 않는다(이미 구독자에게 다시 결제를 권하지 않는다).
4. **`"error"` 뷰**: 기존과 동일하게 서버 메시지 표시 + 재시도 버튼(`"plan"`으로 되돌림).
5. **"Demo: preview payment failure" 버튼과 `handlePreviewFailure` 함수를 완전히
   제거한다** — step 7에서 `simulateFailure` 훅 자체를 서버에서 제거했으므로, 이 버튼이
   남아 있으면 `{ simulateFailure: true }`를 보내도 서버가 무시하고 **실제 Polar 샌드박스
   체크아웃**이 시작돼버린다(더 이상 안전한 데모가 아니다).
6. 기존 `formatDate` 헬�퍼는 `currentPeriodEnd` 표시에 계속 쓴다. `billedAt` 관련 코드(있던
   "Billed on" 행)는 제거한다 — `UsageStatus`에는 `billedAt`이 없다(결제 시점 데이터는 더
   이상 이 화면이 동기적으로 받지 않는다).

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

`page.test.tsx`를 이 새 흐름에 맞게 다시 작성한다(`global.fetch` mock):

- 마운트 시 `GET /api/usage`가 `subscriptionStatus: 'none'`을 주면 `"plan"` 뷰가 뜨는지.
  `'active'`를 주면 `"subscribed"` 뷰가 뜨는지.
- "Pay" 클릭 → `POST /api/subscription/checkout` 200 + `checkoutUrl` → (jsdom에서
  `window.location.href` 대입을 직접 검증하기 어려우면, `window.location` 관련 로직을
  테스트 가능한 함수로 분리하거나 `location.href` setter를 spy로 검증하는 기존 프로젝트
  관례를 따른다) `location.href`가 그 URL로 설정되는지.
- 체크아웃 API 실패 → `"error"` 뷰 + 서버 메시지.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `simulateFailure`/`handlePreviewFailure` 관련 코드가 전부 제거됐는가?
   - 결제 성공 여부를 쿼리 파라미터 파싱으로 판단하는 코드를 추가하지 않았는가(ADR-012 —
     항상 `GET /api/usage`로 재확인)?
   - "이미 구독 중" 사용자에게 다시 결제 카드를 보여주지 않는가?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 8 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 새 뷰 상태 머신과 무엇을 제거했는지 한
     줄로 요약.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- 구독 해지(cancel) 버튼이나 "구독 관리" UI를 새로 만들지 마라. 이유: 위 "배경"에서 설명한
  대로 이 step의 의도적 범위 제외 항목이다 — 백엔드는 있지만 UI 배치/디자인은 별도 논의가
  필요하다.
- `src/app/dashboard/page.tsx`를 이 step에서 건드리지 마라. 이유: 대시보드의 구독 상태
  배지 확장은 이 phase 범위 밖이다(step 6에서 이미 완료됐고 재논의 없이 확장하지 않는다).
- Polar 결제 완료 리다이렉트의 쿼리 파라미터(`checkout_id` 등)를 파싱해서 결제 성공을
  판단하는 로직을 만들지 마라. 이유: ADR-012가 리다이렉트는 UX 목적일 뿐이라고 명시한다 —
  항상 `GET /api/usage` 재조회로 판단한다.
- 기존 테스트를 깨뜨리지 마라.
