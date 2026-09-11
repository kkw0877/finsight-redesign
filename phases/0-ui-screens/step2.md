# Step 2: auth-screens

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 기획 의도와 이전 step 산출물을 파악하라:

- `/docs/feature-spec.md`의 `R-TTKAAN` 절, 특히 F-IZGIPZ(소셜 로그인 및 계정 생성)의
  precondition/trigger/action/outcome/exceptions/display/rules 슬롯
- `/docs/user-flow.md`의 "1. 진입 및 인증" 구간 설명 — 로그인 성공/실패, 신규/기존 계정 분기
- `/docs/ADR.md`의 ADR-001(Supabase Auth 구글 OAuth) — 실제 인증 연동은 아직 없다는 전제를
  재확인하기 위해서만 참고. 이번 step에서 실제 Supabase 클라이언트를 호출하지 않는다.
- `/docs/UI_GUIDE.md`의 "레이아웃" 표(로그인/가입 완료 화면 400~440px 중앙 정렬)와 "애니메이션"
  절(로딩 오버레이는 트랜지션 없이 즉시 표시/제거)
- `src/components/ui/index.ts` — `GoogleButton`, `StatusIconCircle`, `Spinner`, `Button` 포함
  전체 컴포넌트와 props (step 0 산출물)
- `src/app/page.tsx` (step 1 산출물) — 랜딩의 "Start for free"/"Log in" 버튼이 어디로 링크되어
  있는지 확인해 라우트 이름을 맞춘다

이 프로젝트는 백엔드(Supabase Auth)가 아직 연결되지 않았다. 이번 step은 **로그인 화면의 UI와
상태 전환만** 구현한다 — 실제 구글 OAuth 리다이렉트나 세션 생성은 하지 않는다.

## 작업

### `/login` — `src/app/login/page.tsx`

인터랙션(버튼 클릭, 로딩, setTimeout)이 필요하므로 Client Component(`"use client"`)로 작성한다.

- 레이아웃: 최대폭 400px 중앙 정렬. 타이틀 "Get started with Finsight", 설명 "Continue with your
  Google account".
- `GoogleButton`(step 0 산출물) 1개. 클릭 시:
  1. `loading` state를 `true`로 설정하고 버튼 영역 위에 반투명 오버레이 + `Spinner`(32px) +
     "Signing in..." 텍스트를 표시한다(UI_GUIDE: 오버레이는 페이드 없이 즉시 표시).
  2. `setTimeout` 900ms 후 `/welcome`으로 이동(`useRouter().push`).
- 하단에 "← Back to start" 링크(`/`로 이동).
- **로그인 실패 데모**: F-IZGIPZ의 "Exceptions"(인증/계정 생성 실패 시 실패 사실과 재시도 안내
  표시)를 화면으로 확인할 수 있도록, 프로토타입의 다른 화면들(분석 실패, 결제 실패)과 동일한
  관례로 작은 텍스트 링크 "Demo: preview sign-in failure"를 눈에 띄지 않게 하단에 추가한다.
  클릭하면 로딩 오버레이 대신 인라인 에러 메시지("Google 로그인에 실패했습니다. 다시
  시도해주세요." 또는 동등한 영어 문구)를 표시하고, `GoogleButton`은 그대로 다시 누를 수 있게
  둔다(재시도 루프). 이 자체가 실제 기능은 아니고 UI 상태를 검토하기 위한 임시 트리거임을
  주석으로 짧게 남겨라(예: `// TODO: replace with real Supabase Auth error handling`).

### `/welcome` — `src/app/welcome/page.tsx`

Server Component로 충분하다(인터랙션은 버튼 클릭 후 페이지 이동뿐이라 `<Link>`로 처리
가능 — 별도 로컬 state가 필요 없다).

- 최대폭 420px 중앙 정렬. `StatusIconCircle tone="positive"`, 타이틀 "Welcome!", 설명 "Your
  Finsight account is ready. Let's start your first analysis.", CTA 버튼(`Button
  variant="solid" color="primary" size="lg"` label "Go to dashboard")을 `Link href="/dashboard"`로
  감싼다.

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `/login`만 Client Component이고 `/welcome`은 불필요하게 `"use client"`를 달지 않았는가?
   - `src/app/api/`나 Supabase 클라이언트 코드를 추가하지 않았는가(이번 phase 범위 밖)?
   - 로딩/실패 상태 전환이 UI_GUIDE "상태를 숨기지 않는다" 원칙대로 명시적으로 보이는가?
3. 결과에 따라 `phases/0-ui-screens/index.json`의 step 2를 업데이트한다(completed/error/blocked
   규칙은 이전 step과 동일).

## 금지사항

- `@supabase/supabase-js` 등 실제 Auth SDK를 설치/호출하지 마라. 이유: Supabase 프로젝트 자체가
  아직 생성되지 않았다(CLAUDE.md "Not yet done") — 지금 연동 코드를 짜면 어차피 다시 쓰게 된다.
- 이메일/비밀번호 입력 폼을 추가하지 마라. 이유: prd.md "Not in Scope"에 구글 외 로그인 수단은
  MVP 범위 밖으로 명시되어 있다.
- 기존 테스트를 깨뜨리지 마라.
