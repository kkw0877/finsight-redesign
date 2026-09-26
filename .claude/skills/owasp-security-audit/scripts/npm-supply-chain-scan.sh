#!/usr/bin/env bash
# A03:2025 Software Supply Chain Failures — deterministic dependency-CVE data.
# npm audit / npm outdated exit non-zero when they find something — that's the
# expected, useful case, not a script failure, so no `set -e`.
set -uo pipefail

echo "=== npm audit (all deps) ==="
npm audit --json || true

echo "=== npm audit (production only) ==="
npm audit --omit=dev --json || true

echo "=== npm outdated ==="
npm outdated --json || true
