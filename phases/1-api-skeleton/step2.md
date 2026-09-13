# Step 2: subscription-routes

## 배경

Finsight phase `1-api-skeleton`의 목표는 `docs/ARCHITECTURE.md`의 "API 인터페이스" 표에
정의된 라우트들을 실제 외부 서비스 호출 없이 고정 mock 데이터로 응답하는 스켈레톤으로
구현하는 것이다. 이전 step들에서 도메인 타입/fixture(step 0)와 분석·업로드·이용현황
라우트(step 1, `src/app/api/{upload,analysis/start,analysis/latest,usage}/route.ts`)를 이미
만들어 뒀다 — 이 step에서는 구독 결제 관련 라우트 2개를 구현한다.

**중요한 설계 상 단순화**: 실제 서비스에서는 Polar 결제 → Polar 웹훅(`checkout.completed`)
수신 → 서명 검증 → 구독 상태 활성화, 라는 흐름이 신뢰 소스이며(ADR-012), 결제 완료 직후
리다이렉트는 UX 목적일 뿐 상태 확정에 쓰지 않는다. 하지만 이번 phase는 실제 Polar 연동
자체가 범위 밖이라 웹훅도 만들지 않는다(`/api/webhooks/polar`는 다음 phase에서 실제 Polar
연동과 함께 구현한다). 따라서 이번 스켈레톤의 `/api/subscription/checkout`은 **호출 즉시
mock 결제가 성공했다고 간주하고 그 자리에서 구독을 활성화**한다 — 이는 실제 Polar 웹훅
흐름을 대체하는 것이 아니라, 화면 쪽 API 계약(요청을 보내면 어떤 모양의 응답이 오는지)을
미리 검증하기 위한 임시 단순화라는 점을 코드 주석으로 남긴다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "API 인터페이스" 표의 `/api/subscription/checkout`,
  `/api/subscription/cancel` 행, "데이터 흐름" 절 5번(결제)
- `/docs/ADR.md` — ADR-008(Polar, 월 ₩9,900), ADR-012(Polar 웹훅이 유일한 신뢰 소스 — 이번
  phase에서 왜 단순화하는지의 배경), ADR-009(결제 시도 이벤트는 PostHog로, DB엔 최종 상태만)
- `/docs/feature-spec.md` — F-UXSBGF(월간 구독 결제 진행), F-QVPIEG(구독 상태 기반 추가
  분석 권한 및 해지)
- `src/types/usage.ts`, `src/types/api.ts` — 이전 step에서 만든 `SubscriptionStatus`,
  `CheckoutRequestBody`, `CheckoutSuccessResponse`, `CancelResponse` 타입. 정확한 필드명은
  이 파일들을 직접 읽고 확인하라.
- `src/lib/fixtures/usageFixture.ts` — `activateSubscription()`, `cancelSubscription()`,
  `getUsageStatus()` 등 이전 step에서 만든 함수 시그니처를 확인하고 그대로 사용하라.
- `src/app/api/analysis/start/route.ts` (step 1에서 생성) — 이 프로젝트의 라우트 핸들러
  코드 스타일(에러 응답 형태, `NextResponse`/`Response` 사용 방식)을 참고해 일관성을
  유지한다.

## 작업

### 1. `src/app/api/subscription/checkout/route.ts` (POST)

- 요청 바디를 `CheckoutRequestBody`로 파싱한다(`{ simulateFailure?: boolean }`, 바디가 없거나
  파싱 실패해도 `simulateFailure: false`로 취급 — 400을 내지 않는다).
