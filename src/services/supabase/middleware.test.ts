import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateSupabaseSession } from "./middleware";

describe("updateSupabaseSession", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("함수가 존재하며 타입이 맞는다", () => {
    expect(typeof updateSupabaseSession).toBe("function");
  });

  it("NEXT_PUBLIC_SUPABASE_URL이 없으면 명확한 에러를 던진다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const request = new NextRequest("https://finsight.example.com/dashboard");
    await expect(updateSupabaseSession(request)).rejects.toThrow(
      "NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다",
    );
  });

  it("env가 정상이면 response와 user를 반환한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const request = new NextRequest("https://finsight.example.com/dashboard");
    const result = await updateSupabaseSession(request);

    expect(result.response).toBeDefined();
    expect(result.user).toBeNull();
  });
});
