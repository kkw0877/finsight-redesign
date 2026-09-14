import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest as resetAnalysis, startProcessing } from "@/lib/fixtures/analysisFixture";
import {
  __resetForTest as resetUsage,
  consumeOneAnalysis,
  getUsageStatus,
} from "@/lib/fixtures/usageFixture";
import { POST } from "./route";

function makeRequest(): Request {
  return new Request("http://localhost/api/analysis/start", { method: "POST" });
}

describe("POST /api/analysis/start", () => {
  beforeEach(() => {
    resetAnalysis();
    resetUsage();
  });

  it("returns 200 with an AnalysisResult shape and consumes one free analysis", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("categoryBreakdown");
    expect(body).toHaveProperty("anomalies");
    expect(body).toHaveProperty("recommendations");
    expect(body).toHaveProperty("generatedAt");

    expect(getUsageStatus().freeUsedCount).toBe(1);
  });

  it("returns 402 when no remaining free or subscription analyses", async () => {
    consumeOneAnalysis();
    consumeOneAnalysis();
    const response = await POST(makeRequest());
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
  });

  it("returns 409 when a job is already processing", async () => {
    startProcessing();
    const response = await POST(makeRequest());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
  });
});
