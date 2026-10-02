import { describe, expect, it, vi, beforeEach } from "vitest";

const subscriptionsUpdateMock = vi.fn();

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/services/polar/client", () => ({
  createPolarClient: vi.fn(() => ({
    subscriptions: { update: subscriptionsUpdateMock },
  })),
}));

vi.mock("@/services/posthog/server", () => ({
  captureServerEvent: vi.fn(),
  logServerEvent: vi.fn(),
  errorTypeOf: () => "Error",
}));

import { captureServerEvent, logServerEvent } from "@/services/posthog/server";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { POST } from "./route";

const MOCK_USER = { id: "user-1" };

function mockSupabase(options: {
  user?: { id: string } | null;
  row?: Record<string, unknown> | null;
}) {
  const { user = null, row = null } = options;

  const update = vi.fn().mockReturnThis();
  const upsert = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn().mockReturnValue({ eq, maybeSingle });
  const from = vi.fn().mockReturnValue({ select, update, upsert });

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
    __update: update,
    __upsert: upsert,
  };
}

describe("POST /api/subscription/cancel", () => {
  beforeEach(() => {
    subscriptionsUpdateMock.mockReset();
  });

  beforeEach(() => {
    vi.mocked(captureServerEvent).mockClear();
    vi.mocked(logServerEvent).mockClear();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({ user: null }) as never,
    );

    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("returns 400 when there is no active subscription", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({ user: MOCK_USER, row: { status: "none", polar_subscription_id: null } }) as never,
    );

    const response = await POST();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(subscriptionsUpdateMock).not.toHaveBeenCalled();
  });

  it("cancels the active subscription at Polar with the correct id and does not write to the subscriptions table", async () => {
    const supabase = mockSupabase({
      user: MOCK_USER,
      row: { status: "active", polar_subscription_id: "sub_abc123" },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase as never);
    subscriptionsUpdateMock.mockResolvedValue({
      currentPeriodEnd: new Date("2026-10-19T00:00:00.000Z"),
    });

    const response = await POST();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      subscriptionStatus: "cancel_scheduled",
      currentPeriodEnd: "2026-10-19T00:00:00.000Z",
    });

    expect(subscriptionsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sub_abc123",
        subscriptionUpdate: expect.objectContaining({ cancelAtPeriodEnd: true }),
      }),
    );

    expect(supabase.__update).not.toHaveBeenCalled();
    expect(supabase.__upsert).not.toHaveBeenCalled();
    expect(captureServerEvent).toHaveBeenCalledWith("user-1", "subscription_cancel_requested");
  });

  it("returns 500 with a generic message and logs the failure when the Polar API call fails", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      mockSupabase({
        user: MOCK_USER,
        row: { status: "active", polar_subscription_id: "sub_abc123" },
      }) as never,
    );
    subscriptionsUpdateMock.mockRejectedValue(new Error("polar: not found"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(body.error).not.toContain("not found");
    expect(logServerEvent).toHaveBeenCalledWith(
      "subscription cancel request failed",
      "ERROR",
      expect.objectContaining({ event: "subscription_cancel_failed", error_type: "Error" }),
    );
    expect(captureServerEvent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Polar 구독 해지 요청 실패",
      expect.objectContaining({ userId: "user-1" }),
    );

    consoleErrorSpy.mockRestore();
  });
});
