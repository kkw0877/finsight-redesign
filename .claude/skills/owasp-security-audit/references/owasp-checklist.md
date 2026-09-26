# OWASP Top 10:2025 체크리스트 + 프로젝트 CRITICAL 규칙

이 문서는 `owasp-security-audit` 스킬이 스폰하는 5개 서브에이전트 그룹의 체크리스트다. 각
서브에이전트는 자신에게 배정된 그룹 섹션만 읽고, 다른 섹션은 무시한다 (다른 그룹이 담당).

## 공통 규칙 (모든 그룹)

- **구체적으로 악용 가능한 시나리오만 보고**한다. 공격자가 어떤 입력/요청을 보내면 어떤 결과가
  나오는지 설명할 수 없는 "이론상 위험" 지적은 하지 않는다.
- 이 저장소는 Next.js App Router + TypeScript가 대부분이지만, `supabase/migrations/**`(SQL),
  `.github/workflows/**`(YAML) 등 다른 형식 파일도 스캔 대상에 포함될 수 있다 — TS 전용으로
  가정하지 말 것.
- CLAUDE.md의 CRITICAL 규칙 위반은 해당 규칙이 담당 그룹에 배정되어 있다면, 다른 조건과 무관하게
  **무조건 `critical`** 심각도로 보고한다.

## Finding 출력 포맷 (모든 그룹이 정확히 이 형식을 따를 것 — 재정의 금지)

파일:라인이 있는 일반 finding:
```
[A0N:2025][SEVERITY] file:line — 제목
TL;DR: 한 줄 설명 (공격 시나리오 포함)
✓ Good: (있을 때만 포함) 이미 잘 막아둔 부분
-> Fix:
    <language>
    <구체적 수정 코드>
```

CLAUDE.md CRITICAL 규칙 위반이 동시에 해당하면 두 번째 태그를 추가하고 `critical`로 고정:
```
[A01:2025][PROJECT-CRITICAL-2][critical] src/app/api/analysis/[id]/route.ts:34 — ...
```

`SEVERITY`는 다음 중 하나 (`security-reviewer` 에이전트와 동일한 어휘):
- `critical` — 즉시 악용 가능하거나 CRITICAL 규칙 위반
- `major` — 특정 조건에서 악용 가능
- `minor` — 방어 심화가 필요한 수준
- `nit` — 사소한 하드닝 제안

응답 마지막 줄에 정확히: `SUMMARY: N critical, N major, N minor, N nit`

이슈가 없으면 "해당 카테고리에서 발견된 이슈 없음"이라고 한 줄로 말하고 끝낸다. 억지로
findings를 만들어내지 않는다.

---

## 그룹 1: access-control — A01 Broken Access Control, A07 Authentication Failures

**A01 Broken Access Control**: 사용자가 자신의 권한 범위를 넘어 리소스/액션에 접근할 수 있는가.
- 클라이언트가 보낸 ID(`userId`, `analysisId` 등)를 그대로 믿고 소유권 검증 없이 조회/수정하는 API
  라우트가 있는가 (IDOR).
- 미들웨어/`proxy.ts`(이 저장소는 `middleware.ts`가 아니라 `src/proxy.ts` 컨벤션 사용 —
  [[project_nextjs_proxy_convention]]) 인증 가드가 실제로 보호해야 할 라우트를 빠뜨리고 있지 않은가.
- 관리자 전용 기능에 role 체크가 없는가.

**A07 Authentication Failures**: 신원 확인·세션 관리가 취약한가.
- Supabase Auth 세션 토큰을 안전하지 않게 다루는 곳(로컬스토리지에 수동 저장, URL에 노출 등)이
  있는가.
- 세션 만료/리프레시 처리가 없거나, 로그아웃 후에도 유효한 토큰이 재사용되는가.
- Google OAuth 콜백 처리에서 `state` 파라미터 검증 등 CSRF 방지가 빠져 있는가.

**CRITICAL#2 (from CLAUDE.md)**: service role 키로 RLS를 우회하는 코드(분석 처리 라우트, 웹훅
핸들러)는 **모든 쿼리에 `user_id` 조건을 명시적으로** 걸어야 한다. `createClient` 호출에 service
role 키가 쓰인 곳을 찾아 그 안의 모든 `.from(...)` 쿼리에 `.eq('user_id', ...)` 필터가 있는지
확인한다. 없으면 다른 사용자의 데이터를 조회/수정할 수 있는 IDOR이며 `critical`.

**CRITICAL#4 (from CLAUDE.md)**: 업로드 파일은 비공개 Storage + signed URL(소유자 검증 포함)로만
접근해야 한다. 클라이언트가 Storage 경로를 직접 구성해 접근하는 코드(예: `storage.from(...).getPublicUrl()`를
비공개 버킷에 쓰거나, signed URL 발급 전에 요청자가 파일 소유자인지 확인하지 않는 라우트)를 찾는다.

---

## 그룹 2: injection-design — A05 Injection, A06 Insecure Design

**A05 Injection**: 검증되지 않은 입력이 실행 가능한 코드로 처리되는가.
- SQL/PostgREST 쿼리에 사용자 입력을 문자열 결합으로 넣는 곳 (Supabase 쿼리 빌더를 쓰면 대부분
  안전하지만, `.rpc()`나 raw SQL을 쓰는 곳은 확인).
- 셸 명령 실행(`exec`, `spawn`)에 사용자 입력이 그대로 들어가는가.
- `eval`, `new Function`, 동적 `require`/`import`에 사용자 입력이 영향을 미치는가.
- React/JSX에서 `dangerouslySetInnerHTML`에 이스케이프되지 않은 사용자 콘텐츠를 넣는가 (XSS).
- Claude API에 보내는 프롬프트에 사용자 입력을 그대로 삽입해 프롬프트 인젝션으로 시스템 지시를
  덮어쓸 수 있는가 (이 프로젝트는 카드 내역 추출/분석에 Claude API를 쓰므로 특히 중요).

