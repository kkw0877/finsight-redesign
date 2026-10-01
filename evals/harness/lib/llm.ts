// 네트워크·비용이 발생하는 유일한 모듈. 테스트(npm test)에서는 import하지 않는다.
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Anthropic as PostHogAnthropic } from "@posthog/ai/anthropic";
import { PostHog } from "posthog-node";

/**
 * subject는 temperature 0이 필요해서 Sonnet 4.6을 쓴다 — Sonnet 5.5는 기본값이 아닌
 * sampling 파라미터를 400으로 거부한다. judge(Opus 5.5)는 subject와 다른 모델이어야 한다.
 */
export const SUBJECT_MODEL = process.env.EVAL_SUBJECT_MODEL ?? "claude-sonnet-4-6";
export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-opus-5-5";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const evalSessionId = randomUUID();

let client: Anthropic | undefined;
let posthog: PostHog | undefined;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다 (.env.local 또는 환경변수)");

  if (!projectToken || !host) {
    if (process.env.NODE_ENV === "development") {
      const variableName = !projectToken ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN" : "NEXT_PUBLIC_POSTHOG_HOST";
      throw new Error(
        `${variableName} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variableName} is configured`,
      );
    }
    return (client ??= new Anthropic({ apiKey }));
  }

  posthog ??= new PostHog(projectToken, {
    host,
    privacyMode: false,
    enableExceptionAutocapture: true,
  });
  return (client ??= new PostHogAnthropic({ apiKey, posthog }) as unknown as Anthropic);
}

async function text(params: Anthropic.MessageCreateParamsNonStreaming): Promise<string> {
  const res = await getClient().messages.create({
    ...params,
    ...(posthog
      ? {
          posthogTraceId: randomUUID(),
          posthogProperties: { $ai_session_id: evalSessionId },
        }
      : {}),
  });
  if (res.stop_reason === "refusal") throw new Error(`모델이 응답을 거절했습니다 (${res.model})`);
  if (res.stop_reason === "max_tokens") throw new Error(`max_tokens에서 잘렸습니다 (${res.model})`);
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
}

/** subject: 결정적 출력을 위해 temperature 0. */
export function runSubject(system: string, user: string): Promise<string> {
  return text({
    model: SUBJECT_MODEL,
    max_tokens: 2048,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
  });
}

/** judge: Opus는 thinking을 끌 수 없고 temperature를 받지 않으므로 effort로만 조절한다. */
export function runJudge(prompt: string): Promise<string> {
  return text({
    model: JUDGE_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: prompt }],
  });
}

export async function shutdownLLMObservability(): Promise<void> {
  await posthog?.shutdown();
}
