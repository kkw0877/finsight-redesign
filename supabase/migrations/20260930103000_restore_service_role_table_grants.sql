-- service_role이 앱 코드(업로드/분석/웹훅/구독 취소)에서 쓰는 테이블의 DML 권한.
-- 라이브 DB에서 빠져 "permission denied for table analysis_jobs"가 발생했었다.
-- 최소 권한 원칙에 따라 서비스 롤 코드가 접근하는 테이블에만 부여한다(cron_job_failures 제외).
-- 라이브 DB에는 이미 수동 적용되어 있으며, GRANT는 멱등이라 재실행해도 안전하다.
grant select, insert, update, delete
  on public.analysis_jobs, public.analysis_results, public.usage_monthly,
     public.subscriptions, public.webhook_events
  to service_role;
