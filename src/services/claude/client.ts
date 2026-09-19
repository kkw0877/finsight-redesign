import Anthropic from "@anthropic-ai/sdk";

/**
 * 싱글턴 금지 — step 0의 Supabase 클라이언트 팩토리들과 동일한 원칙(요청마다 새로 생성).
 */
export function createClaudeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다");
  }

  return new Anthropic({ apiKey });
}
