-- 20260928052416_sec1_restrict_cleanup_execute.sql 후속 조치:
-- Postgres는 함수 생성 시 EXECUTE를 PUBLIC 롤에도 기본 부여하는데, 이 grant는 anon/authenticated
-- 개별 revoke와 별개로 모든 롤에 상속된다. PUBLIC에서도 명시적으로 revoke해야
-- anon/authenticated가 실제로 더 이상 호출할 수 없다.

revoke execute on function public.cleanup_expired_uploads() from public;
