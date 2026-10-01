import Anthropic from "@anthropic-ai/sdk";
import { Anthropic as PostHogAnthropic } from "@posthog/ai/anthropic";
import { PostHog } from "posthog-node";

export interface ClaudeClient {
  client: Anthropic;
  posthog?: PostHog;
}

export interface ClaudeObservabilityContext {
  posthogDistinctId: string;
  posthogTraceId: string;
  posthogProperties: { $ai_session_id: string };
}

/**
 * 싱글턴 금지 — step 0의 Supabase 클라이언트 팩토리들과 동일한 원칙(요청마다 새로 생성).
 */
export function createClaudeClient(): ClaudeClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다");
  }

  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!projectToken || !host) {
    if (process.env.NODE_ENV === "development") {
      const variableName = !projectToken
        ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
        : "NEXT_PUBLIC_POSTHOG_HOST";
      throw new Error(
        `${variableName} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variableName} is configured`,
      );
    }
    return { client: new Anthropic({ apiKey }) };
  }

  const posthog = new PostHog(projectToken, {
    host,
    // 카드 거래 내역(프롬프트/응답 본문)을 PostHog에 저장하지 않는다 — ADR-004 개인정보 최소화.
    privacyMode: true,
    enableExceptionAutocapture: true,
  });

  return {
    client: new PostHogAnthropic({ apiKey, posthog }) as unknown as Anthropic,
    posthog,
  };
}
