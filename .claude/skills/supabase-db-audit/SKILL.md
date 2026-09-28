---
name: supabase-db-audit
description: Supabase MCP의 get_advisors(security + performance)로 이 프로젝트가 실제로 쓰는 Supabase 프로젝트(NEXT_PUBLIC_SUPABASE_URL에서 자동 판별)를 점검하고 결과를 db-reports/에 리포트로 저장한다. docs/ADR.md와 CLAUDE.md의 CRITICAL 규칙과 대조해 의도된 설계(예: service role 전용 테이블의 RLS-활성화-정책없음)와 실제 이슈를 구분한 뒤, 사용자가 항목별로 고칠지 확인하면 SQL을 먼저 보여주고 승인받아 apply_migration으로 실제 수정까지 진행하며 supabase/migrations/에 동일한 로컬 마이그레이션 파일도 함께 남긴다. Supabase 유료 브랜칭이 없어 프로덕션에 직접 적용하므로 사전 확인 없이는 어떤 수정도 실행하지 않는다. 사용자가 "DB 점검해줘", "Supabase 어드바이저 확인해줘", "데이터베이스 보안/성능 점검", "RLS 점검", "인덱스 점검해줘", "get_advisors 돌려줘", "DB 감사해줘" 등을 요청하면 사용.
---

이 프로젝트가 실제로 연결된 Supabase 프로덕션 프로젝트를 `get_advisors`로 점검하고,
결과를 `db-reports/`에 파일로 저장한 뒤, 사용자가 승인한 항목만 실제로 고친다.
(코드를 정적으로 스캔하는 `owasp-security-audit`과 달리, 이 스킬은 **라이브 DB 상태**를 본다.)

## 1. 프로젝트 판별

1. `.env.local`에서 `NEXT_PUBLIC_SUPABASE_URL`을 읽어 `https://<ref>.supabase.co`에서 `<ref>`를 추출한다.
2. `mcp__supabase__list_projects`를 호출해 해당 `ref`와 일치하는 프로젝트를 찾는다.
3. 상태가 `ACTIVE_HEALTHY`가 아니면(일시정지 등) 사용자에게 알리고 계속할지 확인한다.
4. 이후 모든 MCP 호출에 이 `project_id`를 사용한다. 여러 프로젝트가 매칭되거나 하나도 안 되면
   사용자에게 물어본다 — 임의로 추측하지 않는다.

## 2. 어드바이저 조회

`mcp__supabase__get_advisors`를 `type="security"`와 `type="performance"` 두 번 호출해 하나의
리포트로 합친다. 각 finding의 원본 필드(제목/설명/심각도/영향 대상/remediation 링크)를 그대로
보존한다 — 임의로 심각도를 재해석하거나 문구를 바꾸지 않는다.

## 3. 판단 — 의도된 설계 vs 실제 이슈

각 finding을 다음 세 가지 중 하나로 분류한다. 근거 없이 넘기지 않는다:

- **[실제 이슈]**: 고쳐야 할 것으로 보임.
- **[의도된 설계 — 조치 불요]**: `docs/ADR.md`나 `CLAUDE.md`의 CRITICAL 규칙에 이미 의도적으로
  이렇게 설계했다는 근거가 있는 경우. 반드시 어떤 ADR/규칙 근거인지 리포트에 명시한다.
  예: `webhook_events` 테이블은 RLS가 켜져 있지만 정책이 없다 — service role 전용 접근이며
  ADR-012(결제 확정 신뢰 소스 — Polar 웹훅)에 따른 의도된 설계.
- **[판단 보류 — 확인 필요]**: ADR/CLAUDE.md만으로 의도됐는지 판단이 안 서는 경우. 억지로
  둘 중 하나로 분류하지 않는다.

CRITICAL 규칙 중 "service role 키로 RLS를 우회하는 코드는 모든 쿼리에 user_id 조건을 명시적으로
건다"가 있으므로, "RLS 없음/정책 없음" 어드바이저가 떴다고 곧바로 RLS를 켜는 게 항상 정답은
아니다 — 관련 API 라우트(`src/app/api/`)가 이미 `user_id` 필터링을 하고 있는지 코드도 함께
확인하고 판단 근거에 남긴다.

Auth 설정류 어드바이저(예: leaked password protection 비활성화, OTP 만료 시간 등)는 SQL
마이그레이션으로 고칠 수 없는 대시보드 설정이다 — [실제 이슈]로 분류하되 "SQL 수정 불가 —
Supabase 대시보드에서 수동 설정 필요"라고 표시하고, 6단계의 자동 수정 대상에서 제외한다.

