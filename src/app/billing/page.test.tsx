import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillingPage from "./page";
import type { CheckoutSuccessResponse } from "@/types/api";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const successResponse: CheckoutSuccessResponse = {
  subscriptionStatus: "active",
  currentPeriodEnd: "2026-10-13T00:00:00.000Z",
  billedAt: "2026-09-13T00:00:00.000Z",
};

describe("BillingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the server-provided billedAt/currentPeriodEnd on successful checkout", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(successResponse));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<BillingPage />);

    await user.click(screen.getByRole("button", { name: /Pay ₩9,900/i }));

    expect(await screen.findByText(/Your subscription is active!/)).toBeInTheDocument();
    expect(screen.getByText(/September 13, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/October 13, 2026/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/subscription/checkout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the server error message when the preview-failure button is clicked", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "결제에 실패했습니다. 다시 시도해주세요" }, 402),
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<BillingPage />);

    await user.click(screen.getByRole("button", { name: /Demo: preview payment failure/i }));

    expect(await screen.findByText(/Payment failed/)).toBeInTheDocument();
    expect(screen.getByText(/결제에 실패했습니다\. 다시 시도해주세요/)).toBeInTheDocument();
  });
});
