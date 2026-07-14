#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="apps/web/dist"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Production web bundle is missing; run pnpm build first." >&2
  exit 1
fi

if rg -n --glob '!*.map' \
  'fixture-button|fixture-analog|fixture-unranked|arcadeFixtures|dev-fixtures' \
  "$DIST_DIR"; then
  echo "DEV-only multi-format fixtures leaked into the production bundle." >&2
  exit 1
fi

echo "Production bundle excludes DEV-only multi-format fixtures."
