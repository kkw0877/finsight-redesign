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
      return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
    }

    return NextResponse.redirect(new URL("/welcome", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }
}
