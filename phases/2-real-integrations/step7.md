# Step 7: subscription-routes

## 배경

Step 3~6에서 업로드/분석/대시보드 흐름을 실제 구현으로 바꿨다. 이 step은 결제 관련 API
라우트 2개(`/api/subscription/checkout`, `/api/subscription/cancel`)를 실제 Polar 연동으로
교체한다.

**중요한 계약 변경**: phase 1 mock의 `POST /api/subscription/checkout`은 호출 즉시 구독을
활성화하고 영수증 데이터를 동기 응답으로 줬다. 실제 Polar 연동은 그렇게 동작하지 않는다 —
`feature-spec.md`의 F-UXSBGF가 명시하듯 "결제는 Polar 결제 화면으로 이동해 진행"하며, 결제가
실제로 완료됐는지는 Polar 웹훅(ADR-012, 다음 step 9)만이 확정한다. 그래서 이 step은
`CheckoutSuccessResponse`(즉시 활성화 결과)를 **`CheckoutStartResponse`(Polar 결제 페이지
URL)**로 교체한다 — 화면이 그 URL로 이동시키는 배선은 다음 step(8, `billing-integration`)
범위다. 이 step은 API 라우트만 만든다.

**중요한 설계 원칙(ADR-012)**: 이 두 라우트는 우리 DB의 `subscriptions.status`를 **직접
쓰지 않는다** — Polar API만 호출하고 그 응답을 그대로 클라이언트에 돌려준다. `subscriptions`
테이블의 실제 갱신은 오직 웹훅(step 9)에서만 일어난다("웹훅이 유일한 신뢰 소스").

패키지명은 step 0에서 설치한 `@polar-sh/sdk`(또는 그 step에서 실제로 확인된 이름)를 쓴다.
**Polar SDK의 정확한 메서드/파라미터 이름은 추측하지 말고, `node_modules/@polar-sh/sdk`의
타입 정의나 README, 또는 https://docs.polar.sh 의 최신 문서를 직접 확인한 뒤 코드를
작성하라** — API 형태가 학습 데이터 시점과 다를 수 있다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "API 인터페이스" 표의 `/api/subscription/checkout`,
  `/api/subscription/cancel` 행.
- `/docs/ADR.md` — ADR-008(Polar, 샌드박스 우선 검증, 월 ₩9,900 단일 상품), ADR-012(웹훅이
  유일한 신뢰 소스, 전체를 다시 정독하라 — 이 step과 다음 step의 경계가 여기서 나온다).
