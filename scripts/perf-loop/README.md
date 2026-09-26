# Perf-loop

A Lighthouse-driven performance optimization loop, inspired by the
hypothesis → experiment → measure → keep-or-revert cycle in Karpathy's
[autoresearch](https://github.com/karpathy/autoresearch), scoped to this
project's constraints:

- **Never breaks the product.** Every kept change passes build + lint +
  the full test suite.
- **Never touches the design system.** `src/styles/tokens/` and
  `src/components/ui/` are off-limits (`guard-diff.sh` enforces this) —
  only loading/rendering strategy changes (priority hints, lazy loading,
  preconnect, code-splitting, font-loading config, caching headers, etc.)
  are in scope.
- **Semi-autonomous, not unattended.** Each iteration is applied, verified,
  and logged to `RESEARCH_LOG.md` in one pass; the run stops and reports
  back rather than looping forever in the background.

Category measured: **Performance only** (desktop, simulated throttling),
against a production build (`next build && next start`), for `/` and
`/style-guide`.

## Protocol (one iteration)

1. Read the latest `reports/<page>/*/report.json` for each target page —
   look at `audits` with `score < 0.9` for concrete opportunities (unused
   JS/CSS, render-blocking resources, LCP element, font loading, etc.).
2. Pick **one** hypothesis not already logged as failed in
   `RESEARCH_LOG.md`.
3. Apply the change (page/layout/config files only).
4. `npm run build && npm run lint` — must pass.
5. `./guard-diff.sh` — must pass (no design-system files touched).
6. `npm run test` — must pass.
7. Restart `next start` on the loop's port, re-run
   `node measure.mjs <iter-label> <urls...>`.
8. Visually compare the new `screenshot.png` against the baseline one
   (Read tool / eyeball) for each affected page — must look unchanged to a
   user (this is the "design system preserved" gate; it's a human/model
   visual judgment call, not a pixel-diff threshold, since anti-aliasing
   and font hinting cause harmless byte-level noise).
9. If every gate passed **and** the performance score or a Core Web Vital
   improved without regressing another: `git add`+`git commit` with a
   `perf:` conventional-commit message. Otherwise: `git checkout --` the
   touched files to discard the iteration.
10. Append the outcome to `RESEARCH_LOG.md` either way.

Stop when either target hits 100, or 2–3 consecutive iterations improve
the score by less than ~2 points (diminishing returns).

## Commands

```bash
npm run build && (npm run start -- -p 4173 &)   # background prod server
node scripts/perf-loop/measure.mjs baseline http://localhost:4173/ http://localhost:4173/style-guide
```

Reports land in `reports/<page-slug>/<label>/{report.json,screenshot.png}`
(gitignored — regenerable, not source of truth; `RESEARCH_LOG.md` is the
durable record and is committed).
