// alert의 issue에 대한 영향 통계(몇 명/언제부터/급증 여부)를 PostHog에서 읽기 전용으로 가져온다.
// 에이전트는 네트워크·시크릿이 없으므로, 필요한 수치는 이 결정적 단계가 stats.json으로 건네준다.
// 실패해도 던지지 않는다 — 통계 없이도 triage는 계속되고, 확신도만 낮아진다(triage.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUERY = `
SELECT count(), count(DISTINCT person_id), count(DISTINCT properties.$session_id),
       min(timestamp), max(timestamp), countIf(timestamp > now() - INTERVAL 1 HOUR)
FROM events
WHERE event = '$exception'
  AND properties.$exception_issue_id = {issue_id}
  AND timestamp > now() - INTERVAL 30 DAY`;

/** @param {{issueId:string, env?:Record<string,string|undefined>, fetchImpl?:typeof fetch}} o
 * @returns {Promise<any>} */
export async function fetchStats({ issueId, env = process.env, fetchImpl = fetch }) {
  const key = env.POSTHOG_PERSONAL_API_KEY;
  const project = env.POSTHOG_PROJECT_ID;
  const host = (env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
  if (!key || !project) return { available: false, reason: "POSTHOG_PERSONAL_API_KEY/POSTHOG_PROJECT_ID 미설정" };

  try {
    const res = await fetchImpl(`${host}/api/projects/${encodeURIComponent(project)}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: QUERY, values: { issue_id: issueId } } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { available: false, reason: `PostHog HTTP ${res.status}` };
    const row = (await res.json()).results?.[0];
    if (!row) return { available: false, reason: "PostHog 결과 없음" };
    const [totalEvents, users, sessions, firstSeen, lastSeen, lastHourEvents] = row;
    return { available: true, totalEvents, users, sessions, firstSeen, lastSeen, lastHourEvents };
  } catch (err) {
    return { available: false, reason: `PostHog 호출 실패(${err?.name ?? "Error"})` };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  const alert = JSON.parse(fs.readFileSync(path.join(dir, "alert.json"), "utf8"));
  const stats = await fetchStats({ issueId: alert.issueId });
  fs.writeFileSync(path.join(dir, "stats.json"), JSON.stringify(stats, null, 2));
}
