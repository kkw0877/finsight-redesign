export type SubscriptionStatus = "none" | "active" | "cancel_scheduled" | "inactive";

export interface UsageStatus {
  periodMonth: string; // 'YYYY-MM' (KST 기준, F-ILHNGA)
  freeUsedCount: number;
  freeLimit: number; // 항상 2 (F-ILHNGA)
  freeRemaining: number;
  subscriptionUsedCount: number;
  subscriptionLimit: number; // 활성 구독 시 2, 비구독 시 0 (F-UXSBGF: 월 최대 4회 = 무료 2 + 구독 2)
  subscriptionRemaining: number;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: string | null; // ISO 날짜, 구독 비활성 시 null
}
