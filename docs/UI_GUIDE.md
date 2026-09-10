# UI 디자인 가이드

> 출처: Claude Design 프로젝트 "Finsight 인터랙티브 프로토타입 UI"
> (`0983a2c2-9715-47cc-8487-52b3d72dc931`, 파일 `Finsight Prototype.dc.html`)와 거기서 쓰는
> `wanted-design-system-14898f52-...` 디자인 시스템(export가 `src/styles/tokens/`에 있음).
> 이 문서는 그 프로토타입에서 실제로 쓰인 색상·타이포·레이아웃 값을 이 저장소의 토큰
> 변수명으로 옮겨 적은 것이다. 색상/스케일 자체를 새로 정하지 않았다 — 값이 바뀌어야 하면
> Design 소스를 재동기화한다(`CLAUDE.md`의 "Tokens" 절 참고).
>
> 프로토타입은 라이트 테마만 사용한다. `fig-tokens.css`는 `data-theme="dark"` 값도 갖고
> 있지만, MVP 화면 설계에 다크 모드는 포함되지 않는다 — 필요해지면 이 문서도 갱신할 것.

## 디자인 원칙

1. **도구처럼 보인다.** 랜딩 페이지를 제외한 모든 화면(로그인, 대시보드, 분석 결과, 결제)은
   장식 없이 정보 위계로만 구성한다. 대시보드는 매일 쓰는 작업 화면이지 마케팅 페이지가
   아니다.
2. **색이 아니라 위계로 구분한다.** 카테고리별 지출/이상 지출/절약 추천 세 섹션은 배경색을
   다르게 칠하지 않고, 동일한 카드 스타일(테두리 1px + 섹션 제목)로 나열해 구분한다. 색은
   의미가 있을 때만 쓴다 — 성공(`--status-positive`), 실패(`--status-negative`), 경고
   (`--status-cautionary`), 카테고리 차트 구간 색.
3. **상태를 숨기지 않는다.** 업로드 검증, 데이터 추출, AI 분석, 결제는 모두 실패할 수 있는
   비동기 작업이다. 진행 중/성공/실패 상태를 항상 명시적인 화면으로 보여주고(스피너, 상태
   아이콘, 재시도 버튼), 절대 "조용히" 다음 화면으로 넘어가지 않는다.
4. **참고 정보라는 점을 매번 밝힌다.** AI 분석 결과가 나오는 화면(대시보드 결과, 랜딩 페이지
   하단)에는 "전문 금융 조언이 아니라 참고 정보"라는 문구를 항상 노출한다
   ([feature-spec.md](./feature-spec.md)의 R-GURVDX 요구사항과 직결).

## AI 슬롭 안티패턴 — 하지 마라

| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |

프로토타입은 이미 이 표를 지킨다: 브랜드 색은 보라가 아니라 블루(`--primary-normal`)이고,
카드 강조는 box-shadow 글로우가 아니라 1px 보더 + (포커스 시에만) 얇은 링이며, 반경은
컴포넌트 크기에 따라 12/16/20px로 다르게 쓴다. 구현 시에도 이 방향을 유지한다.

## 색상

라이트 모드 기준, `src/styles/tokens/fig-tokens.css`의 시맨틱 토큰만 사용한다(원색
`--blue-50` 등은 카테고리 차트처럼 팔레트가 필요한 곳에서만 직접 참조).

### 배경

| 용도 | 토큰 | 사용례 |
|------|------|--------|
| 페이지 바탕 | `--background-normal-alternative` | 대시보드 셸 바깥 배경 |
| 카드/표면 | `--background-normal-normal` | 카드, 헤더 바, 인증 화면 |
| 옅은 강조 배경 | `--fill-alternative` | 업로드 드롭존, 랜딩 하단 요금 안내 스트립 |
| 성공 배경 | `--green-95` | 상태 아이콘 원, "포맷 확인됨" 배지 |
| 경고/실패 배경 | `--red-95` | 상태 아이콘 원, 무료 소진 배너, 이상 지출 배지 |

### 텍스트

| 용도 | 토큰 |
|------|------|
| 주 텍스트(제목) | `--label-normal` |
| 본문/보조 설명 | `--label-alternative` |
| 캡션/디스클레이머 | `--label-assistive` |
| 브랜드/링크 강조 | `--primary-normal` |
| 반전 텍스트(솔리드 버튼 위) | `--static-white` |

### 시맨틱 / 상태 색상

