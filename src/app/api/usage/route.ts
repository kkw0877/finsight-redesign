import { createServerSupabaseClient } from "@/services/supabase/server";
import { getUsageStatus } from "@/lib/usage";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const usageStatus = await getUsageStatus(supabase, user.id);
    return Response.json(usageStatus, { status: 200 });
  } catch {
    return Response.json(
      { error: "조회 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요" },
      { status: 500 },
    );
  }
}
