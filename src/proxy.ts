import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/services/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);

  if (!user) {
    if (request.nextUrl.pathname.startsWith("/api")) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/billing/:path*",
    "/api/upload/:path*",
    "/api/analysis/:path*",
    "/api/usage/:path*",
    "/api/subscription/:path*",
  ],
};
