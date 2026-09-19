import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminSupabaseClient } from "./admin";

describe("createAdminSupabaseClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("SUPABASE_SERVICE_ROLE_KEY가 없으면 명확한 에러를 던진다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(() => createAdminSupabaseClient()).toThrow(
      "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다",
    );
  });

  it("NEXT_PUBLIC_SUPABASE_URL이 없으면 명확한 에러를 던진다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    expect(() => createAdminSupabaseClient()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다",
    );
  });

  it("env가 정상이면 예외 없이 클라이언트를 반환한다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    const client = createAdminSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });
});
