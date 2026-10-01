// 하네스 품질 eval 회귀 게이트. 사용법: npm run eval [-- review|qa]
// golden set을 subject에 돌리고 Opus judge가 pass/fail 채점, 하나라도 실패하면 exit 1.
import { exitCode, formatReport, summarize, checkBalance } from "./lib/aggregate.ts";
import { JUDGE_MODEL, SUBJECT_MODEL, runJudge, runSubject, shutdownLLMObservability } from "./lib/llm.ts";
import { loadCases, readLiveClaudeMd } from "./lib/load.ts";
import { buildQaJudgePrompt, buildQaSystem, buildReviewJudgePrompt, buildReviewerSystem, parseVerdict } from "./lib/prompts.ts";
import type { Case, CaseResult } from "./lib/types.ts";

async function grade(c: Case, reviewerSystem: string, qaSystem: string): Promise<CaseResult> {
  try {
    const output = await runSubject(c.track === "review" ? reviewerSystem : qaSystem, c.input);
    const prompt = c.track === "review" ? buildReviewJudgePrompt(c, output) : buildQaJudgePrompt(c, output);
    const verdict = parseVerdict(await runJudge(prompt));
    return { track: c.track, id: c.id, ...verdict };
  } catch (err) {
    // 호출/파싱 실패는 조용히 통과시키지 않고 실패로 센다.
    return { track: c.track, id: c.id, pass: false, reason: `실행 오류: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function main(): Promise<number> {
  const only = process.argv[2];
  if (only && only !== "review" && only !== "qa") {
    console.error("사용법: npm run eval [-- review|qa]");
    return 1;
  }

  const all = loadCases();
  const problems = checkBalance(all);
  if (problems.length > 0) {
    console.error(`golden set 무결성 오류 (비용 발생 전에 중단):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    return 1;
  }

  const cases = only ? all.filter((c) => c.track === only) : all;
  console.log(`subject=${SUBJECT_MODEL} (temp 0)  judge=${JUDGE_MODEL}  cases=${cases.length}`);

  const reviewerSystem = buildReviewerSystem();
  const qaSystem = buildQaSystem(readLiveClaudeMd());
  const results = await Promise.all(cases.map((c) => grade(c, reviewerSystem, qaSystem)));

  const summary = summarize(results);
  console.log(formatReport(summary));
  return exitCode(summary);
}

let exitStatus = 1;
try {
  exitStatus = await main();
} finally {
  await shutdownLLMObservability();
}
process.exit(exitStatus);
