import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock("@/services/github/dispatch", () => ({ dispatchOncallAlert: vi.fn() }));
vi.mock("@/services/posthog/server", () => ({
  logServerEvent: vi.fn(),
  errorTypeOf: () => "Error",
}));

import { dispatchOncallAlert } from "@/services/github/dispatch";
import { logServerEvent } from "@/services/posthog/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { POST } from "./route";

const SECRET = "test-secret-value";

const body = {
  event_id: "uuid-1",
  event: "$error_tracking_issue_created",
  issue_id: "issue-1",
  name: "TypeError",
  description: "Cannot read properties of undefined",
  fingerprint: "fp-1",
  timestamp: "2026-10-05T00:00:00Z",
};

function req(payload: unknown, auth: string | null = `Bearer ${SECRET}`) {
  return new NextRequest("https://finsight.example.com/api/webhooks/posthog", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

function mockAdmin(insertResult: { error: unknown } = { error: null }) {
  const eqDelete = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq: eqDelete });
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert, delete: del });
  vi.mocked(createAdminSupabaseClient).mockReturnValue({ from } as never);
  return { from, insert, del, eqDelete };
}

describe("POST /api/webhooks/posthog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("POSTHOG_ALERT_WEBHOOK_SECRET", SECRET);
    vi.mocked(dispatchOncallAlert).mockResolvedValue(undefined);
  });

  it("시크릿 미설정이면 500 (fail-closed)", async () => {
    vi.stubEnv("POSTHOG_ALERT_WEBHOOK_SECRET", "");
    const res = await POST(req(body));
    expect(res.status).toBe(500);
    expect(dispatchOncallAlert).not.toHaveBeenCalled();
  });

  it.each([
    ["헤더 없음", null],
    ["틀린 시크릿", "Bearer wrong"],
    ["Bearer 아님", SECRET],
  ])("인증 실패(%s) → 401, DB·dispatch 접근 없음", async (_l, auth) => {
    const res = await POST(req(body, auth));
    expect(res.status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(dispatchOncallAlert).not.toHaveBeenCalled();
    expect(logServerEvent).toHaveBeenCalled();
  });

  it("JSON이 아니거나 허용되지 않은 이벤트면 400", async () => {
    expect((await POST(req("not json"))).status).toBe(400);
    expect((await POST(req({ ...body, event: "$pageview" }))).status).toBe(400);
    expect((await POST(req({ ...body, issue_id: "" }))).status).toBe(400);
    expect(dispatchOncallAlert).not.toHaveBeenCalled();
  });

  it("event_id를 먼저 선삽입한 뒤 dispatch한다", async () => {
    const admin = mockAdmin();
    const order: string[] = [];
    admin.insert.mockImplementation(async () => (order.push("insert"), { error: null }));
    vi.mocked(dispatchOncallAlert).mockImplementation(async () => void order.push("dispatch"));

    const res = await POST(req(body));

    expect(res.status).toBe(200);
    expect(order).toEqual(["insert", "dispatch"]);
    expect(admin.from).toHaveBeenCalledWith("webhook_events");
    expect(admin.insert).toHaveBeenCalledWith({
      id: "posthog:uuid-1",
      type: "posthog:$error_tracking_issue_created",
    });
    const [eventId, alert] = vi.mocked(dispatchOncallAlert).mock.calls[0];
    expect(eventId).toBe("posthog:uuid-1");
    expect(alert).toMatchObject({ event: "$error_tracking_issue_created", issueId: "issue-1", name: "TypeError" });
  });

  it("중복(23505)이면 dispatch 없이 200", async () => {
    mockAdmin({ error: { code: "23505" } });
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(dispatchOncallAlert).not.toHaveBeenCalled();
  });

  it("event_id가 없으면 event+issue+timestamp 해시로 결정적 id를 만든다", async () => {
    const admin = mockAdmin();
    const { event_id: _drop, ...noId } = body;
    void _drop;
    await POST(req(noId));
    await POST(req(noId));
    const ids = admin.insert.mock.calls.map((c) => c[0].id);
    expect(ids[0]).toMatch(/^posthog:[0-9a-f]{32}$/);
    expect(ids[0]).toBe(ids[1]);
  });

  it("event_id·timestamp가 모두 없으면 분 단위 버킷으로 후속 alert를 중복 처리하지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const admin = mockAdmin();
      const { event_id: _a, timestamp: _b, ...bare } = body;
      void _a;
      void _b;
      vi.setSystemTime(new Date("2026-10-05T00:00:10Z"));
      await POST(req(bare));
      vi.setSystemTime(new Date("2026-10-05T00:00:50Z"));
      await POST(req(bare));
      vi.setSystemTime(new Date("2026-10-05T00:05:10Z"));
      await POST(req(bare));
      const ids = admin.insert.mock.calls.map((c) => c[0].id);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[0]).not.toBe(ids[2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("롤백 delete가 실패하면 그 사실을 로깅한다(조용히 유실 금지)", async () => {
    const admin = mockAdmin();
    admin.eqDelete.mockResolvedValue({ error: { code: "XX000" } });
    vi.mocked(dispatchOncallAlert).mockRejectedValue(new Error("boom"));
    const res = await POST(req(body));
    expect(res.status).toBe(502);
    expect(logServerEvent).toHaveBeenCalledWith(
      expect.any(String),
      "ERROR",
      expect.objectContaining({ stage: "rollback" }),
    );
  });

  it("dispatch 실패 시 선삽입 row를 지우고 502 — PostHog 재시도가 중복으로 버려지지 않게", async () => {
    const admin = mockAdmin();
    vi.mocked(dispatchOncallAlert).mockRejectedValue(new Error("GitHub 403"));
    const res = await POST(req(body));
    expect(res.status).toBe(502);
    expect(admin.del).toHaveBeenCalled();
    expect(admin.eqDelete).toHaveBeenCalledWith("id", "posthog:uuid-1");
    expect(JSON.stringify(await res.json())).not.toMatch(/403|GitHub/);
  });

  it("문자열로 렌더된 숫자를 숫자로 정제하고 긴 문자열은 자른다", async () => {
    mockAdmin();
    await POST(
      req({
        ...body,
        event: "$error_tracking_issue_spiking",
        current_bucket_value: "42",
        computed_baseline: "0",
        description: "x".repeat(5000),
      }),
    );
    const alert = vi.mocked(dispatchOncallAlert).mock.calls[0][1];
    expect(alert.currentBucketValue).toBe(42);
    expect(alert.computedBaseline).toBe(0);
    expect(alert.description.length).toBeLessThanOrEqual(1000);
  });
});
