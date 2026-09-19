import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./page";
import type { AnalysisResult } from "@/types/analysis";
import type { UsageStatus } from "@/types/usage";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

const baseUsage: UsageStatus = {
  periodMonth: "2026-09",
  freeUsedCount: 0,
  freeLimit: 2,
  freeRemaining: 2,
  subscriptionUsedCount: 0,
  subscriptionLimit: 0,
  subscriptionRemaining: 0,
  subscriptionStatus: "none",
  currentPeriodEnd: null,
};

const mockResult: AnalysisResult = {
  summary: { totalAmount: 500000, periodStart: "2026-08-01", periodEnd: "2026-08-31" },
  categoryBreakdown: [
    { category: "식비", amount: 500000, ratio: 1, description: "식비 지출입니다." },
  ],
  anomalies: [],
  recommendations: [{ text: "저축을 시작해 보세요.", basis: "지출이 많습니다." }],
  generatedAt: "2026-09-13T00:00:00.000Z",
};

function makeFile(name = "statement.csv"): File {
  return new File(["a,b,c"], name, { type: "text/csv" });
}

async function selectFileAndStartAnalysis() {
  const user = userEvent.setup();
  render(<DashboardPage />);

  await screen.findByText(/Upload your card statement/i);

  const fileInput = screen.getByLabelText(/choose file/i);
  await user.upload(fileInput, makeFile());

  const startButton = await screen.findByRole("button", { name: /start analysis/i });
  await user.click(startButton);
}

describe("DashboardPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads a file, starts analysis, and renders the returned AnalysisResult", async () => {
    let usageCallCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/usage")) {
        usageCallCount += 1;
        return jsonResponse(
          usageCallCount === 1 ? baseUsage : { ...baseUsage, freeUsedCount: 1, freeRemaining: 1 },
        );
      }
      if (url.endsWith("/api/analysis/latest")) {
        return jsonResponse({ error: "아직 분석 결과가 없습니다" }, 404);
      }
      if (url.endsWith("/api/upload") && method === "POST") {
        return jsonResponse({ jobId: "job-1", fileName: "statement.csv" });
      }
      if (url.endsWith("/api/analysis/start") && method === "POST") {
        return jsonResponse(mockResult);
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await selectFileAndStartAnalysis();

    await screen.findByText(/Card Statement Analysis/);
    expect(screen.getAllByText(/₩500,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/식비/).length).toBeGreaterThan(0);
    expect(screen.getByText(/저축을 시작해 보세요\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Free analyses 1\/2 left/)).toBeInTheDocument());

    const analysisStartCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        requestUrl(input).endsWith("/api/analysis/start") && (init?.method ?? "GET") === "POST",
    );
    expect(analysisStartCall).toBeDefined();
    const [, analysisStartInit] = analysisStartCall!;
    expect(JSON.parse(analysisStartInit!.body as string)).toEqual({ jobId: "job-1" });
  });

  it("redirects to /billing when /api/analysis/start returns 402", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/usage")) {
        return jsonResponse({ ...baseUsage, freeRemaining: 1 });
      }
      if (url.endsWith("/api/analysis/latest")) {
        return jsonResponse({ error: "아직 분석 결과가 없습니다" }, 404);
      }
      if (url.endsWith("/api/upload") && method === "POST") {
        return jsonResponse({ jobId: "job-2", fileName: "statement.csv" });
      }
      if (url.endsWith("/api/analysis/start") && method === "POST") {
        return jsonResponse({ error: "무료/구독 분석 횟수를 모두 사용했습니다" }, 402);
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await selectFileAndStartAnalysis();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/billing"));
  });

  it("logs out via /api/auth/logout and navigates to the landing page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/usage")) {
        return jsonResponse(baseUsage);
      }
      if (url.endsWith("/api/analysis/latest")) {
        return jsonResponse({ error: "아직 분석 결과가 없습니다" }, 404);
      }
      if (url.endsWith("/api/auth/logout") && method === "POST") {
        return jsonResponse({ success: true });
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<DashboardPage />);

    const logoutButton = await screen.findByRole("button", { name: /log out/i });
    await user.click(logoutButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" }),
    );
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
