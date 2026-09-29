export type Track = "review" | "qa";

export type ReviewCase = {
  track: "review";
  id: string;
  expect: "violation" | "pass";
  /** expect=violation일 때 반드시 잡아야 하는 룰 (prompts.ts의 RULES) */
  rule?: string;
  /** 리뷰 대상 코드 (본문) */
  input: string;
};

export type QaCase = {
  track: "qa";
  id: string;
  /** 답변에 반드시 담겨야 할 사실 */
  must: string[];
  /** 답변에 있으면 안 되는 주장 */
  must_not: string[];
  /** 질문이 틀린 전제를 깔고 있어 반박해야 하는 가드 케이스 */
  false_premise: boolean;
  /** 질문 (본문) */
  input: string;
};

export type Case = ReviewCase | QaCase;

export type Verdict = { pass: boolean; reason: string };

export type CaseResult = { track: Track; id: string; pass: boolean; reason: string };
