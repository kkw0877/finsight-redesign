# Fixture: `src/app/api/analysis/[id]/route.ts` (가상의 신규 라우트)

> 이 파일은 진짜 `.ts` 파일이 아니라 `.ts.md`다 — 이 저장소의 `tsconfig.json`이
> `**/*.ts`/`**/*.tsx` 전체를 include하고 `.claude/settings.json`의 Stop 훅이 매 턴
> `npm run lint && npm run build && npm run test`를 실행하기 때문에, 의도적으로 취약하게
> 작성된 코드를 진짜 `.ts` 확장자로 두면 매 턴 빌드/린트가 깨진다. 이 스킬의 eval을 실행할 때는
> 아래 코드 블록만 발췌해서 스캔 대상으로 주고, 실제 파일로 구체화가 필요하면 격리된 위치
> (별도 git worktree 또는 `/tmp`)에서만 만들고 추적 중인 `src/`에는 절대 넣지 않는다.

의도적으로 심은 취약점:
1. `createAdminSupabaseClient()`(service role, RLS 우회)로 조회하면서 `user_id` 필터가 없음
   → **CRITICAL#2 / A01:2025 Broken Access Control** (IDOR — 다른 사용자의 분석 결과를
   `id`만 알면 조회 가능)
2. URL 파라미터 `id`를 검증 없이 `.rpc()` 호출에 그대로 삽입 → **A05:2025 Injection**
3. `catch` 블록에서 `error.message`를 그대로 응답 바디에 노출 → **CRITICAL#3 / A10:2025
   Mishandling of Exceptional Conditions**

```ts
import { createAdminSupabaseClient } from "@/services/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createAdminSupabaseClient();

    // 취약점 1: user_id 필터 없음 — 다른 사용자의 분석 결과도 id만 알면 조회 가능 (IDOR)
    const { data, error } = await supabase
      .from("analysis_results")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) throw error;

    // 취약점 2: 검증 없이 RPC에 원문 삽입
    await supabase.rpc("log_analysis_access", {
      query: `SELECT * FROM access_log WHERE analysis_id = '${params.id}'`,
    });

    return Response.json(data, { status: 200 });
  } catch (error) {
    // 취약점 3: 내부 예외 메시지를 그대로 클라이언트에 노출
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
```
