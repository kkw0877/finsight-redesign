import { after } from "next/server";
import { PostHog } from "posthog-node";
import { emitPostHogLog, flushPostHogLogs } from "@/instrumentation";
import type { AnalyticsEvent, AnalyticsProperties } from "@/types/analytics";

/**
 * 서버(API 라우트)에서 제품 이벤트를 보낸다. 서버리스는 응답 후 함수가 멈추므로 요청마다
 * 클라이언트를 만들어 즉시 전송하고 정리한다. 트래킹 실패가 요청 처리를 막으면 안 되므로 예외는
 * 삼킨다. distinctId는 항상 Supabase 사용자 ID — 이메일 등 개인정보는 속성에 넣지 않는다.
 */
export async function captureServerEvent(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: AnalyticsProperties,
): Promise<void> {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || !host) return;

  const client = new PostHog(token, { host, flushAt: 1, flushInterval: 0 });
  try {
    await client.captureImmediate({ distinctId, event, properties });
  } catch {
    // 위 주석 참고 — 전송 실패는 무시한다.
  } finally {
    await client.shutdown().catch(() => {});
  }
}

/** 구조화 로그를 남기고 응답이 끝난 뒤 flush한다. 요청 범위 밖(테스트 등)에서도 던지지 않는다. */
export function logServerEvent(
  body: string,
  severity: "ERROR" | "INFO",
  attributes: Record<string, boolean | number | string>,
): void {
  try {
    emitPostHogLog(body, severity, attributes);
    after(async () => {
      await flushPostHogLogs();
    });
  } catch {
    // 로깅 실패는 요청 처리를 막지 않는다.
  }
}

/** 예외 메시지에는 내부 정보/개인정보가 섞일 수 있어, 로그·이벤트에는 종류(이름·코드)만 남긴다. */
export function errorTypeOf(err: unknown): string {
  if (err instanceof Error) return err.name;
  if (typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return "unknown";
}
