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
   → 유효 시 Supabase Storage에 임시 저장(TTL 24h, ADR-003)

2. 추출 + 분석 (비동기, ADR-006)
   분석 요청(Client) → 무료/구독 잔여 횟수 확인(F-ILHNGA/F-QVPIEG)
   → 분석 job 생성(상태: 대기) → 백그라운드에서
     Claude로 거래 내역 추출(ADR-004) → Claude로 소비 분석(ADR-005)
   → 결과를 Supabase DB에 저장, job 상태를 완료/실패로 갱신
   → 정상 완료 시에만 무료 횟수 차감

3. 결과 조회
   Client가 GET /api/analysis/status를 폴링 → 진행 중 상태 표시
   → 완료 시 최신 분석 결과(ADR-007: 이력 없음, 최신 1건만)로 대시보드 갱신

4. 결제
   무료 잔여 0회 → 결제 화면 → Polar 결제 진행 → Polar 웹훅으로 결제 확인
   → 구독 상태를 Supabase에 활성화 → 대시보드에서 추가 분석(월 최대 4회) 가능
```

## 상태 관리

서버 상태(분석 job 상태, 이용 현황, 구독 상태)는 API Route + 클라이언트 폴링으로 동기화한다.
클라이언트 UI 상태(폼 입력, 로컬 로딩 플래그 등)는 `useState`/`useReducer`로 충분하며, 별도
전역 상태 관리 라이브러리(Redux, Zustand 등)는 도입하지 않는다.
