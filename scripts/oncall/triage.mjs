// oncall alert triage의 '결정적' 부분. 에이전트(CI 헤드리스)는 판정(verdict.json)만 쓰고,
// 정책 적용(fail-closed·신호 하한선·경계=신호/낮음)·dedup 키·이슈 렌더링은 여기서 코드로 강제한다.
// 에이전트 말만 믿고 사람을 안 깨우는 사고(조용한 누락)를 막는 것이 목적이다.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containsSecret, redact } from "./redact.mjs";

const VERDICTS = ["noise", "signal"];
const CONFIDENCES = ["high", "medium", "low"];
const TEXT_FIELDS = ["title", "what", "since_when", "affected_users", "suspected_cause", "blast_radius", "recommended_action", "reasoning"];

const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

export function normalizeVerdict(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  if (!VERDICTS.includes(raw.verdict) || !CONFIDENCES.includes(raw.confidence)) return null;
  if (typeof raw.core_path !== "boolean") return null;
  if (!TEXT_FIELDS.every((k) => nonEmpty(raw[k]))) return null;
  if (raw.verdict === "noise" && !nonEmpty(raw.noise_pattern)) return null;
  return raw;
}

export function dedupLabel(alert) {
  return `oncall:${createHash("sha256").update(alert.issueId).digest("hex").slice(0, 12)}`;
}

const FAILSAFE = {
  verdict: "signal",
  confidence: "low",
  core_path: false,
  title: "에이전트 판정 없음 — 수동 확인 필요",
  what: "alert는 도착했지만 자동 분석 결과를 얻지 못했다.",
  since_when: "확인 못 함",
  affected_users: "확인 못 함",
  suspected_cause: "확인 못 함",
  blast_radius: "확인 못 함",
  recommended_action: "PostHog 이슈 링크와 Actions 로그를 직접 확인한다.",
  reasoning: "fail-closed: 판정 실패는 신호로 취급한다.",
};

/** @returns {{action:"record"|"escalate", verdict:any, policyNotes:string[]}} */
export function decide({ alert, stats, verdict }) {
  const policyNotes = [];
  let v = verdict;

  if (!v) {
    policyNotes.push("에이전트 판정 실패(없음/스키마 불일치) → 신호로 처리(fail-closed)");
    return { action: "escalate", verdict: { ...FAILSAFE }, policyNotes };
  }
  v = { ...v };

  if (v.verdict === "noise") {
    const floors = [];
    if (alert.event === "$error_tracking_issue_spiking") floors.push("급증(spiking) alert");
    if (stats?.available && stats.users >= 2) floors.push(`영향 유저 ${stats.users}명`);
    if (v.core_path) floors.push("핵심 경로");
    if (floors.length > 0) {
      policyNotes.push(`신호 하한선: ${floors.join(", ")} — 에이전트의 노이즈 판정을 신호로 올림`);
      v.verdict = "signal";
    } else if (v.confidence === "low") {
      policyNotes.push("경계 케이스(노이즈 확신도 낮음) → 신호로 기울이고 확신도 낮음 유지");
      v.verdict = "signal";
    }
  }

  // 통계를 못 봤으면 근거가 약하다 — 확신도를 한 단계 낮춘다.
  if (!stats?.available && v.confidence === "high") {
    v.confidence = "medium";
    policyNotes.push("PostHog 통계를 가져오지 못해 확신도를 medium으로 제한");
  }

  return { action: v.verdict === "signal" ? "escalate" : "record", verdict: v, policyNotes };
}

// 에이전트가 쓴 문자열은 신뢰하지 않는다(alert 문자열에서 프롬프트 인젝션될 수 있음): @멘션 알림,
// 마크다운 링크, URL(피싱)을 이슈 본문에 그대로 싣지 않는다.
export function sanitizeAgentText(text) {
  return String(text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1 [링크 제거됨]")
    .replace(/https?:\/\/\S+/gi, "[링크 제거됨]")
    .replace(/@(?=[A-Za-z0-9_-])/g, "@\u200b");
}

// 시크릿 유사 문자열이 남아 있어도 throw하지 않는다 — throw하면 plan.json이 안 쓰여 신호가 이슈 없이
// 사라진다(fail-closed 위반). 대신 alert 링크만 있는 최소 본문으로 대체해 escalation은 유지한다.
export function finalizeBody(body, { alert, runUrl }) {
  if (!containsSecret(body)) return body;
  return [
    "> ⚠️ 본문에서 시크릿 유사 문자열이 감지되어 에이전트 서술을 생략했습니다. 수동 확인이 필요합니다.",
    "",
    `- PostHog issue id: \`${alert.issueId}\` (${alert.event})`,
    `- 분석 실행: ${runUrl}`,
  ].join("\n");
}

const fmt = (x) => (x === null || x === undefined ? "확인 못 함" : String(x));

function alertFacts(alert, stats) {
  const lines = [
    `- 이벤트: \`${alert.event}\``,
    `- PostHog issue id: \`${alert.issueId}\``,
    alert.timestamp ? `- alert 시각: ${alert.timestamp}` : null,
    alert.currentBucketValue != null ? `- 급증: 현재 창 ${alert.currentBucketValue}건 / 기준선 ${fmt(alert.computedBaseline)}` : null,
    alert.url ? `- PostHog: ${alert.url}` : null,
    stats?.available
      ? `- 통계: 총 ${stats.totalEvents}건 · ${stats.users}명 · 세션 ${stats.sessions} · 최초 ${fmt(stats.firstSeen)} · 최근 ${fmt(stats.lastSeen)} · 최근 1시간 ${stats.lastHourEvents}건`
      : `- 통계: 가져오지 못함(${fmt(stats?.reason)})`,
  ];
  return lines.filter(Boolean).join("\n");
}

function cleanVerdict(v) {
  return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, typeof val === "string" ? sanitizeAgentText(val) : val]));
}

