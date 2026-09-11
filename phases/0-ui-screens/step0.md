# Step 0: ui-primitives

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 디자인 의도와 기존 컴포넌트 패턴을 파악하라:

- `/CLAUDE.md` (특히 "Components" 절)
- `/docs/UI_GUIDE.md` — 이번 step에서 만들 6개 패턴의 정확한 스펙(색상/치수/용도)이 "컴포넌트"와
  "아직 컴포넌트화되지 않은 반복 패턴" 절에 있다.
- `src/components/ui/Button/Button.tsx`, `Button.module.css` — variant/size 조합을 클래스명
  배열로 합성하는 패턴
- `src/components/ui/Badge/Badge.tsx`, `Badge.module.css`, `Badge.test.tsx` — prop 인터페이스,
  CSS Modules 구조, Vitest + Testing Library 테스트 패턴(모두 그대로 따라야 함)
- `src/components/ui/Icon/Icon.tsx`, `src/components/ui/Icon/icons.ts` — 기존 아이콘 2종
  (`circle-check`, `triangle-alert`) 사용법
- `src/components/ui/index.ts` — 배럴 export 패턴
- `src/styles/tokens/fig-tokens.css`, `spacing.css`, `shadow.css` — 아래에서 쓰는 CSS 변수들의
  실제 이름 확인(변수명은 반드시 여기서 확인하고 손으로 값을 만들어내지 마라)
- `src/app/style-guide/page.tsx`, `page.module.css` — 기존 컴포넌트를 어떻게 섹션으로 보여주는지

## 작업

`docs/UI_GUIDE.md`의 "아직 컴포넌트화되지 않은 반복 패턴" 절에 정의된 5개 패턴 + 구글 로그인
버튼을 `src/components/ui/`에 컴포넌트로 만든다. 각 컴포넌트는 기존 패턴과 동일하게
`ComponentName/ComponentName.tsx` + `ComponentName.module.css` + `ComponentName.test.tsx` 3파일
구조로 만들고, TDD 원칙(CLAUDE.md CRITICAL 규칙)에 따라 테스트를 먼저 작성한 뒤 구현하라.

### 1. `SectionCard`

대시보드 결과 3섹션, 결제 플랜 카드, 결제 완료 영수증 박스에 쓰는 공통 컨테이너.

```ts
export interface SectionCardProps extends HTMLAttributes<HTMLDivElement> {
  focused?: boolean; // true면 UI_GUIDE의 "포커스 링" 스타일 적용
}
export function SectionCard(props: SectionCardProps): JSX.Element;
```

- 기본: `border: 1px solid var(--line-normal-normal)`, `border-radius`는 `--radius-lg`~`--radius-xl`
  사이(UI_GUIDE 표기: 16~20px 값을 실제 토큰에서 확인), `padding: var(--space-8)`,
  `background: var(--background-normal-normal)`, `box-shadow: none`.
- `focused`: `border: 2px solid var(--primary-normal)`, `box-shadow: 0 0 0 4px rgba(51,102,255,0.12)`,
  `transition: border-color 0.3s, box-shadow 0.3s` (UI_GUIDE "애니메이션" 절에 명시된 유일한
  포커스 전환 — 다른 트랜지션 추가하지 마라).

### 2. `StatusIconCircle`

가입 완료/업로드·추출·분석·결제 실패/결제 성공에서 재사용하는 상태 원.

```ts
export interface StatusIconCircleProps {
  tone: "positive" | "negative";
  size?: number; // default 56
  iconSize?: number; // default 26
  className?: string;
}
export function StatusIconCircle(props: StatusIconCircleProps): JSX.Element;
```

- `positive`: 배경 `var(--green-95)`, 내부 `Icon name="circle-check"` color `var(--status-positive)`.
- `negative`: 배경 `var(--red-95)`, 내부 `Icon name="triangle-alert"` color `var(--status-negative)`.
- 원(`border-radius: 50%`), flex center로 아이콘을 가운데 배치.

### 3. `UsageBadge`

대시보드 헤더의 "Free analyses 1/2 left" 같은 상시 노출 pill.

```ts
export interface UsageBadgeProps {
  text: string;
  warn?: boolean; // 소진 상태
  className?: string;
}
export function UsageBadge(props: UsageBadgeProps): JSX.Element;
```

- `border-radius: var(--radius-pill)`, `padding: 6px var(--space-6)`.
- 기본: `background: var(--fill-normal)`, `color: var(--label-normal)`.
- `warn`: `background: var(--red-95)`, `color: var(--status-negative)`.

### 4. `UploadDropzone`

