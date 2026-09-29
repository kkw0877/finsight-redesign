import type { QaCase, ReviewCase, Verdict } from "./types.ts";

/**
 * CLAUDE.md "아키텍처 규칙"의 CRITICAL 룰 요약. 사람이 CLAUDE.md와 맞춰 유지한다 —
 * 룰이 바뀌면 여기와 cases/review/를 함께 고친다.
 */
export const RULES = [
  { id: "external-service-boundary", text: "Supabase/Claude/Polar 등 외부 서비스 호출은 src/app/api/ 라우트 핸들러(또는 그 안에서 부르는 src/services/ 래퍼)에서만 한다. 클라이언트 컴포넌트에서 외부 서비스 SDK를 직접 호출하면 위반." },
  { id: "upload-ttl", text: "업로드 원본 파일(CSV/PDF)은 24시간 TTL로 정리되는 임시 저장소에만 둔다. 이 TTL을 우회하는 영구 저장 경로를 추가하면 위반." },
  { id: "service-role-user-id", text: "service role 키(RLS 우회)를 쓰는 코드는 RLS가 없다고 전제하고 모든 쿼리에 user_id 조건을 명시해야 한다. user_id 조건 없는 쿼리는 위반." },
  { id: "error-message-leak", text: "내부 예외 메시지나 스택 트레이스를 사용자에게 그대로 노출하면 위반. 항상 이해 가능한 메시지로 매핑한다." },
] as const;

export const RULE_IDS = RULES.map((r) => r.id);

export function buildReviewerSystem(): string {
  return [
    "너는 Finsight 프로젝트의 경량 코드 리뷰어다. 주어진 코드가 아래 CRITICAL 룰을 위반하는지만 본다. 스타일·성능·기타 의견은 내지 않는다.",
    "",
    ...RULES.map((r) => `- [${r.id}] ${r.text}`),
    "",
    "출력 형식: 첫 줄은 `VERDICT: VIOLATION <rule-id>` 또는 `VERDICT: PASS` 중 하나. 이어서 근거를 1~3줄로 쓴다.",
    "위반이 확실하지 않으면 PASS로 답한다. 룰과 무관한 코드는 위반이 아니다.",
  ].join("\n");
}

export function buildReviewJudgePrompt(c: ReviewCase, reviewerOutput: string): string {
  const expectation =
    c.expect === "violation"
      ? `이 코드는 사람이 라벨링한 정답이 "룰 위반"이다. 위반 룰: ${c.rule}. 리뷰어가 이 코드에서 ${c.rule} 위반을 지적했어야 pass다. 다른 룰만 지적했거나 PASS로 답했으면 fail.`
      : `이 코드는 사람이 라벨링한 정답이 "정상(위반 없음)"이다. 리뷰어가 어떤 룰 위반도 지적하지 않고 PASS로 답했어야 pass다. 위반을 지적했으면(오탐) fail.`;
  return [
    "너는 LLM 리뷰어의 출력을 채점하는 엄격한 채점관이다.",
    "",
    expectation,
    "",
    "<code>", c.input, "</code>",
    "",
    "<reviewer_output>", reviewerOutput, "</reviewer_output>",
    "",
    '다른 설명 없이 JSON 한 개만 출력: {"pass": true|false, "reason": "한 문장 근거"}',
  ].join("\n");
}

export function buildQaSystem(claudeMd: string): string {
  return [
    "너는 Finsight 저장소에서 일하는 개발자다. 아래는 이 저장소의 CLAUDE.md(프로젝트 지침)다. 이것을 근거로 질문에 한국어로 간결히 답한다.",
    "질문의 전제가 CLAUDE.md와 다르면 그대로 따르지 말고 전제부터 바로잡는다. CLAUDE.md에 없는 내용은 모른다고 말한다.",
    "",
    "<CLAUDE.md>",
    claudeMd,
    "</CLAUDE.md>",
  ].join("\n");
}

export function buildQaJudgePrompt(c: QaCase, answer: string): string {
  return [
    "너는 답변을 사실 기준으로 채점하는 엄격한 채점관이다. 사람이 라벨링한 기준만 쓴다.",
    "- must의 모든 항목이 답변에 (표현이 달라도 의미상) 담겨 있어야 한다.",
    "- must_not 항목은 답변이 주장·권유해서는 안 된다. 그런 주장을 반박하거나 부정하는 문장은 위반이 아니다.",
    ...(c.false_premise ? ["- 이 질문은 틀린 전제를 깔고 있다(틀린 전제 가드). 답변이 전제를 그대로 받아들이면 fail."] : []),
    "",
    "<question>", c.input, "</question>",
    "",
    "<must>", ...c.must.map((m) => `- ${m}`), "</must>",
    "<must_not>", ...c.must_not.map((m) => `- ${m}`), "</must_not>",
    "",
    "<answer>", answer, "</answer>",
    "",
    '다른 설명 없이 JSON 한 개만 출력: {"pass": true|false, "reason": "한 문장 근거"}',
  ].join("\n");
}

/** judge 응답에서 첫 JSON 객체를 뽑아 검증한다. pass는 반드시 boolean. */
export function parseVerdict(text: string): Verdict {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`judge 응답에 JSON이 없습니다: ${text.slice(0, 200)}`);
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  const obj = parsed as { pass?: unknown; reason?: unknown };
  if (typeof obj.pass !== "boolean") throw new Error("judge 응답의 pass가 boolean이 아닙니다");
  return { pass: obj.pass, reason: typeof obj.reason === "string" ? obj.reason : "" };
}

/** CLAUDE.md의 `@경로` import 줄을 파일 내용으로 펼친다 (1단계). 못 읽으면 원문 유지. */
export function expandImports(text: string, read: (path: string) => string | undefined): string {
  return text
    .split("\n")
    .map((line) => {
      const m = line.match(/^@(\S+)\s*$/);
      return (m && read(m[1])) ?? line;
    })
    .join("\n");
}
