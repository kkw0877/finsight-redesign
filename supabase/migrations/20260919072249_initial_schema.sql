create table if not exists usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month text not null,                    -- 'YYYY-MM', KST 기준
  free_used_count integer not null default 0,
  subscription_used_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_month)
);

create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'none'
    check (status in ('none', 'active', 'cancel_scheduled', 'inactive')),
  polar_subscription_id text,
  polar_customer_id text,
  current_period_end timestamptz,
  auto_renew boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  source_file_path text not null,
  source_file_type text not null,
  file_expires_at timestamptz not null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ADR-013: 사용자당 동시 processing job 1개 이하 강제
create unique index if not exists analysis_jobs_one_processing_per_user
  on analysis_jobs (user_id) where (status = 'processing');

create table if not exists analysis_results (
  user_id uuid primary key references auth.users(id) on delete cascade,
  job_id uuid not null references analysis_jobs(id) on delete cascade,
  summary jsonb not null,
  category_breakdown jsonb not null,
  anomalies jsonb not null,
  recommendations jsonb not null,
  generated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id text primary key,          -- Polar 이벤트 ID (idempotency 키)
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table usage_monthly enable row level security;
alter table subscriptions enable row level security;
alter table analysis_jobs enable row level security;
alter table analysis_results enable row level security;
alter table webhook_events enable row level security;

create policy "usage_monthly_select_own" on usage_monthly
  for select using (auth.uid() = user_id);
create policy "usage_monthly_insert_own" on usage_monthly
  for insert with check (auth.uid() = user_id);
create policy "usage_monthly_update_own" on usage_monthly
  for update using (auth.uid() = user_id);

create policy "subscriptions_select_own" on subscriptions
  for select using (auth.uid() = user_id);
create policy "subscriptions_insert_own" on subscriptions
  for insert with check (auth.uid() = user_id);
create policy "subscriptions_update_own" on subscriptions
  for update using (auth.uid() = user_id);

create policy "analysis_jobs_select_own" on analysis_jobs
  for select using (auth.uid() = user_id);
create policy "analysis_jobs_insert_own" on analysis_jobs
  for insert with check (auth.uid() = user_id);
create policy "analysis_jobs_update_own" on analysis_jobs
  for update using (auth.uid() = user_id);

create policy "analysis_results_select_own" on analysis_results
  for select using (auth.uid() = user_id);
create policy "analysis_results_insert_own" on analysis_results
  for insert with check (auth.uid() = user_id);
create policy "analysis_results_update_own" on analysis_results
  for update using (auth.uid() = user_id);

-- webhook_events: RLS만 활성화, anon/authenticated 정책은 의도적으로 없음(ADR-012, service role만 접근)

grant select, insert, update on usage_monthly, subscriptions, analysis_jobs, analysis_results
  to authenticated;

insert into storage.buckets (id, name, public)
values ('card-statements', 'card-statements', false)
on conflict (id) do nothing;
