# Rug Pull Rumble Arcade

Rug Pull Rumble is the first game in a Phaser 4 arcade platform. The workspace
contains a DOM arcade shell, a deterministic TypeScript combat simulation, game
content, shared controls/protocol packages, and a replay-verifying API.

## Local development

Install dependencies with `pnpm install`, then start ranked development with:

```sh
pnpm dev:ranked
```

The web app runs at `http://localhost:5173`. Vite forwards its same-origin
`/api/*` requests to the API at `http://127.0.0.1:3000` and removes the `/api`
prefix. A production deployment must provide the same routing contract.

`pnpm dev` starts only the web app. If the API cannot be reached, session
acquisition deliberately falls back to a fully playable unranked session.
Server validation rejections do not fall back silently: the shell displays the
configuration or request error.

In development only, `http://localhost:5173/?arcadeFixtures=1` replaces the
production registry with three small conformance games: ranked button input,
ranked quantized analog input with cosmetic Arcade Physics, and unranked input.
They exercise the real shell and Phaser lifecycle and are compile-time removed
from the production bundle.

## Verification backend

The API uses an in-memory store only when `DATABASE_URL` is absent in local
development. Durable ranked deployment uses PostgreSQL 17, schema-keyed
verifier revisions, leased/idempotent ticket processing, and a bounded worker
thread pool. Run the real database integration suite with:

```sh
pnpm test:api:integration
```

Production artifacts live in `deploy/`. Copy `deploy/.env.example`, provide a
strong ticket secret and database password, then run the production Compose
stack from that directory. Caddy is the sole public service: it terminates TLS,
serves the web build, overwrites forwarding headers, and proxies same-origin
`/api/*` requests to the private API container.

Production configuration deliberately has no insecure fallbacks. It requires
`DATABASE_URL`, a ticket secret of at least 32 bytes, an explicit build
allowlist, and trusted-proxy CIDRs. `/health` is liveness; `/ready` additionally
checks PostgreSQL, worker capacity, and retained verifier/category references.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:sim
pnpm test:architecture
pnpm test:api:integration
pnpm build:all
pnpm check:bundle
pnpm test:e2e
```

`pnpm check:fast` runs types, lint, all non-Docker Vitest suites, both builds,
and the production fixture-exclusion check. `pnpm check:all` adds PostgreSQL and
browser flows. GitHub Actions runs those concerns as separate fast, PostgreSQL,
and browser jobs. Playwright starts both services and exercises ranked,
offline/unranked, multi-format lifecycle, replay dispatch, and Phaser isolation.
