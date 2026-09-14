import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest as resetUsage, getUsageStatus } from "@/lib/fixtures/usageFixture";
import { POST as checkout } from "../checkout/route";
import { POST } from "./route";

describe("POST /api/subscription/cancel", () => {
  beforeEach(() => {
    resetUsage();
  });

  it("returns 400 when there is no active subscription", async () => {
    const response = await POST();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
  });

  it("cancels an active subscription, keeping the existing currentPeriodEnd", async () => {
    await checkout(
      new Request("http://localhost/api/subscription/checkout", { method: "POST" }),
    );
    const { currentPeriodEnd: activatedPeriodEnd } = getUsageStatus();

    const response = await POST();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.subscriptionStatus).toBe("cancel_scheduled");
    expect(body.currentPeriodEnd).toBe(activatedPeriodEnd);

    const after = getUsageStatus();
    expect(after.subscriptionStatus).toBe("cancel_scheduled");
    expect(after.currentPeriodEnd).toBe(activatedPeriodEnd);
  });
});
