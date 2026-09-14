import type { AnalysisResult } from "@/types/analysis";
import {
  finishProcessing,
  isProcessing,
  MOCK_ANALYSIS_RESULT,
  setLatestResult,
  startProcessing,
} from "@/lib/fixtures/analysisFixture";
import { consumeOneAnalysis, hasRemainingAnalysis } from "@/lib/fixtures/usageFixture";

export const maxDuration = 300;

export async function POST(_request: Request) {
  try {
    if (!hasRemainingAnalysis()) {
      return Response.json(
        { error: "무료/구독 분석 횟수를 모두 사용했습니다" },
        { status: 402 },
      );
    }

    if (isProcessing()) {
      return Response.json({ error: "이미 처리 중인 분석이 있습니다" }, { status: 409 });
    }

    startProcessing();
    try {
      const result: AnalysisResult = {
        ...MOCK_ANALYSIS_RESULT,
        generatedAt: new Date().toISOString(),
      };
      consumeOneAnalysis();
      setLatestResult(result);
      return Response.json(result, { status: 200 });
    } finally {
      finishProcessing();
    }
  } catch {
    return Response.json({ error: "분석 처리 중 문제가 발생했습니다" }, { status: 500 });
  }
}