export function renderIssue({ alert, stats, decision, runUrl }) {
  const v = cleanVerdict(decision.verdict);
  const labels = ["oncall", "oncall:signal", `confidence:${v.confidence}`, dedupLabel(alert)];
  if (alert.event === "$error_tracking_issue_spiking") labels.push("oncall:spike");

  const body = [
    `> 🤖 oncall 에이전트의 **읽기 전용** 1차 분석입니다. prod는 수정하지 않았습니다. 분석 실행: ${runUrl}`,
    "",
    `## 확신도: ${v.confidence === "low" ? "낮음" : v.confidence === "medium" ? "보통" : "높음"} (${v.confidence})`,
    ...(decision.policyNotes.length ? ["", ...decision.policyNotes.map((n) => `- ⚠️ ${n}`)] : []),
    "",
    "## 무슨 에러",
    v.what,
    "",
    "## 언제부터 · 몇 명",
    `- 시점: ${v.since_when}`,
    `- 영향 유저: ${v.affected_users}`,
    "",
    "## 의심 원인 (최근 커밋과 겹치는가)",
    v.suspected_cause,
    "",
    "## 영향 범위",
    v.blast_radius,
    "",
    "## 권장 액션",
    v.recommended_action,
    "",
    "## 판단 근거",
    v.reasoning,
    "",
    "## alert 원자료",
    alertFacts(alert, stats),
    "",
    `<sub>dedup: \`${dedupLabel(alert)}\` — 같은 issue의 후속 alert는 이 이슈에 코멘트로 쌓입니다.</sub>`,
  ].join("\n");

  return { title: `[oncall] ${redact(v.title).slice(0, 110)}`, body: redact(body), labels };
}

export function renderComment({ alert, stats, decision, runUrl }) {
  const v = cleanVerdict(decision.verdict);
  const text = [
    `🔁 같은 issue의 새 alert (\`${alert.event}\`, ${alert.timestamp ?? "시각 불명"}) — 분석 ${runUrl}`,
    `- 확신도: ${v.confidence}${decision.policyNotes.length ? ` · ${decision.policyNotes.join(" / ")}` : ""}`,
    `- 요약: ${v.what}`,
    `- 영향 유저: ${v.affected_users} · 권장 액션: ${v.recommended_action}`,
    alertFacts(alert, stats),
  ].join("\n");
  return redact(text);
}

function renderSummary({ alert, decision, plan }) {
  const v = decision.verdict;
  return redact(
    [
      `### oncall triage: ${plan.action === "escalate" ? "🚨 신호 → escalation" : "🔇 노이즈 → 기록만"}`,
      `- issue: \`${alert.issueId}\` (${alert.event}) — ${alert.name}`,
      `- 판정: ${v.verdict} / 확신도 ${v.confidence}${v.noise_pattern ? ` / 패턴 ${v.noise_pattern}` : ""}`,
      `- 사유: ${v.reasoning}`,
      ...decision.policyNotes.map((n) => `- ⚠️ ${n}`),
    ].join("\n"),
  );
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function plan(dir, runUrl) {
  const alert = readJson(path.join(dir, "alert.json"), null);
  if (!alert?.issueId) throw new Error("alert.json이 없거나 올바르지 않다");
  const stats = readJson(path.join(dir, "stats.json"), { available: false, reason: "stats.json 없음" });
  const verdict = normalizeVerdict(readJson(path.join(dir, "verdict.json"), null));

  const decision = decide({ alert, stats, verdict });
  const out = { action: decision.action, dedupLabel: dedupLabel(alert), verdict: decision.verdict.verdict, confidence: decision.verdict.confidence };

  if (decision.action === "escalate") {
    const issue = renderIssue({ alert, stats, decision, runUrl });
    fs.writeFileSync(path.join(dir, "issue-body.md"), finalizeBody(issue.body, { alert, runUrl }));
    fs.writeFileSync(path.join(dir, "issue-comment.md"), finalizeBody(renderComment({ alert, stats, decision, runUrl }), { alert, runUrl }));
    out.title = issue.title;
    out.labels = issue.labels;
  }
  fs.writeFileSync(path.join(dir, "summary.md"), renderSummary({ alert, decision, plan: out }));
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(out, null, 2));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = (name) => rest[rest.indexOf(name) + 1];
  if (cmd !== "plan" || !arg("--dir")) {
    console.error("usage: triage.mjs plan --dir <dir> --run-url <url>");
    process.exit(2);
  }
  plan(arg("--dir"), arg("--run-url") ?? "(unknown)");
}
