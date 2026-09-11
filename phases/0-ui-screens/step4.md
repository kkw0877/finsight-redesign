# Step 4: billing-screen

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 기획 의도와 이전 step 산출물을 파악하라:

- `/docs/feature-spec.md`의 `R-GFWXZC` 절 전체(F-ILHNGA/F-UXSBGF/F-QVPIEG) — 결제 금액, 추가
  분석 조건, 실패/해지 처리 문구
- `/docs/ADR.md`의 ADR-008(Polar, 샌드박스 우선, 월 ₩9,900), ADR-012(웹훅이 유일한 신뢰
  소스 — 리다이렉트 콜백은 UX용일 뿐 상태 확정에 안 쓴다는 원칙. 이번 step은 웹훅이 없으므로
  이 원칙을 "결제 성공 화면은 실제로 구독을 활성화하지 않는다"는 제약으로 이해하고 구현할 것)
- `/docs/UI_GUIDE.md`의 "레이아웃" 표(결제 화면 440px 중앙)와 "상태 아이콘 원"/"섹션 카드" 스펙
- `src/components/ui/index.ts` — `SectionCard`, `StatusIconCircle`, `Spinner`, `Button` props
  (step 0 산출물)
- `src/app/dashboard/page.tsx`(step 3 산출물) — "Subscribe to keep analyzing" 배너가 `/billing`
  으로 링크되어 있는지 확인하고, 이 페이지에서 대시보드로 돌아가는 링크가 그 라우트 이름과
  일치하게 한다

이 프로젝트는 백엔드/Polar 연동이 없다. 이번 step은 결제 화면의 UI와 상태 전환만 구현한다 —
실제 결제 세션 생성이나 구독 활성화는 하지 않는다.

## 작업

### `src/app/billing/page.tsx`

Client Component(`"use client"`)로 작성한다.

**상태 모델**: `view: "plan" | "paying" | "success" | "error"` (초기값 `"plan"`).

**본문** (최대폭 440px 중앙 정렬):

1. `plan`: 타이틀 "Keep analyzing with a monthly subscription" + `SectionCard`로 감싼 플랜 카드
   (플랜명 "Finsight Premium", 가격 "₩9,900 / month", 혜택 리스트: "Unlimited additional
   analyses" / "Priority anomaly alerts" / "Cancel anytime" — feature-spec F-UXSBGF의 실제 정책
   (무료 2회 소진 후 추가 월 2회, 월 최대 4회)과 문구가 어긋나지 않게 표현할 것. "Unlimited"라는
   프로토타입 원문 표현을 그대로 쓰면 정책과 모순되므로, 실제 정책에 맞는 문구("월 2회 추가
   분석 이용" 계열)로 고쳐서 쓴다.). `Button variant="solid" color="primary" size="lg"` label
   "Pay ₩9,900" — 클릭 시 `view`를 `"paying"`으로 전환하고 `setTimeout` 900ms 후 `"success"`로
   전환. "Maybe later" 링크(대시보드로 돌아가기, `Link href="/dashboard"`). 작은 캡션 링크
   "Demo: preview payment failure"로 `view`를 바로 `"error"`로 전환(결제 흐름 자체를 밟지 않고
   실패 화면을 검토할 수 있게, 프로토타입과 동일한 관례).
2. `paying`: `plan` 화면 위에 반투명 오버레이 + `Spinner`(24px) + "Processing payment..." 텍스트
   (UI_GUIDE: 오버레이는 페이드 없이 즉시 표시/제거).
3. `success`: `StatusIconCircle tone="positive"` + 타이틀 "Your subscription is active!" +
   `SectionCard`로 감싼 영수증 박스(Plan/Amount/Billed on/Next billing date — 날짜는 오늘 기준
   임의 값이 아니라 `new Date()` 기반으로 오늘/한 달 뒤를 계산해서 넣는다. 하드코딩된 과거
   날짜를 박아넣지 마라) + "Back to dashboard" 버튼(`Link href="/dashboard"`).
4. `error`: `StatusIconCircle tone="negative"` + 타이틀 "Payment failed" + 설명("Check your card
   details and try again. Your subscription status hasn't changed." 계열) + "Retry payment"
   버튼(`view`를 `"plan"`으로 되돌림) + "Back to dashboard" 링크.

`setTimeout`은 다른 전환("Demo: preview payment failure" 클릭 등)과 경합하지 않도록 정리
(`clearTimeout`)한다.

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 결제 성공 화면의 날짜가 하드코딩이 아니라 현재 시각 기준으로 계산되는가?
   - 플랜 혜택 문구가 F-UXSBGF의 실제 정책(무료 2회 + 구독 추가 2회, 월 최대 4회)과 일치하는가
     ("무제한" 같은 프로토타입 원문 표현을 그대로 남기지 않았는가)?
   - `src/app/api/`나 Polar SDK 호출 코드를 추가하지 않았는가?
3. 결과에 따라 `phases/0-ui-screens/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 산출물 요약
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message"` 기록
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 기록 후 즉시 중단
4. 모든 step(0~4)이 completed 상태가 되면, `phases/index.json`의 `0-ui-screens` phase 항목도
   최종적으로 `"completed"`로 반영되어 있는지 확인한다(execute.py가 자동 처리하므로 직접 고칠
   필요는 없다 — 확인만 한다).

## 금지사항

- `@polar-sh/sdk` 등 실제 Polar 클라이언트를 설치/호출하지 마라. 이유: Polar 상품/웹훅이 아직
  설정되지 않았다(CLAUDE.md "Not yet done").
- 결제수단(카드번호 등) 입력 폼을 만들지 마라. 이유: 실제 결제 UI는 Polar의 호스팅 결제
  페이지로 이동하는 것이 최종 설계이며(F-UXSBGF), 자체 카드 입력 폼을 만드는 것은 설계에서
  벗어난다.
- 기존 테스트를 깨뜨리지 마라.
