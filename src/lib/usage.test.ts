import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeOneAnalysis, getCurrentPeriodMonth, getUsageStatus } from "./usage";

type Row = Record<string, unknown>;

function makeSupabaseStub(tables: {
  usage_monthly?: Row[];
  subscriptions?: Row[];
}): { client: SupabaseClient; upserts: Row[] } {
  const usageMonthly = tables.usage_monthly ?? [];
  const subscriptions = tables.subscriptions ?? [];
  const upserts: Row[] = [];

  const from = vi.fn((table: string) => {
    if (table === "usage_monthly") {
      return {
        select: () => ({
          eq: (col1: string, val1: unknown) => ({
            eq: (col2: string, val2: unknown) => ({
              maybeSingle: async () => ({
                data: usageMonthly.find((r) => r[col1] === val1 && r[col2] === val2) ?? null,
                error: null,
              }),
            }),
          }),
        }),
        upsert: (row: Row) => {
          upserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "subscriptions") {
      return {
        select: () => ({
          eq: (col1: string, val1: unknown) => ({
            maybeSingle: async () => ({
              data: subscriptions.find((r) => r[col1] === val1) ?? null,
              error: null,
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { client: { from } as unknown as SupabaseClient, upserts };
}

describe("getCurrentPeriodMonth", () => {
  it("KST 기준 YYYY-MM 형식을 반환한다", () => {
    const result = getCurrentPeriodMonth();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("getUsageStatus", () => {
  it("사용 기록이 없으면 잔여 횟수를 최대치로 반환한다", async () => {
    const { client } = makeSupabaseStub({});

    const status = await getUsageStatus(client, "user-1");

    expect(status.freeUsedCount).toBe(0);
    expect(status.freeLimit).toBe(2);
    expect(status.freeRemaining).toBe(2);
    expect(status.subscriptionStatus).toBe("none");
    expect(status.subscriptionLimit).toBe(0);
    expect(status.subscriptionRemaining).toBe(0);
    expect(status.currentPeriodEnd).toBeNull();
  });

  it("활성 구독자는 구독 잔여 한도가 2다", async () => {
    const periodMonth = getCurrentPeriodMonth();
    const { client } = makeSupabaseStub({
      usage_monthly: [
        { user_id: "user-1", period_month: periodMonth, free_used_count: 2, subscription_used_count: 1 },
      ],
      subscriptions: [
        { user_id: "user-1", status: "active", current_period_end: "2026-09-30T00:00:00.000Z" },
      ],
    });

    const status = await getUsageStatus(client, "user-1");

    expect(status.freeRemaining).toBe(0);
    expect(status.subscriptionLimit).toBe(2);
    expect(status.subscriptionUsedCount).toBe(1);
    expect(status.subscriptionRemaining).toBe(1);
    expect(status.subscriptionStatus).toBe("active");
    expect(status.currentPeriodEnd).toBe("2026-09-30T00:00:00.000Z");
  });

  it("비활성 구독자는 구독 한도가 0이다", async () => {
    const { client } = makeSupabaseStub({
      subscriptions: [{ user_id: "user-1", status: "inactive", current_period_end: null }],
    });

    const status = await getUsageStatus(client, "user-1");

    expect(status.subscriptionLimit).toBe(0);
    expect(status.subscriptionRemaining).toBe(0);
  });
});

describe("consumeOneAnalysis", () => {
  it("무료 잔여가 있으면 free_used_count를 1 증가시킨다", async () => {
    const { client, upserts } = makeSupabaseStub({});

    await consumeOneAnalysis(client, "user-1");

    expect(upserts).toHaveLength(1);
    expect(upserts[0].free_used_count).toBe(1);
    expect(upserts[0].subscription_used_count).toBe(0);
  });

  it("무료 소진 시 subscription_used_count를 1 증가시킨다", async () => {
    const periodMonth = getCurrentPeriodMonth();
    const { client, upserts } = makeSupabaseStub({
      usage_monthly: [
        { user_id: "user-1", period_month: periodMonth, free_used_count: 2, subscription_used_count: 0 },
      ],
    });

    await consumeOneAnalysis(client, "user-1");

    expect(upserts[0].free_used_count).toBe(2);
    expect(upserts[0].subscription_used_count).toBe(1);
  });
});
