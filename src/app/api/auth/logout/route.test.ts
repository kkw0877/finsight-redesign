import { describe, expect, it, vi, beforeEach } from "vitest";

const signOutMock = vi.fn();

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signOut: signOutMock,
    },
  })),
}));

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    signOutMock.mockReset();
  });

  it("세션을 종료하고 success:true를 200으로 응답한다", async () => {
    signOutMock.mockResolvedValue({ error: null });

    const response = await POST();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(signOutMock).toHaveBeenCalled();
  });

  it("내부 에러 발생 시 사용자 이해 가능한 메시지로 500을 응답한다", async () => {
    signOutMock.mockRejectedValue(new Error("db connection lost"));

    const response = await POST();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(body.error).not.toContain("db connection lost");
  });
});
