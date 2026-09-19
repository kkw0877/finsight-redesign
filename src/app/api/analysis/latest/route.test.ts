import { describe, expect, it, vi } from "vitest";
import { MOCK_ANALYSIS_RESULT } from "@/lib/fixtures/analysisFixture";

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createServerSupabaseClient } from "@/services/supabase/server";
import { GET } from "./route";

const MOCK_USER = { id: "user-1" };

const MOCK_RESULT_ROW = {
  summary: MOCK_ANALYSIS_RESULT.summary,
  category_breakdown: MOCK_ANALYSIS_RESULT.categoryBreakdown,
  anomalies: MOCK_ANALYSIS_RESULT.anomalies,
  recommendations: MOCK_ANALYSIS_RESULT.recommendations,
  generated_at: MOCK_ANALYSIS_RESULT.generatedAt,
};

function mockSupabase(options: {
  user?: { id: string } | null;
  row?: Record<string, unknown> | null;
  selectError?: unknown;
}) {
  const { user = null, row = null, selectError = null } = options;

  const eq = vi.fn().mockReturnThis();
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: selectError });
  const select = vi.fn().mockReturnValue({ eq, maybeSingle });
  const from = vi.fn().mockReturnValue({ select });

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  };
}

describe("GET /api/analysis/latest", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never,
    );

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 404 when no result exists yet", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({ user: MOCK_USER, row: null }) as never,
    );

    const response = await GET();
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
  });

  it("returns 200 with the latest result mapped to camelCase", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({ user: MOCK_USER, row: MOCK_RESULT_ROW }) as never,
    );

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(MOCK_ANALYSIS_RESULT);
  });

  it("returns 500 with a generic message when the DB query fails", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({ user: MOCK_USER, selectError: new Error("connection refused") }) as never,
    );

    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(body.error).not.toContain("connection refused");
  });
});