| 용도 | 토큰 |
|------|------|
| 성공 | `--status-positive` (녹색) |
| 실패/에러 | `--status-negative` (빨강) |
| 주의/이상 지출 | `--status-cautionary` (주황) |
| 브랜드 프라이머리 | `--primary-normal` (블루), hover는 `--primary-strong` |
| 중립 테두리 | `--line-normal-normal`, 강조 필요 시 `--line-normal-strong`(점선 드롭존) |
| 중립 채움(비활성 배지·아이콘 박스) | `--fill-normal` / `--fill-strong` |

### 카테고리 차트 색상

지출 카테고리 막대그래프처럼 순서 있는 팔레트가 필요한 곳은 아래 6색을 이 순서로 순환
사용한다(지출 비중이 큰 카테고리부터 배정):

```
--blue-50, --green-50, --purple-50, --orange-50, --cyan-50, --pink-50
```

## 컴포넌트

구현된 컴포넌트는 `src/components/ui/`에 있다. 아래는 각 컴포넌트의 실제 쓰임과, 아직
컴포넌트화되지 않았지만 프로토타입에 반복적으로 나오는 레이아웃 패턴이다.

### Button (`Button/Button.tsx`)

`variant`(solid/outlined) × `color`(primary/assistive) × `size`(sm/md/lg) 조합.

| 조합 | 용도 |
|------|------|
| `primary` `solid` `lg` | 페이지의 핵심 CTA 1개 (예: "Start for free", "Start analysis", "Pay ₩9,900") |
| `primary` `solid` `sm/md` | 배너·카드 안의 즉시 액션 (예: "Subscribe to keep analyzing") |
| `primary` `outlined` | 헤더의 보조 액션 (예: 랜딩의 "Log in") |
| `assistive` `outlined` | 카드 위의 중립 액션 (예: "Analyze new statement") |
| `assistive` `solid` | 데모/보조 액션. 실제 화면에서는 드물게 사용 |

