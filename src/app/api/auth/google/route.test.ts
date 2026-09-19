import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const signInWithOAuthMock = vi.fn();

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithOAuth: signInWithOAuthMock,
    },
  })),
}));

import { GET } from "./route";

function makeRequest(): NextRequest {
  return new NextRequest("https://finsight.example.com/api/auth/google");
}

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    signInWithOAuthMock.mockReset();
  });

  it("구글 인증 URL로 리다이렉트한다", async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth?client_id=abc" },
      error: null,
    });

    const response = await GET(makeRequest());

    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/auth?client_id=abc",
    );
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://finsight.example.com/auth/callback",
      },
    });
  });

  it("Supabase가 에러를 반환하면 로그인 실패 화면으로 리다이렉트한다", async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: null },
      error: new Error("oauth misconfigured"),
    });

    const response = await GET(makeRequest());

    expect([302, 307]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).toContain("/login?error=oauth_failed");
  });

  it("예외가 발생해도 내부 에러를 노출하지 않고 로그인 실패 화면으로 리다이렉트한다", async () => {
    signInWithOAuthMock.mockRejectedValue(new Error("network down"));

    const response = await GET(makeRequest());

    expect([302, 307]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).toContain("/login?error=oauth_failed");
  });
});
