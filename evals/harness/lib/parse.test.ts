// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseCase, parseFrontmatter } from "./parse.ts";

describe("parseFrontmatter", () => {
  it("스칼라, 리스트, 본문을 분리한다", () => {
    const { meta, body } = parseFrontmatter(
      ["---", "id: a", 'title: "따옴표 값"', "must:", "  - 하나", "  - 둘", "---", "", "본문 줄1", "본문 줄2", ""].join("\n"),
    );
    expect(meta).toEqual({ id: "a", title: "따옴표 값", must: ["하나", "둘"] });
    expect(body).toBe("본문 줄1\n본문 줄2");
  });

  it("frontmatter가 없으면 던진다", () => {
    expect(() => parseFrontmatter("그냥 본문")).toThrow(/frontmatter/);
  });

  it("닫는 ---가 없으면 던진다", () => {
    expect(() => parseFrontmatter("---\nid: a\n본문")).toThrow(/frontmatter/);
  });
});

const reviewRaw = (fm: string, body = "```ts\nconst a = 1;\n```") => `---\n${fm}\n---\n${body}\n`;

describe("parseCase — review", () => {
  it("violation 케이스를 파싱한다", () => {
    const c = parseCase(reviewRaw("id: r1\ntrack: review\nexpect: violation\nrule: upload-ttl"), "r1.md");
    expect(c).toMatchObject({ track: "review", id: "r1", expect: "violation", rule: "upload-ttl" });
    expect(c.input).toContain("const a = 1");
  });

  it("pass 케이스는 rule 없이 통과한다", () => {
    const c = parseCase(reviewRaw("id: r2\ntrack: review\nexpect: pass"), "r2.md");
    expect(c).toMatchObject({ track: "review", expect: "pass" });
  });

  it("violation인데 rule이 없거나 모르는 rule이면 던진다", () => {
    expect(() => parseCase(reviewRaw("id: r\ntrack: review\nexpect: violation"), "r.md")).toThrow(/rule/);
    expect(() => parseCase(reviewRaw("id: r\ntrack: review\nexpect: violation\nrule: nope"), "r.md")).toThrow(/rule/);
  });

  it("pass인데 rule이 있으면 던진다", () => {
    expect(() => parseCase(reviewRaw("id: r\ntrack: review\nexpect: pass\nrule: upload-ttl"), "r.md")).toThrow(/rule/);
  });

  it("expect 값이 잘못되면 던진다", () => {
    expect(() => parseCase(reviewRaw("id: r\ntrack: review\nexpect: maybe"), "r.md")).toThrow(/expect/);
  });

  it("본문이 비면 던진다", () => {
    expect(() => parseCase(reviewRaw("id: r\ntrack: review\nexpect: pass", ""), "r.md")).toThrow(/본문/);
  });
});

describe("parseCase — qa", () => {
  const qa = (extra = "") =>
    `---\nid: q1\ntrack: qa\nmust:\n  - 사실 A\nmust_not:\n  - 오답 B\n${extra}---\n질문?\n`;

  it("must/must_not과 기본 false_premise=false를 파싱한다", () => {
    expect(parseCase(qa(), "q1.md")).toMatchObject({
      track: "qa",
      id: "q1",
      must: ["사실 A"],
      must_not: ["오답 B"],
      false_premise: false,
      input: "질문?",
    });
  });

  it("false_premise: true를 인식한다", () => {
    expect(parseCase(qa("false_premise: true\n"), "q1.md")).toMatchObject({ false_premise: true });
  });

  it("must가 비면 던진다", () => {
    expect(() => parseCase("---\nid: q\ntrack: qa\nmust_not:\n  - x\n---\n질문\n", "q.md")).toThrow(/must/);
  });
});

it("모르는 track이면 던진다", () => {
  expect(() => parseCase("---\nid: x\ntrack: foo\n---\n본문\n", "x.md")).toThrow(/track/);
});
