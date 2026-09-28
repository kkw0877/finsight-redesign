-- Supabase performance advisor 대응 (supabase-db-audit 스킬):
-- RLS 정책이 auth.uid()를 행마다 재평가해 스케일에서 느려짐 (auth_rls_initplan).
-- auth.uid()를 (select auth.uid())로 감싸 쿼리 플래너가 한 번만 평가하도록 최적화.

alter policy "usage_monthly_select_own" on public.usage_monthly using ((select auth.uid()) = user_id);
alter policy "usage_monthly_insert_own" on public.usage_monthly with check ((select auth.uid()) = user_id);
alter policy "usage_monthly_update_own" on public.usage_monthly using ((select auth.uid()) = user_id);

alter policy "subscriptions_select_own" on public.subscriptions using ((select auth.uid()) = user_id);
alter policy "subscriptions_insert_own" on public.subscriptions with check ((select auth.uid()) = user_id);
alter policy "subscriptions_update_own" on public.subscriptions using ((select auth.uid()) = user_id);

alter policy "analysis_jobs_select_own" on public.analysis_jobs using ((select auth.uid()) = user_id);
alter policy "analysis_jobs_insert_own" on public.analysis_jobs with check ((select auth.uid()) = user_id);
alter policy "analysis_jobs_update_own" on public.analysis_jobs using ((select auth.uid()) = user_id);

alter policy "analysis_results_select_own" on public.analysis_results using ((select auth.uid()) = user_id);
alter policy "analysis_results_insert_own" on public.analysis_results with check ((select auth.uid()) = user_id);
alter policy "analysis_results_update_own" on public.analysis_results using ((select auth.uid()) = user_id);
