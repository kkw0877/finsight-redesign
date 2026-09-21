import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@polar-sh/sdk/webhooks", async () => {
  const actual =
    await vi.importActual<typeof import("@polar-sh/sdk/webhooks")>("@polar-sh/sdk/webhooks");
  return { ...actual, validateEvent: vi.fn() };
});

import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { POST } from "./route";

function makeRequest(body: string, webhookId = "evt_test_1"): NextRequest {
  return new NextRequest("https://finsight.example.com/api/webhooks/polar", {
    method: "POST",
    headers: {
      "webhook-id": webhookId,
      "webhook-timestamp": "1732000000",
      "webhook-signature": "v1,fake-signature",
    },
    body,
  });
}

function createTableMock(config: {
  maybeSingleResult?: { data: unknown; error: unknown };
  insertResult?: { error: unknown };
  updateEqResult?: { error: unknown };
  upsertResult?: { error: unknown };
} = {}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue(config.maybeSingleResult ?? { data: null, error: null });
  const eqAfterSelect = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eqAfterSelect });

  const insert = vi.fn().mockResolvedValue(config.insertResult ?? { error: null });

  const eqAfterUpdate = vi.fn().mockResolvedValue(config.updateEqResult ?? { error: null });
  const update = vi.fn().mockReturnValue({ eq: eqAfterUpdate });

  const upsert = vi.fn().mockResolvedValue(config.upsertResult ?? { error: null });

  return { select, insert, update, upsert, eqAfterSelect, eqAfterUpdate };
}

function mockAdmin(options: {
  webhookEvents?: Parameters<typeof createTableMock>[0];
  subscriptions?: Parameters<typeof createTableMock>[0];
} = {}) {
  const webhookEvents = createTableMock(options.webhookEvents);
  const subscriptions = createTableMock(options.subscriptions);
  const from = vi.fn((table: string) => {
    if (table === "webhook_events") return webhookEvents;
    if (table === "subscriptions") return subscriptions;
    throw new Error(`unexpected table ${table}`);
  });
  return { from, webhookEvents, subscriptions };
}

function subscriptionActiveEvent(overrides: { externalId?: string | null } = {}) {
  const externalId = "externalId" in overrides ? overrides.externalId : "user-1";
  return {
    type: "subscription.active" as const,
    timestamp: new Date("2026-09-19T00:00:00Z"),
    data: {
      id: "sub_123",
      customerId: "cust_123",
      currentPeriodEnd: new Date("2026-10-19T00:00:00Z"),
      cancelAtPeriodEnd: false,
      customer: { externalId },
    },
  };
}

function subscriptionCanceledEvent() {
  return {
    type: "subscription.canceled" as const,
    timestamp: new Date("2026-09-19T00:00:00Z"),
    data: {
      id: "sub_123",
      customerId: "cust_123",
      currentPeriodEnd: new Date("2026-10-19T00:00:00Z"),
      cancelAtPeriodEnd: true,
      customer: { externalId: "user-1" },
    },
  };
}

function subscriptionRevokedEvent() {
  return {
    type: "subscription.revoked" as const,
    timestamp: new Date("2026-09-19T00:00:00Z"),
    data: {
      id: "sub_123",
      customerId: "cust_123",
      currentPeriodEnd: new Date("2026-10-19T00:00:00Z"),
      cancelAtPeriodEnd: true,
      customer: { externalId: "user-1" },
    },
  };
}

function subscriptionPastDueEvent() {
  return {
    type: "subscription.past_due" as const,
    timestamp: new Date("2026-09-19T00:00:00Z"),
    data: {
      id: "sub_123",
      customerId: "cust_123",
      currentPeriodEnd: new Date("2026-10-19T00:00:00Z"),
      cancelAtPeriodEnd: false,
      customer: { externalId: "user-1" },
    },
  };
}

