import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { updateSupabaseSessionMock } = vi.hoisted(() => ({
  updateSupabaseSessionMock: vi.fn(),
}));

vi.mock("@/services/supabase/middleware", () => ({
  updateSupabaseSession: updateSupabaseSessionMock,
}));

import { proxy } from "./proxy";

function makeRequest(path: string): NextRequest {
  return new NextRequest(`https://finsight.example.com${path}`);
}

describe("proxy", () => {
  beforeEach(() => {
    updateSupabaseSessionMock.mockReset();
  });

  it("비로그인 사용자가 보호된 페이지에 접근하면 /login으로 리다이렉트한다", async () => {
    updateSupabaseSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: null,
    });

    const response = await proxy(makeRequest("/dashboard"));

    expect([302, 307]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("비로그인 사용자가 보호된 API에 접근하면 401 JSON을 반환한다", async () => {
    updateSupabaseSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: null,
    });

    const response = await proxy(makeRequest("/api/upload"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
  });

  it("로그인 사용자는 보호된 페이지 요청을 통과시킨다", async () => {
    const passThroughResponse = NextResponse.next();
    updateSupabaseSessionMock.mockResolvedValue({
      response: passThroughResponse,
      user: { id: "user-1" },
    });

    const response = await proxy(makeRequest("/dashboard"));

    expect(response).toBe(passThroughResponse);
  });

  it("로그인 사용자는 보호된 API 요청을 통과시킨다", async () => {
    const passThroughResponse = NextResponse.next();
    updateSupabaseSessionMock.mockResolvedValue({
      response: passThroughResponse,
      user: { id: "user-1" },
    });

    const response = await proxy(makeRequest("/api/analysis/start"));

    expect(response).toBe(passThroughResponse);
  });
});
