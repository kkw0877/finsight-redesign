import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisResult } from "@/types/analysis";

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/services/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));
vi.mock("@/services/claude/client", () => ({
  createClaudeClient: vi.fn(() => ({})),
}));
vi.mock("@/services/claude/extractTransactions", () => ({
  extractTransactions: vi.fn(),
}));
vi.mock("@/services/claude/analyzeSpending", () => ({
  analyzeSpending: vi.fn(),
}));
vi.mock("@/lib/usage", () => ({
  getUsageStatus: vi.fn(),
  consumeOneAnalysis: vi.fn(),
}));

import { createServerSupabaseClient } from "@/services/supabase/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { extractTransactions } from "@/services/claude/extractTransactions";
import { analyzeSpending } from "@/services/claude/analyzeSpending";
import { consumeOneAnalysis, getUsageStatus } from "@/lib/usage";
import { POST } from "./route";

type Row = Record<string, unknown>;

interface JobRow {
  id: string;
  user_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  source_file_path: string;
  source_file_type: "csv" | "pdf";
  updated_at: string;
  error_message?: string | null;
}

class Builder implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: [string, unknown][] = [];

  constructor(
    private rows: Row[],
    private op: "select" | "update",
    private patch: Row | null,
    private onUpdate?: () => { code?: string } | null,
  ) {}

  eq(col: string, val: unknown): this {
    this.filters.push([col, val]);
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(([c, v]) => row[c] === v);
  }

  async maybeSingle() {
    const match = this.rows.find((r) => this.matches(r));
    return { data: match ?? null, error: null };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = (() => {
      if (this.onUpdate) {
        const error = this.onUpdate();
        if (error) return { data: null, error };
      }
      if (this.op === "update" && this.patch) {
        this.rows.filter((r) => this.matches(r)).forEach((r) => Object.assign(r, this.patch as Row));
      }
      return { data: null, error: null };
    })();
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function createFakeAdminClient(params: {
  jobs: JobRow[];
  onProcessingUpdateError?: () => { code?: string } | null;
}): { client: SupabaseClient; upserts: Row[]; jobs: JobRow[] } {
  const upserts: Row[] = [];

  const analysisJobsTable = {
    select: () => new Builder(params.jobs as unknown as Row[], "select", null),
    update: (patch: Row) => {
      const isProcessingUpdate = patch.status === "processing";
      return new Builder(
        params.jobs as unknown as Row[],
        "update",
        patch,
        isProcessingUpdate ? params.onProcessingUpdateError : undefined,
      );
    },
  };

  const analysisResultsTable = {
    upsert: (row: Row) => {
      upserts.push(row);
      return Promise.resolve({ error: null });
    },
  };

  const from = vi.fn((table: string) => {
    if (table === "analysis_jobs") return analysisJobsTable;
    if (table === "analysis_results") return analysisResultsTable;
    throw new Error(`unexpected table ${table}`);
  });

  const createSignedUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: "https://signed.example.com/file" }, error: null });
  const storage = { from: vi.fn(() => ({ createSignedUrl })) };

  return { client: { from, storage } as unknown as SupabaseClient, upserts, jobs: params.jobs };
}

const USER_ID = "user-1";
const JOB_ID = "job-1";

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/analysis/start", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mockAuthedUser(): void {
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
  } as unknown as SupabaseClient);
}

function mockFullUsage(): void {
  vi.mocked(getUsageStatus).mockResolvedValue({
    periodMonth: "2026-09",
    freeUsedCount: 0,
    freeLimit: 2,
    freeRemaining: 2,
    subscriptionUsedCount: 0,
    subscriptionLimit: 0,
    subscriptionRemaining: 0,
    subscriptionStatus: "none",
    currentPeriodEnd: null,
  });
}

function pendingJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: JOB_ID,
    user_id: USER_ID,
    status: "pending",
    source_file_path: `${USER_ID}/${JOB_ID}/statement.csv`,
    source_file_type: "csv",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const VALID_ANALYSIS: Omit<AnalysisResult, "generatedAt"> = {
  summary: { totalAmount: 10000, periodStart: "2026-09-01", periodEnd: "2026-09-02" },
  categoryBreakdown: [{ category: "식비", amount: 10000, ratio: 1, description: "식비 지출입니다." }],
  anomalies: [],
  recommendations: [{ text: "추천", basis: "근거" }],
};

