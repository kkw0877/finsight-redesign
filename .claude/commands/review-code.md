현재 변경 사항(diff)을 3개 차원의 서브에이전트로 병렬 리뷰하고, 결과를 취합해 Harness 포맷으로 보여줘라.

## 1. 리뷰 대상 확정

- 인자로 PR 번호/브랜치/경로가 주어지면 그것을 대상으로 한다.
- 인자가 없으면 `git status`, `git diff HEAD` (staged+unstaged), `git diff main...HEAD` (main 대비 커밋된 변경)를 확인해 실제로 변경 사항이 있는 쪽을 대상으로 삼는다.
- 변경된 파일 목록(`git diff --name-only ...`)과 diff 본문을 확보한다.
- 변경 사항이 전혀 없으면 그 사실만 보고하고 종료한다.

## 2. 서브에이전트 병렬 실행

Agent 툴로 아래 3개를 **하나의 메시지 안에서 동시에** 호출한다 (순차 호출 금지 — 병렬 실행이 이 워크플로우의 핵심이다):

- `subagent_type: correctness-reviewer`
- `subagent_type: security-reviewer`
- `subagent_type: architecture-reviewer`

세 호출 모두 새로 시작하는 에이전트이므로(이전 대화 맥락 없음), 각 prompt에 반드시 다음을 포함한다:
- 리뷰 대상 diff 전체 (또는 diff를 그대로 재현할 정확한 git 커맨드와 작업 디렉토리)
- 변경된 파일 목록
- "당신의 차원만 리뷰하고 다른 차원(다른 두 에이전트의 담당 영역)은 다루지 말라"는 지시
- 에이전트 정의 파일(`.claude/agents/<name>.md`)에 이미 명시된 출력 포맷을 그대로 따르라는 지시 (재정의하지 말 것)

diff가 너무 커서 한 프롬프트에 다 들어가지 않으면, 파일을 몇 개씩 묶어 같은 subagent_type을 여러 번 병렬로 호출한다 (예: correctness-reviewer를 파일 그룹별로 2개 인스턴스).

## 3. 결과 취합

3개(혹은 그 이상) 에이전트가 반환한 findings를 모아 다음 규칙으로 취합한다:

- **중복 제거**: 같은 file:line을 두 에이전트 이상이 지적하면 더 높은 심각도를 채택하고, 지적 내용을 한 항목으로 병합한다 (예: RLS 우회 시 `user_id` 누락은 security와 architecture 양쪽에서 나올 수 있음 — security 판정을 우선하고 architecture 쪽 중복 항목은 제거).
- **심각도 집계**: 전체 findings에서 🔴 critical / 🟠 major / 🟡 minor / ⚪ nit 개수를 센다.
- **판정 결정**:
  - critical이 하나라도 있으면 `Blocked`
  - critical은 없지만 major가 있으면 `Changes Requested`
  - minor/nit만 있거나 findings가 전혀 없으면 `Approve`

## 4. 출력 (2층 구조)

### 인라인 코멘트 (finding별, 4줄)

취합된 findings를 심각도 높은 순으로 나열한다. 각 항목은 에이전트가 반환한 포맷을 그대로 재사용한다:

```
[심각도] file:line — 제목
TL;DR: 한 줄 설명
✓ Good: (있을 때만)
-> Fix: <코드>
```

### PR 전체 요약 (맨 마지막에 1개)

```
## 리뷰 요약

**판정**: {Approve | Changes Requested | Blocked}

**심각도**: 🔴 {n} · 🟠 {n} · 🟡 {n} · ⚪ {n}

**Walkthrough**: {변경 사항 2~3줄 요약}

**잘된 점**:
- {세 에이전트의 ✓ Good 중 대표적인 것들을 취합, 중복 제거}

**Critical / Major**:
- {critical·major만 나열 — 없으면 "없음"}

**다음 액션**:
- {구체적으로 무엇을 먼저 고쳐야 하는지}
```

## 주의사항

- 서브에이전트는 읽기 전용이다 (코드를 수정하지 않는다). 발견된 문제의 실제 수정은 이 리뷰 결과를 사용자가 확인한 뒤 별도로 진행한다.
- 세 에이전트 중 하나가 "해당 차원 이슈 없음"이라고만 답해도 정상이다 — 억지로 findings를 만들어내지 않는다.
- PR 요약의 "잘된 점"과 "Critical/Major"는 반드시 위에서 취합한 인라인 findings에서만 뽑는다 — 새로 지어내지 않는다.
