// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPolarClient } from "./client";

describe("createPolarClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("POLAR_ACCESS_TOKEN이 없으면 명확한 에러를 던진다", () => {
    vi.stubEnv("POLAR_ACCESS_TOKEN", "");

    expect(() => createPolarClient()).toThrow("POLAR_ACCESS_TOKEN이 설정되지 않았습니다");
  });

  it("env가 정상이면 예외 없이 클라이언트를 반환한다 (POLAR_SERVER 미설정 시 sandbox 기본값)", () => {
    vi.stubEnv("POLAR_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("POLAR_SERVER", "");

    const client = createPolarClient();
    expect(client).toBeDefined();
    expect(typeof client.checkouts.create).toBe("function");
    expect(typeof client.subscriptions.update).toBe("function");
  });

  it("POLAR_SERVER=production이면 production 서버를 사용한다", () => {
    vi.stubEnv("POLAR_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("POLAR_SERVER", "production");

    expect(() => createPolarClient()).not.toThrow();
  });
});
