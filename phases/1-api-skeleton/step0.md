# Step 0: types-fixtures

## 배경

Finsight는 Next.js(App Router) + TypeScript 기반 카드 소비 분석 서비스다. 지금까지는
`src/app/{page.tsx,login,welcome,dashboard,billing,privacy}`에 화면만 구현되어 있고,
백엔드가 전혀 없다 — 대시보드/결제 화면의 상태 전환은 전부 클라이언트 로컬 state +
`setTimeout`으로 시뮬레이션되어 있다. `src/app/api/`, `src/types/`, `src/lib/`,
`src/services/` 디렉토리는 아직 존재하지 않는다.

이번 phase(`1-api-skeleton`)의 목표는 `docs/ARCHITECTURE.md`의 "API 인터페이스" 표에 정의된
라우트들을 실제 Supabase/Claude/Polar 호출 없이 고정 mock 데이터로 응답하는 스켈레톤으로
구현하고, 대시보드/결제 화면의 `setTimeout` 시뮬레이션을 실제 `fetch` 호출로 교체해 API
계약(요청/응답 shape)이 화면과 맞는지 검증하는 것이다. 실제 Supabase 프로젝트 생성, 구글
OAuth 앱 등록, Polar 상품/웹훅 설정 같은 외부 서비스 연동은 이번 phase 범위 밖이다(다음
phase).

이 step(0번)은 그 첫 단계로, 이후 모든 API 라우트와 화면 연동이 의존할 **도메인 타입**과
**mock 데이터/상태를 담는 fixture 모듈**을 만든다. API 라우트나 화면 코드는 이 step에서
건드리지 않는다(다음 step들에서 진행).

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — 특히 "데이터 모델", "API 인터페이스", "도메인 타입" 절
- `/docs/ADR.md` — 특히 ADR-004(추출 데이터 최소화), ADR-005(고정 12개 카테고리),
  ADR-007(최신 결과만 보관), ADR-013(동시 분석 요청 방지), ADR-017(동기 처리)
- `/docs/feature-spec.md` — 특히 F-ILHNGA(무료 횟수), F-PAOWJD/F-RPFVZX(이용 현황 조회),
  F-QVPIEG(구독 상태), F-VZZTMF/F-LRPAYO/F-BLDQBC(분석 결과 슬롯)
- `/src/app/dashboard/page.tsx` — 현재 대시보드가 쓰고 있는 mock 데이터 형태
  (`CATEGORIES`, `ANOMALIES`, `RECOMMENDATIONS`, `FREE_LIMIT` 등, 대략 34~82번 줄)를 참고하되,
  **필드명/카테고리 언어는 그대로 베끼지 말 것** — 아래 "작업" 절의 지시를 따른다(이유는 아래
  참고).
- `/src/app/billing/page.tsx` — 현재 결제 화면이 쓰고 있는 mock 데이터 형태
  (`PLAN_BENEFITS`, 결제 성공 영수증 필드 등)

**중요한 불일치**: 현재 `dashboard/page.tsx`의 mock 데이터는 영문 필드명(`name`, `pct`,
`title`, `desc`)과 영문 카테고리명("Food & Cafe", "Shopping" 등)을 쓰지만,
`docs/ARCHITECTURE.md`가 확정한 `AnalysisResult` 도메인 타입은 한글 12개 고정 카테고리
enum과 `ratio`/`description`/`relatedTransactions`/`reason`/`note`/`text`/`basis` 필드명을
쓴다. 이번 phase에서는 **문서에 확정된 도메인 타입을 그대로 채택**하기로 결정했다 — 화면
쪽 코드는 이후 step(3번)에서 이 타입에 맞게 갱신한다. 이 step에서는 fixture 데이터도 반드시
문서 타입 기준(한글 카테고리, 위 필드명)으로 만들어야 한다.

## 작업

### 1. `src/types/analysis.ts`

`docs/ARCHITECTURE.md`의 "도메인 타입" 절에 정의된 타입을 **그대로** 옮긴다(값을 바꾸지
않는다 — 이 타입은 이미 확정된 설계 기준선이다):

```ts
export type AnalysisStatus = 'processing' | 'completed' | 'failed'

export type Category =
  | '식비' | '교통' | '카페/간식' | '쇼핑' | '문화/여가' | '의료/건강'
  | '주거/관리비' | '통신비' | '교육' | '여행' | '구독/금융' | '기타'

export interface AnalysisResult {
  summary: { totalAmount: number; periodStart: string; periodEnd: string }
  categoryBreakdown: { category: Category; amount: number; ratio: number; description: string }[]
  anomalies: { relatedTransactions: string[]; reason: string; note: string }[]
  recommendations: { text: string; basis: string }[]
  generatedAt: string
}
```

### 2. `src/types/usage.ts`

