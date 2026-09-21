# Step 3: upload-route

## 배경

Step 0(서비스 클라이언트), 1(DB 스키마 + 비공개 Storage 버킷 `card-statements`), 2(인증
흐름 + 전역 미들웨어)가 끝났다. 이 step은 현재 mock인 `POST /api/upload`를 실제 Storage
저장 + `analysis_jobs` row 생성으로 교체한다.

`src/middleware.ts`(step 2)가 이미 `/api/upload`를 보호 대상으로 걸어뒀지만, 그건 "로그인
안 된 요청을 401로 거르는" 역할일 뿐이다 — 이 라우트 핸들러 자신도 `user.id`가 필요하므로
반드시 다시 세션을 확인해야 한다(step 2에서 정한 규칙).

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "데이터 흐름 1. 업로드" 절, "API 인터페이스" 표의 `/api/upload`
  행, "보안 규칙" 절(service role 쿼리 `user_id` 명시 필터, 비공개 버킷 + signed URL).
- `/docs/ADR.md` — ADR-003(24시간 보관), ADR-013(부분 유니크 인덱스 — 이 step은 `pending`
  row만 만드므로 이 인덱스와 직접 충돌하지 않는다, 이유는 아래 참고), ADR-014(비공개 버킷).
- `/docs/feature-spec.md` — F-ILFWKT(파일 업로드 및 형식 검증) 전체.
- `phases/2-real-integrations/index.json`의 step 0/1/2 `summary` — 클라이언트 함수 시그니처,
  정확한 테이블/컬럼명, 미들웨어 규칙을 확인한다.
- `src/app/api/upload/route.ts` — 현재 mock 구현(확장자/용량 검증 로직은 그대로 재사용하고,
  Storage/DB 연동만 추가한다).
- `src/types/api.ts`의 `UploadResponse` — 응답 계약이 `{ jobId, fileName }`으로 이미 고정돼
  있다. **이 계약을 바꾸지 마라** — 다음 step들(analysis-start-route, dashboard-integration)
  이 이 모양 그대로를 기대한다.
- Next.js 16 Route Handler에서 `request.formData()`로 큰 파일(최대 20MB)을 받을 때 요청
  본문 크기 제한이 있는지 `node_modules/next/dist/docs/`에서 확인하라(이 버전은 학습 데이터
  기준과 다를 수 있다, `/AGENTS.md` 참고) — 제한이 있다면 이 route의 설정(예: route segment
  config)에서 어떻게 늘리는지도 함께 확인해서 반영한다.

## 작업

`src/app/api/upload/route.ts`를 아래 순서로 수정한다. **확장자/용량 검증 로직(400 응답,
기존 한글 메시지)은 그대로 유지**한다.

1. `createServerSupabaseClient()`로 `auth.getUser()`를 호출한다. 사용자가 없으면 401로
   `{ error: '로그인이 필요합니다' }` 응답(미들웨어를 통과했다면 이론상 항상 있어야 하지만,
   라우트 자체의 방어선으로 반드시 다시 확인한다).
2. 기존 확장자/용량 검증을 통과시킨다.
3. `crypto.randomUUID()`로 `jobId`를 만든다. Storage 경로는
   `${user.id}/${jobId}/${file.name}`로 구성한다(사용자별 폴더 분리).
4. `createAdminSupabaseClient()`(RLS 우회, 비공개 버킷은 service role만 쓸 수 있다 — 이
   경로에서 `user.id`는 반드시 1번에서 얻은 인증된 사용자 것만 쓴다, 요청 바디의 값을
   신뢰하지 않는다, CLAUDE.md CRITICAL)로 `card-statements` 버킷에 파일을 업로드한다.
   `contentType`은 확장자 기준으로 `text/csv` 또는 `application/pdf`를 명시적으로 지정한다
   (`file.type`을 그대로 믿지 않는다).
5. 업로드가 성공하면 같은 admin 클라이언트로 `analysis_jobs`에 row를 insert한다:
   `id=jobId`, `user_id=user.id`, `status='pending'`, `source_file_path=<3번 경로>`,
   `source_file_type='csv'|'pdf'`, `file_expires_at=now()+24시간`(JS로 계산해서 ISO 문자열로
   넘긴다).
6. DB insert가 실패하면, 이미 업로드된 Storage 오브젝트를 best-effort로 삭제 시도한 뒤(삭제
   자체가 실패해도 무시하고 계속 진행 — 별도 try/catch로 감싼다) 사용자에게는 일반화된 에러
   메시지로 500 응답한다.
7. 성공하면 기존과 동일하게 `{ jobId, fileName: file.name }`(`UploadResponse`)를 200으로
   응답한다.

이 step에서 `analysis_jobs.status`를 `'processing'`으로 만들지 않는다 — ADR-013의 부분
유니크 인덱스는 `status='processing'`에만 걸려 있으므로, 같은 사용자가 여러 번 업로드해서
`'pending'` row가 여러 개 쌓여도 그 인덱스와 무관하다(의도된 동작 — 분석 시작 전까지는
동시성 제약이 필요 없다).

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

테스트는 Route Handler 함수를 직접 호출하는 기존 프로젝트 관례를 따르되, `@/services/
supabase/{server,admin}`을 `vi.mock`으로 모킹한다(실제 Supabase 네트워크 호출 없이):

- 인증 없음 → 401.
- 잘못된 확장자/20MB 초과 → 기존과 동일하게 400 + 기존 메시지(회귀 테스트).
- 정상 업로드 → mock된 storage `.upload()`와 `.from('analysis_jobs').insert()`가 예상한
  인자(경로에 `user.id`/`jobId` 포함, `status: 'pending'`, `file_expires_at`이 대략 24시간
  뒤)로 호출됐는지, 응답이 200 + `{ jobId, fileName }`인지.
- DB insert 실패 시 storage 삭제가 시도되는지, 응답이 500 + 일반화된 메시지인지.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `UploadResponse` 계약(`{ jobId, fileName }`)이 그대로 유지됐는가?
   - Storage 업로드/DB insert 모두 admin(service role) 클라이언트를 쓰되, `user_id`는 항상
     인증된 사용자의 것으로 명시적으로 채워졌는가(CLAUDE.md CRITICAL)?
   - 내부 예외를 그대로 노출하지 않는가?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 3 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 Storage 경로 규칙과 `analysis_jobs` insert
     컬럼을 한 줄로 요약(다음 step 4가 같은 job을 조회해야 한다).
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- `UploadResponse` 타입/응답 shape을 바꾸지 마라. 이유: 이후 step들이 이 계약에 의존한다.
- `src/app/api/analysis/`, `src/app/dashboard/`를 이 step에서 건드리지 마라. 이유: 분석
  시작 로직은 step 4, 화면 연동은 step 6 범위다.
- `analysis_jobs.status`를 `'processing'`으로 만들지 마라. 이유: 그건 분석이 실제로
  시작될 때(step 4)의 책임이다 — 업로드 시점에 processing으로 만들면 ADR-013 유니크
  인덱스와 의미가 어긋난다(아직 분석을 시작한 게 아니므로).
- 기존 테스트를 깨뜨리지 마라.
