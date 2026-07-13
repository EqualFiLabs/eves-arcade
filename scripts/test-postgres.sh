#!/usr/bin/env bash
set -euo pipefail

project="rpr-phase7-test-$$"
compose=(docker compose -p "$project" -f deploy/compose.test.yml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

"${compose[@]}" up -d --wait
export TEST_DATABASE_URL="postgresql://arcade:arcade-test@127.0.0.1:55432/arcade_test"
pnpm exec vitest run tests/api/postgres-store.test.ts
