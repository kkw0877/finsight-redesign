import type { OncallAlert } from "@/types/oncall";

// `..` 같은 점-only 세그먼트(경로 이탈)는 거절한다.
const REPO_PATTERN = /^(?!\.+\/)[\w.-]+\/(?!\.+$)[\w.-]+$/;

/**
 * 서버리스는 `claude -p`를 띄울 수 없으므로 alert 처리는 CI(repository_dispatch)에 위임한다.
 * client_payload는 최상위 키 10개 제한이 있어 `{ event_id, alert }`로 묶는다. 실패 시 응답 본문은
 * 에러에 담지 않는다(상태코드만).
 */
export async function dispatchOncallAlert(eventId: string, alert: OncallAlert): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.ONCALL_GITHUB_REPO;
  if (!token) throw new Error("GITHUB_DISPATCH_TOKEN이 설정되지 않았습니다");
  if (!repo || !REPO_PATTERN.test(repo)) {
    throw new Error("ONCALL_GITHUB_REPO가 없거나 owner/name 형식이 아닙니다");
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "finsight-oncall",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "posthog-alert",
      client_payload: { event_id: eventId, alert },
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`GitHub dispatch failed: ${res.status}`);
}
