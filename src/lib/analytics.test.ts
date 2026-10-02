import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() },
}));

import posthog from "posthog-js";
import { identifyFromUsageResponse, resetAnalytics, trackEvent } from "./analytics";

function enable() {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
}

describe("analytics (client)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("환경변수가 없으면 아무 것도 보내지 않는다", () => {
    trackEvent("file_selected", { file_type: "csv" });
    resetAnalytics();
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it("환경변수가 있으면 이벤트와 속성을 PostHog로 보낸다", () => {
    enable();
    trackEvent("file_selected", { file_type: "csv", file_size_kb: 12 });
    expect(posthog.capture).toHaveBeenCalledWith("file_selected", {
      file_type: "csv",
      file_size_kb: 12,
    });
  });

  it("PostHog SDK가 예외를 던져도 화면 동작을 막지 않는다", () => {
    enable();
    vi.mocked(posthog.capture).mockImplementationOnce(() => {
      throw new Error("sdk down");
    });
    expect(() => trackEvent("file_selected")).not.toThrow();
  });

  it("사용량 응답 헤더의 사용자 ID로만 identify한다 (이메일 헤더는 읽지 않는다)", () => {
    enable();
    const response = new Response(null, {
      headers: {
        "X-Finsight-PostHog-Distinct-Id": "user-1",
        "X-Finsight-PostHog-Person-Email": "user@example.com",
      },
    });
    identifyFromUsageResponse(response);
    expect(posthog.identify).toHaveBeenCalledWith("user-1");
  });

  it("헤더에 사용자 ID가 없으면 identify하지 않는다", () => {
    enable();
    identifyFromUsageResponse(new Response(null));
    expect(posthog.identify).not.toHaveBeenCalled();
  });
});
