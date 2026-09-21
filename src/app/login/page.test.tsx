import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

let mockSearch = "";

import LoginPage from "./page";

describe("LoginPage", () => {
  it("error 쿼리 파라미터가 없으면 에러 배너를 표시하지 않는다", () => {
    mockSearch = "";
    render(<LoginPage />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("error=oauth_failed 쿼리가 있으면 이해 가능한 한글 에러 배너를 표시한다", () => {
    mockSearch = "error=oauth_failed";
    render(<LoginPage />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/구글 로그인/);
  });

  it("구글 로그인 버튼 클릭 시 /api/auth/google로 이동한다", async () => {
    mockSearch = "";
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" },
    });

    render(<LoginPage />);
    const button = screen.getByRole("button", { name: /continue with google/i });
    button.click();

    expect(window.location.href).toBe("/api/auth/google");

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
