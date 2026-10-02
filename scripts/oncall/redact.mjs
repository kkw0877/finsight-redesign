// oncall CI 자동 수정용 시크릿 마스킹. 에이전트가 읽는 실패 로그를 정제하고(stdin→stdout),
// PR 본문/diff에 시크릿이 남았는지 검사한다(--check, 발견 시 exit 1).
import { fileURLToPath } from "node:url";

const MASK = "[REDACTED]";

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

// 값 자체가 시크릿 형태인 토큰들.
const TOKEN_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /\bsk-[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, // JWT (Supabase 키 포함)
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+(?=@)/gi, // URL 안의 user:password@
];

// KEY/TOKEN/SECRET/PASSWORD 류 이름에 값이 대입된 형태. 타입 표기(`apiKey: string`)는 건드리지 않는다.
const ASSIGNMENT =
  /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|AUTH|CREDENTIAL)[A-Za-z0-9_]*)(["']?\s*[=:]\s*)(?!\[REDACTED\])(?!(?:string|number|boolean|undefined|null|true|false|any|unknown|void|never)\b)("[^"\n]+"|'[^'\n]+'|[^\s"',;)}\]]+)/gi;

function maskSecrets(text) {
  let out = text;
  for (const re of TOKEN_PATTERNS) {
    out = out.replace(re, (_m, prefix) => `${typeof prefix === "string" ? prefix : ""}${MASK}`);
  }
  return out.replace(ASSIGNMENT, (_m, name, sep) => `${name}${sep}${MASK}`);
}

export function redact(text) {
  return maskSecrets(text.replace(ANSI, ""));
}

export function containsSecret(text) {
  return maskSecrets(text) !== text;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = await readStdin();
  if (process.argv.includes("--check")) {
    if (containsSecret(input)) {
      console.error("secret-like content detected");
      process.exit(1);
    }
  } else {
    process.stdout.write(redact(input));
  }
}
