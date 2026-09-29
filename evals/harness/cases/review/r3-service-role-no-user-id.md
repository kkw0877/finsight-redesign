---
id: r3-service-role-no-user-id
track: review
expect: violation
rule: service-role-user-id
---

```ts
// src/app/api/analysis/[id]/route.ts
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // service role 클라이언트는 RLS를 우회한다.
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("analysis_results").select("*").eq("id", id).single();

  return Response.json(data, { status: 200 });
}
```
