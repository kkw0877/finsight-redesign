import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillingPage from "./page";
import type { CheckoutStartResponse } from "@/types/api";
import type { UsageStatus } from "@/types/usage";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function usageStatus(overrides: Partial<UsageStatus> = {}): UsageStatus {
  return {
    periodMonth: "2026-09",
    freeUsedCount: 2,
    freeLimit: 2,
    freeRemaining: 0,
    subscriptionUsedCount: 0,
    subscriptionLimit: 0,
    subscriptionRemaining: 0,
    subscriptionStatus: "none",
    currentPeriodEnd: null,
    ...overrides,
  };
}

describe("BillingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the plan card when /api/usage reports no active subscription", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/usage") return jsonResponse(usageStatus({ subscriptionStatus: "none" }));
      throw new Error(`unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BillingPage />);

    expect(await screen.findByRole("button", { name: /Pay ₩9,900/i })).toBeInTheDocument();
  });

  it("shows the already-subscribed view when /api/usage reports an active subscription", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/usage")
        return jsonResponse(
          usageStatus({ subscriptionStatus: "active", currentPeriodEnd: "2026-10-13T00:00:00.000Z" }),
        );
      throw new Error(`unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BillingPage />);

    expect(await screen.findByText(/You're already subscribed/)).toBeInTheDocument();
    expect(screen.getByText(/October 13, 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay ₩9,900/i })).not.toBeInTheDocument();
  });

  it("redirects the browser to the Polar checkout URL on successful checkout", async () => {
    const checkoutResponse: CheckoutStartResponse = {
      checkoutUrl: "https://sandbox.polar.sh/checkout/abc123",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/usage") return jsonResponse(usageStatus({ subscriptionStatus: "none" }));
      if (input === "/api/subscription/checkout") return jsonResponse(checkoutResponse);
      throw new Error(`unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" },
    });

    const user = userEvent.setup();
    render(<BillingPage />);

    await user.click(await screen.findByRole("button", { name: /Pay ₩9,900/i }));

    expect(window.location.href).toBe(checkoutResponse.checkoutUrl);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/subscription/checkout",
      expect.objectContaining({ method: "POST" }),
    );

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("shows the server error message when checkout fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/usage") return jsonResponse(usageStatus({ subscriptionStatus: "none" }));
      if (input === "/api/subscription/checkout")
        return jsonResponse({ error: "결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요" }, 500);
      throw new Error(`unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<BillingPage />);

    await user.click(await screen.findByRole("button", { name: /Pay ₩9,900/i }));

    expect(await screen.findByText(/Payment failed/)).toBeInTheDocument();
    expect(
      screen.getByText(/결제를 시작할 수 없습니다\. 잠시 후 다시 시도해 주세요/),
    ).toBeInTheDocument();
  });

  it("falls back to the plan view when /api/usage fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/usage") return jsonResponse({ error: "실패" }, 500);
      throw new Error(`unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BillingPage />);

    expect(await screen.findByRole("button", { name: /Pay ₩9,900/i })).toBeInTheDocument();
  });
});
