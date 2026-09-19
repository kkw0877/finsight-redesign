import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

const GENERIC_ERROR_MESSAGE = "웹훅을 처리할 수 없습니다";

type PolarEvent = ReturnType<typeof validateEvent>;

/**
 * 이 라우트는 Polar 웹훅 서명으로만 인증한다(세션 없음, ADR-012) — src/proxy.ts의 matcher에
 * 의도적으로 빠져 있다.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error("POLAR_WEBHOOK_SECRET이 설정되지 않았습니다");
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  // 서명은 요청 원문 바이트에 대해 계산되므로 request.json()으로 먼저 파싱하면 안 된다.
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event: PolarEvent | undefined;
  try {
    event = validateEvent(rawBody, headers, secret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return Response.json({ error: "서명 검증에 실패했습니다" }, { status: 401 });
    }
    // 서명은 유효하지만 이 SDK 버전이 알지 못하는 이벤트 타입(payload 파싱 실패) — 상태 매핑
    // 표에 없는 타입과 동일하게 취급한다(idempotency만 기록하고 종료, 아래에서 처리).
    console.error("Polar 웹훅 이벤트 파싱 실패", err);
  }

  // validateEvent가 서명 검증에 성공했다면(위에서 던지지 않았다면) webhook-id 헤더는 항상 있다.
  const webhookId = request.headers.get("webhook-id");
  if (!webhookId) {
    console.error("Polar 웹훅에 webhook-id 헤더가 없습니다");
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  let eventType: string = event?.type ?? "unknown";
  if (!event) {
    try {
      const parsed = JSON.parse(rawBody) as { type?: unknown };
      eventType = typeof parsed.type === "string" ? parsed.type : "unknown";
    } catch {
      eventType = "unknown";
    }
  }

  const admin = createAdminSupabaseClient();

  try {
    const { data: existing } = await admin
      .from("webhook_events")
      .select("id")
      .eq("id", webhookId)
      .maybeSingle();

    if (existing) {
      return Response.json({ received: true }, { status: 200 });
    }

    const { error: insertError } = await admin
      .from("webhook_events")
      .insert({ id: webhookId, type: eventType });

    if (insertError) {
      // 동시에 같은 이벤트가 두 번 들어온 race — 유니크 제약 위반이면 이미 처리 중인 것으로 간주.
      if (insertError.code === "23505") {
        return Response.json({ received: true }, { status: 200 });
      }
      throw insertError;
    }

    if (event) {
      await applySubscriptionUpdate(admin, event);
    }

    const { error: processedError } = await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", webhookId);

    if (processedError) {
      // idempotency 판정은 row 존재 여부만 보므로 이 갱신 실패는 치명적이지 않다 — 로그만 남긴다.
      console.error("webhook_events.processed_at 갱신 실패", processedError);
    }

    return Response.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("Polar 웹훅 처리 중 오류", err);
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}

async function applySubscriptionUpdate(admin: SupabaseClient, event: PolarEvent) {
  switch (event.type) {
    case "subscription.active": {
      const userId = event.data.customer.externalId;
      if (!userId) {
        console.error(
          `subscription.active: customer.externalId가 없습니다 (subscription ${event.data.id})`,
        );
        return;
      }
      const { error } = await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          status: "active",
          polar_subscription_id: event.data.id,
          polar_customer_id: event.data.customerId,
          current_period_end: event.data.currentPeriodEnd.toISOString(),
          auto_renew: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      return;
    }
    case "subscription.canceled": {
      const userId = event.data.customer.externalId;
      if (!userId) {
        console.error(
          `subscription.canceled: customer.externalId가 없습니다 (subscription ${event.data.id})`,
        );
        return;
      }
      const { error } = await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          status: "cancel_scheduled",
          polar_subscription_id: event.data.id,
          polar_customer_id: event.data.customerId,
          current_period_end: event.data.currentPeriodEnd.toISOString(),
          auto_renew: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      return;
    }
    case "subscription.revoked": {
      const userId = event.data.customer.externalId;
      if (!userId) {
        console.error(
          `subscription.revoked: customer.externalId가 없습니다 (subscription ${event.data.id})`,
        );
        return;
      }
      const { error } = await admin
        .from("subscriptions")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    case "subscription.updated": {
      const userId = event.data.customer.externalId;
      if (!userId) {
        console.error(
          `subscription.updated: customer.externalId가 없습니다 (subscription ${event.data.id})`,
        );
        return;
      }
      // 구독 row가 이미 있을 때만 의미가 있다 — 없으면 0건 업데이트로 조용히 무시된다.
      const { error } = await admin
        .from("subscriptions")
        .update({
          current_period_end: event.data.currentPeriodEnd.toISOString(),
          auto_renew: !event.data.cancelAtPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    default:
      // subscription.created/uncanceled/past_due 등 표에 없는 모든 타입 — 상태를 바꾸지 않는다.
      return;
  }
}
