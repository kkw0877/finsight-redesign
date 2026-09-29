import { RULE_IDS } from "./prompts.ts";
import type { Case } from "./types.ts";

type Meta = Record<string, string | string[]>;

/** 의존성 없는 최소 frontmatter 파서: `key: value`, `key:` + `  - item` 리스트, `key: []`만 지원. */
export function parseFrontmatter(raw: string): { meta: Meta; body: string } {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") throw new Error("frontmatter(---)로 시작해야 합니다");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("frontmatter를 닫는 ---가 없습니다");

  const meta: Meta = {};
  let listKey: string | null = null;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      (meta[listKey] as string[]).push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === "" ) {
      meta[key] = [];
      listKey = key;
    } else {
      meta[key] = value === "[]" ? [] : unquote(value);
      listKey = null;
    }
  }
  return { meta, body: lines.slice(end + 1).join("\n").trim() };
}

function unquote(v: string): string {
  const s = v.trim();
  return /^(".*"|'.*')$/.test(s) ? s.slice(1, -1) : s;
}

function str(meta: Meta, key: string, file: string): string {
  const v = meta[key];
  if (typeof v !== "string" || v === "") throw new Error(`${file}: '${key}'가 필요합니다`);
  return v;
}

function list(meta: Meta, key: string, file: string): string[] {
  const v = meta[key];
  if (!Array.isArray(v)) throw new Error(`${file}: '${key}'는 리스트여야 합니다`);
  return v;
}

export function parseCase(raw: string, file: string): Case {
  const { meta, body } = parseFrontmatter(raw);
  const id = str(meta, "id", file);
  const track = str(meta, "track", file);
  if (!body) throw new Error(`${file}: 본문(입력)이 비어 있습니다`);

  if (track === "review") {
    const expectV = str(meta, "expect", file);
    if (expectV !== "violation" && expectV !== "pass") {
      throw new Error(`${file}: expect는 violation|pass 여야 합니다 (받은 값: ${expectV})`);
    }
    const rule = typeof meta.rule === "string" ? meta.rule : undefined;
    if (expectV === "violation" && (!rule || !(RULE_IDS as readonly string[]).includes(rule))) {
      throw new Error(`${file}: violation 케이스는 알려진 rule이 필요합니다 (${RULE_IDS.join(", ")})`);
    }
    if (expectV === "pass" && rule) throw new Error(`${file}: pass 케이스에는 rule을 붙이지 않습니다`);
    return { track, id, expect: expectV, rule, input: body };
  }

  if (track === "qa") {
    const must = list(meta, "must", file);
    if (must.length === 0) throw new Error(`${file}: must가 비어 있습니다`);
    const must_not = Array.isArray(meta.must_not) ? meta.must_not : [];
    return { track, id, must, must_not, false_premise: meta.false_premise === "true", input: body };
  }

  throw new Error(`${file}: 알 수 없는 track '${track}' (review|qa)`);
}
