import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkoutsCreateMock = vi.fn();

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/services/polar/client", () => ({
  createPolarClient: vi.fn(() => ({
    checkouts: { create: checkoutsCreateMock },
  })),
}));

import { createServerSupabaseClient } from "@/services/supabase/server";
import { POST } from "./route";

const MOCK_USER = { id: "user-1" };

function mockSupabase(user: { id: string } | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  };
}

function makeRequest(): NextRequest {
  return new NextRequest("https://finsight.example.com/api/subscription/checkout", {
    method: "POST",
  });
}

describe("POST /api/subscription/checkout", () => {
  beforeEach(() => {
    checkoutsCreateMock.mockReset();
    vi.stubEnv("POLAR_PRO_MONTHLY_PRODUCT_ID", "prod_test_123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase(null) as never);

    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
  });

  it("creates a Polar checkout session correlated to the user and returns its URL", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase(MOCK_USER) as never);
    checkoutsCreateMock.mockResolvedValue({
      url: "https://sandbox-api.polar.sh/checkout/abc123",
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ checkoutUrl: "https://sandbox-api.polar.sh/checkout/abc123" });

    expect(checkoutsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        products: ["prod_test_123"],
        externalCustomerId: "user-1",
      }),
    );
  });

  it("returns 500 with a generic message when the Polar API call fails", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase(MOCK_USER) as never);
    checkoutsCreateMock.mockRejectedValue(new Error("polar: invalid product id"));

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(body.error).not.toContain("invalid product id");
  });
});
