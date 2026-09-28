-- Supabase security advisor 대응 (supabase-db-audit 스킬):
-- cleanup_expired_uploads()는 pg_cron 전용(ADR-011)으로 의도했지만 SECURITY DEFINER
-- 함수 생성 시 Postgres가 기본으로 EXECUTE를 anon/authenticated에 부여해, 로그인 없이도
-- POST /rest/v1/rpc/cleanup_expired_uploads로 누구나 호출할 수 있었다.

revoke execute on function public.cleanup_expired_uploads() from anon, authenticated;
