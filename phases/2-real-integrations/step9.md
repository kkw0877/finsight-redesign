# Step 9: polar-webhook

## 배경

Step 7에서 결제/해지 라우트가 Polar API만 호출하고 우리 DB의 `subscriptions` 테이블은 건드리지
않도록 만들어뒀다 — 이 step에서 만드는 웹훅(`POST /api/webhooks/polar`)이 바로 그
`subscriptions` 상태를 실제로 갱신하는 **유일한 곳**이다(ADR-012).

이 라우트는 로그인 세션이 아니라 **Polar 웹훅 서명**으로만 인증한다 — `docs/ARCHITECTURE.md`
가 이미 명시했고 step 2의 `src/middleware.ts` matcher에도 이 경로가 빠져 있다(직접 확인하라).

**Polar SDK/웹훅 검증 방식도 추측하지 마라** — `@polar-sh/sdk`가 서명 검증 헬퍼(예:
`validateEvent` 류)를 함께 제공하는지 먼저 확인하고, 있으면 그걸 쓴다. 직접 HMAC을 구현해야
한다면 Polar 공식 문서의 웹훅 서명 방식을 확인한 뒤 구현한다.

**서명 검증의 흔한 실수**: 서명은 요청 **원문 바이트**에 대해 계산된다. Next.js Route
Handler에서 `request.json()`을 먼저 호출해 파싱한 뒤 그걸 다시 문자열화해서 검증하면 서명이
안 맞을 수 있다 — 반드시 `await request.text()`로 원문을 먼저 얻어 검증에 쓰고, 검증을
통과한 뒤에만 `JSON.parse()`한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — ADR-012(웹훅 idempotency, 서명 검증, 상태 갱신 유일 소스) **전체를
  정독**.
- `/docs/ARCHITECTURE.md` — "API 인터페이스" 표의 `/api/webhooks/polar` 행, "데이터 모델"
  절의 `webhook_events` 테이블.
- `phases/2-real-integrations/index.json`의 step 7 `summary` — 체크아웃 생성 시 `user.id`를
  담은 correlation 필드 이름(웹훅 payload에서 이 값을 읽어 내부 사용자를 찾아야 한다),
  `subscriptions.polar_subscription_id`/`polar_customer_id` 컬럼명.
- `src/services/supabase/admin.ts` — 이 라우트가 쓸 클라이언트(세션이 없으므로 admin만
  가능하다).

**이미 확정된 사항**: `SubscriptionStatus`는 `'none' | 'active' | 'cancel_scheduled' |
'inactive'` 4가지로 유지한다(enum을 확장하지 않기로 이미 논의해 확정함). Polar의
`subscription.past_due` 같이 이 enum에 없는 이벤트는 상태를 바꾸지 않고 idempotency 기록만
남긴다 — 아래 "작업" 절 표를 그대로 따른다.

## 작업

### 1. 서명 검증 + 원문 파싱

`await request.text()`로 원문을 얻고, `POLAR_WEBHOOK_SECRET`으로 서명을 검증한다. 실패하면
401을 반환한다(바디 파싱 이전에 검증한다). 통과하면 `JSON.parse(rawBody)`로 이벤트를 얻는다
— `{ id: string, type: string, data: {...} }` 형태로 가정하고 정확한 필드는 SDK 타입에서
확인한다.

### 2. Idempotency (admin 클라이언트, `webhook_events`)

- `event.id`로 기존 row가 있는지 조회한다. 있으면(이미 처리했거나 처리 중) 200
  `{ received: true }`로 즉시 응답하고 아무것도 다시 처리하지 않는다.
- 없으면 `{ id: event.id, type: event.type, received_at: now() }`를 insert한다. (이 insert가
  유니크 제약 위반으로 실패하면 — 동시에 같은 이벤트가 두 번 들어온 race — 이미 처리 중인
  것으로 보고 200으로 응답하고 중단한다.)

### 3. 이벤트 타입별 처리

| `event.type` | `subscriptions.status` | 그 외 갱신 |
|---|---|---|
| `subscription.active` | `'active'` | `polar_subscription_id`, `polar_customer_id`, `current_period_end`, `auto_renew=true` |
| `subscription.canceled` | `'cancel_scheduled'` | `current_period_end`(유지), `auto_renew=false` |
| `subscription.revoked` | `'inactive'` | — |
| `subscription.updated`, `subscription.cycled` | (바꾸지 않음) | `current_period_end`, `auto_renew`만 이벤트 payload 값으로 갱신(구독 row가 이미 있을 때만 — 없으면 그냥 무시) |
| `subscription.past_due` 등 표에 없는 모든 타입 | (바꾸지 않음) | 없음 — idempotency 기록만 남기고 종료 |

