import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/usage", () => {
  it("returns 200 with UsageStatus shape", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("periodMonth");
    expect(body).toHaveProperty("freeUsedCount");
    expect(body).toHaveProperty("freeLimit");
    expect(body).toHaveProperty("freeRemaining");
    expect(body).toHaveProperty("subscriptionUsedCount");
    expect(body).toHaveProperty("subscriptionLimit");
    expect(body).toHaveProperty("subscriptionRemaining");
    expect(body).toHaveProperty("subscriptionStatus");
    expect(body).toHaveProperty("currentPeriodEnd");
  });
});
