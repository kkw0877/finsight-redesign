import type { CancelResponse } from "@/types/api";
import { cancelSubscription, getUsageStatus } from "@/lib/fixtures/usageFixture";

export async function POST() {
  try {
    const { subscriptionStatus, currentPeriodEnd } = getUsageStatus();

    if (subscriptionStatus !== "active" || currentPeriodEnd === null) {
      return Response.json({ error: "활성 구독이 없습니다" }, { status: 400 });
    }

    cancelSubscription(currentPeriodEnd);

    const response: CancelResponse = {
      subscriptionStatus: "cancel_scheduled",
      currentPeriodEnd,
    };
    return Response.json(response, { status: 200 });
  } catch {
    return Response.json({ error: "구독 해지 처리 중 문제가 발생했습니다" }, { status: 500 });
  }
}
