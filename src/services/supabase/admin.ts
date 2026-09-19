import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * CRITICAL: 이 클라이언트는 service role 키로 RLS를 우회한다. 이 클라이언트로 실행하는
 * 모든 쿼리는 RLS가 없다고 전제하고, 호출하는 쪽이 반드시 `.eq('user_id', ...)` 등으로
 * 사용자 필터를 직접 걸어야 한다(CLAUDE.md/ARCHITECTURE.md의 "보안 규칙" 참고). 분석 처리
 * 라우트(`/api/analysis/start`)와 웹훅 핸들러(`/api/webhooks/polar`)에서만 사용한다.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
