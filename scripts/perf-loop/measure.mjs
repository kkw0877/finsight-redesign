#!/usr/bin/env node
// Runs Lighthouse (performance category only) against one or more local URLs,
// saves the full JSON report + a decoded full-page screenshot PNG per URL,
// and prints a one-line summary JSON to stdout for the caller to parse.
//
// Usage: node scripts/perf-loop/measure.mjs <label> [--profile=mobile|desktop] <url> [url2 ...]
//   label: short slug used for the report subfolder, e.g. "baseline" or "iter-01"
//   profile: "mobile" (default, matches Lighthouse's default throttled config —
//     the primary metric this loop optimizes for) or "desktop" (used as a
//     no-regression check; the site already scores 100 there).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const rawArgs = process.argv.slice(2);
const profileArg = rawArgs.find((a) => a.startsWith("--profile="));
const profile = profileArg ? profileArg.split("=")[1] : "mobile";
const [label, ...urls] = rawArgs.filter((a) => a !== profileArg);

if (!label || urls.length === 0) {
  console.error("Usage: node measure.mjs <label> [--profile=mobile|desktop] <url> [url2 ...]");
  process.exit(1);
}
if (profile !== "mobile" && profile !== "desktop") {
  console.error(`Unknown --profile=${profile}, expected mobile or desktop`);
  process.exit(1);
}

const REPORTS_DIR = path.join(import.meta.dirname, "reports");

function slugForUrl(url) {
  const { pathname } = new URL(url);
  return pathname === "/" ? "root" : pathname.replace(/^\/|\/$/g, "").replace(/\//g, "-");
}

async function measureOne(chrome, url) {
  const result = await lighthouse(
    url,
    {
      port: chrome.port,
      output: "json",
      onlyCategories: ["performance"],
      // "simulate" (Lantern's static analysis) proved unreliable on this
      // codebase's @import-based font loading — it scored this site 55
      // (~42s simulated FCP/LCP) while real network throttling ("devtools",
      // which actually delays requests in real time) scores it 96 (~2.3s).
      // Slower per run, but "devtools" is the one that isn't lying.
      throttlingMethod: "devtools",
    },
    profile === "desktop" ? desktopConfig : undefined, // undefined = lighthouse's default (mobile) config
  );

  const lhr = result.lhr;
  const slug = slugForUrl(url);
  const dir = path.join(REPORTS_DIR, slug, profile, label);
  await mkdir(dir, { recursive: true });

  await writeFile(path.join(dir, "report.json"), JSON.stringify(lhr, null, 2));

  const screenshotData = lhr.fullPageScreenshot?.screenshot?.data;
  let screenshotFile = null;
  if (screenshotData) {
    const match = screenshotData.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (match) {
      const [, ext, base64] = match;
      screenshotFile = `screenshot.${ext}`;
      await writeFile(path.join(dir, screenshotFile), Buffer.from(base64, "base64"));
    }
  }

  const metrics = lhr.audits.metrics?.details?.items?.[0] ?? {};

  return {
    url,
    slug,
    performanceScore: Math.round((lhr.categories.performance.score ?? 0) * 100),
    lcpMs: metrics.largestContentfulPaint ?? null,
    tbtMs: metrics.totalBlockingTime ?? null,
    clsScore: lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
    fcpMs: metrics.firstContentfulPaint ?? null,
    speedIndexMs: metrics.speedIndex ?? null,
    reportPath: path.join(dir, "report.json"),
    screenshotPath: screenshotFile ? path.join(dir, screenshotFile) : null,
  };
}

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-sandbox"],
});

try {
  const summaries = [];
  for (const url of urls) {
    // Sequential on purpose: Lighthouse's simulated throttling gets noisy
    // under concurrent runs against the same Chrome instance.
    summaries.push(await measureOne(chrome, url));
  }
  console.log(JSON.stringify(summaries, null, 2));
} finally {
  await chrome.kill();
}
