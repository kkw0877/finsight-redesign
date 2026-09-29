---
id: r1-client-sdk-direct
track: review
expect: violation
rule: external-service-boundary
---

```tsx
// src/components/UploadPanel/UploadPanel.tsx
"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export function UploadPanel() {
  const [status, setStatus] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { error } = await supabase.storage.from("uploads").upload(`tmp/${file.name}`, file);
    setStatus(error ? "업로드에 실패했습니다" : "업로드 완료");
  }

  return <input type="file" onChange={onPick} aria-label={status || "파일 선택"} />;
}
```