describe("POST /api/analysis/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("인증되지 않은 요청은 401을 반환한다", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as unknown as SupabaseClient);

    const response = await POST(makeRequest({ jobId: JOB_ID }));

    expect(response.status).toBe(401);
  });

  it("jobId가 없으면 400을 반환한다", async () => {
    mockAuthedUser();

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
  });

  it("잔여 횟수가 없으면 402를 반환하고 job/사용량에 아무 쓰기도 하지 않는다", async () => {
    mockAuthedUser();
    vi.mocked(getUsageStatus).mockResolvedValue({
      periodMonth: "2026-09",
      freeUsedCount: 2,
      freeLimit: 2,
      freeRemaining: 0,
      subscriptionUsedCount: 0,
      subscriptionLimit: 0,
      subscriptionRemaining: 0,
      subscriptionStatus: "none",
      currentPeriodEnd: null,
    });
    const { client } = createFakeAdminClient({ jobs: [pendingJob()] });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(client);

    const response = await POST(makeRequest({ jobId: JOB_ID }));
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBeTypeOf("string");
    expect(extractTransactions).not.toHaveBeenCalled();
    expect(consumeOneAnalysis).not.toHaveBeenCalled();
  });

  it("존재하지 않는 jobId는 404를 반환한다", async () => {
    mockAuthedUser();
    mockFullUsage();
    const { client } = createFakeAdminClient({ jobs: [] });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(client);

    const response = await POST(makeRequest({ jobId: "nonexistent" }));

    expect(response.status).toBe(404);
  });

  it("이미 completed된 job은 409를 반환한다", async () => {
    mockAuthedUser();
    mockFullUsage();
    const { client } = createFakeAdminClient({ jobs: [pendingJob({ status: "completed" })] });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(client);

    const response = await POST(makeRequest({ jobId: JOB_ID }));

    expect(response.status).toBe(409);
  });

  it("다른 job이 최근(<300초) processing 중이면 409를 반환하고 대상 job은 pending을 유지한다", async () => {
    mockAuthedUser();
    mockFullUsage();
    const otherJob = pendingJob({
      id: "job-other",
      status: "processing",
      updated_at: new Date(Date.now() - 10_000).toISOString(),
    });
    const targetJob = pendingJob();
    const { client, jobs } = createFakeAdminClient({ jobs: [targetJob, otherJob] });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(client);

    const response = await POST(makeRequest({ jobId: JOB_ID }));

    expect(response.status).toBe(409);
    expect(jobs.find((j) => j.id === JOB_ID)?.status).toBe("pending");
    expect(jobs.find((j) => j.id === "job-other")?.status).toBe("processing");
  });

  it("다른 job이 오래된(>=300초) processing 상태면 failed로 전환하고 대상 job을 진행한다", async () => {
    mockAuthedUser();
    mockFullUsage();
    const otherJob = pendingJob({
      id: "job-other",
      status: "processing",
      updated_at: new Date(Date.now() - 301_000).toISOString(),
    });
    const targetJob = pendingJob();
    const { client, jobs, upserts } = createFakeAdminClient({ jobs: [targetJob, otherJob] });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(client);
    vi.mocked(extractTransactions).mockResolvedValue([]);
    vi.mocked(analyzeSpending).mockResolvedValue(VALID_ANALYSIS);

    const response = await POST(makeRequest({ jobId: JOB_ID }));

    expect(jobs.find((j) => j.id === "job-other")?.status).toBe("failed");
    expect(response.status).toBe(200);
    expect(upserts).toHaveLength(1);
  });

  it("Claude 호출이 성공하면 200과 결과를 반환하고 완료 처리/사용량 차감을 수행한다", async () => {
    mockAuthedUser();
    mockFullUsage();
    const targetJob = pendingJob();
    const { client, jobs, upserts } = createFakeAdminClient({ jobs: [targetJob] });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(client);
    vi.mocked(extractTransactions).mockResolvedValue([
      { date: "2026-09-01", merchant: "A", amount: 10000, transactionType: "일시불" },
    ]);
    vi.mocked(analyzeSpending).mockResolvedValue(VALID_ANALYSIS);

    const response = await POST(makeRequest({ jobId: JOB_ID }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("categoryBreakdown");
    expect(body).toHaveProperty("anomalies");
    expect(body).toHaveProperty("recommendations");
    expect(body).toHaveProperty("generatedAt");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].user_id).toBe(USER_ID);
    expect(upserts[0].job_id).toBe(JOB_ID);
    expect(jobs.find((j) => j.id === JOB_ID)?.status).toBe("completed");
    expect(consumeOneAnalysis).toHaveBeenCalledWith(client, USER_ID);
  });

  it("Claude 호출이 실패하면 500을 반환하고 job을 failed로 갱신 시도하며 사용량은 차감하지 않는다", async () => {
    mockAuthedUser();
    mockFullUsage();
    const targetJob = pendingJob();
    const { client, jobs } = createFakeAdminClient({ jobs: [targetJob] });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(client);
    vi.mocked(extractTransactions).mockRejectedValue(new Error("claude api boom"));

    const response = await POST(makeRequest({ jobId: JOB_ID }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toContain("boom");
    expect(jobs.find((j) => j.id === JOB_ID)?.status).toBe("failed");
    expect(consumeOneAnalysis).not.toHaveBeenCalled();
  });

  it("동시 요청 경합으로 UPDATE가 unique_violation(23505)에 걸리면 409를 반환한다", async () => {
    mockAuthedUser();
    mockFullUsage();
    const targetJob = pendingJob();
    const { client } = createFakeAdminClient({
      jobs: [targetJob],
      onProcessingUpdateError: () => ({ code: "23505" }),
    });
    vi.mocked(createAdminSupabaseClient).mockReturnValue(client);

    const response = await POST(makeRequest({ jobId: JOB_ID }));

    expect(response.status).toBe(409);
  });
});