대시보드 빈 상태의 업로드 영역 컨테이너(콘텐츠는 페이지에서 children으로 주입).

```ts
export interface UploadDropzoneProps extends HTMLAttributes<HTMLDivElement> {}
export function UploadDropzone(props: UploadDropzoneProps): JSX.Element;
```

- `border: 2px dashed var(--line-normal-strong)`, `border-radius: var(--radius-xl)`(20px),
  `background: var(--fill-alternative)`, `padding: 48px 32px`, `text-align: center`.

### 5. `FileRowCard`

업로드된 파일 1건을 보여주는 가로형 카드.

```ts
export interface FileRowCardProps {
  fileName: string;
  fileSize: string;
  verified?: boolean; // true면 우측에 Badge(tone="positive" text="Format verified") 표시
  className?: string;
}
export function FileRowCard(props: FileRowCardProps): JSX.Element;
```

- `display: flex; align-items: center; gap: var(--space-6); padding: 14px var(--space-7);
  border: 1px solid var(--line-normal-normal); border-radius: var(--radius-md)(12px);
  background: var(--background-normal-normal);`
- 좌측 36x36px 아이콘 박스(`background: var(--fill-strong); border-radius: 8px`, 내부 콘텐츠
  없음 — 프로토타입과 동일하게 플레이스홀더), 중앙에 파일명(`--label-normal`, bold)/용량
  (`--label-assistive`, 작게), 우측에 `verified`일 때만 기존 `Badge` 컴포넌트 재사용
  (import from `../Badge/Badge`).

### 6. `GoogleButton`

구글 브랜드 가이드용 전용 버튼. 기존 `Button` 컴포넌트는 재사용하지 않는다(UI_GUIDE 명시:
"구글 로그인 버튼은 Button 컴포넌트를 쓰지 않는다").

```ts
export interface GoogleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string; // default "Continue with Google"
}
export function GoogleButton(props: GoogleButtonProps): JSX.Element;
```

- `width: 100%; height: 52px; border-radius: 12px; background: #fff;
  border: 1px solid var(--line-normal-normal); display: flex; align-items: center;
  justify-content: center; gap: 10px; font-size: 15px; font-weight: 600;
  color: var(--label-normal);`
- 내부에 표준 구글 "G" 4색 로고를 인라인 SVG로 직접 그린다(20x20, 공개된 구글 브랜드 마크 —
  `viewBox="0 0 20 20"`에 파란/초록/노란/빨강 4개 path로 구성하는 표준 형태를 사용하라). 아이콘
  패키지를 새로 추가하지 마라 — 이 버튼 하나를 위해 의존성을 늘릴 필요 없다.

### 배럴 export + 스타일가이드 갱신

- `src/components/ui/index.ts`에 6개 컴포넌트와 그 prop 타입을 기존 패턴대로 export 추가.
- `src/app/style-guide/page.tsx`에 새 `<section>`을 추가해 6개 컴포넌트를 각각 최소 1개 예시로
  렌더링한다(기존 섹션 순서/스타일은 건드리지 말고 맨 아래에 추가만 한다).

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 6개 컴포넌트 모두 `src/components/ui/<Name>/<Name>.tsx` + `.module.css` + `.test.tsx` 3파일
     구조를 따르는가?
   - `src/styles/tokens/*.css`의 값을 직접 수정하지 않았는가(CLAUDE.md CRITICAL 규칙)?
   - CSS에서 쓴 변수명이 실제로 `src/styles/tokens/`에 존재하는가(추측한 변수명 없는지)?
3. 결과에 따라 `phases/0-ui-screens/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 만든 컴포넌트 6개 이름과 위치를 한 줄로 요약
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message"` 기록
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 기록 후 즉시 중단

## 금지사항

- `src/styles/tokens/` 아래 파일의 값을 손으로 고치지 마라. 이유: Figma 원본과의 추적성이
  깨진다(CLAUDE.md "Tokens" 절).
- `circle-check`/`triangle-alert` 외의 새 아이콘을 만들지 마라. 이유: `Icon/icons.ts`의 캐비어트
  (CLAUDE.md "Icon caveat")에 따라 나머지 아이콘은 Design 재동기화 또는 아이콘 패키지 교체로
  해결해야 하는 범위이며, 이번 step에서 임의로 손그림 SVG를 추가하면 나중에 재동기화 시 충돌한다.
- Redux/Zustand 등 전역 상태 라이브러리를 추가하지 마라. 이유: ARCHITECTURE.md "상태 관리" 절에서
  이미 불필요하다고 결정됨.
- 기존 테스트를 깨뜨리지 마라.
