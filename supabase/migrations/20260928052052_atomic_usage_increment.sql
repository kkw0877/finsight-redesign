-- OWASP A06:2025 Insecure Design 대응 (owasp-security-audit 스킬 스모크 테스트 발견):
-- consumeOneAnalysis()가 usage_monthly 행을 읽어온 뒤 +1 해서 upsert하는 방식(read-then-write)
-- 이었다. analysis_jobs_one_processing_per_user 유니크 인덱스(ADR-013)가 "사용자당 동시
-- processing job 1개"는 이미 강제하지만, 한 job이 완료(status='completed' 갱신 + 사용량 차감)
-- 되는 사이에 즉시 다음 job이 processing으로 들어가 완료되면, 두 consumeOneAnalysis 호출이
-- 겹치면서 같은 이전 값을 읽어 +1 하고 서로의 갱신을 덮어쓸 수 있다(lost update) — 빠르게
-- 연달아 업로드/분석을 반복하면 무료/구독 쿼터보다 많은 분석이 가능해지는 경로다.
--
-- 하나의 INSERT ... ON CONFLICT DO UPDATE 문으로 읽기와 증가를 한 트랜잭션/한 문장에서
-- 원자적으로 처리해 이 레이스를 제거한다.

create or replace function public.increment_usage(
  p_user_id uuid,
  p_period_month text,
  p_free_limit integer
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.usage_monthly (user_id, period_month, free_used_count, subscription_used_count, updated_at)
  values (p_user_id, p_period_month, 1, 0, now())
  on conflict (user_id, period_month) do update
  set
    free_used_count = case
      when public.usage_monthly.free_used_count < p_free_limit
        then public.usage_monthly.free_used_count + 1
        else public.usage_monthly.free_used_count
    end,
    subscription_used_count = case
      when public.usage_monthly.free_used_count < p_free_limit
        then public.usage_monthly.subscription_used_count
        else public.usage_monthly.subscription_used_count + 1
    end,
    updated_at = now();
$$;

grant execute on function public.increment_usage(uuid, text, integer) to authenticated;
