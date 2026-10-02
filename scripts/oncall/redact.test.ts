import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { containsSecret, redact } from "./redact.mjs";

const SCRIPT = path.join(__dirname, "redact.mjs");

describe("redact", () => {
  it.each([
    ["Anthropic key", "key sk-ant-api03-AbCdEf_123-xyz456789 failed"],
    ["GitHub token", "token ghp_abcdefghijklmnopqrstuvwxyz0123456789 used"],
    ["GitHub fine-grained PAT", "github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz0123456789"],
    ["JWT", "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123_-xyz"],
    ["AWS access key id", "id AKIAIOSFODNN7EXAMPLE here"],
    ["Bearer header", "Authorization: Bearer abc123.def456-ghi789"],
    ["DB URL password", "postgresql://postgres:hunter2pass@db.example.co:5432/postgres"],
  ])("masks %s", (_label, input) => {
    const out = redact(input);
    expect(out).toContain("[REDACTED]");
    expect(containsSecret(out)).toBe(false);
  });

  it("masks the value of secret-looking env assignments but keeps the name", () => {
    const out = redact("SUPABASE_SERVICE_ROLE_KEY=abcdef123456\nPOLAR_WEBHOOK_SECRET: s3cr3t-value");
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY=[REDACTED]");
    expect(out).toContain("POLAR_WEBHOOK_SECRET: [REDACTED]");
    expect(out).not.toContain("abcdef123456");
    expect(out).not.toContain("s3cr3t-value");
  });

  it("strips ANSI escapes and leaves ordinary log lines alone", () => {
    const line = "src/app/page.tsx:12:5  error  'x' is assigned a value but never used";
    expect(redact(`\u001b[31m${line}\u001b[0m`)).toBe(line);
  });

  it("is idempotent", () => {
    const once = redact("API_TOKEN=abc123 and sk-ant-api03-AbCdEf_123-xyz456789");
    expect(redact(once)).toBe(once);
  });
});

describe("containsSecret", () => {
  it("detects an unmasked secret and ignores clean text", () => {
    expect(containsSecret("ANTHROPIC_API_KEY=sk-ant-api03-AbCdEf_123-xyz456789")).toBe(true);
    expect(containsSecret("Tests 218 passed (218)")).toBe(false);
  });
});

describe("CLI", () => {
  it("redacts stdin to stdout", () => {
    const out = execFileSync("node", [SCRIPT], { input: "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789" });
    expect(out.toString()).toBe("GITHUB_TOKEN=[REDACTED]");
  });

  it("--check exits 1 when a secret is present and 0 otherwise", () => {
    const dirty = spawnSync("node", [SCRIPT, "--check"], { input: "password=hunter2" });
    const clean = spawnSync("node", [SCRIPT, "--check"], { input: "all good" });
    expect(dirty.status).toBe(1);
    expect(clean.status).toBe(0);
  });
});
