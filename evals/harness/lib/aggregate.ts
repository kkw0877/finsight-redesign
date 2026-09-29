import { RULE_IDS } from "./prompts.ts";
import type { Case, CaseResult, Track } from "./types.ts";

export type Summary = {
  total: number;
  passed: number;
  failed: number;
  byTrack: Record<Track, { total: number; passed: number }>;
  failures: CaseResult[];
};

export function summarize(results: CaseResult[]): Summary {
  const byTrack: Summary["byTrack"] = { review: { total: 0, passed: 0 }, qa: { total: 0, passed: 0 } };
  for (const r of results) {
    byTrack[r.track].total += 1;
    if (r.pass) byTrack[r.track].passed += 1;
  }
  const passed = results.filter((r) => r.pass).length;
  return { total: results.length, passed, failed: results.length - passed, byTrack, failures: results.filter((r) => !r.pass) };
}

/** 회귀 게이트: 하나라도 실패하거나, 채점된 게 하나도 없으면 1. */
export function exitCode(s: Summary): 0 | 1 {
  return s.total === 0 || s.failed > 0 ? 1 : 0;
}

export function formatReport(s: Summary): string {
  const lines = [
    `review ${s.byTrack.review.passed}/${s.byTrack.review.total}  qa ${s.byTrack.qa.passed}/${s.byTrack.qa.total}  — 전체 ${s.passed}/${s.total}`,
  ];
  for (const f of s.failures) lines.push(`  ✗ [${f.track}] ${f.id}: ${f.reason}`);
  lines.push(exitCode(s) === 0 ? "PASS" : "FAIL");
  return lines.join("\n");
}

/** golden set 균형/무결성 문제 목록 (비어 있으면 정상). */
export function checkBalance(cases: Case[]): string[] {
  const problems: string[] = [];

  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) problems.push(`id 중복: ${c.id}`);
    seen.add(c.id);
  }

  const review = cases.flatMap((c) => (c.track === "review" ? [c] : []));
  const qa = cases.flatMap((c) => (c.track === "qa" ? [c] : []));

  if (review.length === 0) problems.push("review 트랙 케이스가 없습니다");
  else {
    if (!review.some((c) => c.expect === "pass")) problems.push("review: 오탐 방지용 pass 케이스가 없습니다");
    for (const rule of RULE_IDS) {
      if (!review.some((c) => c.expect === "violation" && c.rule === rule)) {
        problems.push(`review: 룰 '${rule}'을 덮는 violation 케이스가 없습니다`);
      }
    }
  }

  if (qa.length === 0) problems.push("qa 트랙 케이스가 없습니다");
  else if (!qa.some((c) => c.false_premise)) problems.push("qa: 틀린 전제 반박 가드(false_premise: true) 케이스가 없습니다");

  return problems;
}
