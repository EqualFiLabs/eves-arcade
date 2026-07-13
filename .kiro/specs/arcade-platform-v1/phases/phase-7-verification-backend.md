# Phase 7: Generalized Verification Backend

Status: `COMPLETE`

Approved: 2026-07-13

Completed: 2026-07-13

Roadmap: `../architecture-hardening-roadmap.md`

## Goal

Replace the RPR-specific in-memory API prototype with a durable,
runtime-validated verification service whose ticket lifecycle, replay workers,
leaderboards, rate limits, and deployment boundary remain safe across process
restarts and multiple API instances.

## Locked Decisions

- PostgreSQL 17 is the durable source of truth. SQL migrations are forward-only
  and protected by an advisory lock; no ORM owns the schema.
- Verification runs in a bounded Piscina worker-thread pool. There is no message
  broker or external job queue in V1.
- Tickets sign an explicit verifier identity and revision. The first immutable
  adapter is `rpr.verify@1`.
- Ticket reservations use a 15-second lease. Infrastructure failures release
  the lease or permit later reclamation; deterministic rejection is terminal.
- Identical terminal submissions are idempotent. Conflicting reuse of the same
  ticket is rejected.
- Accepted and rejected replay attempts, traces, review flags, expired tickets,
  and verifier references are retained without automatic V1 deletion.
- Leaderboards are selected from an explicit category registry and indexed
  category values. Routes do not infer metrics from category names.
- Production uses a private API/database network behind one Caddy proxy. Caddy
  terminates TLS, serves the web build, overwrites client forwarding headers,
  and exposes same-origin `/api/*` routing.
- No account, wallet, payout, blockchain, public review, or reward behavior is
  introduced.
- The Crypto Crash Launcher prototype specification remains untouched.

## Public Contract Changes

- `SessionTicket` now includes `{ verifier: { id, revision } }`, covered by its
  HMAC signature.
- A rejected `SubmissionResponse` now includes a stable `code` and `retryable`
  flag in addition to `reason` and `flagged`.
- RPR tickets bind `rug-pull-rumble@0.1.0` to `rpr.verify@1`, `rpr.input@2`,
  Trace V2, and `rpr.result@1`.
- `/health` remains a liveness endpoint. `/ready` additionally proves database
  access, worker availability, and that every retained verifier/category is
  still registered.

## Ticket Lifecycle

```text
issued
  -> verifying (lease + canonical submission fingerprint)
       -> accepted (canonical result + leaderboard values committed atomically)
       -> rejected (claim + trace + reason + review flag retained atomically)
       -> issued (worker/queue infrastructure failure; retry permitted)
  -> expired
```

Structural envelope, schema, byte, trace, and hash validation happens before a
reservation. Once deterministic replay begins, replay-invalid evidence or a
canonical mismatch consumes the ticket and is retained for review. A worker
crash, timeout, full queue, lost lease, or transient store failure never turns
an unverified claim into a leaderboard row.

## Chronological Implementation

### 7.1 Generalize dispatch and protocol identity

- Added exact verifier and leaderboard registries.
- Moved RPR validation and replay behavior into one game verifier descriptor
  consumed by both the API and worker registry.
- Removed RPR route conditionals and hard-coded leaderboard result schemas.
- Added runtime validation for ticket verifier identity and stored canonical
  results.

### 7.2 Add durable transactional storage

- Added PostgreSQL migrations for tickets, verification results/traces,
  leaderboard values, rate-limit windows, and migration history.
- Added atomic reservation, lease recovery, accepted/rejected finalization,
  unique session/category constraints, and idempotent terminal responses.
- Retained the in-memory store as a fast implementation of the same contract
  for focused route tests.
- Added readiness checks for verifier/category revisions referenced by durable
  rows.

### 7.3 Isolate and bound replay work

- Added a production worker entry and bounded Piscina pool.
- Defaulted the pool to one fewer than the available CPU count, a queue twice
  the pool size, and a two-second verification deadline.
- Distinguished deterministic replay rejection from retryable worker capacity,
  timeout, and crash failures.
- Terminated timed-out tasks and allowed Piscina to replace their workers.

### 7.4 Harden transport and operations

- Added a one-MiB streaming body cap before JSON allocation.
- Replaced process-local IP counters with atomic PostgreSQL rate-limit windows
  for durable deployments; only HMAC-derived client keys are stored.
- Trusted forwarding headers only when the socket peer matches configured proxy
  CIDRs. The Node adapter overwrites its private peer-address header.
- Added production-only failure for missing database URL, weak ticket secret,
  missing build allowlist, or absent trusted-proxy configuration.
- Added structured request and verification logs without raw traces, secrets,
  player IPs, or signed ticket bodies.

### 7.5 Package and prove the deployment

- Added Node 20 API and Caddy web images, PostgreSQL 17 test/production Compose
  definitions, a one-shot migration entry, static TLS proxy configuration, and
  environment template.
- Kept the API and database off public host ports in the production topology.
- Updated repository guidance to recognize `apps/api` while retaining the V1
  prohibitions on accounts, wallets, blockchain, payouts, and rewards.

## Verification Evidence

- `pnpm build:all`: API main/worker/migration artifacts and the 87-module web
  production build passed.
- `pnpm typecheck`: passed across all buildable workspace projects.
- `pnpm lint`: passed.
- `pnpm test:sim`: 29 files and 264 tests passed; the five Docker-gated database
  tests were intentionally skipped by this fast suite.
- `pnpm test:api:integration`: five PostgreSQL 17 integration tests passed,
  including repeatable migrations, restart persistence, concurrent reservation,
  lease recovery, retained review evidence, and cross-instance rate limiting.
- `pnpm test:e2e`: all 20 desktop and mobile browser tests passed with the
  worker-backed ranked submission path active.
- Production API and web container images built successfully.
- Production API container smoke passed migration, `/ready`, worker startup,
  PostgreSQL connectivity, and signed session issuance.
- Production Compose expansion and `git diff --check` passed.

## Deferred Items

- A durable external verification queue is unnecessary for V1 and remains a
  future scaling option.
- Authenticated operator/review APIs, trace export tooling, and database backup
  automation require an operational product decision before implementation.
- Multi-region coordination, secret key rings, account identity, reward
  heuristics, and deletion/retention windows remain outside this phase.
- Phase 8 owns broader architecture enforcement and multi-format verifier
  fixtures; Phases 9–10 own launcher adaptation and product delivery.
