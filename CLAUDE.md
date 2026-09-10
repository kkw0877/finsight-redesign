@AGENTS.md

# Finsight — design system & frontend

## Source of truth
- UI/UX prototype: Claude Design project "Finsight 인터랙티브 프로토타입 UI"
  (project id `0983a2c2-9715-47cc-8487-52b3d72dc931`, file `Finsight Prototype.dc.html`).
  Re-fetch via the `DesignSync` tool (`get_project` / `list_files` / `get_file`) if tokens,
  the icon set, or more components need to be re-synced from Figma later.
- Design system: `wanted-design-system-14898f52-493d-47d6-b09a-21e9806b41cc`.

## Tokens (`src/styles/tokens/`)
Copied verbatim from the design system's CSS export (`fig-tokens.css`, `typography.css`,
`spacing.css`, `shadow.css`, `fonts.css`). Imported once via `src/styles/tokens/index.css`,
which `src/app/globals.css` imports. Don't hand-edit token values — re-sync from the Design
source instead, so numbers stay traceable back to Figma.

## Styling approach
CSS Modules + CSS custom properties. No Tailwind — the token export is already CSS
variables, so this avoids a duplicate token-mapping layer. TypeScript, Next.js App Router.

## Components (`src/components/ui/`)
Only the components actually used by the Finsight prototype flow are implemented: Button,
Badge, Chip, Spinner (maps to the design system's "Circular"), Icon. The full Wanted design
system has ~80 components and ~300 icons — deliberately not all ported. Add more only as
real screens need them, following the existing pattern: `ComponentName/ComponentName.tsx` +
`ComponentName.module.css`, exported from `src/components/ui/index.ts`.

**Icon caveat**: `src/components/ui/Icon/icons.ts` only has 2 hand-drawn icons
(`circle-check`, `triangle-alert`) as stand-ins. The source icon bundle exceeded the Design
API's response size cap when fetched, so the exact filled "2" variants used in the prototype
weren't recoverable. Re-sync from Design, or switch to an icon package (e.g. lucide-react),
before relying on more icons.

## Pages
- `/style-guide` — live reference for every token and component. Check changes here before
  wiring them into real screens.
- `/` currently just redirects to `/style-guide` — no real landing page exists yet. Replace
  this once landing-page work starts.

## Not yet done
- 실제 연동 착수(Supabase 프로젝트/스키마 생성, 구글 OAuth 앱 등록, Polar 상품 설정 등)와
  그 위의 기능 구현(로그인/업로드/분석/결제 화면). 정책·기술 스택 결정은
  [docs/ADR.md](./docs/ADR.md)에 확정되어 있으니 그것을 근거로 구현한다.
- 계정 삭제(탈퇴) 기능은 MVP 범위 밖으로 결정했지만, 분석 결과는 계정 삭제 전까지 보관하기로
  했다 — 삭제 기능이 없으면 사실상 무기한 보관이 되는 트레이드오프가 있다
  ([docs/ADR.md](./docs/ADR.md)의 ADR-007 참고). MVP 이후 가장 먼저 재검토할 것.

---

# Harness Framework Template (from github.com/jha0313/harness_framework)

> [docs/ADR.md](./docs/ADR.md)와 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)의 결정을
> 근거로 채워짐. 스택이 바뀌면 이 세 문서를 함께 갱신할 것.

## 기술 스택
- Next.js (App Router), TypeScript
- CSS Modules + CSS 커스텀 프로퍼티(디자인 토큰 export). Tailwind 미사용
- Supabase (Postgres + Supabase Auth, 구글 OAuth) — DB 및 인증
- Anthropic Claude API — 카드 내역 거래 추출(텍스트+이미지 PDF) 및 소비 분석
- Polar — 구독 결제
- Vercel — 배포
- PostHog — 제품 분석(가입/업로드/분석 전환율 등)

## 아키텍처 규칙
- CRITICAL: Supabase/Claude/Polar 등 외부 서비스 호출은 `src/app/api/` 라우트 핸들러(또는
  그 안에서 호출하는 `src/services/`의 래퍼)에서만 처리한다. 클라이언트 컴포넌트에서 외부
  서비스 SDK를 직접 호출하지 않는다.
- CRITICAL: 업로드 원본 파일(CSV/PDF)은 24시간 후 자동 삭제되는 임시 저장소에만 둔다 — 이
  TTL을 우회하는 별도 영구 저장 경로를 추가하지 않는다.
- 컴포넌트는 `src/components/`, 타입은 `src/types/`, 외부 API 래퍼는 `src/services/`에 분리.
- AI 분석 처리는 비동기(백그라운드 job + 클라이언트 폴링)로 구현한다. 동기 요청 안에서 거래
  추출·AI 분석까지 끝내지 않는다(Vercel 함수 타임아웃 리스크, ADR-006 참고).

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트
