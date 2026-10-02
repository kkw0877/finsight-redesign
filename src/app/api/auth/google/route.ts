import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { errorTypeOf, logServerEvent } from "@/services/posthog/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${request.nextUrl.origin}/auth/callback`,
      },
    });

    if (error || !data.url) {
      // 반복되는 OAuth 시작 실패 패턴을 감지하려면 로깅이 필요하다(OWASP A09:2025).
      console.error("Google OAuth 시작 실패", error);
      logServerEvent("google oauth start failed", "ERROR", {
        event: "oauth_start_failed",
        reason: "supabase_error",
        error_type: errorTypeOf(error),
      });
      return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
    }

    return NextResponse.redirect(data.url);
  } catch (err) {
    console.error("Google OAuth 시작 중 예외 발생", err);
    logServerEvent("google oauth start failed", "ERROR", {
      event: "oauth_start_failed",
      reason: "exception",
      error_type: errorTypeOf(err),
    });
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }
}
