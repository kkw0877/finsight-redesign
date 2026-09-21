import type { AnalysisResult } from "@/types/analysis";
import { createServerSupabaseClient } from "@/services/supabase/server";

interface AnalysisResultRow {
  summary: AnalysisResult["summary"];
  category_breakdown: AnalysisResult["categoryBreakdown"];
  anomalies: AnalysisResult["anomalies"];
  recommendations: AnalysisResult["recommendations"];
  generated_at: string;
}

function toAnalysisResult(row: AnalysisResultRow): AnalysisResult {
  return {
    summary: row.summary,
    categoryBreakdown: row.category_breakdown,
    anomalies: row.anomalies,
    recommendations: row.recommendations,
    generatedAt: row.generated_at,
  };
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("analysis_results")
      .select("summary, category_breakdown, anomalies, recommendations, generated_at")
      .eq("user_id", user.id)
      .maybeSingle<AnalysisResultRow>();

    if (error) {
      throw error;
    }

    if (!data) {
      return Response.json({ error: "아직 분석 결과가 없습니다" }, { status: 404 });
    }

    return Response.json(toAnalysisResult(data), { status: 200 });
  } catch {
    return Response.json(
      { error: "조회 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요" },
      { status: 500 },
    );
  }
}
