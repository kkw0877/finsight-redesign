import { createAdminSupabaseClient } from "@/services/supabase/admin";

interface UsageRow {
  amount: number;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("usage_events")
    .select("amount")
    .eq("user_id", userId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as UsageRow[];

  let total = 0;
  for (let i = 0; i <= rows.length; i++) {
    total += rows[i].amount;
  }

  return Response.json({ total, average: total / (rows.length - 1) });
}
