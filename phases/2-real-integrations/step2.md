# Step 2: auth-flow

## 배경

Step 0에서 Supabase 클라이언트 팩토리를, Step 1에서 DB 스키마(RLS 포함)를 만들었다. 이
step에서는 실제 구글 로그인 흐름을 연결한다: OAuth 시작 → 콜백(세션 교환) → 로그아웃, 그리고
보호 화면/API를 지키는 전역 미들웨어.

**핵심 설계 규칙 (반드시 지킬 것)**: `docs/ARCHITECTURE.md`의 "패턴" 절은 "클라이언트
컴포넌트에서 외부 서비스 SDK를 직접 호출하지 않는다"고 명시한다. Supabase Auth도 예외가
아니다 — 로그인 버튼을 눌렀을 때 클라이언트 컴포넌트(`login/page.tsx`)가 `supabase-js`를
직접 import해서 `signInWithOAuth`를 호출하면 안 된다. 대신 버튼은 **자체 API 라우트로 이동
(navigate)**시키고, 그 라우트가 서버 사이드에서 Supabase SDK를 호출해 Google 인증 URL로
리다이렉트한다. "이동"은 SDK 호출이 아니라 단순 브라우저 네비게이션이므로 이 규칙을 지킨다.

이번 phase는 인증 미들웨어를 `src/middleware.ts` 전역 처리 방식으로 하기로 확정했다(각
화면/라우트 개별 체크 대신). **중요**: 미들웨어는 "로그인 안 된 요청을 거칠게 막는 것"까지만
책임진다 — 실제 쿼리에 쓸 `user_id`를 다음 step들의 각 API 라우트 핸들러에 자동으로
넘겨주지 않는다. 이후 step(업로드/분석/구독 라우트)들은 미들웨어를 통과했더라도 라우트
안에서 **다시** `createServerSupabaseClient()`로 `auth.getUser()`를 호출해 본인 사용자를
확인하고 그 `user.id`로 쿼리를 스코핑해야 한다 — 이 사실을 다음 step 작성자가 헷갈리지
않도록 이 step의 산출물에 명확히 남겨라.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "API 인터페이스" 표의 `/auth/callback` 행과 그 아래 "이
  라우트는 세션 인증 미들웨어 대상이 아니다" 문단.
