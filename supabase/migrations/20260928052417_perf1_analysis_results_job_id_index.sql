-- Supabase performance advisor 대응 (supabase-db-audit 스킬):
-- analysis_results.job_id FK에 커버링 인덱스가 없어 analysis_jobs 조인/삭제 시 성능 저하 가능.

create index if not exists analysis_results_job_id_idx on public.analysis_results (job_id);
