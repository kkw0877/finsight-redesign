/** PostHog error tracking alert 중 oncall이 받는 라이프사이클 이벤트. */
export const ONCALL_ALERT_EVENTS = [
  "$error_tracking_issue_created",
  "$error_tracking_issue_reopened",
  "$error_tracking_issue_spiking",
] as const;

export type OncallAlertEvent = (typeof ONCALL_ALERT_EVENTS)[number];

/** 웹훅 본문에서 정제해 CI로 넘기는 alert 요약. 원문(스택 트레이스 등)은 넘기지 않는다. */
export interface OncallAlert {
  event: OncallAlertEvent;
  issueId: string;
  name: string;
  description: string;
  fingerprint: string | null;
  timestamp: string | null;
  currentBucketValue: number | null;
  computedBaseline: number | null;
  url: string | null;
}
