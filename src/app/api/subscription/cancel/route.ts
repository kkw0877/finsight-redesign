import type { CancelResponse } from "@/types/api";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createPolarClient } from "@/services/polar/client";
import { captureServerEvent, errorTypeOf, logServerEvent } from "@/services/posthog/server";

const GENERIC_ERROR_MESSAGE = "구독 해지 요청 중 문제가 발생했습니다";

interface SubscriptionRow {
  status: string;
  polar_subscription_id: string | null;
}

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, polar_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle<SubscriptionRow>();

  if (!subscription || subscription.status !== "active" || !subscription.polar_subscription_id) {
    return Response.json({ error: "활성 구독이 없습니다" }, { status: 400 });
  }

  try {
    const polar = createPolarClient();
    // subscriptions 테이블은 여기서 갱신하지 않는다 — 웹훅만이 구독 상태의 유일한 신뢰 소스다(ADR-012).
    const updated = await polar.subscriptions.update({
      id: subscription.polar_subscription_id,
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });

    await captureServerEvent(user.id, "subscription_cancel_requested");

    const response: CancelResponse = {
      subscriptionStatus: "cancel_scheduled",
      currentPeriodEnd: new Date(updated.currentPeriodEnd).toISOString(),
    };
    return Response.json(response, { status: 200 });
  } catch (err) {
    // 결제 실패는 반드시 로깅한다(OWASP A09:2025) — 취소 요청이 조용히 실패하면 운영팀이
    // 감지할 방법이 없다.
    console.error("Polar 구독 해지 요청 실패", { userId: user.id, err });
    logServerEvent("subscription cancel request failed", "ERROR", {
      event: "subscription_cancel_failed",
      error_type: errorTypeOf(err),
    });
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}
