import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dispatchOncallAlert } from "@/services/github/dispatch";
import { errorTypeOf, logServerEvent } from "@/services/posthog/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { ONCALL_ALERT_EVENTS, type OncallAlert, type OncallAlertEvent } from "@/types/oncall";

const GENERIC_ERROR_MESSAGE = "웹훅을 처리할 수 없습니다";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function isAuthorized(header: string | null, secret: string): boolean {
  const match = header?.match(/^Bearer (.+)$/);
  if (!match) return false;
  // 길이가 달라도 timingSafeEqual이 던지지 않도록 해시끼리 비교한다.
  return timingSafeEqual(sha256(match[1]), sha256(secret));
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function parseAlert(raw: unknown): { eventId: string; alert: OncallAlert } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const event = ONCALL_ALERT_EVENTS.find((e) => e === b.event) as OncallAlertEvent | undefined;
  const issueId = str(b.issue_id, 100);
  if (!event || !issueId) return null;

  const timestamp = str(b.timestamp, 40);
  // PostHog 템플릿의 {event.uuid}를 쓰는 게 정석. 없으면 같은 alert는 같은 id가 되도록 해시로 대체한다.
  const eventId =
    str(b.event_id, 100) ??
    createHash("sha256").update(`${event}|${issueId}|${timestamp ?? ""}`).digest("hex").slice(0, 32);

  return {
    eventId: `posthog:${eventId}`,
    alert: {
      event,
      issueId,
      name: str(b.name, 200) ?? "(unknown)",
      description: str(b.description, 1000) ?? "",
      fingerprint: str(b.fingerprint, 500),
      timestamp,
      currentBucketValue: num(b.current_bucket_value),
      computedBaseline: num(b.computed_baseline),
      url: str(b.url, 500),
    },
  };
}

/**
 * PostHog error tracking alert(단건 created/reopened + 급증 spiking) 수신 — oncall 1차 방어선의
 * '문'. 여기서는 공유 시크릿 검증 → event_id 선삽입(멱등) → CI 위임(dispatch)까지만 한다. 노이즈/신호
 * 판정과 escalation은 CI의 헤드리스 에이전트가 한다(ADR-018). 세션 없음 — src/proxy.ts matcher에
 * 의도적으로 빠져 있다. PostHog 웹훅 destination은 HMAC 서명을 지원하지 않아 커스텀 헤더 시크릿을 쓴다.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.POSTHOG_ALERT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("POSTHOG_ALERT_WEBHOOK_SECRET이 설정되지 않았습니다");
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    logServerEvent("posthog alert webhook auth failed", "ERROR", {
      event: "posthog_alert_webhook_auth_failed",
    });
    return Response.json({ error: "인증에 실패했습니다" }, { status: 401 });
  }

  let parsed: ReturnType<typeof parseAlert>;
  try {
    parsed = parseAlert(await request.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const { eventId, alert } = parsed;

  const admin = createAdminSupabaseClient();
  // 멱등 저장소는 webhook_events(ADR-012)를 재사용한다 — service role 전용 테이블, user_id 개념 없음.
  const { error: insertError } = await admin
    .from("webhook_events")
    .insert({ id: eventId, type: `posthog:${alert.event}` });

  if (insertError) {
    if (insertError.code === "23505") {
      return Response.json({ received: true, duplicate: true }, { status: 200 });
    }
    console.error("posthog alert 멱등 row 삽입 실패", insertError);
    logServerEvent("posthog alert idempotency insert failed", "ERROR", {
      event: "posthog_alert_webhook_failed",
      stage: "insert",
      error_type: errorTypeOf(insertError),
    });
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  try {
    await dispatchOncallAlert(eventId, alert);
  } catch (err) {
    // 선삽입 row가 남아 있으면 PostHog 재시도가 중복으로 버려져 alert가 유실된다 — 지우고 5xx로 재시도를 유도.
    await admin.from("webhook_events").delete().eq("id", eventId);
    console.error("oncall dispatch 실패", err);
    logServerEvent("posthog alert dispatch failed", "ERROR", {
      event: "posthog_alert_webhook_failed",
      stage: "dispatch",
      error_type: errorTypeOf(err),
    });
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }

  return Response.json({ received: true }, { status: 200 });
}
