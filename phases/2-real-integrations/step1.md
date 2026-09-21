# Step 1: db-schema-migration

## 배경

Step 0에서 Supabase 클라이언트 팩토리(`src/services/supabase/{admin,server,middleware}.ts`)를
만들었다. 이 step은 그 클라이언트들이 실제로 쿼리할 **DB 스키마**를 Supabase CLI 마이그레이션
파일로 작성하고 원격 프로젝트에 적용한다. 이 프로젝트는 DB 마이그레이션을 **Supabase CLI(`db
push`)**로 관리하기로 결정했다(Dashboard SQL Editor 직접 실행 대신) — 스키마 변경 이력이
git으로 추적된다.

**중요한 설계 확정 사항 (이 문서를 쓰기 전 사용자와 논의해 확정함)**: `docs/ARCHITECTURE.md`의
"데이터 흐름 1. 업로드" 절은 업로드 시점에 `analysis_jobs` row가 `status=pending`으로
생성된다고 적혀 있는데, 같은 문서의 "데이터 모델" 절과 ADR-017 본문은 `status`를
`processing | completed | failed` 3가지로만 정의한다. 이건 ADR-017이 비동기→동기 전환 때
세분화된 처리 단계(`pending`/`extracting`/`analyzing`)를 정리하면서 "업로드됨 vs 분석 중"
구분까지 실수로 같이 없앤 것으로 판단해, **`pending`을 다시 추가하기로 확정**했다(총 4가지:
`pending | processing | completed | failed`). 이렇게 하지 않으면 ADR-011의 pg_cron 정리
job이 "업로드만 하고 분석은 안 누른" 파일을 추적할 row 자체가 없어 영영 못 지운다. 이 step의
스키마는 이 확정된 4-상태 기준으로 만든다 — `docs/ARCHITECTURE.md`/ADR-017 원문과 다르다고
스스로 판단해 3가지로 되돌리지 마라.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "데이터 모델" 절 전체(5개 테이블 컬럼 정의).
- `/docs/ADR.md` — ADR-001(Supabase/RLS), ADR-003(24시간 원본 보관), ADR-007(analysis_results
  는 user_id가 PK인 upsert), ADR-011(pg_cron 정리, `processing` 아닌 것만 대상), ADR-013(부분
  유니크 인덱스), ADR-014(비공개 Storage 버킷 + signed URL).
- `phases/2-real-integrations/index.json`의 step 0 `summary` — 이전 step에서 만든 클라이언트
  파일 경로 확인(이 step에서 직접 쓰진 않지만 다음 step들이 참고할 스키마와 일관되게 만들기
  위해 존재를 인지해둔다).

## 작업

### 1. Supabase CLI 프로젝트 연결 확인

로컬에 Supabase CLI(`supabase --version`으로 설치 확인 가능)가 이미 설치되어 있다. 이 저장소
루트에는 아직 `supabase/` 디렉토리가 없다.

1. `supabase/config.toml`이 없으면 `supabase init`으로 초기화한다(대화형 프롬프트가 뜨면
   기본값으로 진행하거나 non-interactive 플래그를 확인해 쓴다).
2. 이 프로젝트의 Supabase project ref는 `fwnamclnlfvqtxovtsbp`다(`.env.local`의
   `NEXT_PUBLIC_SUPABASE_URL=https://fwnamclnlfvqtxovtsbp.supabase.co`에서 확인 가능한 공개
   값 — 민감정보 아님). `supabase link --project-ref fwnamclnlfvqtxovtsbp`를 실행한다.
3. **이 명령이 로그인(`supabase login`, 브라우저 인증 필요)을 요구하며 실패하면, 3회
   재시도하지 말고 즉시 `blocked` 처리하라.** 이건 코드 수정으로 해결할 수 있는 문제가
   아니다 — `blocked_reason`에 "로컬에서 `supabase login`으로 먼저 로그인한 뒤
   `supabase link --project-ref fwnamclnlfvqtxovtsbp`를 실행해야 함"이라고 명확히 적고
   중단한다.

### 2. 마이그레이션 파일 작성

`supabase migration new initial_schema`로 타임스탬프가 붙은 파일을 생성한다(직접 파일명을
만들지 말고 CLI가 만든 `supabase/migrations/<timestamp>_initial_schema.sql` 경로를 그대로
쓴다). 아래 내용을 채운다 — 컬럼명/타입은 `docs/ARCHITECTURE.md`의 "데이터 모델" 절을
기준으로 하되, 위 "배경"에서 확정한 대로 `analysis_jobs.status`에는 `pending`을 포함한다.

```sql
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
```

각 테이블에 `updated_at`을 자동 갱신하는 트리거는 만들지 않아도 된다(애플리케이션 코드가
매 쓰기마다 `updated_at`을 직접 채운다 — 다음 step들 범위) — 이 step은 스키마만 만든다.

### 3. RLS 활성화 + 정책