`docs/ARCHITECTURE.md`의 `SubscriptionStatus` 타입을 그대로 옮기고, `/api/usage` 응답 형태와
`/api/subscription/*` 응답에 필요한 타입을 `docs/feature-spec.md`의 F-PAOWJD/F-RPFVZX/F-QVPIEG
데이터 슬롯을 근거로 새로 정의한다(문서에 응답 JSON 형태까지는 없으므로 이 slot 설명을
근거로 설계하되, 카멜케이스 필드명을 쓴다):

```ts
export type SubscriptionStatus = 'none' | 'active' | 'cancel_scheduled' | 'inactive'

export interface UsageStatus {
  periodMonth: string          // 'YYYY-MM' (KST 기준, F-ILHNGA)
  freeUsedCount: number
  freeLimit: number             // 항상 2 (F-ILHNGA)
  freeRemaining: number
  subscriptionUsedCount: number
  subscriptionLimit: number     // 활성 구독 시 2, 비구독 시 0 (F-UXSBGF: 월 최대 4회 = 무료 2 + 구독 2)
  subscriptionRemaining: number
  subscriptionStatus: SubscriptionStatus
  currentPeriodEnd: string | null   // ISO 날짜, 구독 비활성 시 null
}
```

### 3. `src/types/api.ts`

각 API 라우트의 요청/응답 타입을 정의한다 — 시그니처만 확정하고, 세부 값은 fixture/route
구현 시 자유롭게 채운다:

```ts
export interface UploadResponse {
  jobId: string
  fileName: string
}

export interface AnalysisStartResponseError {
  error: string   // 사용자에게 보여줄 이해 가능한 메시지 (내부 예외 노출 금지, CLAUDE.md CRITICAL 규칙)
}

export interface CheckoutRequestBody {
  simulateFailure?: boolean   // 테스트 전용 훅: true면 결제 실패를 흉내낸다. 실제 Polar에는 없는 개념.
}

export interface CheckoutSuccessResponse {
  subscriptionStatus: 'active'
  currentPeriodEnd: string
  billedAt: string
}

export interface CancelResponse {
  subscriptionStatus: 'cancel_scheduled'
  currentPeriodEnd: string   // 혜택이 유지되는 종료 예정일
}
```

`AnalysisResult`를 성공 응답으로 그대로 쓰는 라우트(`/api/analysis/start`,
`/api/analysis/latest`)는 별도 Response 타입을 안 만들어도 된다 — `AnalysisResult`를 직접
쓴다.

### 4. `src/lib/fixtures/analysisFixture.ts`

고정 `AnalysisResult` mock 데이터 1건을 만든다. 현재 `dashboard/page.tsx`의 mock 콘텐츠
(지출 규모, 이상 지출 패턴, 추천 문구의 취지)를 참고해서 의미상 비슷한 내용으로 만들되,
**반드시** 위 `AnalysisResult` 타입 그대로(한글 카테고리, `ratio`/`description` 등 필드명)
작성한다. 예:

```ts
import type { AnalysisResult } from '@/types/analysis'

export const MOCK_ANALYSIS_RESULT: AnalysisResult = {
  summary: { totalAmount: 1847600, periodStart: '2026-08-01', periodEnd: '2026-08-31' },
  categoryBreakdown: [
    { category: '식비', amount: 612400, ratio: 0.33, description: '...' },
    // ... 나머지 카테고리
  ],
  anomalies: [
    { relatedTransactions: ['...'], reason: '...', note: '...' },
  ],
  recommendations: [
    { text: '...', basis: '...' },
  ],
  generatedAt: new Date().toISOString(),
}
```

그리고 "현재 저장된 최신 분석 결과"를 흉내내는 **모듈 레벨 mutable 상태**와 그 상태를
읽고/쓰는 함수를 만든다(ADR-007: 최신 결과만 보관, 새 분석 완료 시 덮어씀). 시그니처 예:

```ts
export function getLatestResult(): AnalysisResult | null   // 아직 분석한 적 없으면 null
export function setLatestResult(result: AnalysisResult): void
```

또한 ADR-013(동시 분석 요청 방지)을 흉내낼 "현재 처리 중" 플래그와 그 조회/설정/해제
함수도 만든다(실제 DB 유니크 인덱스가 아니라 모듈 레벨 boolean으로 충분하다 — DB 레벨
제약을 흉내낼 필요는 없다고 이미 확인됨):

```ts
export function isProcessing(): boolean
export function startProcessing(): void
export function finishProcessing(): void
```

### 5. `src/lib/fixtures/usageFixture.ts`

무료/구독 사용 횟수와 구독 상태를 담는 모듈 레벨 mutable 상태와 조작 함수를 만든다.
F-ILHNGA/F-UXSBGF/F-QVPIEG 규칙을 반영한다:

