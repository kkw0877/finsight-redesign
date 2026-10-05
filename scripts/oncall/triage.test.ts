import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { containsSecret } from "./redact.mjs";
import { dedupLabel, decide, finalizeBody, normalizeVerdict, renderIssue } from "./triage.mjs";

const alert = {
  event: "$error_tracking_issue_created",
  issueId: "issue-1",
  name: "TypeError: x is undefined",
  description: "at analysis stage",
  fingerprint: "fp",
  timestamp: "2026-10-05T00:00:00Z",
  currentBucketValue: null,
  computedBaseline: null,
  url: null,
};
const stats = { available: true, totalEvents: 3, users: 1, sessions: 1, firstSeen: "2026-10-05T00:00:00Z", lastSeen: "2026-10-05T00:01:00Z", lastHourEvents: 3 };
const noise = {
  verdict: "noise", confidence: "high", core_path: false, title: "봇 크롤러 오류",
  what: "봇 UA에서 발생", since_when: "상시", affected_users: "1명(봇)", suspected_cause: "최근 커밋과 무관",
  blast_radius: "없음", recommended_action: "없음", reasoning: "docs/ONCALL 노이즈 목록의 봇 패턴", noise_pattern: "bot-ua",
};
const signal = { ...noise, verdict: "signal", noise_pattern: undefined, title: "분석 단계 TypeError", reasoning: "새 에러, 핵심 경로" };

describe("normalizeVerdict", () => {
  it("올바른 판정은 통과", () => expect(normalizeVerdict(noise)).not.toBeNull());
  it.each([
    ["null", null],
    ["verdict 값 이상", { ...noise, verdict: "maybe" }],
    ["confidence 없음", { ...noise, confidence: undefined }],
    ["noise인데 noise_pattern 없음", { ...noise, noise_pattern: "" }],
    ["signal인데 recommended_action 없음", { ...signal, recommended_action: "" }],
  ])("%s → null", (_l, v) => expect(normalizeVerdict(v)).toBeNull());
});

describe("decide (fail-closed 정책)", () => {
  it("에이전트 판정이 없거나 깨졌으면 신호/낮음으로 사람을 깨운다", () => {
    const d = decide({ alert, stats, verdict: null });
    expect(d.action).toBe("escalate");
    expect(d.verdict.confidence).toBe("low");
    expect(d.policyNotes.join()).toMatch(/판정 실패/);
  });

  it("확신 높은 단발 노이즈는 기록만 하고 종료", () => {
    expect(decide({ alert, stats, verdict: normalizeVerdict(noise) }).action).toBe("record");
  });

  it("경계(noise + 확신도 낮음)는 신호로 기울이고 확신도를 낮음으로 표기", () => {
    const d = decide({ alert, stats, verdict: normalizeVerdict({ ...noise, confidence: "low" }) });
    expect(d.action).toBe("escalate");
    expect(d.verdict.verdict).toBe("signal");
    expect(d.verdict.confidence).toBe("low");
  });

  it.each([
    ["급증(spiking) alert", { ...alert, event: "$error_tracking_issue_spiking" }, stats, noise],
    ["여러 유저", alert, { ...stats, users: 2 }, noise],
    ["핵심 경로", alert, stats, { ...noise, core_path: true }],
  ])("%s는 에이전트가 노이즈라 해도 신호 하한선으로 escalate", (_l, a, s, v) => {
    const d = decide({ alert: a, stats: s, verdict: normalizeVerdict(v) });
    expect(d.action).toBe("escalate");
    expect(d.verdict.verdict).toBe("signal");
    expect(d.policyNotes.length).toBeGreaterThan(0);
  });

  it("통계를 못 가져왔으면 확신도 high를 medium으로 낮춘다", () => {
    const d = decide({ alert, stats: { available: false, reason: "no key" }, verdict: normalizeVerdict(signal) });
    expect(d.action).toBe("escalate");
    expect(d.verdict.confidence).toBe("medium");
  });
});

describe("dedupLabel", () => {
  it("같은 issueId는 같은 라벨, 다른 issueId는 다른 라벨, 50자 이내", () => {
    expect(dedupLabel(alert)).toBe(dedupLabel({ ...alert, name: "다른 이름" }));
    expect(dedupLabel(alert)).not.toBe(dedupLabel({ ...alert, issueId: "issue-2" }));
    expect(dedupLabel(alert)).toMatch(/^oncall:[0-9a-f]{12}$/);
  });
});