## 4. 리포트 저장 + 출력

1. Executive Summary(advisor 타입별 findings 개수, [실제 이슈]/[의도된 설계]/[판단 보류] 개수)를 만든다.
2. 항목별 테이블: 제목 / advisor 타입(security\|performance) / 원본 심각도 / 영향 대상(schema.table 등) /
   설명 / remediation 링크 / 판정(+ADR 근거).
3. `db-reports/<YYYY-MM-DD>-<HHMMSS>-<4자리 랜덤 hex>.md`에 Write한다
   (`db-reports/` 없으면 새로 만든다 — `.gitignore`에 이미 등록되어 있어 git 추적 대상이 아니다).
   같은 이름의 파일이 이미 있으면 랜덤 suffix를 다시 뽑아 재시도한다.
4. 저장한 파일 경로를 알리고, 리포트 내용(Executive Summary + 전체 항목)을 대화창에도 출력한다 —
   파일에만 저장하고 끝내지 않는다.

## 5. 수정 여부 확인

[실제 이슈]로 분류된 항목 중 SQL로 고칠 수 있는 것들을 나열하고, 사용자에게 어떤 항목을
고칠지 묻는다(전체/일부/전부 보류). 사용자가 명시적으로 고르기 전에는 6단계로 넘어가지 않는다.

## 6. 실제 수정 적용 (승인된 항목만)

이 프로젝트는 Supabase 유료 브랜칭을 쓰지 않으므로 **모든 수정은 프로덕션 DB에 직접 적용된다.**
되돌리기 어려운 작업이므로 항목별로 아래 순서를 반드시 지킨다 — 확인 없이 건너뛰지 않는다:

1. 기존 마이그레이션(`supabase/migrations/*.sql`) 스타일을 따라 idempotent한 SQL을 초안 작성한다
   (`create ... if not exists`, `drop ... if exists` 등). 대상 테이블에 이미 걸려 있는 RLS
   정책·grant와 충돌하지 않는지 기존 마이그레이션 파일들을 먼저 읽고 확인한다.
2. 완성된 SQL 전문을 사용자에게 보여주고 **명시적으로 승인**을 받는다. 승인 없이
   `apply_migration`을 호출하지 않는다.
3. 승인되면 `date -u +%Y%m%d%H%M%S`로 타임스탬프를 얻고, 영문 snake_case로 짧은 설명을 붙여
   이름을 만든다 (예: `20260928153000_add_index_analysis_jobs_status`). 이 이름을
   `mcp__supabase__apply_migration`의 `name`과 로컬 파일명 접두사에 **동일하게** 사용해
   원격/로컬 버전이 어긋나지 않게 한다.
4. `apply_migration(project_id, name, query)`을 호출해 프로덕션에 적용한다.
5. 성공하면 같은 SQL을 `supabase/migrations/<name>.sql`로 로컬에도 Write한다(git 추적용).
   커밋은 사용자가 명시적으로 요청할 때만 한다 — 이 스킬이 임의로 git commit을 실행하지 않는다.
6. 인덱스 생성처럼 락 시간이 걱정되는 항목이면 `create index concurrently`를 쓰고 싶을 수 있는데,
   `CONCURRENTLY`는 트랜잭션 안에서 실행할 수 없다. `apply_migration`이 각 마이그레이션을
   트랜잭션으로 감싸는지 불확실하면, 이 사실과 위험을 사용자에게 알리고 결정을 맡긴다 — 임의로
   `CONCURRENTLY`를 넣거나 빼지 않는다.

## 7. 마무리

적용된 항목과 남겨둔(보류/대시보드 수동 조치 필요) 항목을 다시 한번 요약해서 출력한다.
CLI(`supabase`)가 설치되어 있으니, `supabase migration list --linked`로 원격/로컬 마이그레이션
이력이 어긋나지 않았는지 확인해보라고 안내한다.

## 주의사항

- 이 스킬은 승인된 항목에 한해 실제로 프로덕션 DB에 쓰기 작업을 수행한다 — 5~6단계의 확인
  절차를 생략하지 않는다.
- `db-reports/`에 저장된 리포트는 아직 고치지 않은 취약점의 상세 지도이므로 git에 커밋하지
  않는다(`.gitignore`에 이미 등록됨).
- Executive Summary의 카운트와 판정은 실제로 나열된 findings에서만 집계한다 — 새로 지어내지 않는다.
- 5개 findings 중 일부가 "해당 없음"이어도 정상이다 — 억지로 findings를 만들어내지 않는다.
