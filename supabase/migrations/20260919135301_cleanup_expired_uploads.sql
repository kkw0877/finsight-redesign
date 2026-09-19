-- ADR-011: 업로드 원본 파일 자동 삭제 (pg_cron + pg_net)
--
-- analysis_jobs.file_expires_at가 지났고 status가 'processing'이 아닌 job의
-- Storage 오브젝트(card-statements 버킷)만 삭제한다. analysis_jobs/analysis_results
-- row 자체는 감사/추적 목적으로 그대로 둔다(ADR-007과 결을 맞춤).
--
-- pg_net은 비동기 HTTP 호출이라 Storage REST API의 응답(404 등)이 이 함수 실행을
-- 막지 않는다 — 이미 삭제된 파일에 대한 재요청은 자연히 무시된다.
--
-- service role 키는 이 마이그레이션 파일에 평문으로 넣지 않는다(git에 커밋되므로).
-- 대신 Supabase Vault에 name='service_role_key'로 저장한 값을 함수 실행 시점에
-- vault.decrypted_secrets에서 조회한다. 이 시크릿 자체는 별도로(마이그레이션 밖에서)
-- `supabase db query --linked`로 1회 등록한다.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

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

-- cron.schedule은 동일 job 이름 재등록 시 에러를 던지므로, 재실행 가능하도록
-- 기존 job이 있으면 먼저 unschedule한다.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-expired-uploads') then
    perform cron.unschedule('cleanup-expired-uploads');
  end if;
end;
$$;

select cron.schedule(
  'cleanup-expired-uploads',
  '0 * * * *', -- 매시 정각 (ADR-011: 삭제 지연 트레이드오프를 고려해 너무 길지 않은 주기)
  $$ select public.cleanup_expired_uploads(); $$
);
