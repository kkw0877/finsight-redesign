// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RULE_IDS,
  buildQaJudgePrompt,
  buildReviewJudgePrompt,
  buildReviewerSystem,
  expandImports,
  parseVerdict,
} from "./prompts.ts";

describe("parseVerdict", () => {
  it("순수 JSON을 파싱한다", () => {
    expect(parseVerdict('{"pass": true, "reason": "ok"}')).toEqual({ pass: true, reason: "ok" });
  });

  it("코드펜스/잡설이 섞여도 첫 JSON 객체를 뽑는다", () => {
    expect(parseVerdict('판정:\n```json\n{"pass": false, "reason": "누락"}\n```')).toEqual({ pass: false, reason: "누락" });
  });

  it("pass가 boolean이 아니면 던진다 (문자열 'true'를 통과로 치지 않는다)", () => {
    expect(() => parseVerdict('{"pass": "true", "reason": "x"}')).toThrow();
  });

  it("JSON이 없으면 던진다", () => {
    expect(() => parseVerdict("모르겠음")).toThrow();
  });
});

describe("expandImports", () => {
  it("@경로 줄을 파일 내용으로 치환한다", () => {
    const files: Record<string, string> = { "AGENTS.md": "에이전트 규칙" };
    expect(expandImports("# 제목\n@AGENTS.md\n끝", (p) => files[p])).toBe("# 제목\n에이전트 규칙\n끝");
  });

  it("읽을 수 없는 import는 원문을 유지한다", () => {
    expect(expandImports("@없음.md", () => undefined)).toBe("@없음.md");
  });
});

describe("프롬프트 빌더", () => {
  it("리뷰어 시스템 프롬프트에 모든 룰 id가 들어간다", () => {
    const s = buildReviewerSystem();
    for (const id of RULE_IDS) expect(s).toContain(id);
  });

  it("리뷰 judge 프롬프트는 기대 라벨(violation+rule / pass)을 담는다", () => {
    const v = buildReviewJudgePrompt({ track: "review", id: "x", expect: "violation", rule: "upload-ttl", input: "CODE" }, "OUT");
    expect(v).toContain("upload-ttl");
    expect(v).toContain("OUT");
    const p = buildReviewJudgePrompt({ track: "review", id: "y", expect: "pass", input: "CODE" }, "OUT");
    expect(p).toMatch(/위반[\s\S]*(없|지적하지)/);
  });

  it("qa judge 프롬프트는 must/must_not/질문/답변을 담고 false_premise를 표시한다", () => {
    const p = buildQaJudgePrompt(
      { track: "qa", id: "q", must: ["MUST1"], must_not: ["NOT1"], false_premise: true, input: "QUESTION" },
      "ANSWER",
    );
    for (const s of ["MUST1", "NOT1", "QUESTION", "ANSWER", "틀린 전제"]) expect(p).toContain(s);
  });
});
