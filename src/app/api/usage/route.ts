import { getUsageStatus } from "@/lib/fixtures/usageFixture";

export async function GET() {
  try {
    return Response.json(getUsageStatus(), { status: 200 });
  } catch {
    return Response.json({ error: "이용 현황 조회 중 문제가 발생했습니다" }, { status: 500 });
  }
}
