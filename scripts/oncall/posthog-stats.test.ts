import { describe, expect, it, vi } from "vitest";
import { fetchStats } from "./posthog-stats.mjs";

const env = { POSTHOG_PERSONAL_API_KEY: "phx_x", POSTHOG_PROJECT_ID: "123", POSTHOG_HOST: "https://us.posthog.com" };
const ok = (results: unknown[][]) => new Response(JSON.stringify({ results }), { status: 200 });

describe("fetchStats", () => {
  it("HogQL을 placeholder로 호출하고 통계로 변환한다", async () => {
    const f = vi.fn().mockResolvedValue(ok([[12, 3, 4, "2026-10-04 01:00:00", "2026-10-05 00:59:00", 5]]));
    const s = await fetchStats({ issueId: "issue-1'; drop", env, fetchImpl: f });

    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://us.posthog.com/api/projects/123/query/");
    expect(init.headers.Authorization).toBe("Bearer phx_x");
    const body = JSON.parse(init.body);
    expect(body.query.values).toEqual({ issue_id: "issue-1'; drop" });
    expect(body.query.query).not.toContain("drop");
    expect(s).toEqual({ available: true, totalEvents: 12, users: 3, sessions: 4, firstSeen: "2026-10-04 01:00:00", lastSeen: "2026-10-05 00:59:00", lastHourEvents: 5 });
  });

  it("자격증명이 없으면 호출 없이 available:false", async () => {
    const f = vi.fn();
    const s = await fetchStats({ issueId: "i", env: {}, fetchImpl: f });
    expect(s.available).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTP 오류", () => Promise.resolve(new Response("nope", { status: 403 }))],
    ["네트워크 오류", () => Promise.reject(new Error("boom"))],
    ["빈 결과", () => Promise.resolve(ok([]))],
  ])("%s이면 던지지 않고 available:false", async (_l, impl) => {
    const s = await fetchStats({ issueId: "i", env, fetchImpl: vi.fn().mockImplementation(impl) });
    expect(s.available).toBe(false);
    expect(typeof s.reason).toBe("string");
  });
});
