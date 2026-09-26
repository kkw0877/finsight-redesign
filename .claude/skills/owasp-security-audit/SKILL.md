---
name: owasp-security-audit
description: Scans this codebase for security vulnerabilities against OWASP Top 10:2025 plus this project's own CLAUDE.md CRITICAL security rules (service-role RLS bypass without user_id filtering, insecure Storage/signed-URL access, exception messages leaked to users, client components calling external services directly, upload TTL bypass), and saves a structured, OWASP-ordered report file to security-reports/ instead of just printing findings in chat. Supports a fast diff-only scan of pending git changes AND an on-demand full-codebase audit, plus real `npm audit`/`npm outdated` dependency-CVE scanning — not just LLM guessing. Use this whenever the user asks to scan for vulnerabilities, run a security review, audit the codebase, check dependencies for CVEs, or asks things like "이 코드 안전한가요", "보안 스캔해줘", "취약점 점검해줘", "보안 리뷰해줘", "전체 코드베이스 감사해줘", "배포 전에 점검해줘", or mentions OWASP, RLS, secrets, injection, XSS, SSRF, access control, or exception handling — even if they never say the words "OWASP" or "security audit".
---

이 저장소를 OWASP Top 10:2025 10개 카테고리 + `CLAUDE.md`의 프로젝트 CRITICAL 규칙 5개
기준으로 스캔하고, 결과를 `security-reports/`에 파일로 저장한다.

## 1. 모드 판별 (diff vs full)

1. 인자로 "diff"/"full"/"전체"가 명시되어 있으면 그대로 따른다.
2. 없으면 사용자 문구로 분류한다:
   - full 신호: "전체", "전체 코드베이스", "전체 감사", "full audit", "모든 코드"
   - diff 신호: "이 변경사항", "이 PR", "이 브랜치", "방금 커밋", "diff"
3. 그래도 모호하면 `/review-code`와 동일한 순서로 확인한다: `git status`, `git diff HEAD`
   (staged+unstaged), `git diff main...HEAD` (main 대비 커밋된 변경). 이 중 하나라도
   변경사항이 있으면 diff-mode, 전부 비어 있으면 자동으로 full-mode로 전환한다.
4. 선택한 모드를 사용자에게 먼저 한 줄로 알리고, 리포트 헤더에도 기록한다.

**Diff-mode 대상**: 변경된 파일 목록(`git diff --name-only ...`)과 diff 본문.
**Full-mode 대상**: `src/` 전체 + `supabase/migrations/**`(SQL) + `.github/workflows/**`(YAML)가
존재하면 포함 — 이 프로젝트는 TS 파일이 대부분이지만 스캔 대상을 TS로만 한정하지 않는다.

변경사항이 전혀 없고 사용자가 diff-mode를 명시하지도 않았다면(2번 신호도 없이 3번에서 자동
full-mode 전환된 경우) 그 사실을 알리고 계속 진행한다.

## 2. 서브에이전트 5개를 한 메시지에서 동시 호출

`references/owasp-checklist.md`를 이 스킬을 실행하는 본인이 먼저 훑어 그룹 구성을 확인한 뒤,
Agent 툴로 아래 5개를 **하나의 메시지 안에서 동시에** 호출한다 (순차 호출 금지 — `/review-code`와
동일하게 병렬 실행이 핵심이다). `subagent_type`은 `general-purpose`를 쓰고, 도구는 프롬프트에서
Read/Grep/Glob/Bash로 제한하도록 지시한다 (Edit/Write 금지 — 읽기 전용 스캔).

| # | 그룹 | 담당 카테고리 |
|---|---|---|
| 1 | access-control | A01 Broken Access Control, A07 Authentication Failures, CRITICAL#2, CRITICAL#4 |
| 2 | injection-design | A05 Injection, A06 Insecure Design |
| 3 | config-crypto-secrets | A02 Security Misconfiguration, A04 Cryptographic Failures, CRITICAL#1 |
| 4 | supply-chain | A03 Software Supply Chain Failures (도구 실행 — §3 참고) |
| 5 | integrity-logging-errors | A08 Software/Data Integrity Failures, A09 Security Logging and Alerting Failures, A10 Mishandling of Exceptional Conditions, CRITICAL#3, CRITICAL#5 |

각 서브에이전트는 새로 시작하는 에이전트라 이전 대화 맥락이 없으므로, 프롬프트에 반드시 다음을
포함한다 (자기완결적으로 작성):
- 모드(diff/full) + 정확한 재현 커맨드 또는 스캔 대상 파일/디렉토리 목록
- "당신은 [그룹명] 카테고리만 담당한다. 다른 그룹의 영역은 다른 서브에이전트가 맡으니 언급하지
  말라"
