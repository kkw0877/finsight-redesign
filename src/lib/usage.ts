import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionStatus, UsageStatus } from "@/types/usage";

const FREE_LIMIT = 2;
const SUBSCRIPTION_LIMIT = 2;
const USAGE_TABLE = "usage_monthly";
const SUBSCRIPTIONS_TABLE = "subscriptions";

/** KST(Asia/Seoul) 기준 'YYYY-MM' — F-ILHNGA의 매월 1일(KST) 초기화 기준일 계산용. */
export function getCurrentPeriodMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

async function fetchUsageRow(
  supabase: SupabaseClient,
  userId: string,
  periodMonth: string,
): Promise<{ free_used_count: number; subscription_used_count: number }> {
  const { data, error } = await supabase
    .from(USAGE_TABLE)
    .select("free_used_count, subscription_used_count")
    .eq("user_id", userId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    free_used_count: (data?.free_used_count as number | undefined) ?? 0,
    subscription_used_count: (data?.subscription_used_count as number | undefined) ?? 0,
  };
}

export async function getUsageStatus(supabase: SupabaseClient, userId: string): Promise<UsageStatus> {
  const periodMonth = getCurrentPeriodMonth();

  const usageRow = await fetchUsageRow(supabase, userId, periodMonth);

  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (subscriptionError) {
    throw subscriptionError;
  }

  const subscriptionStatus: SubscriptionStatus =
    (subscriptionRow?.status as SubscriptionStatus | undefined) ?? "none";
  const subscriptionLimit = subscriptionStatus === "active" ? SUBSCRIPTION_LIMIT : 0;

  return {
    periodMonth,
    freeUsedCount: usageRow.free_used_count,
    freeLimit: FREE_LIMIT,
    freeRemaining: Math.max(0, FREE_LIMIT - usageRow.free_used_count),
    subscriptionUsedCount: usageRow.subscription_used_count,
    subscriptionLimit,
    subscriptionRemaining: Math.max(0, subscriptionLimit - usageRow.subscription_used_count),
    subscriptionStatus,
    currentPeriodEnd: (subscriptionRow?.current_period_end as string | null | undefined) ?? null,
  };
}

/** 정상 완료된 분석에 대해서만 호출한다 — 무료 잔여 우선 차감, 소진 시 구독분 차감(F-ILHNGA). */
export async function consumeOneAnalysis(supabase: SupabaseClient, userId: string): Promise<void> {
  const periodMonth = getCurrentPeriodMonth();
  const usageRow = await fetchUsageRow(supabase, userId, periodMonth);

  const nextFreeUsedCount =
    usageRow.free_used_count < FREE_LIMIT ? usageRow.free_used_count + 1 : usageRow.free_used_count;
  const nextSubscriptionUsedCount =
    usageRow.free_used_count < FREE_LIMIT
      ? usageRow.subscription_used_count
      : usageRow.subscription_used_count + 1;

  const { error } = await supabase.from(USAGE_TABLE).upsert({
    user_id: userId,
    period_month: periodMonth,
    free_used_count: nextFreeUsedCount,
    subscription_used_count: nextSubscriptionUsedCount,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}
