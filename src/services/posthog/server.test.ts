import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureImmediate = vi.fn();
const shutdown = vi.fn();
const constructed = vi.fn();

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      constructed(...args);
    }
    captureImmediate = captureImmediate;
    shutdown = shutdown;
  },
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/instrumentation", () => ({
  emitPostHogLog: vi.fn(),
  flushPostHogLogs: vi.fn(),
}));

import { after } from "next/server";
import { emitPostHogLog, flushPostHogLogs } from "@/instrumentation";
import { captureServerEvent, errorTypeOf, logServerEvent } from "./server";

function enable() {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
}

describe("captureServerEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureImmediate.mockResolvedValue(undefined);
    shutdown.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("환경변수가 없으면 클라이언트를 만들지 않는다", async () => {
    await captureServerEvent("user-1", "file_uploaded");
    expect(constructed).not.toHaveBeenCalled();
  });

  it("사용자 ID를 distinctId로 이벤트를 즉시 전송하고 클라이언트를 정리한다", async () => {
    enable();
    await captureServerEvent("user-1", "file_uploaded", { file_type: "csv" });
    expect(captureImmediate).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "file_uploaded",
      properties: { file_type: "csv" },
    });
    expect(shutdown).toHaveBeenCalled();
  });

  it("전송이 실패해도 예외를 던지지 않는다 (요청 처리를 막지 않는다)", async () => {
    enable();
    captureImmediate.mockRejectedValue(new Error("network"));
    await expect(captureServerEvent("user-1", "file_uploaded")).resolves.toBeUndefined();
    expect(shutdown).toHaveBeenCalled();
  });
});

describe("logServerEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("로그를 남기고 응답 뒤에 flush를 예약한다", async () => {
    logServerEvent("upload failed", "ERROR", { event: "upload_failed" });
    expect(emitPostHogLog).toHaveBeenCalledWith("upload failed", "ERROR", {
      event: "upload_failed",
    });
    const callback = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await callback();
    expect(flushPostHogLogs).toHaveBeenCalled();
  });

  it("요청 범위 밖이라 after()가 던져도 예외를 전파하지 않는다", () => {
    vi.mocked(after).mockImplementationOnce(() => {
      throw new Error("outside request scope");
    });
    expect(() => logServerEvent("x", "INFO", {})).not.toThrow();
  });
});

describe("errorTypeOf", () => {
  it("Error는 이름, DB/스토리지 오류 객체는 code, 그 외는 unknown을 돌려준다 (메시지는 쓰지 않는다)", () => {
    expect(errorTypeOf(new TypeError("secret detail"))).toBe("TypeError");
    expect(errorTypeOf({ code: "42501", message: "permission denied" })).toBe("42501");
    expect(errorTypeOf("boom")).toBe("unknown");
    expect(errorTypeOf(null)).toBe("unknown");
  });
});