- "시작하기 전에 `.claude/skills/owasp-security-audit/references/owasp-checklist.md`를 읽고,
  당신의 그룹 섹션(공통 규칙 + Finding 출력 포맷 + 해당 그룹 섹션)을 확인하라"
- "출력 포맷은 그 문서에 정의된 그대로 따르라 — 재정의하지 말 것"

그룹 4(supply-chain)는 코드 리딩이 거의 없고 도구 실행 위주이므로 다른 4개와 병렬로 같은
메시지에서 호출해도 된다 (서로 의존성 없음).

## 3. 그룹 4 (supply-chain): 실제 도구 실행

supply-chain 서브에이전트 프롬프트에 다음을 명시한다:

1. `bash .claude/skills/owasp-security-audit/scripts/npm-supply-chain-scan.sh`를 Bash 툴로
   실행해 `npm audit`(전체/production-only)와 `npm outdated`의 JSON 출력을 모두 확보한다.
2. 각 advisory를 해석한다: npm 심각도 `low/moderate/high/critical`를 이 스킬의
   `nit/minor/major/critical`로 매핑. `via` 체인으로 direct/transitive 여부를 판단.
3. `--omit=dev` 결과에 없고 전체 결과에만 있는(즉 dev-only) 취약점은, 빌드 시점 공급망 리스크
   (예: Vercel 빌드 중 악성 코드 주입 가능성)로 볼 근거가 없는 한 `minor`/`nit`로 낮춘다.
4. `npm outdated`에만 나오고 대응하는 audit advisory가 없는 패키지는 알려진 CVE가 없다는
   뜻이므로 정보성 `nit`로만 기록한다 (임의로 `major`/`critical`로 올리지 않는다).
5. 같은 advisory가 여러 `via` 경로로 나오면 하나의 finding으로 병합하고 경로를 모두 나열한다.
6. Finding 포맷: `[A03:2025][SEVERITY] package:<name>@<version> (direct|transitive via <path>)`
   — 파일:라인이 없으므로 일반 포맷과 다르다.

## 4. 취합 및 리포트 저장

5개 서브에이전트의 응답을 모두 받은 뒤:

1. **중복 제거**: 같은 `file:line`(또는 A03의 `package:name`)을 2개 이상 그룹이 지적했다면 하나로
   병합하고, 더 높은 심각도를 채택하며, OWASP 태그를 모두 합친다 (예: `[A01:2025][A05:2025]`).
2. **정렬**: 1차 키는 OWASP 카테고리 오름차순(A01→A10) — `/review-code`의 심각도 우선 정렬과
   다르다는 점에 주의. 2차 키는 카테고리 내부에서 심각도 내림차순(critical→nit).
3. **집계**: 카테고리별 critical/major/minor/nit 카운트와 전체 합계를 낸다.
4. **판정**: critical이 하나라도 있으면 🔴 Blocked, critical 없이 major가 있으면 🟠 Changes
   Requested, minor/nit만 있거나 findings가 없으면 🟢 Approve.
5. `references/report-template.md`의 템플릿을 그대로 채워
   `security-reports/<YYYY-MM-DD>-<HHmm>-<mode>.md`에 Write한다 (`security-reports/` 디렉토리가
   없으면 새로 만든다 — 이 디렉토리는 `.gitignore`에 포함되어 있으므로 git 추적 대상이 아니다).
   타임스탬프로 파일을 누적하고 기존 리포트를 덮어쓰지 않는다.
6. 저장한 파일의 정확한 경로를 사용자에게 알리고, 리포트 본문(또는 Executive Summary +
   critical/major 항목 요약)을 대화창에도 출력한다 — 파일에만 저장하고 끝내지 않는다.

## 주의사항

- 서브에이전트는 읽기 전용이다 (코드를 수정하지 않는다). 실제 수정은 이 리포트를 사용자가 확인한
  뒤 별도로 진행한다.
- 5개 중 일부가 "해당 카테고리 이슈 없음"이라고만 답해도 정상이다 — 억지로 findings를 만들어내지
  않는다.
- Executive Summary의 카운트와 판정은 반드시 실제로 나열된 findings에서만 집계한다 — 새로
  지어내지 않는다.
- `security-reports/`에 저장된 리포트는 아직 고치지 않은 취약점의 상세 지도이므로, git에
  커밋하지 않는다(`.gitignore`에 이미 등록됨). 팀과 공유가 필요하면 대화창 출력이나 별도 채널로
  전달한다.