**A06 Insecure Design**: 아키텍처 수준에서 보안 통제가 아예 빠져 있는가 (구현 버그가 아니라 설계
결함).
- Rate limiting이 전혀 없는 인증/업로드/분석 엔드포인트 (무차별 대입, 리소스 고갈 공격에 노출).
- 업로드 파일 크기/타입 제한이 클라이언트 단에만 있고 서버에 없는가.
- 결제(Polar) 관련 로직에서 클라이언트가 가격/플랜을 결정하고 서버가 그대로 신뢰하는가.

---

## 그룹 3: config-crypto-secrets — A02 Security Misconfiguration, A04 Cryptographic Failures

**A02 Security Misconfiguration**: 보안 설정/기본값이 잘못되어 있는가.
- 에러 상세 정보, 디버그 모드, 소스맵이 프로덕션에 그대로 노출되는가.
- CORS 설정이 지나치게 허용적인가 (`*` origin에 credentials 허용 등).
- 보안 헤더(CSP, X-Frame-Options 등)가 전혀 설정되어 있지 않은가.
- Supabase RLS 정책이 아예 없거나 `true`로 열려 있는 테이블이 있는가 (마이그레이션 SQL 확인).

**A04 Cryptographic Failures**: 민감 데이터 보호가 부실한가.
- API 키, DB 비밀번호, service role 키 등이 코드에 하드코딩되어 있는가 (특히 클라이언트 번들에
  포함될 수 있는 `'use client'` 컴포넌트나 `NEXT_PUBLIC_` 접두사 없이 클라이언트에서 참조되는
  환경변수).
- 약한 해시 알고리즘(MD5, SHA1)을 비밀번호나 토큰에 쓰는가.
- HTTPS를 강제하지 않는 외부 호출이 있는가.

**CRITICAL#1 (from CLAUDE.md)**: 외부 서비스(Supabase/Claude API/Polar) 호출은 `src/app/api/`
라우트 핸들러 또는 그 안에서 호출하는 `src/services/`에서만 이루어져야 한다. `'use client'`
컴포넌트나 클라이언트 사이드 코드에서 이들 SDK를 직접 import/호출하는 곳이 있는지 확인한다.
이는 클라이언트 번들에 API 키가 노출되는 A02/A04 이슈로 이어지므로 이 그룹에서 함께 다룬다.

---

## 그룹 4: supply-chain — A03 Software Supply Chain Failures (도구 실행)

이 그룹은 코드를 읽는 대신 **`scripts/npm-supply-chain-scan.sh`를 Bash로 실행**해서 결정적인
CVE 데이터를 얻는다. 세부 절차와 심각도 매핑은 SKILL.md 본문의 "A03 서브에이전트" 섹션을 따른다.
추가로 확인할 것:
- `package.json`에 out-of-registry(깃 URL, 로컬 경로) 의존성이 있는가 — 공급망 신뢰 경계가
  불명확해짐.
- CI(`.github/workflows/**`)에서 서드파티 GitHub Action을 SHA 고정 없이 `@main`/`@latest`
  태그로 쓰는가 (공급망 공격 표면).
- `postinstall` 스크립트가 있는 의심스러운 패키지가 새로 추가되었는가.

---

## 그룹 5: integrity-logging-errors — A08, A09, A10

**A08 Software or Data Integrity Failures**: 검증되지 않은 업데이트/CI-CD 프로세스 리스크.
- Webhook(Polar 결제 등) payload의 서명 검증(HMAC 등)이 빠져 있는가 — 위조된 webhook을 그대로
  신뢰하면 결제 없이 구독을 활성화시킬 수 있음.
- CI/CD 파이프라인에서 서명/체크섬 검증 없이 외부 아티팩트를 다운로드해 실행하는가.

**A09 Security Logging and Alerting Failures**: 보안 이벤트 탐지/모니터링이 부족한가.
- 로그인 실패, 결제 실패, 권한 오류 같은 보안 관련 이벤트가 전혀 로깅되지 않는가.
- 로그에 민감정보(비밀번호, 전체 카드번호, 토큰)가 그대로 남는가 (로깅은 하되 과다 노출도 문제).

**A10 Mishandling of Exceptional Conditions**: 에러 처리가 부적절해 정보가 새는가.
- catch 블록에서 스택 트레이스나 내부 에러 메시지를 그대로 클라이언트 응답/UI에 노출하는가.
- 에러 발생 시 fail-open(보안 체크를 건너뛰고 통과)으로 동작하는 로직이 있는가.

**CRITICAL#3 (from CLAUDE.md)**: 내부 예외 메시지·스택 트레이스를 사용자에게 그대로 노출하면
안 된다 — 항상 이해 가능한 메시지로 매핑해야 한다. `catch (error)` 이후 `error.message`,
`error.stack`, 또는 에러 객체 자체를 `NextResponse.json`/응답 바디에 그대로 넣는 코드를 찾는다.

**CRITICAL#5 (from CLAUDE.md)**: 업로드 원본 파일(CSV/PDF)은 24시간 TTL로 pg_cron이 정리하는
임시 저장소에만 두어야 한다 — 이 TTL을 우회하는 별도 영구 저장 경로를 추가하면 안 된다. 업로드
파일을 TTL이 적용되지 않는 별도 버킷/테이블/디스크에 복사·보관하는 코드가 있는지 확인한다.
