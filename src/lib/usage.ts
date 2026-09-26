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

/**
 * 정상 완료된 분석에 대해서만 호출한다 — 무료 잔여 우선 차감, 소진 시 구독분 차감(F-ILHNGA).
 *
 * 읽은 뒤 +1 해서 upsert하는 방식이 아니라 `increment_usage` DB 함수(단일 원자적
 * INSERT ... ON CONFLICT DO UPDATE, 20260926190000_atomic_usage_increment.sql)를 호출한다 —
 * 사용자당 동시 processing job은 1개로 강제되지만(ADR-013), 한 job의 완료 처리와 다음 job의
 * 완료 처리가 짧은 간격으로 겹치면 read-then-write 방식은 lost update로 쿼터를 초과시킬 수
 * 있었다.
 */
export async function consumeOneAnalysis(supabase: SupabaseClient, userId: string): Promise<void> {
  const periodMonth = getCurrentPeriodMonth();

  const { error } = await supabase.rpc("increment_usage", {
    p_user_id: userId,
    p_period_month: periodMonth,
    p_free_limit: FREE_LIMIT,
  });

  if (error) {
    throw error;
  }
}
