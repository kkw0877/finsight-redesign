// @vitest-environment node
// 이 클라이언트는 서버 전용 코드다 — 프로젝트 기본 jsdom 환경의 `window`가 있으면
// Anthropic SDK가 브라우저로 오인해 생성자에서 에러를 던지므로 node 환경으로 오버라이드한다.
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
