import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCase } from "./parse.ts";
import { expandImports } from "./prompts.ts";
import type { Case } from "./types.ts";

const HARNESS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = join(HARNESS_DIR, "..", "..");

/** cases/<track>/*.md 전부를 로드한다. 파일명 == id, 디렉터리 == track 을 강제한다. */
export function loadCases(): Case[] {
  const cases: Case[] = [];
  for (const track of ["review", "qa"] as const) {
    const dir = join(HARNESS_DIR, "cases", track);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
      const c = parseCase(readFileSync(join(dir, file), "utf8"), `${track}/${file}`);
      if (c.track !== track) throw new Error(`${track}/${file}: track(${c.track})이 디렉터리와 다릅니다`);
      if (c.id !== basename(file, ".md")) throw new Error(`${track}/${file}: id(${c.id})가 파일명과 다릅니다`);
      cases.push(c);
    }
  }
  return cases;
}

/** 라이브 CLAUDE.md (+ `@` import 1단계 펼침) — qa 트랙의 컨텍스트. */
export function readLiveClaudeMd(): string {
  const read = (p: string): string | undefined => {
    try {
      return readFileSync(join(REPO_ROOT, p), "utf8");
    } catch {
      return undefined;
    }
  };
  return expandImports(readFileSync(join(REPO_ROOT, "CLAUDE.md"), "utf8"), read);
}
