import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { captureServerEvent, errorTypeOf, logServerEvent } from "@/services/posthog/server";

// Supabase는 신규 사용자 생성 시 created_at과 last_sign_in_at을 거의 같은 시각으로 기록한다.
const NEW_USER_WINDOW_MS = 10_000;

function isNewUser(user: { created_at?: string; last_sign_in_at?: string }): boolean {
  if (!user.created_at || !user.last_sign_in_at) return false;
  return (
    Math.abs(new Date(user.last_sign_in_at).getTime() - new Date(user.created_at).getTime()) <
    NEW_USER_WINDOW_MS
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // 조작/재전송된 code 파라미터 등 반복되는 세션 교환 실패 패턴을 감지하려면 로깅이
      // 필요하다(OWASP A09:2025).
      console.error("OAuth 세션 교환 실패", error);
      logServerEvent("oauth callback failed", "ERROR", {
        event: "oauth_callback_failed",
        reason: "session_exchange_error",
        error_type: errorTypeOf(error),
      });
      return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
    }

    const user = data?.user;
    if (user) {
      await captureServerEvent(user.id, isNewUser(user) ? "sign_up_completed" : "sign_in_completed", {
        provider: "google",
      });
    }

    return NextResponse.redirect(new URL("/welcome", request.url));
  } catch (err) {
    console.error("OAuth 콜백 처리 중 예외 발생", err);
    logServerEvent("oauth callback failed", "ERROR", {
      event: "oauth_callback_failed",
      reason: "exception",
      error_type: errorTypeOf(err),
    });
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }
}