각 케이스에서, 상태를 바꾸는 이벤트(`active`/`canceled`/`revoked`)는 payload에서 correlation
값(step 7에서 체크아웃에 심은 `user.id`)을 읽어 내부 사용자를 찾는다. **그 값을 못 찾으면
`subscriptions`에 아무것도 쓰지 말고 `console.error`로 로그만 남기고 200으로 응답한다**
(Polar가 무한 재시도하지 않도록 — ADR-009: 별도 에러 모니터링 도구 없이 Vercel 로그로
충분하다는 방침과 일치). `subscriptions` upsert는 `user_id`(PK) 기준으로 한다.

### 4. 처리 완료 표시

성공적으로 처리한 뒤 `webhook_events` row의 `processed_at`을 갱신한다. 이 갱신이 실패해도
치명적이지 않다(idempotency 판정은 row 존재 여부만 보므로) — 로그만 남기고 200으로
응답한다.

### 5. 에러 처리

이 라우트는 사람이 읽는 화면이 아니라 Polar 서버가 호출하는 엔드포인트다 — CLAUDE.md의
"내부 예외를 사용자에게 노출하지 않는다" 규칙은 여기서 "Polar에게 무엇을 돌려주는가"에
적용된다: 서명 검증 실패는 401, 예측하지 못한 처리 중 예외(DB 연결 오류 등)는 500으로
응답해 Polar가 표준 웹훅 재시도 정책에 따라 다시 보내게 한다(idempotency가 이미 있으므로
재시도돼도 안전하다). 응답 바디에 스택 트레이스를 넣지 않는다.

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

`@/services/supabase/admin`과 서명 검증 함수를 `vi.mock`으로 모킹해서:

- 서명 검증 실패 → 401, `webhook_events`에 아무 쓰기도 없는지.
- 처음 보는 `event.id` + `subscription.active` → `webhook_events` insert + `subscriptions`
  upsert(`status: 'active'`)가 올바른 `user_id`로 호출되는지, 200 응답.
- 같은 `event.id`를 다시 보내면(이미 `webhook_events`에 존재) → `subscriptions`에 대한 쓰기가
  전혀 없이 200만 응답하는지(idempotency).
- `subscription.canceled` → `status: 'cancel_scheduled'`. `subscription.revoked` →
  `status: 'inactive'`.
- `subscription.past_due`(표에 없는 타입) → `webhook_events`에는 기록되지만
  `subscriptions`에는 쓰기가 없는지.
- correlation 값을 찾을 수 없는 이벤트 → `subscriptions` 쓰기 없이 200(로그만).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/middleware.ts`의 matcher에 `/api/webhooks/`가 여전히 빠져 있는가(건드리지 않았어야
     한다)?
   - 서명 검증이 `request.text()` 원문에 대해 이루어지는가?
   - idempotency가 실제로 중복 처리를 막는가?
   - `SubscriptionStatus`에 새 값을 추가하지 않았는가?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 9 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 처리하는 이벤트 타입 목록과 상태 매핑을
     한 줄로 요약.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요(예: Polar 대시보드에서 이 웹훅 엔드포인트의 실제 시크릿/이벤트 구독
     목록을 재확인해야 함) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후
     즉시 중단.

## 금지사항

- `SubscriptionStatus` 타입에 `'past_due'` 등 새 값을 추가하지 마라. 이유: 이미 논의해
  "enum 확장 없음"으로 확정했다 — 위 표의 매핑을 그대로 따른다.
- `src/middleware.ts`의 matcher에 이 라우트를 추가하지 마라. 이유: 웹훅은 세션이 없다 —
  추가하면 Polar의 모든 웹훅 호출이 401로 막힌다.
- 서명 검증 없이(또는 검증 실패 시에도) 이벤트를 처리하지 마라. 이유: 서명 검증이 없으면
  누구나 이 엔드포인트에 가짜 결제 완료 이벤트를 보내 무료로 구독을 활성화할 수 있다 —
  치명적인 보안 취약점이다.
- 기존 테스트를 깨뜨리지 마라.
