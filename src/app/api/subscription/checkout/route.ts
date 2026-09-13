import type { CheckoutRequestBody, CheckoutSuccessResponse } from "@/types/api";
import { activateSubscription } from "@/lib/fixtures/usageFixture";

async function parseBody(request: Request): Promise<CheckoutRequestBody> {
  try {
    const body = await request.json();
    return { simulateFailure: body?.simulateFailure === true };
  } catch {
    return { simulateFailure: false };
  }
}

export async function POST(request: Request) {
  try {
    const { simulateFailure } = await parseBody(request);

    // simulateFailure는 실제 Polar에 없는 개념 — 화면 쪽 결제 실패 UI를 테스트하기 위한 전용 훅.
    if (simulateFailure) {
      return Response.json(
        { error: "결제에 실패했습니다. 다시 시도해주세요" },
        { status: 402 },
      );
    }

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    activateSubscription(currentPeriodEnd.toISOString());

    const response: CheckoutSuccessResponse = {
      subscriptionStatus: "active",
      currentPeriodEnd: currentPeriodEnd.toISOString(),
      billedAt: new Date().toISOString(),
    };
    return Response.json(response, { status: 200 });
  } catch {
    return Response.json({ error: "결제 처리 중 문제가 발생했습니다" }, { status: 500 });
  }
}
