# Fixture: `src/components/UploadPreview/UploadPreview.tsx` (가상의 신규 클라이언트 컴포넌트)

> `route-analysis-missing-user-filter.ts.md`와 같은 이유로 `.ts.md`로 저장한다 (진짜
> `.tsx`가 아님 — tsconfig/Stop 훅 문제).

의도적으로 심은 취약점:
1. `'use client'` 컴포넌트가 Supabase SDK를 직접 import/호출 → **CRITICAL#1** (외부 서비스
   호출은 `src/app/api/` 또는 `src/services/`에서만 해야 함)
2. 클라이언트가 구성한 경로로 signed URL을 발급하며 소유자 검증 없음 → **CRITICAL#4 / A01:2025
   Broken Access Control**
3. service role 키가 클라이언트 번들에 하드코딩됨 → **A04:2025 Cryptographic Failures**,
   **A02:2025 Security Misconfiguration** (비밀키가 브라우저로 전달됨)

```tsx
"use client";

import { createClient } from "@supabase/supabase-js";

// 취약점 3: service role 키가 클라이언트 번들에 하드코딩되어 브라우저에 그대로 노출됨
const SUPABASE_SERVICE_ROLE_KEY = "sb-service-role-eyJhbGciOiJI...";

const supabase = createClient(
  "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY,
);

export function UploadPreview({ userSuppliedPath }: { userSuppliedPath: string }) {
  const [url, setUrl] = useState<string | null>(null);

  async function loadPreview() {
    // 취약점 1+2: 클라이언트에서 Supabase Storage를 직접 호출하고,
    // 사용자가 임의로 넘긴 경로를 소유자 검증 없이 그대로 signed URL로 발급
    const { data } = await supabase.storage
      .from("uploads")
      .createSignedUrl(userSuppliedPath, 60 * 60);

    setUrl(data?.signedUrl ?? null);
  }

  return (
    <button onClick={loadPreview}>
      {url ? <img src={url} alt="preview" /> : "미리보기 불러오기"}
    </button>
  );
}
```
