# Step 3: dashboard-screen

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 기획 의도와 이전 step 산출물을 파악하라:

- `/docs/feature-spec.md`의 `R-ONTTAQ`(F-ILFWKT), `R-GURVDX`(F-KCOAUD/F-VZZTMF/F-LRPAYO/F-BLDQBC),
  `R-AJSOKJ`(F-PAUYQW/F-ANJCJR/F-RPFVZX), `R-GFWXZC`의 F-ILHNGA — 각 슬롯의 exceptions/display/rules
- `/docs/ADR.md`의 ADR-017(동기 처리 — 폴링 없이 단일 스피너) — 진행 상태를 여러 단계
  ("추출 중"/"분석 중")로 쪼개지 말고 단일 스피너로 표시해야 하는 근거
- `/docs/prd.md`의 "Product Decisions" 2번(업로드 최대 20MB), 4번(초기화 기준일), 5번(구독자
  월 최대 4회), 11번(고정 12개 카테고리 — 이번 step은 mock 데이터라 직접 쓰진 않지만 결과 화면
  문구가 이 체계와 어긋나면 안 됨)
- `/docs/UI_GUIDE.md`의 "레이아웃" 표(대시보드 헤더/빈 상태 680px/결과 740px)와 "상태 아이콘 원",
  "업로드 드롭존", "파일 행 카드", "이용 현황 배지" 스펙(이미 step 0에서 컴포넌트로 만들어짐)
- `src/components/ui/index.ts` — `UsageBadge`, `UploadDropzone`, `FileRowCard`, `SectionCard`,
  `StatusIconCircle`, `Spinner`, `Button`, `Badge`, `Chip` 전체 props (step 0 산출물)
- `src/app/login/page.tsx`(step 2 산출물) — 이 프로젝트에서 Client Component + `setTimeout` 기반
  상태 시뮬레이션을 어떻게 작성했는지 참고해 동일한 스타일을 유지한다

이 프로젝트는 백엔드가 없다. `/api/upload`, `/api/analysis/start`, `/api/usage` 등은 아직
존재하지 않으므로, 이번 step은 그 API들이 반환할 결과를 **로컬 state로 흉내만 낸다**. 페이지를
벗어났다가 돌아오면(다른 라우트로 이동 후 재방문) 상태는 초기값으로 리셋된다 — 이는 의도된
동작이다(실제 서버 상태가 생기기 전까지 전역 mock store를 만들지 않기로 결정했다).

## 작업

### `src/app/dashboard/page.tsx`

전체를 Client Component(`"use client"`)로 작성한다. 향후 실제 구현에서도 이 페이지는 로드 시
`GET /api/usage`, `GET /api/analysis/latest`를 호출하는 Client 페이지가 될 것이므로(
`ARCHITECTURE.md`의 "상태 관리" 절), 지금 로컬 state로 흉내 내는 구조가 그대로 이어진다.

**상태 모델** (정확한 타입/필드명은 자유, 아래는 최소 요구사항):

```ts
type DashboardView =
  | "empty" | "file-selected" | "upload-error" | "extract-error"
  | "analyzing" | "analysis-error" | "result";

// 컴포넌트 로컬 state 최소 구성
freeRemaining: number;      // 초기값 2 (무료 월 2회, F-ILHNGA)
view: DashboardView;        // 초기값 "empty"
selectedFile: { name: string; size: string } | null;
```

**헤더** (풀와이드, 좌우 패딩 32px, 양끝 정렬, 모바일에서 `flex-wrap`):
- 좌: "Finsight" 워드마크.
- 우: `UsageBadge`(freeRemaining이 0이면 `warn` + 텍스트 "You've used all your free analyses this
  month." 계열 문구, 아니면 "Free analyses {freeRemaining}/2 left"), 아바타 원(32px, 배경
  `--primary-normal`, 흰 글자 "A" — 실제 사용자 이니셜은 로그인 연동 후 대체할 플레이스홀더),
  "Log out" 텍스트 링크(`Link href="/"`, 실제 세션 무효화는 아직 없음 — 주석으로 명시).

**본문** (최대폭 680px 중앙, `view`에 따라 분기):

1. `empty`: `freeRemaining === 0`이면 상단에 경고 배너(빨강 배경, "You've used all your free
   analyses this month." + `Button variant="solid" color="primary" size="sm"` label "Subscribe to
   keep analyzing" → `Link href="/billing"`). 그 아래 `UploadDropzone` 안에 타이틀/설명 +
   `Chip` "CSV"/"PDF" 2개 + **실제** `<input type="file" accept=".csv,.pdf">`(라벨/버튼으로
   스타일링 가능, 하지만 반드시 진짜 file input이어야 한다 — 이유는 아래 규칙 참고).
   - 파일 선택 시 클라이언트에서 확장자 검증: `.csv`/`.pdf`(대소문자 무관)가 아니면 `view`를
     `"upload-error"`로 전환. 20MB 초과 시에도 동일하게 `"upload-error"`로 전환(F-ILFWKT: 용량
     초과는 형식 오류와 동일한 메시지로 처리).
   - 유효하면 `selectedFile`을 설정하고 `view`를 `"file-selected"`로 전환.
2. `file-selected`: `FileRowCard`(파일명/용량/`verified` 표시) + `Button variant="solid"
   color="primary" size="lg"` label "Start analysis" + "Choose a different file" 링크(다시
   `"empty"`로). "Start analysis" 클릭 시: `freeRemaining <= 0`이면 `router.push("/billing")`,
   아니면 `view`를 `"analyzing"`으로 전환.
3. `upload-error` / `extract-error` / `analysis-error`: `StatusIconCircle tone="negative"` +
   타이틀/설명(feature-spec의 각 Exceptions 문구를 이해 가능한 문장으로 표시) + "Upload
   again"/"Retry analysis" 버튼(`"empty"` 또는 `"analyzing"`으로 되돌림).
   - `extract-error`로 들어가는 실제 경로가 없으므로(백엔드 없이는 "추출 실패"를 진짜로 재현할
     수 없음), `empty` 상태의 드롭존 아래에 작은 캡션 링크 "Demo: simulate corrupted file"을
     추가해 `view`를 `"extract-error"`로 바꾼다. 실제 기능이 아니라 임시 트리거임을 주석으로
     남겨라.
4. `analyzing`: `Spinner`(48px) + "Analyzing your card statement" + 체크리스트 텍스트(추출 완료
   ✓ / 분석 중... / 인사이트 생성 중, ADR-017에 따라 실제로는 세분화된 진행 상태를 서버가 주지
   않으므로 이 3줄은 순수 장식 텍스트다) + `setTimeout` 2200ms 후 `view`를 `"result"`로 전환하고
   `freeRemaining`을 1 차감(0 미만으로 내려가지 않게). 하단에 작은 캡션 링크 "Demo: preview
   analysis failure"로 `view`를 `"analysis-error"`로 바로 전환할 수 있게 한다(`setTimeout` 취소
   필수 — 두 전환이 경합하지 않게).
