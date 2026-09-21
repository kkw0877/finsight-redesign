import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/services/supabase/server";

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
      return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
    }

    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }
}