`user_id`가 있는 4개 테이블(`usage_monthly`, `subscriptions`, `analysis_jobs`,
`analysis_results`)에 RLS를 켜고, 본인 행만 CRUD 가능하도록 정책을 만든다:

```sql
alter table usage_monthly enable row level security;
alter table subscriptions enable row level security;
alter table analysis_jobs enable row level security;
alter table analysis_results enable row level security;
alter table webhook_events enable row level security;

-- 예시 (usage_monthly) — 나머지 3개 user_id 테이블에도 동일 패턴 반복
create policy "usage_monthly_select_own" on usage_monthly
  for select using (auth.uid() = user_id);
create policy "usage_monthly_insert_own" on usage_monthly
  for insert with check (auth.uid() = user_id);
create policy "usage_monthly_update_own" on usage_monthly
  for update using (auth.uid() = user_id);
```

`webhook_events`는 `user_id` 컬럼이 없다 — RLS만 켜고 `anon`/`authenticated`용 정책은 **하나도
추가하지 마라**(정책이 없으면 service role 키를 쓰는 웹훅 핸들러만 접근 가능하고, 일반 로그인
사용자는 어떤 방식으로도 접근 불가 — 이게 의도된 동작이다, ADR-012).

`authenticated` 롤에 테이블 레벨 권한도 명시적으로 부여한다(Supabase는 RLS로 행 단위를
막지만 테이블 자체 권한은 별도다):

```sql
grant select, insert, update on usage_monthly, subscriptions, analysis_jobs, analysis_results
  to authenticated;
```

`webhook_events`는 `authenticated`에 어떤 권한도 주지 않는다.

### 4. 비공개 Storage 버킷 (ADR-014)

업로드 원본 파일을 담을 비공개 버킷을 만든다:

```sql
insert into storage.buckets (id, name, public)
values ('card-statements', 'card-statements', false)
on conflict (id) do nothing;
```

`storage.objects`에 대한 별도 RLS 정책은 추가하지 않는다 — 버킷이 `public: false`이고 정책이
없으면 기본적으로 `service_role`만 접근 가능하다(이 프로젝트는 클라이언트가 Storage에 직접
접근하지 않고 항상 서버가 admin 클라이언트로 signed URL을 발급하는 구조이므로, 이게 가장
안전한 기본값이다 — ADR-014).

### 5. 마이그레이션 적용

`supabase db push`로 방금 만든 마이그레이션을 연결된 원격 프로젝트에 적용한다. 실패 시
에러 메시지를 읽고 SQL 문법/제약조건 문제라면 수정 후 재시도(최대 3회, 일반적인 step 재시도
규칙). 연결 자체가 안 되는 문제(로그인 필요 등)는 위 1번에서 이미 blocked 처리했어야 한다.

## Acceptance Criteria

```bash
supabase db push   # 마이그레이션이 원격 프로젝트에 에러 없이 적용됨
npm run build       # 이 step은 TS 코드를 건드리지 않으므로 기존 빌드가 깨지지 않는지만 확인
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `analysis_jobs.status`에 `pending`이 포함되어 있는가(이 문서에서 확정한 4-상태)?
   - ADR-013의 부분 유니크 인덱스(`WHERE status = 'processing'`)가 정확히 만들어졌는가?
   - `user_id`가 있는 4개 테이블 모두 RLS가 켜져 있고 `auth.uid() = user_id` 정책이 있는가?
   - `webhook_events`에는 `authenticated`용 정책/권한이 전혀 없는가(CLAUDE.md CRITICAL —
     service role 우회 지점을 최소화)?
   - Storage 버킷이 `public: false`로 생성됐는가?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 1 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 마이그레이션 파일 경로, 테이블/인덱스 목록,
     `analysis_jobs.status`가 4-상태임을 명시해 요약(다음 step들이 정확한 컬럼명을 알아야
     한다).
   - 수정 3회 시도 후에도 실패(SQL 문법 등 코드로 해결 가능한 문제) → `"status": "error"`,
     `"error_message": "구체적 에러 내용"`.
   - 로그인/연결 문제로 진행 불가 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"`
     후 즉시 중단.

## 금지사항

- `src/` 아래 어떤 파일도 건드리지 마라. 이유: 이 step은 순수 DB 스키마 작업이고, 이 스키마를
  실제로 쓰는 코드는 이후 step들(3~9번) 범위다.
- `analysis_jobs.status`를 ADR-017 원문 그대로 3가지(`processing | completed | failed`)로
  되돌리지 마라. 이유: 위 "배경"에서 사용자와 논의해 `pending`을 다시 추가하기로 이미
  확정했다 — 이 결정 없이는 ADR-011의 pg_cron 정리 대상에서 "업로드만 하고 버려진 파일"이
  영구히 빠진다.
- `webhook_events`, `storage.objects`에 `anon`/`authenticated` 대상 정책을 추가하지 마라.
  이유: 이 두 리소스는 service role(서버 코드)만 접근해야 하는 신뢰 경계다 — 정책을 추가하면
  그 경계가 뚫린다.
- 기존 테스트를 깨뜨리지 마라.