- `simulateFailure`가 `true`면 구독 상태를 바꾸지 않고 402 또는 500(택1, 실제 결제 실패에
  가까운 코드를 골라라)로 `{ error: string }` 응답한다("결제에 실패했습니다. 다시
  시도해주세요" 취지의 한글 메시지, F-UXSBGF의 "실패 시 사실 + 재시도 방법 안내" 규칙). 이
  필드는 실제 Polar에는 없는, 화면 쪽에서 에러 UI를 테스트하기 위한 전용 훅임을 주석으로
  남긴다.
- 그 외의 경우: 오늘 기준 한 달 뒤 날짜를 `currentPeriodEnd`로 계산하고,
  `usageFixture.activateSubscription(currentPeriodEnd)`를 호출해 구독을 활성화한 뒤,
  `CheckoutSuccessResponse` 형태(`{ subscriptionStatus: 'active', currentPeriodEnd, billedAt
  }`, `billedAt`은 현재 시각 ISO 문자열)로 200 응답한다.
- 상품 가격(₩9,900)이나 상품명은 이 라우트의 응답에 포함할 필요 없다 — 화면(billing
  page)이 이미 정적으로 알고 있는 값이다. 이 라우트는 "결제 실행 결과"만 책임진다.

### 2. `src/app/api/subscription/cancel/route.ts` (POST)

- `usageFixture.getUsageStatus()`로 현재 `subscriptionStatus`를 확인한다.
- `'active'`가 아니면(`'none'`/`'inactive'`/이미 `'cancel_scheduled'`) 400으로
  `{ error: string }` 응답한다("활성 구독이 없습니다" 취지).
- `'active'`면 `usageFixture.cancelSubscription(currentPeriodEnd)`를 호출한다 — 이때
  `currentPeriodEnd`는 **기존에 저장된** 구독 종료 예정일을 그대로 유지해서 넘긴다(해지해도
  현재 결제 주기 종료까지는 혜택이 유지된다, F-QVPIEG) — 임의로 새 날짜를 계산하지 않는다.
  `getUsageStatus()`가 반환하는 기존 `currentPeriodEnd` 값을 그대로 재사용하라.
- 성공 시 `CancelResponse` 형태(`{ subscriptionStatus: 'cancel_scheduled', currentPeriodEnd
  }`)로 200 응답한다.

### 공통 규칙

- step 1의 라우트들과 동일한 스타일을 유지한다: 모든 예외는 `try/catch`로 잡아 사용자
  이해 가능한 메시지로 매핑하고(CLAUDE.md CRITICAL 규칙), 내부 예외 객체를 그대로 응답
  바디에 넣지 않는다.

### 3. 테스트 작성 (TDD)

CLAUDE.md CRITICAL 규칙에 따라 두 라우트 모두 테스트를 먼저 작성한다(step 1과 동일하게
Route Handler 함수를 직접 호출하는 방식). 최소한 아래를 검증한다:

- `/api/subscription/checkout`: `simulateFailure: true` → 4xx/5xx + 상태 미변경(호출 후
  `usageFixture.getUsageStatus().subscriptionStatus`가 여전히 활성화 이전 값인지 확인),
  `simulateFailure` 없이 호출 → 200 + `subscriptionStatus: 'active'` + 이후
  `usageFixture.getUsageStatus().subscriptionStatus === 'active'`.
- `/api/subscription/cancel`: 구독이 `'none'`인 상태에서 호출 → 400, 먼저 checkout으로
  활성화한 뒤 호출 → 200 + `subscriptionStatus: 'cancel_scheduled'` + 이후
  `usageFixture.getUsageStatus().subscriptionStatus === 'cancel_scheduled'`이고
  `currentPeriodEnd`는 활성화 시점 값과 동일한지.

step 1에서 fixture 상태 격리를 위해 리셋 유틸(예: `__resetForTest()`)을 추가했다면 이
테스트에서도 동일하게 써서 테스트 간 상태가 새지 않게 한다.

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # ESLint 통과
npm test        # vitest 통과 (이번 step에서 추가한 라우트 테스트 포함, 이전 step 테스트도 계속 통과)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/app/api/subscription/checkout/`, `src/app/api/subscription/cancel/`에만 새 파일을
     추가했는가?
   - 해지해도 현재 결제 주기 종료까지는 `currentPeriodEnd`가 유지되는가(F-QVPIEG)?
   - 결제 실패 시 구독 상태가 변경되지 않는가(F-UXSBGF)?
   - 모든 응답이 내부 예외를 그대로 노출하지 않는가(CLAUDE.md CRITICAL)?
3. 결과에 따라 `phases/1-api-skeleton/index.json`의 step 2 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 만든 라우트 파일과 `simulateFailure` 훅의
     존재를 한 줄로 요약(다음 step 4번이 이 훅을 써서 billing 화면의 실패 UI를 연습해야
     한다).
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- Polar SDK나 실제 Polar API를 호출하는 코드를 넣지 마라. 이유: 실제 Polar 연동은 다음
  phase 범위다 — 이번 라우트는 mock으로 즉시 성공/실패를 결정한다.
- `/api/webhooks/polar` 라우트를 만들지 마라. 이유: 서명 검증 대상이 될 실제 Polar 웹훅이
  없는 상태에서 스켈레톤을 만들어봐야 검증할 수 있는 게 없다 — 다음 phase에서 실제 연동과
  함께 만든다.
- `src/app/billing/page.tsx`나 `src/app/dashboard/page.tsx`를 이 step에서 건드리지 마라.
  이유: 화면 연동은 step 4(billing)/step 3(dashboard) 범위다.
- 구독 상품 가격(₩9,900) 같은 정적 문구를 이 라우트 응답에 새로 넣지 마라. 이유: 이미
  화면(billing page)이 정적으로 표시하고 있고, 이 라우트는 결제 실행 결과만 책임진다 —
  중복된 진실 소스를 만들지 않는다.
- 기존 테스트를 깨뜨리지 마라.
