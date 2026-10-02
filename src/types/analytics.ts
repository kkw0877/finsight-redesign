/**
 * PostHog 이벤트 이름 카탈로그 — docs/TRACKING.md의 트래킹 플랜과 1:1로 맞춘다.
 * 오타로 이벤트가 쪼개지는 것을 막기 위해 이름은 이 유니온으로만 쓴다.
 * 이벤트 속성에는 개인정보(이메일, 파일명, 가맹점명, 금액)를 넣지 않는다.
 */
export type AnalyticsEvent =
  // 진입 및 인증 (user-flow 섹션 1)
  | "google_sign_in_started"
  | "google_sign_in_failed"
  | "sign_up_completed"
  | "sign_in_completed"
  | "user_logged_out"
  // 파일 업로드 (섹션 3)
  | "file_selected"
  | "upload_validation_failed"
  | "file_uploaded"
  | "upload_failed"
  // AI 분석 (섹션 3·4)
  | "analysis_started"
  | "analysis_limit_reached"
  | "analysis_completed"
  | "analysis_failed"
  | "analysis_request_failed"
  | "analysis_result_viewed"
  // 구독 결제 (섹션 5)
  | "billing_plan_viewed"
  | "checkout_started"
  | "checkout_failed"
  | "subscription_activated"
  | "subscription_cancel_requested"
  | "subscription_cancel_scheduled"
  | "subscription_revoked"
  | "subscription_payment_failed";

export type AnalyticsProperties = Record<string, string | number | boolean | null>;
