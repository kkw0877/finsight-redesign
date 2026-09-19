import { afterEach, describe, expect, it, vi } from "vitest";
import { createClaudeClient } from "./client";

describe("createClaudeClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ANTHROPIC_API_KEY가 없으면 명확한 에러를 던진다", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    expect(() => createClaudeClient()).toThrow("ANTHROPIC_API_KEY가 설정되지 않았습니다");
  });

  it("env가 정상이면 예외 없이 클라이언트를 반환한다", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-api-key");

    const client = createClaudeClient();
    expect(client).toBeDefined();
    expect(typeof client.messages.create).toBe("function");
  });
});