describe("POST /api/webhooks/polar", () => {
  beforeEach(() => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "whsec_test");
    vi.mocked(validateEvent).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 and writes nothing when signature verification fails", async () => {
    vi.mocked(validateEvent).mockImplementation(() => {
      throw new WebhookVerificationError("invalid signature");
    });
    const admin = mockAdmin();
    vi.mocked(createAdminSupabaseClient).mockReturnValue(admin as never);

    const response = await POST(makeRequest("{}"));

    expect(response.status).toBe(401);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("records a new event and activates the subscription for the correlated user", async () => {
    vi.mocked(validateEvent).mockReturnValue(subscriptionActiveEvent() as never);
    const admin = mockAdmin();
    vi.mocked(createAdminSupabaseClient).mockReturnValue(admin as never);

    const response = await POST(makeRequest("{}", "evt_active_1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });

    expect(admin.webhookEvents.insert).toHaveBeenCalledWith({
      id: "evt_active_1",
      type: "subscription.active",
    });
    expect(admin.subscriptions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", status: "active" }),
      expect.objectContaining({ onConflict: "user_id" }),
    );
  });

  it("does not write to subscriptions again when the same event id is replayed", async () => {
    vi.mocked(validateEvent).mockReturnValue(subscriptionActiveEvent() as never);
    const admin = mockAdmin({
      webhookEvents: { maybeSingleResult: { data: { id: "evt_active_1" }, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(admin as never);

    const response = await POST(makeRequest("{}", "evt_active_1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });
    expect(admin.webhookEvents.insert).not.toHaveBeenCalled();
    expect(admin.subscriptions.upsert).not.toHaveBeenCalled();
    expect(admin.subscriptions.update).not.toHaveBeenCalled();
  });

  it("sets status to cancel_scheduled on subscription.canceled", async () => {
    vi.mocked(validateEvent).mockReturnValue(subscriptionCanceledEvent() as never);
    const admin = mockAdmin();
    vi.mocked(createAdminSupabaseClient).mockReturnValue(admin as never);

    const response = await POST(makeRequest("{}", "evt_canceled_1"));

    expect(response.status).toBe(200);
    expect(admin.subscriptions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", status: "cancel_scheduled" }),
      expect.objectContaining({ onConflict: "user_id" }),
    );
  });

  it("sets status to inactive on subscription.revoked", async () => {
    vi.mocked(validateEvent).mockReturnValue(subscriptionRevokedEvent() as never);
    const admin = mockAdmin();
    vi.mocked(createAdminSupabaseClient).mockReturnValue(admin as never);

    const response = await POST(makeRequest("{}", "evt_revoked_1"));

    expect(response.status).toBe(200);
    expect(admin.subscriptions.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "inactive" }),
    );
    expect(admin.subscriptions.eqAfterUpdate).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("records the event but does not touch subscriptions for a type outside the mapping table", async () => {
    vi.mocked(validateEvent).mockReturnValue(subscriptionPastDueEvent() as never);
    const admin = mockAdmin();
    vi.mocked(createAdminSupabaseClient).mockReturnValue(admin as never);

    const response = await POST(makeRequest("{}", "evt_past_due_1"));

    expect(response.status).toBe(200);
    expect(admin.webhookEvents.insert).toHaveBeenCalledWith({
      id: "evt_past_due_1",
      type: "subscription.past_due",
    });
    expect(admin.subscriptions.upsert).not.toHaveBeenCalled();
    expect(admin.subscriptions.update).not.toHaveBeenCalled();
  });

  it("does not write to subscriptions when the correlated user cannot be found", async () => {
    vi.mocked(validateEvent).mockReturnValue(subscriptionActiveEvent({ externalId: null }) as never);
    const admin = mockAdmin();
    vi.mocked(createAdminSupabaseClient).mockReturnValue(admin as never);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(makeRequest("{}", "evt_no_correlation_1"));

    expect(response.status).toBe(200);
    expect(admin.subscriptions.upsert).not.toHaveBeenCalled();
    expect(admin.subscriptions.update).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
