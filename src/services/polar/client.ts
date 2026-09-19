import { Polar } from "@polar-sh/sdk";

/**
 * 싱글턴 금지 — step 0의 Supabase/Claude 클라이언트 팩토리들과 동일한 원칙(요청마다 새로 생성).
 * POLAR_SERVER가 없으면 'sandbox'로 기본값 — ADR-008 "샌드박스 우선 검증".
 */
export function createPolarClient(): Polar {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("POLAR_ACCESS_TOKEN이 설정되지 않았습니다");
  }

  const server = process.env.POLAR_SERVER === "production" ? "production" : "sandbox";

  return new Polar({ accessToken, server });
}
