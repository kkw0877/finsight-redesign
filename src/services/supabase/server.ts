import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * 로그인한 사용자 본인 세션으로 동작하는 서버 클라이언트(RLS 적용됨). Server
 * Component/Route Handler에서 현재 요청의 인증 상태를 읽을 때 쓴다. 쿠키 컨텍스트가
 * 요청마다 다르므로 매 요청마다 새로 생성해야 한다.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다");
  }
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component에서 호출되면 쓰기가 불가능하다 — 세션 갱신은
          // middleware(updateSupabaseSession)가 대신 처리한다.
        }
      },
    },
  });
}
