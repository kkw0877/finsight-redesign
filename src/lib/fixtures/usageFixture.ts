import type { SubscriptionStatus, UsageStatus } from "@/types/usage";

const FREE_LIMIT = 2;
const SUBSCRIPTION_LIMIT = 2;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

let freeUsedCount = 0;
let subscriptionUsedCount = 0;
let subscriptionStatus: SubscriptionStatus = "none";
let currentPeriodEnd: string | null = null;

function getPeriodMonth(): string {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getSubscriptionLimit(): number {
  return subscriptionStatus === "active" || subscriptionStatus === "cancel_scheduled"
    ? SUBSCRIPTION_LIMIT
    : 0;
}

export function getUsageStatus(): UsageStatus {
  const subscriptionLimit = getSubscriptionLimit();
  return {
    periodMonth: getPeriodMonth(),
    freeUsedCount,
    freeLimit: FREE_LIMIT,
    freeRemaining: Math.max(0, FREE_LIMIT - freeUsedCount),
    subscriptionUsedCount,
    subscriptionLimit,
    subscriptionRemaining: Math.max(0, subscriptionLimit - subscriptionUsedCount),
    subscriptionStatus,
    currentPeriodEnd,
  };
}

export function hasRemainingAnalysis(): boolean {
  const status = getUsageStatus();
  return status.freeRemaining > 0 || status.subscriptionRemaining > 0;
}

export function consumeOneAnalysis(): void {
  if (freeUsedCount < FREE_LIMIT) {
    freeUsedCount += 1;
    return;
  }
  subscriptionUsedCount += 1;
}

export function activateSubscription(periodEnd: string): void {
  subscriptionStatus = "active";
  subscriptionUsedCount = 0;
  currentPeriodEnd = periodEnd;
}

export function cancelSubscription(periodEnd: string): void {
  subscriptionStatus = "cancel_scheduled";
  currentPeriodEnd = periodEnd;
}
