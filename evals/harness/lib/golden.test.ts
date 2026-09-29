// @vitest-environment node
// 실제 golden set(cases/*.md)의 무결성/균형을 키 없이 지킨다.
import { describe, expect, it } from "vitest";
import { checkBalance } from "./aggregate.ts";
import { loadCases } from "./load.ts";

describe("golden set", () => {
  const cases = loadCases();

  it("케이스가 로드된다 (파싱 오류 없음)", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it("두 트랙 모두 비어있지 않고 균형이 맞다", () => {
    expect(checkBalance(cases)).toEqual([]);
  });

  it("review: 위반 4 + 정상 1로 시작한다", () => {
    const review = cases.filter((c) => c.track === "review");
    expect(review.filter((c) => c.expect === "violation")).toHaveLength(4);
    expect(review.filter((c) => c.expect === "pass")).toHaveLength(1);
  });
});
