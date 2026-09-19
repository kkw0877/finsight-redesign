# Step 10: pg-cron-cleanup

## 배경

이 phase의 마지막 step이다(사용자와 논의해 이 위치로 확정 — DB 마이그레이션과 같은
Supabase 영역이라 자연스럽게 묶이고, SQL 함수 + pg_cron 스케줄 등록 하나로 끝나는 작은
작업이라 별도 phase로 미루지 않기로 했다). ADR-011에 따라 업로드 원본 파일(비공개 Storage
버킷의 실제 오브젝트)을 24시간 뒤 자동 삭제하는 정리 job을 Supabase `pg_cron`으로 등록한다.

**대상**: `analysis_jobs`에서 `file_expires_at`이 지났고 `status <> 'processing'`인 row의
Storage 오브젝트(`analysis_jobs`가 `pending` 상태로 남아있는 "업로드만 하고 분석은 안 누른"
케이스가 이제 이 조건에 포함된다 — step 1에서 `pending`을 4-상태에 추가한 이유가 바로 이것).
`processing` 중인 job은 이번 주기에서 건너뛴다(ADR-011 — 진행 중인 요청과의 경합 방지).

**삭제 범위(중요)**: 이 job은 **Storage 오브젝트(실제 파일)만** 지운다. `analysis_jobs`
row 자체는 지우거나 컬럼을 비우지 않는다 — row는 그대로 두고(감사/추적 목적, ADR-007의
"결과는 계정 삭제 전까지 보관" 원칙과 결이 같다), 그 row가 가리키던 파일만 없어지는 것이다.
같은 row를 나중에 다시 처리 대상으로 잘못 잡지 않도록(같은 파일을 두 번 지우려 시도하는 것
자체는 무해하지만), 삭제한 job에는 이미 처리됐다는 표시(예: 새 컬럼을 추가하지 않고 이미
있는 `error_message`에 남기거나, 가장 간단하게는 `file_expires_at`을 지난 job이 재조회돼도
Storage 삭제 API가 "이미 없음"을 정상 응답하는 것에 의존해도 된다 — 새 스키마 변경 없이
가능한 방법을 선택하라).

**중요**: Postgres SQL에서 `storage.objects` 테이블 row를 직접 `DELETE`하는 것만으로는
실제 오브젝트 스토리지(S3 호환 백엔드)의 바이트가 지워지지 않을 수 있다 — Supabase의
Storage REST API를 통해 삭제해야 실제 파일도 지워진다. Supabase는 pg_cron과 함께 `pg_net`
확장으로 Postgres 안에서 Storage REST API를 HTTP로 직접 호출하는 패턴을 공식적으로
지원한다. **정확한 최신 방법(확장 활성화, service role 키를 SQL 함수 안에서 안전하게 참조
하는 방법 — 보통 Supabase Vault를 쓴다, HTTP 호출 함수 시그니처)은 학습 데이터로 추측하지
말고 Supabase 공식 문서를 웹 검색/조회해서 현재 권장 방식을 확인한 뒤 구현하라.**

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — ADR-011(전체 재정독), ADR-003(24시간 보관 배경).
- `/docs/ARCHITECTURE.md` — "데이터 흐름 4. 파일 정리" 절.
- `phases/2-real-integrations/index.json`의 step 1 `summary` — `analysis_jobs`의 정확한
  컬럼명(`file_expires_at`, `source_file_path`, `status` 4-상태), Storage 버킷 이름
  (`card-statements`).
- 로컬 `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`(변수 이름만 — 이미 이전 step들에서
  `fwnamclnlfvqtxovtsbp`라는 project ref로 노출된 값, 새로 값을 출력할 필요 없음). Storage
  REST 엔드포인트는 이 URL 기준으로 구성된다.

## 작업

### 1. 마이그레이션 파일 작성

`supabase migration new cleanup_expired_uploads`로 새 마이그레이션을 만든다(step 1과 동일한
방식 — CLI가 만든 타임스탬프 파일명을 그대로 쓴다). 이미 `supabase link`가 되어 있어야
한다(step 1에서 이미 링크했을 것 — 안 되어 있으면 이 step도 blocked 처리하고 이유를
남긴다).

내용:

1. 필요한 확장(`pg_cron`, `pg_net` — Supabase 프로젝트에서 보통 dashboard에서 활성화하지만
   `create extension if not exists`로 마이그레이션에서도 켤 수 있는지 확인, 안 되면 이
   부분만 blocked 처리하고 "Dashboard → Database → Extensions에서 pg_cron/pg_net을 켠 뒤
   재시도"로 사유를 남긴다).
2. service role 키를 SQL 함수 안에서 안전하게 참조하는 방법을 확인해 설정한다(Vault 등 —
   위 "배경"에서 언급한 공식 패턴을 조사해 반영).
3. `cleanup_expired_uploads()` SQL 함수: `analysis_jobs`에서
   `file_expires_at < now() AND status <> 'processing'`인 row를 순회하며, 각각의
   `source_file_path`에 대해 `card-statements` 버킷의 Storage 오브젝트를 Storage REST API로
   삭제 요청한다(`pg_net`의 비동기 HTTP 호출 사용). 이미 지워진 파일에 대한 재요청(404
   등)은 에러로 취급하지 않고 무시한다.
4. `cron.schedule(...)`로 이 함수를 주기적으로(예: 매시간, ADR-011의 "삭제 지연 트레이드
   오프"를 고려해 너무 길지 않은 주기) 실행하도록 등록한다.

### 2. 적용

`supabase db push`로 적용한다.

## Acceptance Criteria

```bash
supabase db push
npm run build
npm run lint
npm test
```

이 step은 pg_cron/pg_net을 실제로 등록하는 SQL 작업이라 vitest로 직접 검증할 대상(TS 코드
변경)이 없다 — `npm test`는 기존 테스트가 깨지지 않았는지 확인하는 용도로만 돌린다. SQL
함수 자체는 `supabase db push` 성공 여부와, 가능하다면 `select cron.schedule(...)`가 반환한
job이 `cron.job` 테이블에 등록됐는지(`supabase db execute` 등으로 직접 조회) 확인한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 정리 대상 조건이 `file_expires_at < now() AND status <> 'processing'`과 정확히
     일치하는가(4-상태 전부 대상이 되는가 — `pending`도 포함)?
   - `analysis_jobs` row 자체나 `analysis_results`는 건드리지 않는가?
   - service role 키가 마이그레이션 SQL 파일 안에 평문으로 커밋되지 않는가(Vault 등 안전한
     방법을 썼는가)?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 10 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 스케줄 주기와 사용한 확장/방식을 한 줄로
     요약.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 확장 활성화 등 Dashboard에서만 가능한 수동 조치가 필요 → `"status": "blocked"`,
     `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- Vercel Cron이나 별도 job 큐 서비스를 추가하지 마라. 이유: ADR-011이 "별도 인프라를
  추가하지 않고 Supabase 안에서 해결"하기로 명시적으로 결정했다.
- service role 키를 SQL에 평문으로(마이그레이션 파일에 직접) 넣지 마라. 이유: 마이그레이션
  파일은 git에 커밋된다 — 키가 그대로 노출된다.
- `analysis_jobs`/`analysis_results` row를 삭제하거나 컬럼을 비우지 마라. 이유: 위 "배경"에서
  설명한 대로 이 job은 Storage 오브젝트만 지운다 — DB row는 감사/추적용으로 유지한다
  (ADR-007과 결을 맞춘다).
- 기존 테스트를 깨뜨리지 마라.
