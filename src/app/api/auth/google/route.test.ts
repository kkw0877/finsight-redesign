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

vi.mock("@/services/posthog/server", () => ({
  captureServerEvent: vi.fn(),
  logServerEvent: vi.fn(),
  errorTypeOf: () => "Error",
}));

import { logServerEvent } from "@/services/posthog/server";
import { GET } from "./route";

function makeRequest(): NextRequest {
  return new NextRequest("https://finsight.example.com/api/auth/google");
}

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    signInWithOAuthMock.mockReset();
    vi.mocked(logServerEvent).mockClear();
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

  it("Supabase가 에러를 반환하면 로그인 실패 화면으로 리다이렉트하고 실패를 로깅한다", async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: null },
      error: new Error("oauth misconfigured"),
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(makeRequest());

    expect([302, 307]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).toContain("/login?error=oauth_failed");
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(logServerEvent).toHaveBeenCalledWith(
      "google oauth start failed",
      "ERROR",
      expect.objectContaining({ event: "oauth_start_failed", reason: "supabase_error" }),
    );

    consoleErrorSpy.mockRestore();
  });

  it("예외가 발생해도 내부 에러를 노출하지 않고 로그인 실패 화면으로 리다이렉트하며 로깅한다", async () => {
    signInWithOAuthMock.mockRejectedValue(new Error("network down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(makeRequest());

    expect([302, 307]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).toContain("/login?error=oauth_failed");
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(logServerEvent).toHaveBeenCalledWith(
      "google oauth start failed",
      "ERROR",
      expect.objectContaining({ event: "oauth_start_failed", reason: "exception" }),
    );

    consoleErrorSpy.mockRestore();
  });
});
