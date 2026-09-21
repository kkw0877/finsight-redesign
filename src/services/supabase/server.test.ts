import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => {},
  })),
}));

describe("createServerSupabaseClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("모듈이 정상적으로 import되고 함수가 존재한다", async () => {
    const mod = await import("./server");
    expect(typeof mod.createServerSupabaseClient).toBe("function");
  });

  it("NEXT_PUBLIC_SUPABASE_ANON_KEY가 없으면 명확한 에러를 던진다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const { createServerSupabaseClient } = await import("./server");
    await expect(createServerSupabaseClient()).rejects.toThrow(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다",
    );
  });

  it("env가 정상이면 예외 없이 클라이언트를 반환한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const { createServerSupabaseClient } = await import("./server");
    const client = await createServerSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });
});
