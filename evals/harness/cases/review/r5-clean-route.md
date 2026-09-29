---
id: r5-clean-route
track: review
expect: pass
---

```ts
// src/app/api/analysis/latest/route.ts
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";

export const maxDuration = 300;

export async function GET() {
  try {
    const auth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("analysis_results")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return Response.json(data, { status: 200 });
  } catch {
    return Response.json(
      { error: "조회 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요" },
      { status: 500 },
    );
  }
}
```
