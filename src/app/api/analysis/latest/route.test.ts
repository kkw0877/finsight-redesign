import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, MOCK_ANALYSIS_RESULT, setLatestResult } from "@/lib/fixtures/analysisFixture";
import { GET } from "./route";

describe("GET /api/analysis/latest", () => {
  beforeEach(() => {
    __resetForTest();
  });

  it("returns 404 when no result exists yet", async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
  });

  it("returns 200 with the latest result once one is set", async () => {
    setLatestResult(MOCK_ANALYSIS_RESULT);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(MOCK_ANALYSIS_RESULT);
  });
});
