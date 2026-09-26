#!/usr/bin/env bash
# Fails (exit 1) if the current working-tree diff touches design-system source:
# tokens or the shared ui component library. Perf-loop iterations may only
# change loading/rendering strategy (page files, layout, next.config, font
# loading config) — never the design system's values.
#
# A one-time exception for src/styles/tokens/fonts.css was considered (to fix
# what looked like a font-loading-caused mobile LCP regression) but the
# underlying finding turned out to be a Lighthouse Lantern simulation
# artifact, not a real bug — see RESEARCH_LOG.md "iter-00". No exception is
# in effect; the pattern below is unconditional.
set -euo pipefail

FORBIDDEN_PATTERN='^src/styles/tokens/|^src/components/ui/'

CHANGED=$(git diff --name-only; git diff --name-only --cached)
CHANGED=$(echo "$CHANGED" | sort -u | grep -v '^$' || true)

if [ -z "$CHANGED" ]; then
  echo "guard-diff: no changes to check"
  exit 0
fi

VIOLATIONS=$(echo "$CHANGED" | grep -E "$FORBIDDEN_PATTERN" || true)

if [ -n "$VIOLATIONS" ]; then
  echo "guard-diff: FORBIDDEN files touched (design system must stay untouched):"
  echo "$VIOLATIONS"
  exit 1
fi

echo "guard-diff: OK"
echo "$CHANGED"
