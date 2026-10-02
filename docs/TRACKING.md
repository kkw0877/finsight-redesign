# Finsight 트래킹 플랜 (PostHog)

> 기준: [user-flow.md](./user-flow.md)의 노드(n1~n35), [prd.md](./prd.md)의 Success Metrics(KPI),
> [ADR.md](./ADR.md)의 ADR-009(제품 분석은 PostHog). 이벤트 이름은
> [`src/types/analytics.ts`](../src/types/analytics.ts)의 `AnalyticsEvent` 유니온이 단일 출처다.

## 원칙

- **서버 우선**: 결과가 서버에서 확정되는 이벤트(업로드/분석 완료·실패/가입/결제)는 API 라우트에서
  `captureServerEvent`로 기록한다. 브라우저 이벤트는 광고 차단·탭 닫힘으로 유실되기 쉽고, 같은
  사실을 클라이언트·서버가 둘 다 보내면 중복 집계된다. 브라우저는 화면에서만 알 수 있는 것(파일
  선택, 클라이언트 검증 실패, 결과 화면 노출, 네트워크 실패)만 보낸다.
- **식별**: distinct id는 항상 Supabase 사용자 ID. 로그인 후 `/api/usage` 응답 헤더의 ID로
  `identify`한다. 이메일은 PostHog로 보내지 않는다.
- **개인정보 금지 속성**: 이메일, 파일명, 가맹점명, 금액, 거래 내용, 예외 메시지는 이벤트·로그
  속성에 넣지 않는다. 개수(`*_count`), 형식(`file_type`), 크기(`file_size_kb`), 소요 시간,
  오류 종류(`error_type` = 예외 이름 또는 DB 오류 코드)만 쓴다. AI 호출 기록은 `privacyMode: true`.
- **실패 안전**: 트래킹 호출은 예외를 던지지 않는다(`src/lib/analytics.ts`,
  `src/services/posthog/server.ts`). 환경변수가 없으면 조용히 건너뛴다.
- **로그 vs 이벤트**: 제품 이벤트는 "사용자가 한 일"(분석·전환율용), 구조화 로그
  (`logServerEvent`)는 "시스템에서 일어난 문제"(장애 대응용)다. 서버 오류 경로는 둘 다 남긴다.

## user-flow 노드별 이벤트

| user-flow | 지점 | 이벤트 | 발생 위치 | 주요 속성 |
|---|---|---|---|---|
| n2 랜딩 | 방문 | `$pageview`(자동) | posthog-js | — |
| n7 소셜 로그인 클릭 | 버튼 클릭 | `google_sign_in_started` | 브라우저 `login/page.tsx` | — |
| n8 No 인증 실패 | 로그인 화면 복귀 | `google_sign_in_failed` | 브라우저 `login/page.tsx` | `reason` |
| n8·n9 인증 성공 | OAuth 콜백 | `sign_up_completed`(신규) / `sign_in_completed`(기존) | 서버 `auth/callback` | `provider` |
| n35 로그아웃 | 로그아웃 성공 | `user_logged_out` (+ `reset`) | 브라우저 `dashboard/page.tsx` | — |
| n15 파일 선택 | 클라이언트 선택 | `file_selected` | 브라우저 `dashboard/page.tsx` | `file_type`, `file_size_kb` |
| n16 No 형식 무효 | 클라이언트 검증 실패 | `upload_validation_failed` | 브라우저 `dashboard/page.tsx` | `reason` |
| n16·n17 | 서버 검증/저장 실패 | `upload_failed` | 서버 `api/upload` | `reason`(`unsupported_format`/`file_too_large`/`storage_upload_error`/`db_insert_error`) |
| n16 Yes | 업로드 성공 | `file_uploaded` | 서버 `api/upload` | `file_type`, `file_size_kb` |
| n20 No 횟수 없음 | 소진 상태에서 시작 | `analysis_limit_reached` | 브라우저(`source: client`) / 서버 402(`source: server`) | `source` |
| n21 분석 시작 | 분석 요청 | `analysis_started` | 브라우저 `dashboard/page.tsx` | — |
| n23 Yes | 분석 성공 | `analysis_completed` | 서버 `api/analysis/start` | `file_type`, `transaction_count`, `category_count`, `anomaly_count`, `recommendation_count`, `duration_ms` |
| n18·n23 No | 추출/분석/저장 실패 | `analysis_failed` | 서버 `api/analysis/start` | `file_type`, `stage`(`storage`/`extraction`/`analysis`/`save`), `error_type`, `duration_ms` |
| n22·n24 | 서버에 닿지 못한 실패 | `analysis_request_failed` | 브라우저 `dashboard/page.tsx` | `reason: network` |
| n25~n27 결과 | 결과 화면 노출 | `analysis_result_viewed` | 브라우저 `dashboard/page.tsx` | `source`(`completed`/`returning`), 카테고리·이상·추천 개수 |
| n29 결제 화면 | 플랜 화면 노출 | `billing_plan_viewed` | 브라우저 `billing/page.tsx` | — |
| n31 결제 진행 | 체크아웃 생성 | `checkout_started` | 서버 `api/subscription/checkout` | — |
| n33 결제 실패 | 체크아웃 생성 실패 | `checkout_failed` | 서버 `api/subscription/checkout` | `reason` |
| n32·n34 결제 성공 | Polar 웹훅 | `subscription_activated` | 서버 `api/webhooks/polar` | — |
| 구독 해지 | 해지 요청 성공 | `subscription_cancel_requested` | 서버 `api/subscription/cancel` | — |
| 구독 해지 | 웹훅 확정 | `subscription_cancel_scheduled` / `subscription_revoked` | 서버 `api/webhooks/polar` | — |
| 갱신 실패 | 웹훅 | `subscription_payment_failed` | 서버 `api/webhooks/polar` | — |

