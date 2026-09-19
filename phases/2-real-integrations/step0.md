# Step 0: service-clients-setup

## 배경

Finsight는 지금까지 두 phase를 거쳤다:

- `0-ui-screens`: 화면(`src/app/{page.tsx,login,welcome,dashboard,billing,privacy}`)과
  `src/components/ui/`를 구현.
- `1-api-skeleton`: `docs/ARCHITECTURE.md`의 API 라우트 6개를 **mock 데이터/fixture 기반**으로
  구현(`src/types/`, `src/lib/fixtures/`, `src/app/api/`). 실제 Supabase/Claude/Polar 호출은
  전혀 없다.

이번 phase(`2-real-integrations`)의 목표는 그 mock 스켈레톤 위에 실제 Supabase(DB+Auth),
Claude API, Polar 연동을 얹는 것이다. Supabase 프로젝트/Google OAuth 앱/Polar 상품은 이미
사용자가 직접 만들어뒀고, 로컬 `.env.local`과 Vercel 프로덕션 환경변수에 필요한 키가 채워져
있다 — 이 step에서 그 키를 실제로 쓰는 코드를 만들기 시작한다.

이 step(0번)은 그 첫 단계로, 이후 모든 step이 의존할 **Supabase 클라이언트 팩토리**와
**외부 SDK 의존성**만 준비한다. 화면(`src/app/`)이나 API 라우트, 미들웨어는 이 step에서 아직
건드리지 않는다 — 다음 step들에서 이 팩토리를 import해서 쓴다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 특히 "디렉토리 구조"(`src/services/`의 역할)와 "패턴" 절의
  "Supabase/Claude/Polar 등 외부 서비스 호출은 반드시 `src/app/api/`의 라우트 핸들러(또는
  `src/services/`의 래퍼를 그 안에서 호출)를 통해서만 수행한다" 규칙, "보안 규칙" 절.
- `/docs/ADR.md` — ADR-001(Supabase DB+Auth), ADR-014(비공개 Storage 버킷 + signed URL).
- `/CLAUDE.md`의 "아키텍처 규칙" 절 — CRITICAL 규칙 전부(특히 service role 키로 RLS 우회 시
  `user_id` 직접 필터링, 외부 서비스 SDK는 API 라우트/서비스 래퍼에서만 호출).
- `package.json` — 현재 의존성 확인(Next.js 16, React 19, TypeScript, vitest).
- `.env.example`과 로컬 `.env.local`(값은 이미 채워져 있다고 가정하고 **값을 출력하거나
  로그에 남기지 마라** — 변수 이름만 참고) — 어떤 환경변수 이름을 코드에서 기대해야 하는지
  확인한다.

## 작업

### 1. 의존성 설치

아래 패키지를 설치한다. **정확한 패키지명/버전은 설치 전에 `npm view <package> version`으로
확인하라** — 특히 Polar SDK는 패키지명이 바뀌었을 수 있으니 `npm view @polar-sh/sdk version`이
실패하면 웹 검색으로 Polar의 공식 Node/TypeScript SDK 패키지명을 다시 확인한 뒤 설치한다.

- `@supabase/supabase-js` — Supabase 클라이언트 코어.
- `@supabase/ssr` — Next.js App Router(Server Components/Route Handler/Middleware)에서 쿠키
  기반 세션을 다루기 위한 공식 헬퍼. (구버전 `@supabase/auth-helpers-nextjs`는 deprecated이니
  쓰지 마라.)
- `@anthropic-ai/sdk` — Claude API(거래 추출 + 소비 분석, ADR-004/005).
- `@polar-sh/sdk` (또는 확인된 공식 패키지명) — Polar 결제(ADR-008/012).

### 2. `src/services/supabase/admin.ts`

RLS를 우회하는 **service role 클라이언트** 팩토리. 분석 처리 라우트(`/api/analysis/start`)와
웹훅 핸들러(`/api/webhooks/polar`)에서만 쓴다.

```ts
export function createAdminSupabaseClient(): SupabaseClient
```

**핵심 규칙**:
- 모듈 최상단에서 클라이언트를 미리 만들어 export하는 **싱글턴 패턴을 쓰지 마라** — 함수
  호출 시점에 매번 `createClient(...)`로 새로 만든다. (싱글턴 자체가 위험하진 않지만, 이
  프로젝트는 빌드/테스트 시점에 env가 없는 환경에서 모듈을 import만 해도 되게 하려는 것이
  목적이다 — 아래 "핵심 규칙" 두 번째 항목 참고.)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 없으면 `createClient`를 호출하지
  않고 그 자리에서 명확한 에러를 던진다(`throw new Error('SUPABASE_SERVICE_ROLE_KEY가
  설정되지 않았습니다')` 같은 형태) — undefined 값을 그대로 SDK에 넘겨 나중에 알 수 없는
  네트워크 에러로 실패하는 것을 방지한다.
