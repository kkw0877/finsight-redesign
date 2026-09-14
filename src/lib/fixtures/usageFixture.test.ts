import { describe, expect, it } from "vitest";
import {
  activateSubscription,
  cancelSubscription,
  consumeOneAnalysis,
  getUsageStatus,
  hasRemainingAnalysis,
} from "./usageFixture";

describe("usageFixture", () => {
  it("starts with 2 free analyses remaining and no subscription", () => {
    const status = getUsageStatus();
    expect(status.freeUsedCount).toBe(0);
    expect(status.freeLimit).toBe(2);
    expect(status.freeRemaining).toBe(2);
    expect(status.subscriptionStatus).toBe("none");
    expect(status.subscriptionLimit).toBe(0);
    expect(status.currentPeriodEnd).toBeNull();
    expect(status.periodMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it("consumes free analyses first, then subscription analyses once activated", () => {
    consumeOneAnalysis();
    consumeOneAnalysis();
    expect(getUsageStatus().freeUsedCount).toBe(2);
    expect(getUsageStatus().freeRemaining).toBe(0);

    activateSubscription("2026-10-01T00:00:00.000Z");
    expect(getUsageStatus().subscriptionStatus).toBe("active");
    expect(getUsageStatus().subscriptionRemaining).toBe(2);

    consumeOneAnalysis();
    expect(getUsageStatus().subscriptionUsedCount).toBe(1);
    expect(getUsageStatus().subscriptionRemaining).toBe(1);
    expect(hasRemainingAnalysis()).toBe(true);

    consumeOneAnalysis();
    expect(getUsageStatus().subscriptionUsedCount).toBe(2);
    expect(hasRemainingAnalysis()).toBe(false);
  });

  it("marks the subscription as cancel_scheduled while keeping the current period end", () => {
    cancelSubscription("2026-10-01T00:00:00.000Z");
    const status = getUsageStatus();
    expect(status.subscriptionStatus).toBe("cancel_scheduled");
    expect(status.currentPeriodEnd).toBe("2026-10-01T00:00:00.000Z");
  });
});
