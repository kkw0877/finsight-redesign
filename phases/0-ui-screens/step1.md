# Step 1: landing-page

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 기획 의도와 이전 step 산출물을 파악하라:

- `/docs/prd.md` — 특히 "Product Decisions" 11개 항목(가격, 파일 크기, 무료 횟수 등 랜딩에
  노출해야 하는 확정값)과 "Not in Scope"
- `/docs/feature-spec.md`의 `R-ZOBFKZ` 절(F-MVOOAK, F-ENLUHX, F-MAFWCW) — 랜딩 페이지 acceptance
  criteria와 각 기능의 display/rules 슬롯
- `/docs/ADR.md`의 ADR-015 — 개인정보 국외 이전 고지 문구와 노출 위치
- `/docs/UI_GUIDE.md`의 "레이아웃" 표(랜딩 히어로/3열 카드 최대폭)와 "반응형 / 모바일 웹" 절
- `src/components/ui/index.ts` — step 0에서 추가된 `SectionCard` 등 포함 전체 컴포넌트 목록과
  props
- `src/app/style-guide/page.tsx`, `page.module.css` — 페이지 레벨에서 토큰 기반 CSS Module을
  쓰는 기존 패턴

이전 step(`ui-primitives`)에서 만들어진 컴포넌트를 실제로 열어 props를 확인한 뒤 사용하라.

## 작업

`src/app/page.tsx`(현재 `/style-guide`로 리다이렉트하는 자리표시 페이지)를 실제 랜딩 페이지로
교체한다. Server Component로 작성한다(인터랙션이 없는 정적 콘텐츠 — ARCHITECTURE.md "패턴" 절의
"Server Components를 기본으로 쓰고 인터랙션이 필요한 부분만 Client Component로 분리" 원칙).

### 페이지 구조 (Claude Design 프로토타입의 랜딩 화면 내용을 그대로 반영, `docs/UI_GUIDE.md` 토큰
값 사용)

1. **헤더**: 좌측 "Finsight" 워드마크(`--primary-normal`), 우측 로그인 버튼
   (`Button variant="outlined" color="assistive" size="sm"`, `href`/`Link`로 `/login`행).
2. **히어로** (최대폭 660px, 좌측 정렬): "AI Spending Analysis" 배지(`Badge` 또는 기존 프로토타입
   문구 그대로), 타이틀("One card statement, see your spending habits" 또는 동등한 한국어/영어
   중 기존 프로토타입 언어를 유지), 설명 문단, CTA 버튼(`Button variant="solid" color="primary"
   size="lg"`, label "Start for free", `/login`으로 이동) + "Free users get 2 analyses per month"
   캡션.
3. **3열 기능 카드** (풀블리드, 좌우 패딩 48px, 3칼럼 그리드 gap 20px, 모바일은 1열 스택):
   "Track spending by category" / "Detect unusual spending" / "Actionable savings tips" 3장,
   각 `SectionCard`로 감싸도 되고 UI_GUIDE 스펙대로 직접 스타일링해도 된다 — 시각적으로 UI_GUIDE
   "섹션 카드" 스펙(1px 보더, 그림자 없음)과 일치해야 한다.
4. **요금/파일형식 스트립** (`--fill-alternative` 배경): "CSV supported"/"PDF supported" 칩
   (`Chip` 컴포넌트, `variant="outlined" size="sm"`), "Free · 2 analyses/month",
   "Paid · ₩9,900/mo for unlimited analyses" 텍스트 pill 2개(프로토타입처럼 검정 배경 pill로
   구현하거나, 시맨틱 토큰으로 대체 가능 — 임의로 새 색상 변수를 만들지 마라).
5. **국외 이전 고지 + 개인정보처리방침 링크** (ADR-015): "AI 분석을 위해 개인정보가 국외
   (Anthropic, 미국)로 이전됩니다"에 해당하는 문구(한국어/영어 중 페이지의 다른 텍스트와 일관된
   언어 사용)와 `/privacy` 링크를 캡션 크기(`--text-caption-1-*`, `--label-assistive`)로 하단에
   배치. 기존 프로토타입 디스클레이머("Finsight's results are... not professional financial...
   advice.")도 함께 유지.

### `/privacy` 스텁 페이지

`src/app/privacy/page.tsx`를 새로 만든다. 실제 개인정보처리방침 문구 작성/법무 검토는 이번 범위
밖(prd.md "Not in Scope" 마지막 항목, ADR-015 트레이드오프)이므로, "개인정보처리방침은 준비
중입니다. AI 분석을 위해 카드 내역이 국외(Anthropic, 미국)로 전송됩니다." 정도의 간단한 안내
문구만 담은 최소 페이지로 만든다. 랜딩 페이지의 링크가 깨지지 않게 하는 목적이며, 법적 문서를
작성하는 step이 아니다 — 여러 섹션을 갖춘 정식 약관 페이지처럼 과하게 만들지 마라.

### 반응형

`docs/UI_GUIDE.md`의 "반응형 / 모바일 웹" 절 규칙을 그대로 적용: `src/styles/tokens/breakpoints.css`
의 `--breakpoint-mobile`(640px) 값을 리터럴로 미디어쿼리에 사용(`@media (max-width: 640px)`),
좌우 패딩 48px→20px(`--space-8`), 3열 그리드→1열 스택, CTA에 `fullWidth` prop 적용.

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/app/page.tsx`가 여전히 Server Component인가(불필요한 `"use client"` 없음)?
   - 랜딩 페이지에 ADR-015 국외 이전 고지와 `/privacy` 링크가 실제로 렌더링되는가?
   - PRD "Not in Scope"의 이메일/비밀번호 가입 폼처럼 범위 밖 기능을 추가하지 않았는가?
3. 결과에 따라 `phases/0-ui-screens/index.json`의 step 1을 업데이트한다(completed/error/blocked
   규칙은 이전 step과 동일).

## 금지사항

- `src/app/style-guide/page.tsx`를 수정하지 마라. 이유: 이 step은 랜딩 페이지 신규 작성만
  다룬다 — style-guide 개편은 범위 밖.
- 실제 개인정보처리방침/이용약관 문구를 그럴듯하게 창작해서 채우지 마라. 이유: prd.md에 법무
  검토 전까지 확정 문구를 만들지 않기로 명시되어 있다 — 만들면 나중에 실제 문서로 교체할 때
  "이미 확정된 것처럼 보이는" 오해를 만든다.
- `src/app/api/` 아래 파일을 만들지 마라. 이 step은 정적 콘텐츠만 다룬다.
- 기존 테스트를 깨뜨리지 마라.