- 이 클라이언트를 쓰는 모든 쿼리는 RLS가 없다고 전제하고 **호출하는 쪽(다음 step들의 API
  라우트)이** 반드시 `.eq('user_id', ...)`를 직접 걸어야 한다 — 이 파일 자체는 강제할 수
  없으므로, 파일 상단 주석으로 이 규칙을 명시해 다음 step 작업자가 놓치지 않게 한다
  (CLAUDE.md CRITICAL 규칙).

### 3. `src/services/supabase/server.ts`

로그인한 사용자 본인 세션으로 동작하는 **서버 클라이언트** 팩토리. Server
Component/Route Handler에서 현재 요청의 인증 상태를 읽을 때 쓴다(RLS 적용됨).

```ts
export async function createServerSupabaseClient(): Promise<SupabaseClient>
```

`@supabase/ssr`의 `createServerClient`를 쓰고, 쿠키 어댑터는 `next/headers`의 `cookies()`
(Next.js 16 기준 비동기 API인지 확인하고 맞춰라)를 통해 구현한다. Route Handler 안에서 쿠키를
쓰는 세션이므로 매 요청마다 새로 만들어야 한다(2번 항목과 동일한 이유로 싱글턴 금지).

### 4. `src/services/supabase/middleware.ts`

Next.js 미들웨어 전용 헬퍼. 다음 step(`auth-flow`)에서 만들 `src/middleware.ts`가 이 함수를
가져다 쓴다 — 미들웨어 자체는 이 step에서 만들지 않는다.

```ts
export async function updateSupabaseSession(
  request: NextRequest
): Promise<{ response: NextResponse; user: User | null }>
```

`@supabase/ssr`가 권장하는 Next.js 미들웨어 세션 갱신 패턴(요청/응답 양쪽에 쿠키를 동기화하는
어댑터)을 그대로 따른다. 내부에서 `supabase.auth.getUser()`를 호출해 현재 사용자를 확인하고,
갱신된 쿠키가 담긴 `response`와 함께 반환한다.

### 5. 최소 테스트

이 클라이언트들은 실제 요청/쿠키 컨텍스트가 있어야 의미 있게 동작하므로, 이 step에서는
아래 정도만 검증한다(과도한 mocking으로 구현 세부사항을 테스트하지 않는다):

- `createAdminSupabaseClient()`: 테스트 환경에서 `SUPABASE_SERVICE_ROLE_KEY`를 임시로 지운
  상태로 호출하면 명확한 에러가 던져지는지. 정상 env가 있으면 예외 없이 객체가 반환되는지.
- `createServerSupabaseClient()`, `updateSupabaseSession()`: 모듈이 정상적으로 import되고,
  함수가 존재하며 타입이 맞는지 정도의 스모크 테스트(완전한 요청 흐름 mocking은 다음
  step에서 실제 라우트/미들웨어를 만들 때 그 컨텍스트에서 검증한다).

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # ESLint 통과
npm test        # vitest 통과 (이번 step에서 추가한 테스트 포함, 이전 phase 테스트도 계속 통과)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/services/supabase/{admin,server,middleware}.ts` 외에 `src/app/`, `src/components/`,
     `src/middleware.ts`를 건드리지 않았는가?
   - 세 클라이언트 모두 모듈 최상단 싱글턴이 아니라 호출 시점에 생성하는 팩토리 함수인가?
   - `.env.local`/시크릿 값을 로그나 커밋 메시지, 테스트 코드에 그대로 남기지 않았는가?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 0 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 설치한 패키지(정확한 버전 포함)와 세 함수의
     정확한 export 경로/시그니처를 한 줄로 요약(다음 step들이 그대로 import해야 한다).
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요(예: 패키지명을 찾을 수 없음, npm 레지스트리 접근 불가) →
     `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- `src/app/`, `src/middleware.ts`, `src/lib/fixtures/`, `src/app/api/` 등 이 step 범위 밖의
  파일을 건드리지 마라. 이유: 이 step은 순수하게 서비스 클라이언트 스캐폴딩이고, 실제 사용은
  이후 step들의 범위다 — 지금 앞당겨 쓰면 다음 step들의 diff가 지저분해진다.
- Supabase/Anthropic/Polar 클라이언트를 모듈 최상단에서 즉시 생성해 export하지 마라(싱글턴
  금지). 이유: 빌드/테스트 시점에 env가 없는 상황에서도 다른 모듈이 이 파일을 안전하게
  import할 수 있어야 하고, 요청마다 쿠키 컨텍스트가 다른 서버 클라이언트를 전역 공유하면
  세션이 요청 간에 섞일 위험이 있다.
- 이 step에서 실제 Supabase 프로젝트에 네트워크 요청을 보내는 통합 테스트를 만들지 마라.
  이유: CI/로컬 환경에 항상 실제 Supabase 접근이 보장되지 않는다 — 클라이언트 생성 자체와
  에러 처리만 검증하면 충분하다.
- 기존 테스트를 깨뜨리지 마라.
