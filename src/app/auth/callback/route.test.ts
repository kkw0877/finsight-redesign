import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const exchangeCodeForSessionMock = vi.fn();

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
    },
  })),
}));

vi.mock("@/services/posthog/server", () => ({
  captureServerEvent: vi.fn(),
  logServerEvent: vi.fn(),
  errorTypeOf: () => "Error",
}));

import { captureServerEvent, logServerEvent } from "@/services/posthog/server";
import { GET } from "./route";

function makeRequest(search = ""): NextRequest {
  return new NextRequest(`https://finsight.example.com/auth/callback${search}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSessionMock.mockReset();
    vi.mocked(captureServerEvent).mockClear();
    vi.mocked(logServerEvent).mockClear();
  });

  it("code 파라미터가 없으면 로그인 실패 화면으로 리다이렉트한다", async () => {
    const response = await GET(makeRequest());

    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/login?error=oauth_failed");
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("세션 교환에 실패하면 로그인 실패 화면으로 리다이렉트하고 실패를 로깅한다", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: new Error("invalid code") });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(makeRequest("?code=abc123"));

    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/login?error=oauth_failed");
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(logServerEvent).toHaveBeenCalledWith(
      "oauth callback failed",
      "ERROR",
      expect.objectContaining({ event: "oauth_callback_failed", reason: "session_exchange_error" }),
    );
    expect(captureServerEvent).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("세션 교환에 성공하면 welcome 화면으로 리다이렉트한다", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const response = await GET(makeRequest("?code=abc123"));

    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/welcome");
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
  });

  it("처음 가입한 사용자(생성 시각≈마지막 로그인 시각)는 sign_up_completed를 기록한다", async () => {
    const now = new Date().toISOString();
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { user: { id: "user-new", created_at: now, last_sign_in_at: now } },
      error: null,
    });

    await GET(makeRequest("?code=abc123"));

    expect(captureServerEvent).toHaveBeenCalledWith("user-new", "sign_up_completed", {
      provider: "google",
    });
  });

  it("기존 사용자는 sign_in_completed를 기록한다", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: {
        user: {
          id: "user-old",
          created_at: "2026-01-01T00:00:00.000Z",
          last_sign_in_at: new Date().toISOString(),
        },
      },
      error: null,
    });

    await GET(makeRequest("?code=abc123"));

    expect(captureServerEvent).toHaveBeenCalledWith("user-old", "sign_in_completed", {
      provider: "google",
    });
  });
});
