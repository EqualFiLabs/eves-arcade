#!/usr/bin/env bash
set -euo pipefail

# Browser flows use the actual API and an isolated, fully seeded PostgreSQL DB.
project="rpr-browser-test-$$"
compose=(docker compose -p "$project" -f deploy/compose.test.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
"${compose[@]}" up -d --wait
export DATABASE_URL="postgresql://arcade:arcade-test@127.0.0.1:55432/arcade_test"
# Runtime must have no configured RPC, including when the parent shell has one.
while IFS= read -r name; do
  case "$name" in *RPC*|ROBINHOOD_MAINNET|ROBINHOOD_TESTNET) unset "$name" ;; esac
done < <(compgen -e)
pnpm --filter @rpr/api migrate
pnpm --filter @rpr/api operators:import
pnpm exec playwright test "$@"