- 초기 상태: `freeUsedCount: 0`, `freeLimit: 2`, `subscriptionUsedCount: 0`,
  `subscriptionStatus: 'none'`, `currentPeriodEnd: null`.
- 분석 1건이 정상 완료될 때만 사용 횟수가 차감된다(무료 잔여가 있으면 무료부터, 없고 구독이
  활성이면 구독 사용 횟수를 차감) — 실패한 분석은 차감하지 않는다(F-ILHNGA, F-UXSBGF).
- 무료+구독 잔여가 모두 0이면 더 이상 차감할 수 없다.

시그니처 예:

```ts
export function getUsageStatus(): UsageStatus
export function hasRemainingAnalysis(): boolean
export function consumeOneAnalysis(): void   // 무료 우선 차감, 없으면 구독분 차감. 잔여 없을 때 호출 금지(호출 전 hasRemainingAnalysis로 확인)
export function activateSubscription(currentPeriodEnd: string): void   // subscriptionStatus='active', subscriptionUsedCount 리셋
export function cancelSubscription(currentPeriodEnd: string): void     // subscriptionStatus='cancel_scheduled' (활성 상태였을 때만 의미 있음)
```

`periodMonth` 리셋(매월 1일 KST 기준 초기화, F-ILHNGA)의 실제 크론/스케줄링 로직은 만들지
않는다 — 스켈레톤 단계이므로 서버 프로세스가 떠 있는 동안의 in-memory 상태만 관리하면
충분하다. 단, `getUsageStatus()`가 반환하는 `periodMonth` 값 자체는 현재 KST 기준 'YYYY-MM'
문자열로 정확히 계산해서 채운다(하드코딩 금지).

### 6. 테스트 작성 (TDD)

CLAUDE.md CRITICAL 규칙: 새 기능은 테스트를 먼저 작성하고 통과하는 구현을 만든다. `vitest`가
이미 설정되어 있다(`npm test` → `vitest run`). 아래를 검증하는 테스트를 작성한다(파일 위치는
`src/lib/fixtures/*.test.ts` 등 기존 프로젝트 관례를 따른다 — 관례가 없으면 소스 파일과 같은
디렉토리에 `*.test.ts`로 둔다):

- `usageFixture`: 초기 상태에 `freeRemaining`이 2인지, `consumeOneAnalysis()`를 2번 호출하면
  `freeUsedCount`가 2·`freeRemaining`이 0이 되는지, 구독 활성화 후 추가로 소비하면
  `subscriptionUsedCount`가 올라가는지, `hasRemainingAnalysis()`가 무료+구독 모두 소진되면
  `false`를 반환하는지.
- `analysisFixture`: `getLatestResult()`가 초기엔 `null`, `setLatestResult()` 이후엔 그
  값을 반환하는지. `isProcessing()`/`startProcessing()`/`finishProcessing()`이 기대대로
  플래그를 토글하는지.

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # ESLint 통과
npm test        # vitest 통과 (이번 step에서 추가한 테스트 포함)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/types/`, `src/lib/fixtures/`에만 파일을 추가했는가? (`src/app/`, `src/components/`는
     이 step에서 건드리지 않는다)
   - `Category`/`AnalysisResult` 타입이 `docs/ARCHITECTURE.md`와 정확히 일치하는가?
   - CLAUDE.md CRITICAL 규칙(TDD)을 지켰는가 — 테스트가 실제로 fixture 동작을 검증하는가?
3. 결과에 따라 `phases/1-api-skeleton/index.json`의 step 0 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 만든 파일 목록과 핵심 타입/함수 시그니처를
     한 줄로 요약(다음 step들이 이 요약을 참고해서 import 경로/함수명을 알아야 한다).
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- `src/app/api/`, `src/app/dashboard/`, `src/app/billing/`를 이 step에서 건드리지 마라. 이유:
  이후 step들(1~4번)에서 각각 독립적으로 다룰 범위다 — 지금 손대면 다음 step들의 diff가
  지저분해진다.
- `AnalysisResult`/`Category` 타입 필드명이나 카테고리 목록을 `docs/ARCHITECTURE.md`/
  `docs/ADR.md`와 다르게 임의로 바꾸지 마라. 이유: 이 타입은 이미 확정된 설계 기준선이고,
  대시보드 차트 색상 순환 로직(ADR-005)이 정확히 12개 고정 카테고리를 전제한다.
- `analysis_jobs`/`analysis_results` 같은 실제 DB 테이블·유니크 인덱스를 흉내내는 코드를
  만들지 마라. 이유: DB 레벨 제약은 스켈레톤 단계에서 흉내낼 필요가 없다고 이미 결정했다 —
  모듈 레벨 boolean 플래그(`isProcessing`)로 충분하다.
- 기존 테스트를 깨뜨리지 마라.
