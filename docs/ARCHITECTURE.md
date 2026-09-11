# 아키텍처

> 여기 정리된 스택/흐름 결정의 배경(왜 이렇게 정했는지, 트레이드오프)은
> [ADR.md](./ADR.md) 참고.

## 디렉토리 구조
```
src/
├── app/               # 페이지 + API 라우트
├── components/        # UI 컴포넌트
├── types/             # TypeScript 타입 정의
├── lib/               # 유틸리티 + 헬퍼
├── styles/            # 디자인 토큰 CSS (Figma 추출본 — 직접 수정 금지, 아래 참고)
└── services/          # 외부 API 래퍼 (Supabase, Claude, Polar)
```

`src/styles/tokens/`는 디자인 시스템의 CSS 변수 export를 그대로 복사한 것이다
(`fig-tokens.css`, `typography.css`, `spacing.css`, `shadow.css`, `fonts.css`).
`src/styles/tokens/index.css`가 이들을 한 번에 import하고, `src/app/globals.css`가 그것을
import한다. 값을 손으로 고치지 않는다 — Figma 숫자와의 추적성이 깨진다. 토큰을 바꿔야 하면
Design 소스에서 재동기화한다. 상세 배경은 `/CLAUDE.md`의 "Tokens" 절 참고.

## 스택 (ADR.md 근거)

- **프레임워크**: Next.js (App Router), TypeScript
- **DB/인증**: Supabase (Postgres + Supabase Auth, 구글 OAuth) — [ADR.md](./ADR.md)의 ADR-001
- **배포**: Vercel — [ADR.md](./ADR.md)의 ADR-002
- **AI**: Anthropic Claude API (거래 내역 추출 + 소비 분석) — [ADR.md](./ADR.md)의 ADR-004/ADR-005
- **결제**: Polar (구독, 월 ₩9,900) — [ADR.md](./ADR.md)의 ADR-008
- **제품 분석**: PostHog — [ADR.md](./ADR.md)의 ADR-009

## 패턴

Server Components를 기본으로 쓰고, 업로드 폼·분석 진행 상태 폴링·결제 버튼처럼 인터랙션이
필요한 부분만 Client Component로 분리한다.

Supabase/Claude/Polar 등 외부 서비스 호출은 반드시 `src/app/api/`의 라우트 핸들러(또는
`src/services/`의 래퍼를 그 안에서 호출)를 통해서만 수행한다. 클라이언트 컴포넌트에서 외부
서비스 SDK를 직접 호출하지 않는다 — 인증 토큰/API 키 노출 방지와 F-RIRRKL의 "화면 진입 전·
데이터 조회 전 인증 상태 확인" 요구사항을 서버 쪽에서 일관되게 강제하기 위함이다.

## 데이터 흐름

```
1. 업로드
   사용자 파일 선택 (Client) → POST /api/upload → 형식/용량(20MB) 검증
   → 유효 시 Supabase Storage에 임시 저장 + analysis_jobs row 생성
     (status=pending, file_expires_at=now+24h, ADR-003)

2. 추출 + 분석 (비동기, ADR-006/ADR-010)
   분석 시작 요청(Client) → POST /api/analysis/start
   → 무료/구독 잔여 횟수 확인(F-ILHNGA/F-QVPIEG), 진행 중 job 없는지 확인(ADR-013)
   → analysis_jobs row 갱신(status=pending)
   → Supabase Database Webhook이 이 insert/update를 감지해 Edge Function 자동 호출
   → Edge Function 안에서 Claude로 거래 내역 추출(ADR-004) → Claude로 소비 분석(ADR-005)
   → analysis_results에 결과 upsert(user_id 기준, ADR-007), analysis_jobs 상태를 완료/실패로 갱신
   → 정상 완료 시에만 무료/구독 사용 횟수 차감

3. 결과 조회
   Client가 GET /api/analysis/status를 폴링 → 진행 중 상태 표시
   → 완료 시 GET /api/analysis/latest로 최신 분석 결과(이력 없음, 최신 1건만)를 가져와 대시보드 갱신

4. 파일 정리
   Supabase pg_cron이 주기 실행 → file_expires_at 지난 analysis_jobs의 Storage 오브젝트/참조 삭제(ADR-011)

5. 결제
   무료 잔여 0회 → 결제 화면 → POST /api/subscription/checkout으로 Polar 결제 세션 생성
   → Polar 결제 진행 → POST /api/webhooks/polar 수신(서명 검증 + webhook_events로 idempotency, ADR-012)
   → 구독 상태를 Supabase에 활성화 → 대시보드에서 추가 분석(월 최대 4회) 가능
```

