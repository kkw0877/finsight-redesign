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

import { GET } from "./route";

function makeRequest(search = ""): NextRequest {
  return new NextRequest(`https://finsight.example.com/auth/callback${search}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSessionMock.mockReset();
  });

  it("code 파라미터가 없으면 로그인 실패 화면으로 리다이렉트한다", async () => {
    const response = await GET(makeRequest());

    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/login?error=oauth_failed");
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("세션 교환에 실패하면 로그인 실패 화면으로 리다이렉트한다", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: new Error("invalid code") });

    const response = await GET(makeRequest("?code=abc123"));

    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/login?error=oauth_failed");
  });

  it("세션 교환에 성공하면 welcome 화면으로 리다이렉트한다", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const response = await GET(makeRequest("?code=abc123"));

    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/welcome");
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
  });
});