- `/docs/ADR.md` — ADR-001(Supabase Auth, 구글 OAuth).
- `/docs/feature-spec.md` — F-IZGIPZ(소셜 로그인, 특히 Exceptions: "인증 취소 시 로그인
  완료 처리 없이 로그인 화면으로 복귀", "실패 시 실패 사실과 재시도 안내"), F-RIRRKL(로그인
  상태 보호 및 안전한 로그아웃, 특히 "보호 화면은 화면 진입 전·데이터 조회 전 인증 상태
  확인").
- `src/services/supabase/{server,middleware}.ts` — step 0에서 만든 정확한 함수
  시그니처/export 이름을 확인하고 그대로 가져다 쓴다(이 문서에 적은 이름과 다를 수 있으니
  소스가 항상 우선).
- `src/app/login/page.tsx`, `src/app/login/page.module.css` — 현재 mock 구현(전체를 다시
  읽고 어떤 부분을 실제 흐름으로 바꿀지 파악).
- `src/app/welcome/page.tsx` — 로그인 성공 후 도착하는 화면(그대로 유지, 리다이렉트 목적지
  확인용).

## 작업

### 1. `src/app/api/auth/google/route.ts` (GET)

서버 사이드에서 `createServerSupabaseClient()`로 `supabase.auth.signInWithOAuth({ provider:
'google', options: { redirectTo: \`${origin}/auth/callback\` } })`를 호출하고, 반환된
`data.url`로 `NextResponse.redirect(data.url)` 한다. `origin`은 `request.nextUrl.origin`으로
구한다. 에러(설정 문제 등) 발생 시 `/login?error=oauth_failed`로 리다이렉트한다(내부 예외를
그대로 노출하지 않는다, CLAUDE.md CRITICAL).

### 2. `src/app/auth/callback/route.ts` (GET)

- `request.nextUrl.searchParams.get('code')`를 읽는다. 없으면(사용자가 구글 인증을
  취소한 경우 포함) `/login?error=oauth_failed`로 리다이렉트한다(F-IZGIPZ Exceptions).
- `code`가 있으면 `createServerSupabaseClient()`로 `supabase.auth.exchangeCodeForSession(code)`
  를 호출한다. 실패하면 마찬가지로 `/login?error=oauth_failed`로 리다이렉트한다.
- 성공하면 `/welcome`으로 리다이렉트한다(기존 mock 흐름과 동일한 목적지 — `welcome/page.tsx`
  는 이 step에서 건드리지 않는다).
- 이 라우트는 `docs/ARCHITECTURE.md`에 이미 명시된 대로 세션 인증 미들웨어의 보호 대상이
  아니다 — 아래 4번 미들웨어의 matcher에 이 경로를 포함하지 않는다.

### 3. `src/app/api/auth/logout/route.ts` (POST)

`createServerSupabaseClient()`로 `supabase.auth.signOut()`을 호출해 세션 쿠키를 무효화한다.
성공 시 `{ success: true }`를 200으로 응답한다(리다이렉트하지 않는다 — 클라이언트 컴포넌트가
`fetch`로 호출한 뒤 직접 `router.push('/')` 하는 구조를 다음 step(6번, dashboard 연동)에서
쓸 것이다. 이 step에서는 라우트만 만들고 대시보드 쪽 버튼 연결은 하지 않는다).

### 4. `src/middleware.ts`

```ts
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/billing/:path*',
    '/api/upload/:path*',
    '/api/analysis/:path*',
    '/api/usage/:path*',
    '/api/subscription/:path*',
  ],
}
```

이 matcher는 곧 "보호 대상 경로 화이트리스트"다 — `/`, `/login`, `/welcome`, `/privacy`,
`/style-guide`, `/auth/callback`, `/api/auth/*`, `/api/webhooks/polar`는 이 목록에 없으므로
미들웨어가 아예 개입하지 않는다(추가 예외 처리 코드 불필요).

미들웨어 함수는 `src/services/supabase/middleware.ts`의 헬퍼로 세션을 갱신하고 사용자
유무를 확인한다:

- 사용자가 없고 경로가 `/api`로 시작하면 → `NextResponse.json({ error: '로그인이
  필요합니다' }, { status: 401 })`를 반환한다.
- 사용자가 없고 페이지 경로(`/dashboard`, `/billing`)면 → `/login`으로 리다이렉트한다
  (F-RIRRKL).
- 사용자가 있으면 → 헬퍼가 반환한, 쿠키가 갱신된 `response`를 그대로 반환해 요청을
  통과시킨다.

### 5. `src/app/login/page.tsx` 실제 연동

- 현재 `handleSignIn`(클릭 → `setLoading(true)` → 900ms 후 `/welcome`으로 `router.push`)을
  제거하고, `GoogleButton`의 `onClick`에서 `window.location.href = '/api/auth/google'`로
  이동시킨다(전체 페이지 네비게이션이어야 서버 라우트가 실제로 호출되고 그 리다이렉트를
  브라우저가 따라간다 — `router.push` 같은 클라이언트 사이드 네비게이션을 쓰지 마라).
- `useSearchParams()`(Next.js `next/navigation`)로 URL의 `error` 쿼리 파라미터를 읽는다.
  값이 있으면(`oauth_failed` 등) 기존 에러 배너(`role="alert"`인 `<p>`)를 그 값에 맞는
  이해 가능한 한글 메시지로 보여준다(예: "구글 로그인에 실패했습니다. 다시 시도해주세요").
- "Demo: preview sign-in failure" 버튼과 그 위의 `// TODO: replace with real Supabase Auth
  error handling` 주석 2곳을 제거한다 — 이 TODO가 정확히 이 step에서 하는 작업이므로 이제
  실제 에러 흐름(위 `error` 쿼리 파라미터 처리)으로 대체된 것이다.
- `loading` 상태는 버튼 클릭 후 실제 페이지 이동이 일어나기 전까지 짧게 보여주는 용도로
  유지해도 되고, 어차피 전체 페이지 네비게이션이 발생하므로 제거해도 무방하다 — 기존
  `Spinner` 오버레이 UI 자체는 유지하되, `setTimeout` 기반 인위적 지연은 만들지 마라.

### 6. 테스트

Google OAuth 자체(실제 구글 로그인 화면)는 CI/로컬 자동 테스트로 재현할 수 없다 — 아래
범위로 검증한다:

- `src/services/supabase/server.ts`를 `vi.mock`으로 모킹해서:
  - `/api/auth/google`: `signInWithOAuth`가 성공 응답을 주면 그 `url`로 302/307
    리다이렉트하는지. 실패하면 `/login?error=oauth_failed`로 리다이렉트하는지.
  - `/auth/callback`: `code` 파라미터 없이 호출 → `/login?error=oauth_failed` 리다이렉트.
    `exchangeCodeForSession`가 에러를 던지면 동일하게 리다이렉트. 성공하면 `/welcome`
    리다이렉트.
  - `/api/auth/logout`: `signOut` 호출 후 `{ success: true }` 200 응답.
- `src/middleware.ts`: `src/services/supabase/middleware.ts`의 `updateSupabaseSession`을
  모킹해서, `user: null`일 때 `/dashboard`/`/billing` 요청은 `/login`으로 리다이렉트,
  `/api/upload` 등 보호 API 요청은 401 JSON을, `user`가 있을 때는 통과시키는지 검증한다.
- `login/page.tsx`: `?error=oauth_failed` 쿼리로 렌더링했을 때 에러 배너가 뜨는지(React
  Testing Library, 기존 프로젝트 컴포넌트 테스트 관례를 따른다).

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `login/page.tsx`에서 `supabase-js`를 직접 import하지 않았는가(SDK 호출은 항상 API
     라우트 안에서만)?
   - `src/middleware.ts`의 matcher가 지정된 6개 경로 패턴과 정확히 일치하는가?
   - `/auth/callback`, `/api/webhooks/polar`, `/api/auth/*`가 미들웨어 보호 대상에서
     빠져 있는가(ARCHITECTURE.md 명시 사항)?
   - 내부 예외를 사용자에게 그대로 노출하지 않는가(CLAUDE.md CRITICAL)?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 2 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 만든 라우트 3개 + 미들웨어 matcher +
     로그인 페이지 변경 사항을 한 줄로 요약. **미들웨어가 user_id를 라우트에 전달하지 않고
     각 라우트가 직접 세션을 다시 확인해야 한다는 규칙도 summary에 남겨라** — 다음 step들이
     이 전제 위에서 작업한다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- `src/app/dashboard/page.tsx`의 로그아웃 링크를 이 step에서 건드리지 마라. 이유: 대시보드
  전체 연동(업로드 jobId 전달 포함)은 step 6 범위로 이미 정해졌다 — 지금 일부만 손대면 step
  6에서 diff가 꼬인다. 이 step은 `/api/auth/logout` 라우트만 만든다.
- 클라이언트 컴포넌트(`"use client"` 파일)에서 `@supabase/supabase-js`나
  `@supabase/ssr`을 직접 import하지 마라. 이유: 위 "핵심 설계 규칙"에서 설명한 CLAUDE.md/
  ARCHITECTURE.md 규칙 위반이다.
- 미들웨어 matcher를 위 6개 경로보다 넓히거나(`/api/webhooks` 포함 등) 좁히지 마라. 이유:
  ARCHITECTURE.md가 명시적으로 `/api/webhooks/polar`, `/auth/callback`을 미들웨어 예외로
  요구한다 — 넓히면 웹훅이 깨지고, 좁히면 보호가 뚫린다.
- 기존 테스트를 깨뜨리지 마라.