크기: `sm`=36px(헤더/배지 옆 보조 버튼), `md`=44px(폼 내부), `lg`=52px(페이지 핵심 CTA).
`sm`은 모바일 웹(`--breakpoint-mobile` 이하)에서 44px로 올라간다 — 자세한 내용은
[반응형 / 모바일 웹](#반응형--모바일-웹) 참고. 버튼을 화면 폭에 맞춰야 하면 `fullWidth`
prop을 쓴다(기본은 콘텐츠 크기만큼만 차지).

구글 로그인 버튼은 Button 컴포넌트를 쓰지 않는다 — 구글 브랜드 가이드에 맞춘 전용 스타일
(흰 배경, `--line-normal-normal` 1px 테두리, 52px 높이, 구글 G 로고 + "Continue with
Google")이 필요하다. 로고 아이콘은 로컬 `Icon` 세트에 없으므로 별도 확보해야 한다.

### Badge / Chip (`Badge/Badge.tsx`, `Chip/Chip.tsx`)

- **Badge**: 상태 표시. `tone="positive"`(초록, "Format verified" 등 확인 배지),
  `tone="negative"`(빨강, "Alert" 등 이상 지출 배지)를 가장 많이 쓴다. `size="sm"`이 기본.
- **Chip**: 파일 형식 안내("CSV", "PDF") 등 정적 태그. `variant="outlined"` `size="sm"`이
  프로토타입 기본값. `selected`는 필터 UI가 생기면 사용.

### Spinner (`Spinner/Spinner.tsx`)

로딩 오버레이(로그인 인증 중, 결제 처리 중)와 분석 진행 화면에 사용.

| 크기 | 맥락 |
|------|------|
| 24px | 반투명 오버레이 위 인라인 로딩(결제 처리 중) |
| 32px | 로그인 전체 화면 오버레이 |
| 48px | 분석 진행 화면의 메인 인디케이터 |

### Icon (`Icon/Icon.tsx`)

현재 `circle-check`, `triangle-alert` 두 개만 이식되어 있다(둘 다 실제 프로토타입에서
쓰이는 아이콘과 일치 — 성공/실패 상태 원 안에 들어가는 용도로 딱 맞다). 기본 20px, 상태
원 안에서는 24~28px로 키워 쓴다. 더 많은 아이콘이 필요해지면 Design에서 재동기화하거나
아이콘 패키지(lucide-react 등)로 교체한다 (`CLAUDE.md`의 "Icon caveat" 참고).

### 아직 컴포넌트화되지 않은 반복 패턴

프로토타입에 반복적으로 나오지만 아직 `src/components/ui/`에 없는 패턴. 실제 화면을 만들
때 이 스펙대로 컴포넌트를 추가한다.

**섹션 카드** — 대시보드 결과의 카테고리별 지출/이상 지출/절약 추천 세 섹션, 결제 플랜
카드, 결제 완료 영수증 박스에 공통으로 쓰는 컨테이너.
```
border: 1px solid var(--line-normal-normal);
border-radius: var(--radius-lg) ~ var(--radius-xl); /* 16~20px */
padding: var(--space-8); /* 20px */
background: var(--background-normal-normal);
box-shadow: none; /* 그림자로 띄우지 않는다 */
```
결과 화면에서 사이드바 플로우 내비게이션으로 특정 섹션을 가리킬 때만 1.4초짜리 포커스
링을 준다(다른 곳에는 쓰지 않는 예외 애니메이션):
```
border: 2px solid var(--primary-normal);
box-shadow: 0 0 0 4px rgba(51,102,255,0.12);
transition: box-shadow 0.3s, border-color 0.3s;
```

**상태 아이콘 원** — 성공/실패를 알리는 모든 화면(가입 완료, 업로드/추출/분석/결제 실패,
결제 성공)에서 재사용하는 공통 패턴.
```
width/height: 56px; border-radius: 50%;
background: var(--green-95) /* 성공 */ | var(--red-95) /* 실패 */;
/* 내부에 Icon circle-check(성공) 또는 triangle-alert(실패), 24~28px, currentColor는
   --status-positive / --status-negative */
```

**업로드 드롭존** — 대시보드 빈 상태의 업로드 영역.
```
border: 2px dashed var(--line-normal-strong);
border-radius: var(--radius-xl); /* 20px */
background: var(--fill-alternative);
padding: 48px 32px; text-align: center;
```

**파일 행 카드** — 업로드된 파일 1건을 보여주는 가로형 카드(아이콘 박스 + 파일명/용량 +
상태 배지).
```
display: flex; align-items: center; gap: var(--space-6);
padding: 14px var(--space-7);
border: 1px solid var(--line-normal-normal); border-radius: var(--radius-md); /* 12px */
background: var(--background-normal-normal);
```

**이용 현황 배지(pill)** — 대시보드 헤더의 "Free analyses 1/2 left" 같은 상시 노출 배지.
```
border-radius: var(--radius-pill);
padding: 6px var(--space-6);
background: var(--fill-normal) /* 정상 */ | var(--red-95) /* 소진 */;
color: var(--label-normal) /* 정상 */ | var(--status-negative) /* 소진 */;
```

## 레이아웃

화면 유형별 콘텐츠 최대폭 (모두 뷰포트 중앙 정렬):

| 화면 | 최대폭 | 정렬 |
|------|--------|------|
| 랜딩 히어로(제목/설명/CTA) | 660px | 좌측 정렬 |
| 랜딩 3열 기능 카드 | 풀블리드, 좌우 패딩 48px, 3칼럼 그리드 gap 20px | — |
| 로그인 / 가입 완료 / 에러 / 결제 성공 등 상태 화면 | 400~440px | 중앙 정렬(텍스트 포함) |
| 대시보드 헤더 바 | 풀와이드, 좌우 패딩 32px | 양끝 정렬(로고 ↔ 이용현황/아바타/로그아웃) |
| 대시보드 빈 상태(업로드) | 680px | 중앙 정렬 |
| 대시보드 분석 결과 | 740px | 헤더만 중앙, 섹션 내부 텍스트는 좌측 정렬 |
| 결제 화면 | 440px | 중앙 정렬 |

간격: 섹션 사이 `--space-9`~`--space-10`(24~32px), 카드 내부 패딩 `--space-8`(20px), 리스트
행 사이 `--space-6`~`--space-7`(12~16px), 인라인 요소(아이콘-텍스트 등) `--space-4`(8px).

## 반응형 / 모바일 웹

Finsight는 별도 네이티브 앱이 아니라 반응형 웹으로 데스크톱과 모바일 브라우저를 함께
지원한다([prd.md의 Product Decisions](./prd.md#product-decisions-확정) 8번). 브레이크포인트는
`--breakpoint-mobile`(640px, `src/styles/tokens/breakpoints.css`) 하나만 쓴다 — CSS
미디어 쿼리는 커스텀 프로퍼티를 조건으로 못 쓰므로, 컴포넌트/페이지 CSS의 `@media
(max-width: 640px)`는 이 값과 리터럴로 맞춰 쓴다.

640px 이하(모바일 웹)에서 적용하는 규칙:

- **탭 타겟**: `Button`의 `sm`(36px)은 44px로 올라간다(Apple/Google 최소 탭 타겟 가이드).
  `md`(44px)/`lg`(52px)는 이미 충분해 그대로 둔다.
- **풀와이드 CTA**: 위 [레이아웃](#레이아웃) 표의 "화면 핵심 CTA"(`Start for free`,
  `Start analysis`, `Pay ₩9,900` 등)는 모바일에서 `Button`의 `fullWidth` prop으로 화면
  폭에 맞춘다. 자동 적용이 아니라 화면마다 명시적으로 켠다.
- **좌우 패딩 축소**: 랜딩(48px)·대시보드(32px)의 좌우 패딩을 `--space-8`(20px)로 줄인다.
- **그리드 → 스택**: 랜딩 3열 기능 카드, 랜딩/결제 하단 요금 안내 스트립은 1열로 세로
  스택된다(가로 스크롤 금지).
- **헤더 바 줄바꿈**: 대시보드 헤더(로고 ↔ 이용현황 배지·아바타·로그아웃)는 `flex-wrap`으로
  줄바꿈을 허용한다. 요소를 숨기지 않는다.
- **최대폭 컨테이너**: [레이아웃](#레이아웃) 표의 모든 "최대폭 Npx" 값은 상한일 뿐이다 —
  실제 폭은 뷰포트를 넘지 않고 `100%`까지 줄어든다.

## 타이포그래피

프로토타입은 임의 px 값을 썼지만, 실제 구현에서는 `src/styles/tokens/typography.css`의
스케일에 맞춰 정규화한다. 아래는 화면별 역할과 가장 가까운 스케일 토큰이다(font-weight가
스케일 기본값과 다르면 별도 표기).

| 역할 | 사용례 | 가장 가까운 토큰 |
|------|--------|------|
| 랜딩 히어로 타이틀 | "One card statement, see your spending habits" | `--text-display-2-*` (40px/52px/700) |
| 화면 타이틀 | 대시보드 결과/에러/성공 화면 제목(원문 20px/700) | `--text-heading-2-*` (20px/28px), weight는 700로 사용 |
| 섹션 타이틀 | "Spending by category", 결제 플랜명 등(원문 16~18px/700) | `--text-headline-1-*`(18px) 또는 `--text-body-1-normal-*`(16px), weight 700로 사용 |
| 본문/설명 | 카드 설명 문단(원문 14~15px) | `--text-body-2-normal-*`(15px) / `--text-label-1-reading-*`(14px) |
| 캡션/디스클레이머 | "참고 정보" 문구, 파일 용량 등(원문 12~13px) | `--text-caption-1-*`(12px) / `--text-label-2-*`(13px) |

폰트는 `--font-sans`(Pretendard JP) 기본, 랜딩 히어로처럼 임팩트가 필요한 디스플레이
타이틀에만 `--font-display`(Wanted Sans Variable)를 검토한다.

## 애니메이션

아래 4가지만 허용한다. 그 외 모든 모션(글로우, 바운스, 패럴랙스 등) 금지.

- 인터랙션 색상 전환 — 버튼/카드 hover, 배경·테두리·텍스트 색: `0.15s` (`Button.module.css`
  기존 패턴)
- 포커스 하이라이트 — 결과 섹션을 가리킬 때의 테두리+링 전환: `border-color, box-shadow
  0.3s`
- 스피너 회전 — `0.7s linear infinite` (`Spinner.module.css` 기존 패턴)
- 로딩 오버레이 등장/소멸 — 별도 트랜지션 없이 상태값 토글로 즉시 표시/제거(오버레이 자체에
  fade 애니메이션을 추가하지 않는다)

## 아이콘

- SVG 인라인, `viewBox` + 단일 `path`(면 채우기, `fill="currentColor"`). 프로토타입이 쓰는
  아이콘은 stroke 기반이 아니라 solid fill 아이콘이다 — `strokeWidth` 개념 없음.
- 기본 크기 20px. 상태 안내에는 24~28px로 키워 쓴다.
- 아이콘 자체를 원형 배경 박스로 감싸는 것은 "상태 아이콘 원"(성공/실패 안내) 패턴에서만
  예외적으로 허용한다. 버튼 안 아이콘, 인라인 아이콘에는 배경 박스를 쓰지 않는다.