결제 성공의 단일 출처는 Polar 웹훅이다(ADR-012). 결제 완료 후 리다이렉트로 돌아온 화면 이벤트는
의도적으로 두지 않았다.

## KPI → 퍼널 정의 (PostHog Funnels)

| KPI (prd.md) | 퍼널 / 지표 |
|---|---|
| 방문 → 가입 전환율 | `$pageview`(`/`) → `google_sign_in_started` → `sign_up_completed` |
| 가입 → 첫 업로드 전환율 | `sign_up_completed` → `file_uploaded` (사용자별 첫 발생) |
| 업로드 → 분석 완료율 (초기 우선) | `file_uploaded` → `analysis_completed` |
| 분석 결과 조회율 (초기 우선) | `analysis_completed` → `analysis_result_viewed` |
| 무료 사용자 월 2회 소진율 | `analysis_completed` 사용자별 월 횟수, `analysis_limit_reached` |
| 무료 → 유료 전환율 | `analysis_limit_reached` → `billing_plan_viewed` → `checkout_started` → `subscription_activated` |
| 유료 구독 유지율 | `subscription_activated` 이후 `subscription_revoked`/`subscription_payment_failed` 유무(리텐션) |
| 업로드/분석 실패 원인 | `analysis_failed`의 `stage`·`error_type`, `upload_failed`의 `reason` 분포 |

## 장애 대응용 서버 로그 (PostHog Logs)

`event` 속성으로 검색한다. 속성에는 `error_type`(예외 이름/DB 오류 코드)만 들어간다.

| event | 의미 |
|---|---|
| `analysis_processing_started/completed/failed` | 분석 처리 단계(`job_id`, `stage`, `duration_ms`) |
| `upload_failed` | 스토리지/DB 저장 실패(`reason`) — 과거 `permission denied`로 업로드가 막혔을 때 화면에선 원인을 알 수 없었던 문제 대응 |
| `oauth_start_failed`, `oauth_callback_failed` | 구글 로그인 시작/콜백 실패 |
| `checkout_failed`, `subscription_cancel_failed` | 결제 시작/해지 요청 실패 |
| `polar_webhook_signature_failed`, `polar_webhook_processing_failed`, `polar_webhook_unlinked_customer` | 웹훅 서명 위조 시도, 처리 실패, 사용자 연결 불가 |
| `analysis_latest_failed` | 최근 결과 조회 실패 |

## 아직 없는 것 / 결정이 필요한 것

- **랜딩 CTA 클릭**: 랜딩(`app/page.tsx`)은 서버 컴포넌트다. 현재는 `$pageview`와 autocapture로
  방문·클릭을 보고, 가입 퍼널은 `google_sign_in_started`부터 시작한다. CTA별 클릭 구분이 필요하면
  클라이언트 래퍼를 추가해야 한다.
- **분석 결과 만족도(KPI)**: 피드백 UI가 없어 측정하지 못한다. PostHog Surveys 도입 또는 결과 화면의
  만족도 버튼 설계가 선행되어야 한다.
- **브라우저 SDK 호출 규칙**: CLAUDE.md는 "클라이언트에서 외부 서비스 SDK를 직접 호출하지 않는다"고
  하는데, `posthog-js`는 브라우저에서 동작해야 한다. 호출은 `src/lib/analytics.ts` 한 곳으로
  모았지만 규칙 예외를 ADR로 남길지는 미정이다.
- **이벤트 보정**: `captureServerEvent`는 요청마다 클라이언트를 만들어 즉시 전송한다(응답이 수백 ms
  늘 수 있음). 지연이 문제가 되면 `after()`로 응답 뒤로 옮긴다.
