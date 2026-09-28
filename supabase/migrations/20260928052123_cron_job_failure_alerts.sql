-- OWASP A09:2025 Security Logging and Alerting Failures 대응 (owasp-security-audit 스킬
-- 스모크 테스트 발견): cleanup_expired_uploads()는 Vault에서 service_role_key를 못 찾으면
-- `raise warning`만 하고 조용히 종료했다. Postgres WARNING은 이 앱의 어떤 부분도 구독하지
-- 않으므로, 시크릿이 로테이션되어 사라지면 매시 정각 TTL 정리가 무기한 조용히 멈출 수 있었다
-- (CRITICAL#5 위반은 아니지만 그 메커니즘의 모니터링 사각지대).
--
-- 작고 감사 가능한 실패 로그 테이블을 두고, 실패 시 raise warning과 함께 이 테이블에도
-- 기록한다 — 운영자는 Supabase 대시보드에서 이 테이블을 조회하거나(현재 ADR-009: 별도 관리자
-- 화면 없음, 대시보드 직접 조회로 운영) 향후 알림 연동의 소스로 쓸 수 있다.

create table if not exists cron_job_failures (
  id bigint generated always as identity primary key,
  job_name text not null,
  message text not null,
  occurred_at timestamptz not null default now()
);

alter table cron_job_failures enable row level security;
-- 이 테이블은 cron 함수(SECURITY DEFINER)만 기록하고 service role로만 조회한다 — 다른
-- webhook_events(ADR-012)와 동일하게 anon/authenticated 정책은 의도적으로 두지 않는다.

create or replace function public.cleanup_expired_uploads()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_key text;
  expired_paths text[];
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if service_key is null then
    raise warning 'cleanup_expired_uploads: service_role_key secret not found in Vault, skipping this run';
    insert into public.cron_job_failures (job_name, message)
    values ('cleanup-expired-uploads', 'service_role_key secret not found in Vault');
    return;
  end if;

  select array_agg(source_file_path)
  into expired_paths
  from public.analysis_jobs
  where file_expires_at < now()
    and status <> 'processing';

  if expired_paths is null or array_length(expired_paths, 1) = 0 then
    return;
  end if;

  perform net.http_delete(
    url := 'https://fwnamclnlfvqtxovtsbp.supabase.co/storage/v1/object/card-statements',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('prefixes', to_jsonb(expired_paths))
  );
end;
$$;
