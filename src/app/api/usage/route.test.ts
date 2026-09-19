import { describe, expect, it, vi } from "vitest";
import type { UsageStatus } from "@/types/usage";

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/usage", () => ({
  getUsageStatus: vi.fn(),
}));

import { createServerSupabaseClient } from "@/services/supabase/server";
import { getUsageStatus } from "@/lib/usage";
import { GET } from "./route";

const MOCK_USER = { id: "user-1" };

const MOCK_USAGE_STATUS: UsageStatus = {
  periodMonth: "2026-09",
  freeUsedCount: 1,
  freeLimit: 2,
  freeRemaining: 1,
  subscriptionUsedCount: 0,
  subscriptionLimit: 0,
  subscriptionRemaining: 0,
  subscriptionStatus: "none",
  currentPeriodEnd: null,
};

function mockSupabase(user: { id: string } | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  };
}

describe("GET /api/usage", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase(null) as never);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 200 with the UsageStatus returned by getUsageStatus", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase(MOCK_USER) as never);
    vi.mocked(getUsageStatus).mockResolvedValue(MOCK_USAGE_STATUS);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(MOCK_USAGE_STATUS);
    expect(getUsageStatus).toHaveBeenCalledWith(expect.anything(), MOCK_USER.id);
  });

  it("returns 500 with a generic message when getUsageStatus throws", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase(MOCK_USER) as never);
    vi.mocked(getUsageStatus).mockRejectedValue(new Error("connection refused"));

    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(body.error).not.toContain("connection refused");
  });
});
