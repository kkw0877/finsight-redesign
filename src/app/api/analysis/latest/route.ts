import { getLatestResult } from "@/lib/fixtures/analysisFixture";

export async function GET() {
  try {
    const result = getLatestResult();
    if (!result) {
      return Response.json({ error: "아직 분석 결과가 없습니다" }, { status: 404 });
    }
    return Response.json(result, { status: 200 });
  } catch {
    return Response.json({ error: "분석 결과 조회 중 문제가 발생했습니다" }, { status: 500 });
  }
}