describe("renderIssue", () => {
  const d = decide({ alert, stats, verdict: normalizeVerdict(signal) });

  it("분석 5요소와 확신도를 담고, 빈손 escalation이 아니다", () => {
    const { title, body, labels } = renderIssue({ alert, stats, decision: d, runUrl: "https://github.com/o/r/actions/runs/1" });
    expect(title).toMatch(/^\[oncall\] /);
    for (const h of ["무슨 에러", "언제부터", "의심 원인", "영향 범위", "권장 액션", "확신도"]) expect(body).toContain(h);
    expect(body).toContain("actions/runs/1");
    expect(labels).toEqual(expect.arrayContaining(["oncall", "oncall:signal", "confidence:high", dedupLabel(alert)]));
  });

  it("급증 alert면 spike 라벨, 본문의 시크릿은 마스킹", () => {
    const spiking = { ...alert, event: "$error_tracking_issue_spiking", description: "key sk-ant-api03-AbCdEf_123-xyz456789" };
    const dd = decide({ alert: spiking, stats, verdict: normalizeVerdict(signal) });
    const { body, labels } = renderIssue({ alert: spiking, stats, decision: dd, runUrl: "u" });
    expect(labels).toContain("oncall:spike");
    expect(containsSecret(body)).toBe(false);
  });
});

describe("에이전트 서술 무해화 / 안전 본문", () => {
  it("에이전트가 쓴 @멘션·마크다운 링크·URL은 이슈 본문에서 무력화된다", () => {
    const evil = { ...signal, what: "@octocat 확인 [여기](https://evil.example/x) https://evil.example/y" };
    const d = decide({ alert, stats, verdict: normalizeVerdict(evil) });
    const { body } = renderIssue({ alert, stats, decision: d, runUrl: "u" });
    expect(body).not.toMatch(/@octocat/);
    expect(body).not.toContain("evil.example");
  });

  it("currentBucketValue가 undefined여도 'undefined'가 본문에 나오지 않는다", () => {
    const { currentBucketValue: _drop, ...partial } = alert;
    void _drop;
    const d = decide({ alert: partial, stats, verdict: normalizeVerdict(signal) });
    const { body } = renderIssue({ alert: partial, stats, decision: d, runUrl: "u" });
    expect(body).not.toContain("undefined");
  });

  it("finalizeBody: 시크릿이 남아 있으면 던지지 않고 alert 링크만 있는 최소 본문으로 대체", () => {
    const raw = "details sk-ant-api03-AbCdEf_123-xyz456789";
    const out = finalizeBody(raw, { alert, runUrl: "https://x/run/1" });
    expect(containsSecret(out)).toBe(false);
    expect(out).toContain("issue-1");
    expect(out).toContain("https://x/run/1");
    expect(finalizeBody("clean body", { alert, runUrl: "u" })).toBe("clean body");
  });
});

describe("CLI plan", () => {
  const run = (verdict: unknown, a = alert) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "triage-"));
    fs.writeFileSync(path.join(dir, "alert.json"), JSON.stringify(a));
    fs.writeFileSync(path.join(dir, "stats.json"), JSON.stringify(stats));
    if (verdict !== undefined) fs.writeFileSync(path.join(dir, "verdict.json"), typeof verdict === "string" ? verdict : JSON.stringify(verdict));
    execFileSync("node", [path.join(__dirname, "triage.mjs"), "plan", "--dir", dir, "--run-url", "https://x/run/1"]);
    return { dir, plan: JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8")) };
  };

  it("verdict.json이 없거나 JSON이 깨져도 escalate 플랜을 만든다 (조용히 삼키지 않음)", () => {
    expect(run(undefined).plan.action).toBe("escalate");
    expect(run("{broken").plan.action).toBe("escalate");
  });

  it("노이즈는 record 플랜 + issue 본문 없음, 신호는 이슈 본문 파일 생성", () => {
    const n = run(noise);
    expect(n.plan.action).toBe("record");
    expect(fs.existsSync(path.join(n.dir, "issue-body.md"))).toBe(false);
    const s = run(signal);
    expect(s.plan).toMatchObject({ action: "escalate", dedupLabel: dedupLabel(alert) });
    expect(fs.existsSync(path.join(s.dir, "issue-body.md"))).toBe(true);
    expect(fs.readFileSync(path.join(s.dir, "summary.md"), "utf8")).toContain("issue-1");
  });
});
