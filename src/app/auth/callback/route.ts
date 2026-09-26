import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // 조작/재전송된 code 파라미터 등 반복되는 세션 교환 실패 패턴을 감지하려면 로깅이
      // 필요하다(OWASP A09:2025).
      console.error("OAuth 세션 교환 실패", error);
      return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
    }

    return NextResponse.redirect(new URL("/welcome", request.url));
  } catch (err) {
    console.error("OAuth 콜백 처리 중 예외 발생", err);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }
}