## 데이터 모델 (Supabase Postgres)

사용자 계정 자체는 Supabase Auth의 `auth.users`를 그대로 쓰고 별도 `users` 테이블은 만들지
않는다. 아래 5개 테이블만 추가한다. 모두 RLS로 `user_id = auth.uid()` 제한, 백그라운드 처리
(Edge Function)와 웹훅 핸들러는 service role 키로 RLS를 우회해 쓴다.

```
usage_monthly     (user_id, period_month, free_used_count, subscription_used_count, updated_at)
  PK (user_id, period_month)                                            -- F-ILHNGA/F-QVPIEG

subscriptions     (user_id UNIQUE, status, polar_subscription_id, polar_customer_id,
                   current_period_end, auto_renew, updated_at)          -- F-QVPIEG

analysis_jobs     (id, user_id, status, source_file_path, source_file_type,
                   file_expires_at, error_message, created_at, updated_at)
  부분 유니크 인덱스: user_id WHERE status IN ('pending','extracting','analyzing')  -- ADR-013
  file_expires_at 기준 pg_cron 삭제 대상                                             -- ADR-011

analysis_results  (user_id PK, job_id, summary jsonb, category_breakdown jsonb,
                   anomalies jsonb, recommendations jsonb, generated_at)
  user_id가 PK이므로 새 분석 완료 시 upsert로 이전 결과를 덮어씀                       -- ADR-007

webhook_events    (id = Polar event id PK, type, received_at, processed_at)  -- ADR-012
  결제 웹훅 idempotency 체크용
```

## API 인터페이스 (`src/app/api/`)

| 라우트 | 메서드 | 역할 | 근거 |
|---|---|---|---|
| `/api/upload` | POST | CSV/PDF 업로드, 형식/20MB 검증, Storage 저장, `analysis_jobs` row 생성(status=pending) | F-ILFWKT |
| `/api/analysis/start` | POST | 잔여 횟수 확인 후 분석 시작(잔여 0이면 402) | F-PAUYQW, F-ILHNGA |
| `/api/analysis/status` | GET | jobId로 진행 상태 폴링 | F-ANJCJR, ADR-006 |
| `/api/analysis/latest` | GET | 최신 분석 결과 조회(대시보드 로드) | F-ANJCJR, ADR-007 |
| `/api/usage` | GET | 이번 달 무료/구독 사용 현황 + 구독 상태 | F-PAOWJD, F-RPFVZX |
| `/api/subscription/checkout` | POST | Polar 결제 세션 생성, 결제 URL 반환 | F-UXSBGF |
| `/api/subscription/cancel` | POST | 구독 해지 요청(다음 주기부터 갱신 중단) | F-QVPIEG |
| `/api/webhooks/polar` | POST | Polar 웹훅 수신 → 서명 검증 → idempotency → 구독 상태 갱신 | ADR-012 |
| `/auth/callback` | GET | Supabase Auth 구글 OAuth 콜백 | F-IZGIPZ |

결제/분석 시작·성공·실패 같은 시도 단위 이벤트는 별도 DB 로그 테이블을 두지 않고 PostHog로
기록한다(ADR-009/ADR-012). `subscriptions`/`analysis_jobs`는 항상 최신 상태만 담고, 시도별
이력이 필요하면 PostHog에서 조회한다.

## 도메인 타입

설계 기준선만 여기 정리한다. 실제 `src/types/*.ts` 파일은 구현 착수 시 이 정의를 그대로
옮겨 생성한다.

```ts
type AnalysisStatus = 'pending' | 'extracting' | 'analyzing' | 'completed' | 'failed'
type Category = '식비' | '교통' | '카페/간식' | '쇼핑' | '문화/여가' | '의료/건강'
  | '주거/관리비' | '통신비' | '교육' | '여행' | '구독/금융' | '기타'
type SubscriptionStatus = 'none' | 'active' | 'cancel_scheduled' | 'inactive'

interface AnalysisResult {
  summary: { totalAmount: number; periodStart: string; periodEnd: string }
  categoryBreakdown: { category: Category; amount: number; ratio: number; description: string }[]
  anomalies: { relatedTransactions: string[]; reason: string; note: string }[]
  recommendations: { text: string; basis: string }[]
  generatedAt: string
}
```

## 상태 관리

서버 상태(분석 job 상태, 이용 현황, 구독 상태)는 API Route + 클라이언트 폴링으로 동기화한다.
클라이언트 UI 상태(폼 입력, 로컬 로딩 플래그 등)는 `useState`/`useReducer`로 충분하며, 별도
전역 상태 관리 라이브러리(Redux, Zustand 등)는 도입하지 않는다.
