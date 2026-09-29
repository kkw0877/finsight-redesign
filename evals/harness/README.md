# 하네스 품질 eval

Finsight의 **비즈니스 로직이 아니라 "하네스"(CLAUDE.md 룰 + 그것을 읽는 에이전트)의 품질**을 재는 회귀 게이트.
golden set(`cases/**/*.md`)을 subject 모델에 돌리고, 다른 모델(Opus)이 LLM-as-judge로 pass/fail을
채점한다. **하나라도 실패하면 `exit 1`.**

## 실행

```bash
npm test            # 키 없음·무료. 파서/집계/프롬프트 빌더 + golden set 무결성·균형 (vitest)
npm run eval        # 라이브. 네트워크·비용 발생. ANTHROPIC_API_KEY 필요(.env.local 자동 로드)
npm run eval -- qa  # 트랙 하나만 (review | qa)
```

`npm run eval`은 비용을 쓰기 전에 golden set 균형을 먼저 검사하고, 깨져 있으면 바로 중단한다.
API 호출·파싱 실패는 통과로 넘기지 않고 실패로 센다. 채점된 케이스가 0개여도 exit 1.

## 두 트랙

| 트랙 | subject | 무엇을 재나 |
|---|---|---|
| `review` | 경량 리뷰어 (Sonnet 4.6, temp 0). CLAUDE.md CRITICAL 룰 요약을 시스템 프롬프트로 | 코드의 룰 위반을 잡는가 / 정상 코드를 오탐하지 않는가 |
| `qa` | 라이브 `CLAUDE.md`(`@AGENTS.md` 펼침)를 컨텍스트로 받은 응답자 | 규약·예외처리·gotcha 질문에 사실대로 답하는가, 틀린 전제를 반박하는가 |

- judge는 항상 Opus 5.5 — subject와 다른 모델이어야 자기 채점 편향을 피한다.
- subject가 Sonnet **4.6**인 이유: temp 0이 필요한데 Sonnet 5.5는 기본값이 아닌 sampling 파라미터를 400으로 거부한다.
  `EVAL_SUBJECT_MODEL` / `EVAL_JUDGE_MODEL`로 바꿀 수 있다.
- Opus judge는 thinking을 끌 수 없고 temp도 받지 않아 `effort: medium`으로만 조절한다(판정이 완전 결정적이진 않다).

## 케이스 형식

`cases/<track>/<id>.md` — 파일명 = `id`, 디렉터리 = `track` (로더가 강제). frontmatter가 **라벨**, 본문이 **입력**.

```md
---                         ---
id: r4-error-message-leak   id: q5-tailwind-false-premise
track: review               track: qa
expect: violation           false_premise: true      # 틀린 전제 반박 가드
rule: error-message-leak    must:                    # 답변에 담겨야 할 사실
---                           - 이 프로젝트는 Tailwind를 쓰지 않는다
(본문 = 리뷰할 코드)          must_not:                # 주장하면 안 되는 것
                              - Tailwind 설정 안내
                            ---
                            (본문 = 질문)
```

`rule`은 `lib/prompts.ts`의 `RULES` id 중 하나여야 한다.

## 원칙

1. **작게 시작한다.** 지금은 review 5개(위반 4 + 오탐 방지 정상 1), qa 5개(틀린 전제 가드 1 포함).
   케이스는 실제로 하네스가 틀린 순간을 만났을 때 하나씩 늘린다 — 양보다 각 케이스가 무엇을 지키는지가 중요하다.
2. **라벨은 사람이 박제한다.** `expect`/`rule`/`must`/`must_not`은 사람이 CLAUDE.md·ADR을 보고 직접 쓴다.
   LLM이 만든 라벨이나 모델 출력에서 역산한 라벨을 넣지 않는다. 정답을 모델이 정하면 eval이 모델을 재는 게 아니라 모델과 합의하게 된다.
   라벨을 고치는 것은 룰 변경이므로 diff 리뷰를 거친다.
3. **모델이 틀렸다고 라벨을 바꾸지 않는다.** 실패는 (a) 하네스가 나빠졌거나 (b) 룰이 바뀌었는데 라벨이 옛것인 경우뿐이다. (b)면 CLAUDE.md와 `RULES`와 라벨을 함께 고친다.
4. **균형을 코드로 지킨다.** `npm test`가 룰마다 violation 케이스 ≥1, pass 케이스 ≥1, false_premise 가드 ≥1, id 중복 없음을 검사한다.
   그래서 룰을 추가하면 그 룰의 케이스를 만들 때까지 테스트가 빨개진다.

## 구조

```
lib/parse.ts       frontmatter/케이스 파서 (순수)
lib/aggregate.ts   집계·exit code·균형 검사 (순수)
lib/prompts.ts     RULES, 프롬프트 빌더, judge 응답 파서, @import 펼침 (순수)
lib/load.ts        cases/ 로딩, 라이브 CLAUDE.md 읽기 (fs만)
lib/llm.ts         Anthropic 호출 — 유일한 네트워크 지점
run.ts             `npm run eval` 진입점
```

## 알려둘 한계

- `RULES`(리뷰어 프롬프트)는 CLAUDE.md의 CRITICAL 룰을 **사람이 요약해 옮긴 것**이다. CLAUDE.md가 바뀌면 자동으로 따라오지 않는다 (qa 트랙은 라이브 CLAUDE.md라 자동).
- 케이스가 10개라 통과율이 아니라 "이 10개는 지킨다"는 회귀 신호로만 읽는다.
