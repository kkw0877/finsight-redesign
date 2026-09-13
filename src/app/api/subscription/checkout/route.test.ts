import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest as resetUsage, getUsageStatus } from "@/lib/fixtures/usageFixture";
import { POST } from "./route";

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/subscription/checkout", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/subscription/checkout", () => {
  beforeEach(() => {
    resetUsage();
  });

  it("activates the subscription and returns 200 when not simulating failure", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.subscriptionStatus).toBe("active");
    expect(body.currentPeriodEnd).toBeTypeOf("string");
    expect(body.billedAt).toBeTypeOf("string");

    expect(getUsageStatus().subscriptionStatus).toBe("active");
  });

  it("treats a missing body the same as simulateFailure: false", async () => {
    const response = await POST(makeRequest(undefined));
    expect(response.status).toBe(200);
  });

  it("does not change subscription status when simulateFailure is true", async () => {
    const before = getUsageStatus().subscriptionStatus;
    const response = await POST(makeRequest({ simulateFailure: true }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");

    expect(getUsageStatus().subscriptionStatus).toBe(before);
  });
});