- `/docs/feature-spec.md` — F-UXSBGF(월간 구독 결제 진행), F-QVPIEG(해지 요청 — "자동 갱신을
  중단하도록 Polar에 반영하고 해지 예약 상태를 표시").
- `phases/2-real-integrations/index.json`의 step 0 `summary` — Polar 클라이언트 팩토리가
  이미 있는지 확인(없다면 이 step에서 `src/services/polar/client.ts`로 만든다 —
  `createAdminSupabaseClient()`와 동일한 원칙: 함수 팩토리, 싱글턴 금지, env 없으면 명확한
  에러).
- `.env.example`, 로컬 `.env.local`의 **변수 이름만**(값은 출력하지 마라) — 실제 배포된
  Vercel 환경변수는 `POLAR_PRODUCT_ID`가 아니라 **`POLAR_PRO_MONTHLY_PRODUCT_ID`**,
  `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, 그리고 `SUCCESS_URL`, `POLAR_SERVER`
  (`sandbox`|`production`)가 등록되어 있다 — `.env.example`은 아직 옛 이름
  (`POLAR_PRODUCT_ID`)으로 되어 있으니 이 step에서 `POLAR_PRO_MONTHLY_PRODUCT_ID`,
  `SUCCESS_URL`, `POLAR_SERVER` 항목으로 갱신한다(값은 비워둔 채로, 기존 파일 포맷 유지).
- `src/types/api.ts` — `CheckoutRequestBody`, `CancelResponse` 타입.
- `src/app/api/subscription/{checkout,cancel}/route.ts` — 현재 mock 구현.

## 작업

### 1. `src/services/polar/client.ts`

```ts
export function createPolarClient(): Polar   // SDK가 export하는 클라이언트 타입
```

`POLAR_ACCESS_TOKEN`으로 인증하고, `POLAR_SERVER` 환경변수(`'sandbox'` | `'production'`,
없으면 `'sandbox'`로 기본값 — ADR-008 "샌드박스 우선 검증")를 SDK의 서버 선택 옵션에
전달한다.

### 2. `src/types/api.ts` 수정

`CheckoutSuccessResponse`를 제거하고 아래로 교체한다(이 타입을 참조하는 곳이 있다면 이
step에서 찾아서 함께 고친다 — 단, `src/app/billing/page.tsx` 자체의 화면 로직 변경은 다음
step 범위이므로 타입 임포트만 맞춰준다):

```ts
export interface CheckoutStartResponse {
  checkoutUrl: string;
}
```

`CheckoutRequestBody`, `CancelResponse`는 그대로 둔다.

### 3. `src/app/api/subscription/checkout/route.ts` (POST)

1. `createServerSupabaseClient()`로 `auth.getUser()`. 없으면 401.
2. 요청 바디를 `CheckoutRequestBody`로 파싱한다. **`simulateFailure`는 실제 Polar 흐름에는
   없는 개념이므로 이 step부터는 완전히 제거한다** — mock 전용 테스트 훅이었다(화면 쪽 실패
   미리보기 버튼도 다음 step에서 함께 정리한다).
3. `createPolarClient()`로 체크아웃 세션을 생성한다: 상품은
   `process.env.POLAR_PRO_MONTHLY_PRODUCT_ID`, 성공 리다이렉트는
   `process.env.SUCCESS_URL`(없으면 `${origin}/billing`로 fallback, `origin`은
   `request.nextUrl.origin`). **반드시 이 사용자를 식별할 수 있는 값(SDK가 지원하는
   external customer id 또는 metadata 파라미터 — 정확한 이름은 SDK 문서에서 확인)에
   `user.id`를 담아라** — 이게 없으면 다음 step(9)의 웹훅이 어느 내부 사용자의 구독인지
   알 방법이 없다. 이건 이 step에서 가장 중요한 규칙이다.
4. 생성된 체크아웃 세션의 호스팅 결제 페이지 URL을 `{ checkoutUrl: url }`
   (`CheckoutStartResponse`)로 200 응답한다.
5. Polar API 호출이 실패하면(인증 오류, 상품 ID 오류 등) 500 +
   `{ error: '결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요' }`로 응답한다(내부
   예외 비노출).
6. `subscriptions` 테이블에 **아무것도 쓰지 마라** — 이 라우트는 Polar 세션을 만들 뿐이다.

### 4. `src/app/api/subscription/cancel/route.ts` (POST)

1. `createServerSupabaseClient()`로 `auth.getUser()`. 없으면 401.
2. `createServerSupabaseClient()`(RLS)로 `subscriptions`에서 본인 row를 조회한다.
   `status !== 'active'`거나 row가 없으면 400 `{ error: '활성 구독이 없습니다' }`(기존 메시지
   유지).
3. `polar_subscription_id`로 Polar API를 호출해 **다음 결제 주기부터 자동 갱신을
   중단**시킨다(정확한 메서드명은 SDK 문서 확인 — "구독 취소"가 아니라 "주기 종료 시
   취소"에 해당하는 옵션을 써야 한다, F-QVPIEG "현재 결제 주기 종료까지는 활성 유지").
4. Polar 응답에서 받은 만료/종료 예정일로 `CancelResponse`(`{ subscriptionStatus:
   'cancel_scheduled', currentPeriodEnd }`)를 200 응답한다. **`subscriptions` 테이블은 이
   라우트에서 갱신하지 않는다** — 실제 확정은 웹훅이 한다(ADR-012). 화면에는 "요청 접수,
   확정 대기 중"에 해당하는 낙관적 표시만 즉시 보여주는 셈이다(F-PAOWJD의 "갱신 중이면
   마지막 확정 상태 또는 갱신 중 상태 표시" 규칙과 부합).
5. Polar API 호출 실패 시 500 + `{ error: '구독 해지 요청 중 문제가 발생했습니다' }`.

### 5. 테스트

Polar SDK를 `vi.mock`으로 모킹해서(실제 네트워크 호출 없이):

- `/api/subscription/checkout`: 인증 없음 → 401. 정상 → 200 + `checkoutUrl`, Polar SDK
  호출 인자에 `user.id`(또는 그에 해당하는 correlation 필드)와
  `POLAR_PRO_MONTHLY_PRODUCT_ID`가 담겼는지. Polar 호출 실패 → 500.
- `/api/subscription/cancel`: 인증 없음 → 401. 구독 없음/비활성 → 400. 활성 구독 →
  Polar 취소 API가 올바른 `polar_subscription_id`로 호출되는지, 응답이
  `CancelResponse` shape인지, **`subscriptions` 테이블에 대한 쓰기 호출이 전혀 없는지**
  (mock의 `update`/`upsert`가 호출되지 않았음을 명시적으로 검증).

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `simulateFailure`가 완전히 제거됐는가?
   - 두 라우트 모두 `subscriptions` 테이블에 쓰기를 하지 않는가(ADR-012)?
   - 체크아웃 세션 생성 시 `user.id`를 식별할 correlation 값이 반드시 담겼는가?
   - `.env.example`이 `POLAR_PRO_MONTHLY_PRODUCT_ID`/`SUCCESS_URL`/`POLAR_SERVER`로
     갱신됐는가?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 7 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 Polar 클라이언트 위치, correlation에 쓴
     파라미터 이름, `CheckoutStartResponse` 타입 도입을 한 줄로 요약(다음 step 8과 9가 이걸
     알아야 한다).
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요(예: `POLAR_ACCESS_TOKEN` 인증 실패, 상품 ID를 Polar에서 찾을 수 없음)
     → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- 이 두 라우트에서 `subscriptions` 테이블에 어떤 형태로든 쓰기(update/upsert)를 하지 마라.
  이유: ADR-012 — 웹훅만이 구독 상태의 유일한 신뢰 소스다. 여기서 낙관적으로 쓰면 웹훅과
  경합하거나 웹훅이 늦게 와도 이미 활성화된 것처럼 보이는 버그가 생긴다.
- `src/app/billing/page.tsx`, `src/app/api/webhooks/`를 이 step에서 건드리지 마라. 이유:
  화면 연동은 step 8, 웹훅은 step 9 범위다.
- Polar SDK 메서드/파라미터 이름을 검증 없이 추측해서 쓰지 마라. 이유: 학습 데이터 시점과
  실제 SDK가 다를 수 있고, 틀리면 빌드는 통과해도 런타임에 조용히 실패할 수 있다(예: 잘못된
  파라미터명으로 correlation이 안 붙으면 웹훅이 영원히 사용자를 못 찾는다).
- 기존 테스트를 깨뜨리지 마라.
