import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchOncallAlert } from "./dispatch";
import type { OncallAlert } from "@/types/oncall";

const alert: OncallAlert = {
  event: "$error_tracking_issue_spiking",
  issueId: "issue-1",
  name: "TypeError",
  description: "boom",
  fingerprint: "fp",
  timestamp: "2026-10-05T00:00:00Z",
  currentBucketValue: 40,
  computedBaseline: 2,
  url: null,
};

describe("dispatchOncallAlert", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_DISPATCH_TOKEN", "tok");
    vi.stubEnv("ONCALL_GITHUB_REPO", "owner/repo");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("repository_dispatch로 event_id와 alert를 보낸다 (client_payload 최상위 키는 10개 이하)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await dispatchOncallAlert("posthog:abc", alert);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/owner/repo/dispatches");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(body.event_type).toBe("posthog-alert");
    expect(body.client_payload).toEqual({ event_id: "posthog:abc", alert });
    expect(Object.keys(body.client_payload).length).toBeLessThanOrEqual(10);
  });

  it("2xx가 아니면 응답 본문 없이 상태코드만 담아 던진다", async () => {
    fetchMock.mockResolvedValue(new Response("secret details", { status: 403 }));
    await expect(dispatchOncallAlert("posthog:abc", alert)).rejects.toThrow(/403/);
    await expect(dispatchOncallAlert("posthog:abc", alert)).rejects.not.toThrow(/secret details/);
  });

  it("설정이 없으면 fetch 없이 던진다", async () => {
    vi.stubEnv("GITHUB_DISPATCH_TOKEN", "");
    await expect(dispatchOncallAlert("posthog:abc", alert)).rejects.toThrow(/GITHUB_DISPATCH_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("repo 형식이 owner/name이 아니면 던진다", async () => {
    vi.stubEnv("ONCALL_GITHUB_REPO", "../evil");
    await expect(dispatchOncallAlert("posthog:abc", alert)).rejects.toThrow(/ONCALL_GITHUB_REPO/);
  });
});
