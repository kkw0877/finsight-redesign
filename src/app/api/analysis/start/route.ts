import type { AnalysisResult } from "@/types/analysis";
import type { AnalysisStartRequestBody, AnalysisStartResponseError } from "@/types/api";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createClaudeClient } from "@/services/claude/client";
import { extractTransactions } from "@/services/claude/extractTransactions";
import { analyzeSpending } from "@/services/claude/analyzeSpending";
import { consumeOneAnalysis, getUsageStatus } from "@/lib/usage";

export const maxDuration = 300;

const STORAGE_BUCKET = "card-statements";
const PROCESSING_TIMEOUT_MS = 300 * 1000;
const SIGNED_URL_TTL_SECONDS = 60;
const UNIQUE_VIOLATION_CODE = "23505";

const GENERIC_ERROR_MESSAGE = "분석 처리 중 문제가 발생했습니다";
const ALREADY_PROCESSING_MESSAGE = "이미 처리 중인 분석이 있습니다";

interface AnalysisJobRow {
  id: string;
  user_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  source_file_path: string;
  source_file_type: "csv" | "pdf";
  updated_at: string;
}

function errorResponse(message: string, status: number): Response {
  const body: AnalysisStartResponseError = { error: message };
  return Response.json(body, { status });
}

function buildEmptyAnalysis(): Omit<AnalysisResult, "generatedAt"> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    summary: { totalAmount: 0, periodStart: today, periodEnd: today },
    categoryBreakdown: [],
    anomalies: [],
    recommendations: [],
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("로그인이 필요합니다", 401);
    }

    let body: Partial<AnalysisStartRequestBody> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    if (!body.jobId) {
      return errorResponse("jobId가 필요합니다", 400);
    }
    const jobId = body.jobId;

    const admin = createAdminSupabaseClient();

    // F-ILHNGA/ADR-017: 잔여 횟수 확인
    const usageStatus = await getUsageStatus(admin, user.id);
    if (usageStatus.freeRemaining + usageStatus.subscriptionRemaining <= 0) {
      return errorResponse("무료/구독 분석 횟수를 모두 사용했습니다", 402);
    }

    const { data: job } = await admin
      .from("analysis_jobs")
      .select("id, user_id, status, source_file_path, source_file_type, updated_at")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<AnalysisJobRow>();

    if (!job) {
      return errorResponse("업로드된 파일을 찾을 수 없습니다. 다시 업로드해 주세요", 404);
    }

    if (job.status !== "pending") {
      return errorResponse("이미 처리되었거나 처리 중인 파일입니다", 409);
    }

    // ADR-013/ADR-017: 동시 요청 방지 + lazy stuck-job 재수거
    const { data: activeJob } = await admin
      .from("analysis_jobs")
      .select("id, user_id, status, source_file_path, source_file_type, updated_at")
      .eq("user_id", user.id)
      .eq("status", "processing")
      .maybeSingle<AnalysisJobRow>();

    if (activeJob) {
      const staleMs = Date.now() - new Date(activeJob.updated_at).getTime();
      if (staleMs < PROCESSING_TIMEOUT_MS) {
        return errorResponse(ALREADY_PROCESSING_MESSAGE, 409);
      }
      await admin
        .from("analysis_jobs")
        .update({
          status: "failed",
          error_message: "처리 시간 초과",
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeJob.id)
        .eq("user_id", user.id);
    }

    const { error: markProcessingError } = await admin
      .from("analysis_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (markProcessingError) {
      if ((markProcessingError as { code?: string }).code === UNIQUE_VIOLATION_CODE) {
        return errorResponse(ALREADY_PROCESSING_MESSAGE, 409);
      }
      throw markProcessingError;
    }

    try {
      const { data: signedUrlData, error: signedUrlError } = await admin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(job.source_file_path, SIGNED_URL_TTL_SECONDS);

      if (signedUrlError || !signedUrlData) {
        throw signedUrlError ?? new Error("signed URL 발급에 실패했습니다");
      }

      const claude = createClaudeClient();
      const transactions = await extractTransactions({
        client: claude,
        signedUrl: signedUrlData.signedUrl,
        fileType: job.source_file_type,
      });

      // F-BLDQBC: 분석 대상 거래가 없으면 억지로 추천을 만들지 않고 빈 결과로 처리(정상 완료)
      const analysis =
        transactions.length === 0
          ? buildEmptyAnalysis()
          : await analyzeSpending({ client: claude, transactions });

      const generatedAt = new Date().toISOString();
      const result: AnalysisResult = { ...analysis, generatedAt };

      const { error: upsertError } = await admin.from("analysis_results").upsert({
        user_id: user.id,
        job_id: jobId,
        summary: result.summary,
        category_breakdown: result.categoryBreakdown,
        anomalies: result.anomalies,
        recommendations: result.recommendations,
        generated_at: generatedAt,
      });

      if (upsertError) {
        throw upsertError;
      }

      const { error: completeError } = await admin
        .from("analysis_jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("user_id", user.id);

      if (completeError) {
        throw completeError;
      }

      // 정상 완료된 분석에 대해서만 차감 (F-ILHNGA)
      await consumeOneAnalysis(admin, user.id);

      return Response.json(result, { status: 200 });
    } catch {
      try {
        await admin
          .from("analysis_jobs")
          .update({
            status: "failed",
            error_message: GENERIC_ERROR_MESSAGE,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("user_id", user.id);
      } catch {
        // best-effort — 다음 요청의 lazy 재수거가 최종 안전장치다 (ADR-017)
      }
      return errorResponse(GENERIC_ERROR_MESSAGE, 500);
    }
  } catch {
    return errorResponse(GENERIC_ERROR_MESSAGE, 500);
  }
}
