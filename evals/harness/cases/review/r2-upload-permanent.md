---
id: r2-upload-permanent
track: review
expect: violation
rule: upload-ttl
---

```ts
// src/app/api/upload/route.ts (일부)
import { createAdminSupabaseClient } from "@/services/supabase/admin";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file") as File;
  const userId = form.get("userId") as string;

  const supabase = createAdminSupabaseClient();

  // 재분석과 감사 대비를 위해 원본을 영구 보관용 버킷에 그대로 둔다.
  const path = `${userId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("uploads-archive").upload(path, file);
  if (error) {
    return Response.json({ error: "업로드에 실패했습니다" }, { status: 500 });
  }

  await supabase.from("uploads").insert({ user_id: userId, storage_path: path, expires_at: null });
  return Response.json({ path }, { status: 201 });
}
```
