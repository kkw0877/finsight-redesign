import posthog from "posthog-js";
import type { AnalyticsEvent, AnalyticsProperties } from "@/types/analytics";

// 환경변수가 없으면(로컬 미설정 등) 조용히 건너뛴다 — 분석 도구 때문에 화면이 깨지면 안 된다.
function isEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
  );
}

export function trackEvent(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (!isEnabled()) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // 트래킹 실패는 사용자 흐름에 영향을 주지 않는다.
  }
}

export function resetAnalytics(): void {
  if (!isEnabled()) return;
  try {
    posthog.reset();
  } catch {
    // 위와 동일
  }
}

/** /api/usage 응답 헤더의 사용자 ID로 identify한다. 이메일 등 다른 정보는 보내지 않는다. */
export function identifyFromUsageResponse(response: Response): void {
  if (!isEnabled()) return;
  const userId = response.headers?.get("X-Finsight-PostHog-Distinct-Id");
  if (!userId) return;
  try {
    posthog.identify(userId);
  } catch {
    // 위와 동일
  }
}