5. `result`: 최대폭 740px. 헤더(타이틀 "August Card Statement Analysis", 부제 "Total spend
   ₩1,847,600 · 42 transactions · just analyzed", 우측 "Analyze new statement" 버튼 →
   `"empty"`로) + 3개 `SectionCard`(카테고리별 지출 / 이상 지출 탐지 / 절약·관리 추천). mock
   데이터는 아래 값을 그대로 쓴다(Design 프로토타입 원본과 동일 — 임의로 숫자를 바꾸지 마라):

   ```ts
   const CATEGORIES = [
     { name: "Food & Cafe", amount: 612400, pct: 33 },
     { name: "Shopping", amount: 398200, pct: 22 },
     { name: "Other", amount: 364800, pct: 19 },
     { name: "Culture & Leisure", amount: 231000, pct: 13 },
     { name: "Transportation", amount: 156300, pct: 8 },
     { name: "Subscriptions", amount: 84900, pct: 5 },
   ];
   // 막대 색은 UI_GUIDE "카테고리 차트 색상" 6색을 이 순서로 순환:
   // --blue-50, --green-50, --purple-50, --orange-50, --cyan-50, --pink-50

   const ANOMALIES = [
     { title: "3 overlapping subscription payments detected", desc: "Netflix, Watcha, and Disney+ charges are running concurrently. You're spending ₩84,900/month on streaming subscriptions alone." },
     { title: "Online shopping spend up 47% from last month", desc: "Of the ₩398,200 spent on shopping in August, a ₩79,000 charge on 8/14 and a ₩132,000 charge on 8/22 drove most of the increase." },
     { title: "3 late-night delivery charges found", desc: "Delivery app charges between 1–3 AM occurred three times: 8/3, 8/11, and 8/19. Check your late-night snacking spend." },
   ];

   const RECOMMENDATIONS = [
     { title: "Cancel just one duplicate subscription to save up to ₩17,000/month", desc: "Watcha and Disney+ content overlaps. Consider keeping just one." },
     { title: "Try setting a ₩300,000 monthly shopping budget", desc: "Shopping spend was 47% higher than usual this month. Consider setting an alert before your next purchase." },
     { title: "Save on food by grocery shopping instead of delivery", desc: "Swapping those 3 late-night deliveries for home cooking could save about ₩60,000/month." },
   ];
   ```
   - 이상 지출 섹션의 각 항목 제목 옆에 `Badge tone="negative" text="Alert"` 표시.
   - 결과 화면 하단에 UI_GUIDE 원칙 4번("참고 정보라는 점을 매번 밝힌다")에 따른 디스클레이머
     문구를 반드시 표시한다.

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 실제 `<input type="file">`로 확장자/용량 검증이 동작하는가(가짜 버튼 3개로 대체하지
     않았는가)?
   - `analyzing` → `result` 전환 시 `freeRemaining` 차감이 0 미만으로 내려가지 않는가(F-ILHNGA)?
   - mock 데이터 숫자가 위 스펙과 정확히 일치하는가(임의로 바뀐 값 없는지)?
   - `setTimeout`을 페이지 언마운트/다른 전환 시 정리(`clearTimeout`)하는가(경합 방지)?
3. 결과에 따라 `phases/0-ui-screens/index.json`의 step 3을 업데이트한다(completed/error/blocked
   규칙은 이전 step과 동일).

## 금지사항

- `src/app/api/` 아래 라우트를 만들거나 실제 Claude API를 호출하지 마라. 이유: 이번 phase는
  UI 화면만 다룬다(사용자와 합의된 범위).
- 페이지 이동 간 `freeRemaining`/`selectedFile` 등을 유지하기 위한 전역 store(Context/Zustand
  등)를 만들지 마라. 이유: 실제 서버 상태가 생기면 어차피 API 호출로 대체될 코드라 지금 만들면
  버려진다(ARCHITECTURE.md "상태 관리" 절).
- 대시보드 접근에 로그인 여부를 확인하는 라우트 가드를 추가하지 마라. 이유: Supabase Auth
  세션이 아직 없어 검증할 대상이 없다 — 지금 만들면 항상 통과하는 가짜 가드가 된다.
- 기존 테스트를 깨뜨리지 마라.
