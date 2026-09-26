# Perf-loop research log

One entry per iteration, oldest first. Kept so a later session (or a later
iteration in this one) doesn't re-try an idea that already failed a gate.

Format per entry:

```
## iter-NN — <one-line hypothesis>
- Pages: <affected page(s)>
- Change: <files touched + what changed>
- Gates: build=<pass/fail> lint=<pass/fail> test=<pass/fail> guard-diff=<pass/fail> visual=<pass/fail>
- Score: <page> perf <before> -> <after> (LCP <before>ms -> <after>ms, TBT ..., CLS ...)
- Result: KEPT (committed <sha>) | REVERTED (<reason>)
- Notes: <anything worth remembering for the next idea>
```

## iter-00 — measurement methodology, not a code change

- Pages: `/`, `/style-guide`
- Change: none — this entry documents a **rejected hypothesis about the
  measurement tool itself**, kept here so a later iteration doesn't re-chase it.
- Finding: initial mobile-profile baseline (Lighthouse default config,
  `throttlingMethod: "simulate"`) scored both pages **55** with ~42s
  simulated FCP/LCP, pointing at the ~8MB of `@import`-loaded CDN webfonts
  in `src/styles/tokens/fonts.css` as the cause. Investigated a one-time
  exception to edit that file (font-display / preload / self-hosting).
- Before touching anything: confirmed the vendor CSS already sets
  `font-display: swap` on every `@font-face` (checked the fetched CDN CSS
  directly). Re-measured with `throttlingMethod: "devtools"` (real network
  delay, not Lantern's static simulation) — both pages score **96**,
  FCP/LCP ≈ **2.3s**. The 55/42s numbers were a Lantern simulation artifact
  for this @import + large-font-file pattern, not a real user-facing bug.
- Result: REVERTED (no change made). `measure.mjs` now defaults to
  `throttlingMethod: "devtools"` so this doesn't recur. The fonts.css
  exception in `guard-diff.sh` was removed — not needed.
- Notes: don't trust a `simulate`-throttled score on this repo without a
  `devtools`-throttled cross-check, specifically for pages that load
  external `@import`ed webfonts.

## Accepted baseline (2026-09-26)

- Mobile: `/` = 96 (LCP 2253ms, TBT 48ms), `/style-guide` = 90 (LCP 2780ms,
  TBT 97ms).
- Desktop: `/` = 100 (LCP 144ms), `/style-guide` = 100 (LCP 162ms).
- Only remaining opportunity: `unused-javascript` on two shared Next.js
  chunks (`1mh6a-0e61pyc.js`: ~29KB wasted on both pages; `0jbs687-mkrzt.js`:
  ~26KB wasted, style-guide only) — shared-chunk code-splitting granularity,
  not a page-level bug. Fixing it risks re-shaping chunk boundaries used by
  other pages (login/dashboard/billing) for a few tens of KB.
- Decision: stop here. Scores are already high; the remaining gain isn't
  worth the blast radius. Loop not re-run past this point — re-invoke once
  more real screens exist or a regression shows up.
