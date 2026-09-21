import { createServerSupabaseClient } from "@/services/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
    return Response.json({ success: true }, { status: 200 });
  } catch {
    return Response.json({ error: "로그아웃 처리 중 문제가 발생했습니다" }, { status: 500 });
  }
}
