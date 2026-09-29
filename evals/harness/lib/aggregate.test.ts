// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkBalance, exitCode, formatReport, summarize } from "./aggregate.ts";
import { RULE_IDS } from "./prompts.ts";
import type { Case, CaseResult } from "./types.ts";

const r = (track: "review" | "qa", id: string, pass: boolean): CaseResult => ({ track, id, pass, reason: pass ? "ok" : "bad" });

describe("summarize / exitCode", () => {
  it("트랙별 합계와 실패 목록을 낸다", () => {
    const s = summarize([r("review", "a", true), r("review", "b", false), r("qa", "c", true)]);
    expect(s).toMatchObject({ total: 3, passed: 2, failed: 1 });
    expect(s.byTrack.review).toEqual({ total: 2, passed: 1 });
    expect(s.byTrack.qa).toEqual({ total: 1, passed: 1 });
    expect(s.failures.map((f) => f.id)).toEqual(["b"]);
  });

  it("전부 통과해야 exit 0", () => {
    expect(exitCode(summarize([r("qa", "a", true)]))).toBe(0);
  });

  it("하나라도 실패하면 exit 1", () => {
    expect(exitCode(summarize([r("qa", "a", true), r("qa", "b", false)]))).toBe(1);
  });

  it("채점된 케이스가 0개면 조용히 통과하지 않고 exit 1", () => {
    expect(exitCode(summarize([]))).toBe(1);
  });

  it("리포트에 실패 사유가 들어간다", () => {
    expect(formatReport(summarize([r("qa", "b", false)]))).toContain("b");
    expect(formatReport(summarize([r("qa", "b", false)]))).toContain("bad");
  });
});

const rev = (id: string, expectV: "violation" | "pass", rule?: (typeof RULE_IDS)[number]): Case => ({
  track: "review", id, expect: expectV, rule, input: "code",
});
const qa = (id: string, false_premise = false): Case => ({
  track: "qa", id, must: ["m"], must_not: ["n"], false_premise, input: "q?",
});

describe("checkBalance", () => {
  const good: Case[] = [...RULE_IDS.map((rule, i) => rev(`v${i}`, "violation", rule)), rev("ok", "pass"), qa("q1", true)];

  it("균형 잡힌 세트는 문제가 없다", () => {
    expect(checkBalance(good)).toEqual([]);
  });

  it("정상(pass) 케이스가 없으면 지적한다", () => {
    expect(checkBalance(good.filter((c) => !(c.track === "review" && c.expect === "pass"))).join()).toMatch(/pass/);
  });

  it("룰을 덮는 violation 케이스가 없으면 지적한다", () => {
    expect(checkBalance(good.filter((c) => !(c.track === "review" && c.rule === RULE_IDS[0]))).join()).toContain(RULE_IDS[0]);
  });

  it("틀린 전제 반박 가드가 없으면 지적한다", () => {
    expect(checkBalance(good.map((c) => (c.track === "qa" ? { ...c, false_premise: false } : c))).join()).toMatch(/false_premise/);
  });

  it("id가 중복이면 지적한다", () => {
    expect(checkBalance([...good, qa("q1")]).join()).toMatch(/중복/);
  });

  it("트랙이 하나도 없으면 지적한다", () => {
    expect(checkBalance(good.filter((c) => c.track === "qa")).join()).toMatch(/review/);
  });
});
