# Arcade Platform Architecture Hardening Roadmap

## Purpose

This document is the living roadmap for turning the current Rug Pull Rumble
arcade shell into a maintainable, production-ready platform that can support
many substantially different game formats.

It records:

- The architectural direction we have agreed to preserve.
- The current correctness and extensibility problems.
- The chronological phases in which those problems should be addressed.
- The boundaries and exit criteria for planning each phase separately.
- Decisions, implementation notes, verification evidence, and deferred work as
  execution progresses.

This is a roadmap, not the detailed implementation plan for every phase. Before
starting a phase, create or add its concrete task plan, affected-file list,
migration strategy, and test matrix under that phase's work log.

The platform is greenfield. Breaking internal APIs is acceptable when it makes
the architecture safer, simpler, or materially easier to extend. Compatibility
shims should be temporary and should have an explicit removal phase.

## Relationship to Existing Specifications

- `requirements.md`, `design.md`, and `tasks.md` in this directory remain the
  record for Arcade Platform V1's original intent.
- `.kiro/specs/crypto-fighter-v1/` remains the gameplay specification for Rug
  Pull Rumble.
- `.kiro/specs/crypto-crash-launcher-prototype/` describes the spirit and target
  experience of Crypto Crash Launcher. Its standalone project structure and
  Matter-owned authority model must be adapted to the hardened arcade
  architecture before implementation.
- This roadmap supersedes implementation assumptions that conflict with the
  agreed platform direction. Any requirements-level conflict should be resolved
  explicitly and recorded in the Decision Log.

## Status Legend

- `NOT STARTED` — no phase-specific plan has been approved.
- `PLANNING` — detailed scope, tasks, migration, and tests are being defined.
- `READY` — the detailed phase plan is approved and implementation may begin.
- `IN PROGRESS` — implementation has begun.
- `VALIDATING` — implementation is complete and exit criteria are being proved.
- `COMPLETE` — all exit criteria are met and evidence is recorded.
- `BLOCKED` — progress requires a decision or external dependency.
- `DEFERRED` — intentionally postponed with rationale.

## Phase Summary

| Phase | Name | Status | Depends On |
|---|---|---|---|
| 0 | Baseline and architecture record | COMPLETE | None |
| 1 | Repair the ranked vertical slice | COMPLETE | Phase 0 |
| 2 | Make each game core the source of truth | COMPLETE | Phase 1 |
| 3 | Redesign the platform contracts and capabilities | COMPLETE | Phase 2 |
| 4 | Harden the shell lifecycle | NOT STARTED | Phase 3 |
| 5 | Make shared web surfaces game-neutral | NOT STARTED | Phase 3 |
| 6 | Introduce explicit canonical input and trace schemas | NOT STARTED | Phases 2–3 |
| 7 | Generalize and harden the verification backend | NOT STARTED | Phases 2, 3, 6 |
| 8 | Enforce architecture and prove multi-format support | NOT STARTED | Phases 4–7 |
| 9 | Adapt Crypto Crash Launcher to the platform | NOT STARTED | Phase 8 |
| 10 | Build and ship Crypto Crash Launcher V1 | NOT STARTED | Phase 9 |

The ordering is intentional. Later phases may be planned early, but execution
must not rely on contracts or behavior that an earlier phase is expected to
replace.

## Architectural Principles

### Keep the platform thin

The platform owns application-level lifecycle and services. It does not own
gameplay.

The platform may provide:

- Game discovery and dynamic loading.
- Session acquisition and ranked/unranked policy.
- Game mounting, suspension, completion, and teardown.
- Shared settings, analytics, result presentation, and navigation.
- Device-level input sources and trace transport.
- Protocol types, runtime validation, and backend dispatch.

The platform must not provide:

- A shared game loop.
- An ECS or entity model.
- A physics wrapper.
- A renderer abstraction.
- A universal simulation state shape.
- Cross-game gameplay semantics.

### Each game core owns truth

For a ranked game, the pure game core is the sole authority for:

- Simulation state transitions.
- Canonical input semantics.
- Terminal-state detection.
- Stable terminal serialization.
- Replay hashing.
- Score calculation.
- Canonical outcome and statistics.

The web game presents the core. The API verifier replays the same core.
Neither side independently reimplements scoring or terminal derivation.

```text
Game core owns truth
    |-- Web adapter presents it
    `-- API verifier replays it
```

### Presentation follows simulation

Phaser, DOM, audio, camera, particles, and visual physics effects must consume
simulation state and events. Ranked state must not depend on Phaser, the DOM,
wall-clock time, browser scheduling, or unseeded randomness.

### Verification authenticates simulation, not humanity

Replay verification proves that a submitted result follows from a server seed
and canonical input trace. It does not prove that a human supplied the input.
Bot and reward risks remain product and review concerns rather than client-side
anti-cheat problems.

### Prefer explicit registries and schemas over inference

Game versions, verifier dispatch, leaderboard categories, input action order,
trace encoding, result schemas, and capabilities must be explicit and
versioned. File paths, object key order, category naming conventions, and
client claims must not become implicit protocols.

### Optimize for a few clear extension points

Adding a game should require game-local implementation plus intentional
registration. It is acceptable to update a web registry and an API verifier
registry. It is not acceptable to scatter game-specific conditionals through
the shell, result screen, session client, API routes, and storage layer.

## Current Baseline

Phase 2 refreshed the baseline on 2026-07-12 (starting from `4af098c`):

- Node `22.22.0`, pnpm `10.23.0`, TypeScript `5.9.3`, Playwright
  `1.61.1`, Vite `5.4.21`, and Phaser `4.2.0` resolved.
- `pnpm typecheck` and `pnpm lint` pass.
- `pnpm test:sim` passes with 24 files and 205 tests across simulation,
  content, controls, determinism, and API behavior.
- `pnpm test:e2e` passes with 17 tests across desktop Chromium, mobile
  portrait, and mobile landscape projects.
- The production web build passes. Phaser remains dynamically split at
  1,685.87 kB minified / 381.71 kB gzip.
- Only Rug Pull Rumble is registered and the API store remains in memory. Its
  ranked browser flow now uses same-origin `/api`, build-bound tickets, strict
  trace validation, canonical replay storage, and visible verified placement.
- Rug Pull Rumble now has a pure composed core used by live play, replay, tests,
  and API verification. The generic simulation and content boundaries remain
  intact.
- The target dependency policy is one exact Phaser `4.2.1` pin. The package
  update is intentionally deferred beyond Phase 0.
- The roadmap and Crypto Crash Launcher specifications were untracked before
  Phase 0 and were preserved.

Full commands, outputs, contract inventory, defect evidence, and workspace
state are recorded in
`phases/phase-0-baseline-and-architecture-record.md`. Refresh this baseline
after every completed phase.

## Known Problems to Preserve in Planning

These are findings, not a substitute for phase-specific investigation.

### Ranked correctness

1. The RPR client SHA-256 hashes its serialized terminal state, while the API
   verifier returns raw serialized state under `replayHash`. Valid submissions
   cannot match.
2. The default web/API development origins differ, but the API does not provide
   CORS handling and Vite does not proxy the API. Browser sessions therefore
   fall back to unranked under the default local topology.
3. Leaderboard IDs are parsed as though their prefix were a game ID. The
   declared `rpr.score` category does not resolve to the stored
   `rug-pull-rumble` game ID.
4. A verified row still stores client-claimed outcome, statistics, duration,
   build version, and trace hash. Only score and replay state are recomputed.
5. The server does not fully validate result seed, session ID, build version,
   trace version agreement, trace hash, exact payload length, or canonical
   result equality.
6. A ticket is consumed before all trace validation and replay verification
   complete, preventing a safe retry after some submission failures.
7. The result screen labels a ticketed result as `Ranked` before verification
   succeeds. Verification status and placement are not rendered back into the
   result screen.

### Multi-game extensibility

1. The shared result screen imports RPR-specific copy, share content, outcome
   semantics, statistic labels, and distribution hooks.
2. The Phaser config factory imports RPR content, hardcodes title and URL, and
   cannot accept game-specific physics, scale, or full input configuration.
3. API verifier dispatch is hardcoded to Rug Pull Rumble.
4. Known game versions are duplicated in API configuration.
5. The replay viewer is placed in arcade infrastructure but imports RPR scenes
   directly.
6. The completion contract requires a raw input trace from every game rather
   than expressing verification evidence as a capability.
7. The result outcome union is too narrow for score-only, distance, survival,
   race, puzzle, mission, and other game formats.

### Shell lifecycle

1. Concurrent or repeated launches are not protected by an operation token.
2. Session acquisition is not cancelled when a player exits.
3. A session request can resolve after its mount has been detached and still
   launch a game.
4. Synchronous `module.launch()` errors are not caught.
5. The shell cannot observe asynchronous Phaser boot or preload failure.
6. Optional pause support is insufficient for orientation, visibility, shell
   overlays, and ranked frame accounting.
7. Existing teardown tests primarily prove canvas removal, not removal of
   listeners, timers, overlays, audio resources, or WebGL state.

### Controls and traces

1. Trace action order is inferred from `Object.keys()` on the first frame.
2. Server decoders depend on hardcoded positional knowledge of that inferred
   order.
3. Analog values are consumed at full precision by the live simulation but
   replayed after signed-16-bit quantization, which can cause deterministic
   divergence.
4. Trace parsing lacks strict schema, size, frame-count, and payload-length
   validation.
5. Touch drag zones capture pointers but do not currently emit drag axes.
6. Pointer sources do not cover every cancellation/leave/blur case needed to
   guarantee that pressed state cannot stick.

### Operational readiness

1. Session tickets, results, traces, and leaderboards disappear on API restart.
2. Production configuration can silently use the development ticket secret.
3. API requests are cast to TypeScript interfaces without runtime schemas.
4. Request bodies, traces, verifier work, and rate-limit state lack production
   resource bounds.
5. There are no enforced lint boundaries preventing shell/game, cross-game, or
   Phaser/package dependency leaks.
6. Root command naming and documentation do not accurately describe all tests
   currently run.

## Target Repository Shape

Names may change during detailed planning, but the ownership boundaries should
remain:

```text
apps/
  web/
    src/arcade/                    # Generic DOM shell and web services
    src/games/<game-id>/           # Phaser/DOM presentation adapter per game
  api/
    src/verifiers/                 # Explicit verifier adapters + registry
    src/routes/                    # Runtime-validated HTTP boundaries
    src/store/                     # Durable transactional storage interface

packages/
  protocol/                        # Pure shared wire contracts and codecs
  controls/                        # Phaser-free device input sources
  rug-pull-rumble-core/            # Pure RPR sim + canonical result derivation
  crypto-crash-launcher-core/      # Pure launcher sim + canonical result derivation
```

The exact number of packages should remain proportional to actual consumers.
Do not create a generic `game-engine`, `physics`, or `shared-sim` package merely
because two game cores follow similar principles.

---

# Phase 0: Baseline and Architecture Record

## Objective

Turn the review findings into a verified starting point and prevent accidental
scope drift while later phases are planned.

## Scope

- Re-run and record the complete current validation baseline.
- Reproduce the ranked hash, CORS, and leaderboard failures through focused
  tests or documented probes.
- Inventory public platform contracts and all current consumers.
- Confirm the exact Phaser version and dependency policy.
- Record architectural decisions that are already agreed.
- Identify dirty or untracked work that must remain outside platform commits.

## Required Deliverables

- Updated baseline section in this document.
- Focused failing tests or reproducible evidence for critical defects.
- Initial Architecture Decision Records in the Decision Log.
- A detailed Phase 1 plan.

## Exit Criteria

- Every critical ranked defect has a reproducible test or probe.
- Current commands, versions, and repository status are recorded.
- No production behavior has been changed.
- Phase 1 scope is approved.

## Work Log

Status: `COMPLETE`

Planning document:

- `phases/phase-0-baseline-and-architecture-record.md`
- `phases/phase-1-ranked-vertical-slice-plan.md`

Implementation notes:

- Captured the environment, dependency graph, workspace state, commands, test
  counts, build sizes, public contracts, and consumers.
- Ran temporary passing probes that asserted the observed broken behavior, then
  removed the probe file. No intentionally failing/skipped test remains.
- Added no production code, dependency, manifest, lockfile, or runtime change.

Verification evidence:

- Typecheck, lint, 168 Vitest tests, production build, and 17 Playwright tests
  pass.
- `P0-RANK-001` through `P0-RANK-007` reproduce terminal-hash mismatch, missing
  default CORS path, leaderboard category mismatch, client-owned verified
  metadata, unbound result identity/trace metadata, premature ticket
  consumption, and premature ranked UI.
- All technical exit criteria are met and the Phase 1 plan was approved on
  2026-07-12.

Deferred items:

- Phase 1 implements ranked-flow corrections after its plan is approved.
- Exact Phaser `4.2.1` installation waits for the first relevant Phaser
  implementation phase and focused compatibility validation.
- Phase 6 owns the final input/trace schema redesign; Phase 7 owns durable
  transactions, registries, storage, and production hardening.

---

# Phase 1: Repair the Ranked Vertical Slice

## Objective

Make one complete RPR ranked session function correctly from browser ticket
request through server replay acceptance and visible verified placement.

This is a correctness repair, not yet the final generalized architecture.
Temporary code is acceptable only when its removal is assigned to a later
phase.

## Scope

- Establish a working same-origin API path or a narrowly configured CORS policy.
- Make client and verifier terminal hashing identical.
- Validate ticket/result seed, session ID, and game version consistency.
- Validate trace encoding version and trace hash.
- Ensure the server recomputes and stores canonical outcome, score, statistics,
  duration, and replay hash.
- Resolve leaderboard categories without parsing game IDs from category names.
- Display `ticketed`, `submitting`, `verified`, `rejected`, and network-failure
  states accurately.
- Return canonical score and placement to the visible result screen.
- Add a real browser-to-API acceptance test.

## Planning Questions

- Will local and production deployments use a same-origin `/api` route?
- Should ticket consumption occur on submission attempt, verifier start, or
  successful acceptance? What retry behavior is intended?
- Which failures should downgrade a result to local/unranked, and which should
  remain visibly rejected?
- What exact data is retained for rejected or flagged submissions?

## Exit Criteria

- A real RPR browser session can obtain a ticket and receive an accepted server
  response under the supported local topology.
- A tampered seed, result, trace, hash, score, statistic, outcome, or version is
  rejected.
- Only server-derived fields enter verified leaderboard storage.
- The declared RPR leaderboard category returns the accepted result and correct
  placement.
- The result screen never labels an unverified submission as verified.
- Existing unranked/offline play continues to work.
- Typecheck, lint, unit tests, API integration tests, production build, and
  relevant Playwright tests pass.

## Work Log

Status: `COMPLETE`

Planning document:

- `phases/phase-1-ranked-vertical-slice-plan.md`

Implementation notes:

- Added strict runtime validation for session/result payloads, strict V1 trace
  bounds and exact-length decoding, and shared Web Crypto SHA-256 helpers.
- Bound signed tickets and result identities to exact game, game version, build,
  session, seed, trace version, and trace hash values.
- Moved verified result ownership to authoritative replay output, made ticket
  consumption atomic immediately before replay, and isolated `rpr.score` behind
  an explicit category map.
- Established the same-origin `/api` route, exact build handoff, and honest DOM
  states for verifying, verified, rejected, failed, and unranked results.
- Added local ranked-development commands and documentation. RPR-specific result
  derivation and backend maps remain intentionally temporary pending Phases 2
  and 7.

Verification evidence:

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
- `pnpm test:sim` passes 23 files and 197 tests, including permanent protocol,
  API, service, and DOM regressions for P0-RANK-001 through P0-RANK-007.
- `pnpm test:e2e` passes all 17 desktop/mobile tests with API and Vite running
  together. The real KO flow observes `Verifying` before server acceptance,
  then canonical score and placement; an API-unavailable route proves unranked
  play remains usable.
- Tampered canonical fields are rejected and review-flagged after replay;
  verified store assertions prove ticket/server-derived identity, hashes,
  outcome, score, statistics, and duration.

Deferred items:

- Phase 2 centralizes RPR terminal serialization and result derivation in the
  pure game core.
- Phase 3 replaces temporary platform contracts; Phase 7 replaces RPR-specific
  verifier/category maps and in-memory ticket transactions.

---

# Phase 2: Make Each Game Core the Source of Truth

## Objective

Remove duplicated RPR rules from the web scene and API verifier so that client
and server cannot drift on scoring, terminal serialization, hashing, outcome,
or statistics.

## Scope

- Define the RPR pure-core public surface.
- Move canonical terminal serialization, result derivation, and score logic
  into that core.
- Share trace-to-simulation input decoding from the core rather than duplicating
  positional decoding in web and API code.
- Have the live game, replay viewer, determinism fixtures, and API verifier use
  the same functions.
- Decide whether the existing `@rpr/sim` and `@rpr/content` packages become a
  composed RPR core or remain separate behind one RPR-specific facade.
- Keep Phaser and DOM dependencies out of all core packages.

## Planning Questions

- Is `@rpr/sim` already the correct core boundary, or should a thin
  `@rpr/rug-pull-rumble-core` package compose sim and content?
- Where should cross-runtime SHA-256 live?
- What exact serialized state is stable across compatible game versions?
- Does a score-rule change require a game version bump, result schema bump, or
  both?

## Exit Criteria

- Score, outcome, statistics, duration, terminal serialization, and replay hash
  each have one canonical implementation.
- Web and API contain no duplicate RPR score formula or input trace decoder.
- A determinism fixture proves identical canonical results in browser-compatible
  and server runtimes.
- No Phaser or DOM imports enter pure packages.
- All existing behavior remains playable and tests pass.

## Work Log

Status: `COMPLETE`

Planning document:

- `phases/phase-2-game-core-source-of-truth.md`

Implementation notes:

- Added `@rpr/rug-pull-rumble-core` as the only owner of composed match wiring,
  V1 trace decoding, terminal serialization, result derivation, and replay.
- Migrated the live scene, replay viewer, API verifier, manifest/config version
  constants, and determinism fixtures to the core.
- Made exact terminal exhaustion canonical: incomplete and trailing traces are
  consumed and retained for review after replay begins.

Verification evidence:

- Typecheck, lint, production build, and `git diff --check` pass.
- 24 Vitest files with 205 tests and all 17 Playwright tests pass.
- The pinned cross-consumer fixture produces score `555` at frame `677` and
  replay hash prefix `254078a5`; architecture checks keep Phaser and apps out of
  the pure core.

Deferred items:

- Phase 3 owns generalized platform contracts and result presentation.
- Phase 6 owns explicit named action schemas and a replacement for positional
  Trace V1.
- Phase 7 owns generic verifier dispatch, persistent review data, and durable
  ticket transactions.

---

# Phase 3: Redesign the Platform Contracts and Capabilities

## Objective

Define a small versioned shell/game contract that supports different game
formats without forcing every game into fighter outcomes or identical
verification evidence.

## Scope

- Redesign `ArcadeGameManifest`, `ArcadeGameContext`, `ArcadeGameModule`, and
  `ArcadeGameHandle`.
- Add explicit game capabilities for ranked play, replay, touch, gamepad,
  suspension, and orientation.
- Separate canonical verified result data from web presentation data.
- Replace the required raw trace callback with discriminated verification
  evidence.
- Replace `ranked: boolean` with an explicit session/submission status model.
- Decide the versioning rules for games, input schemas, result schemas, trace
  codecs, and builds.
- Require games to identify their exact version when requesting sessions.
- Define safe game-owned result presentation without allowing raw HTML.

## Candidate Contract Direction

```ts
type VerificationEvidence =
  | {
      kind: 'input-trace';
      schemaId: string;
      encodingVersion: number;
      bytes: Uint8Array;
    }
  | { kind: 'none' };

interface GameCompletion {
  result: CanonicalGameResult;
  presentation: ResultPresentation;
  evidence: VerificationEvidence;
}

type RankingStatus =
  | 'unranked'
  | 'ticketed'
  | 'submitting'
  | 'verified'
  | 'rejected'
  | 'submission-failed';
```

This is a direction, not an approved final API.

## Planning Questions

- Which manifest metadata must be shared with the API, and which remains web
  only?
- Should result presentation live in the manifest, completion payload, or a
  game-supplied presenter function?
- Should `launch()` return a promise, a handle with a `ready` promise, or both?
- What is the minimum mandatory lifecycle surface every game can support?
- How are aborted sessions and games without scores represented?

## Exit Criteria

- Contract types contain no Phaser, DOM implementation, or RPR-specific types.
- A fighter, launcher, score-only game, and non-ranked game can be represented
  without casts or meaningless fields.
- Ranked capability is explicit; the shell does not request tickets for games
  that cannot be verified.
- Canonical result data is distinct from presentation.
- All contract consumers migrate without compatibility shims remaining.
- Contract tests and type-level examples cover multiple game shapes.

## Work Log

Status: `COMPLETE`

Planning document:

- `phases/phase-3-platform-contracts-and-capabilities.md`

Implementation notes:

- Replaced the flat RPR-shaped wire model with nested game/schema identities,
  canonical metric maps, discriminated verification evidence, and explicit
  ticketed/unranked sessions.
- Added a synchronous launch handle with observable readiness, reasoned
  suspension, abort context, and manifest-declared input/replay/suspension
  capabilities.
- Made result presentation game-owned but text/link-only, then migrated RPR and
  the API end to end without aliases or compatibility shims.
- Pulled the generic safe result renderer portion of Phase 5 forward because it
  is required to prove the Phase 3 completion contract.

Verification evidence:

- Typecheck and lint pass across the workspace.
- 25 Vitest files with 204 tests pass, including compiled fighter, launcher,
  score-only, and unranked contract examples.
- Production build and `git diff --check` pass.
- All 17 Playwright desktop/mobile flows pass.

Deferred items:

- Phase 4 retains full shell state-machine and asynchronous race hardening.
- Phase 5 retains Phaser factory configuration, replay entry-point neutrality,
  CSS extraction, and accessibility refinement.
- Phase 6 retains named action schemas and Trace V2; Phase 7 retains verifier
  registries, generic category dispatch, and durable transactional storage.

---

# Phase 4: Harden the Shell Lifecycle

## Objective

Make selection, loading, session acquisition, launch, suspension, completion,
and teardown race-safe and observable.

## Scope

- Add a small explicit shell state machine.
- Give every launch operation an ID and `AbortController`.
- Validate operation ownership after every asynchronous boundary.
- Prevent duplicate launches and stale handle replacement.
- Catch module load, launch, boot, and preload failures.
- Make game launch readiness observable.
- Require suspension/resumption for orientation and page visibility.
- Define exactly-once completion behavior.
- Make teardown idempotent and observable.
- Remove timers, listeners, overlays, canvases, audio resources, and game globals
  during teardown.
- Handle browser visibility changes and interrupted sessions without consuming
  unintended ranked frames.

## Candidate Shell States

```text
SELECTING
  -> LOADING_MODULE
  -> ACQUIRING_SESSION
  -> LAUNCHING
  -> PLAYING
  -> COMPLETING
  -> RESULTS
```

Error, cancellation, and exit transitions must be defined during planning.

## Exit Criteria

- Rapid double selection creates at most one game.
- Exit during module load, session fetch, or game boot leaves no detached game
  or late state mutation.
- Launch and preload errors return to a usable shell error surface.
- Orientation and visibility suspension stop ranked simulation input/frame
  consumption.
- Completion is accepted once; later callbacks are ignored and diagnosed.
- Repeated sequential launches show stable listener, timer, canvas, overlay,
  and resource counts.
- Lifecycle race tests and end-to-end teardown tests pass.

## Work Log

Status: `NOT STARTED`

Planning document:

Implementation notes:

Verification evidence:

Deferred items:

---

# Phase 5: Make Shared Web Surfaces Game-Neutral

## Objective

Remove remaining Rug Pull Rumble assumptions from the shell, Phaser factory,
results, sharing, and replay entry points.

## Scope

- Make the Phaser config factory accept game title, dimensions, scale mode,
  background, physics, input, renderer, and scene configuration.
- Remove RPR content imports from shared arcade modules.
- Render result headlines, tones, statistic labels, share text, links, and hooks
  from safe game-owned presentation data.
- Support win/loss, completion, score-only, distance, survival, placement,
  puzzle, abort, and neutral outcomes.
- Make ranked submission status update the live result view.
- Turn the replay viewer into a shell that dispatches to a game-supplied replay
  adapter.
- Split monolithic shell styling out of `index.html`.
- Ensure selection and result surfaces scroll safely on short mobile viewports.
- Preserve keyboard and screen-reader usability for DOM surfaces.

## Planning Questions

- What presentation fields are immutable game metadata versus per-run data?
- How are share URLs constructed for different games and deployments?
- Do distribution hooks belong to the game manifest, arcade configuration, or
  both?
- Which technical replay details are development-only versus player-visible?

## Exit Criteria

- No shared arcade module imports RPR content or game-internal scenes.
- Two fixture manifests with different orientations, physics configs, outcome
  styles, and statistics render correctly.
- Result status changes visibly from ticketed through verified/rejected.
- Replay dispatch selects a game adapter by explicit game/version metadata.
- Mobile and accessibility checks pass.

## Work Log

Status: `NOT STARTED`

Planning document:

Implementation notes:

Verification evidence:

Deferred items:

---

# Phase 6: Introduce Explicit Canonical Input and Trace Schemas

## Objective

Make recorded input stable, versioned, deterministic for analog games, and safe
to decode from untrusted submissions.

## Scope

- Define explicit ordered input schemas with stable schema IDs.
- Construct recorders from schemas rather than first-frame object keys.
- Canonicalize and quantize input before both recording and simulation.
- Version trace envelopes separately from game input schemas.
- Include sufficient schema metadata for safe verifier dispatch.
- Add strict bounds and exact payload-length validation.
- Define frame and byte limits per game/session.
- Complete touch drag-axis behavior.
- Harden pointer cancellation, leave, lost-capture, and blur behavior.
- Evaluate run-length or delta encoding only if real traces justify it.
- Provide migration handling for stored V1 traces if they must remain replayable.

## Canonical Input Flow

```text
Device sources
  -> merge
  -> clamp and quantize to schema
  -> canonical input frame
  -> record canonical frame
  -> game simulation consumes the same canonical frame
```

## Planning Questions

- Must existing V1 RPR traces remain replayable?
- What analog precision is sufficient for each expected game format?
- Does a schema include semantic action names on the wire, or use a registered
  schema ID plus positional payload?
- Which compression scheme keeps decoding simple and bounded?
- How are pause/suspension intervals represented, if at all?

## Exit Criteria

- Input order cannot change because of object construction order.
- Live and replay simulations consume byte-equivalent canonical input values.
- Malformed, truncated, oversized, trailing, or unknown-schema traces fail with
  controlled validation errors.
- Touch stick, drag, pointer, keyboard, and gamepad sources cannot retain stuck
  state after cancellation or teardown.
- Determinism fixtures cover button-only and analog traces.
- Server decoding has explicit time and memory bounds.

## Work Log

Status: `NOT STARTED`

Planning document:

Implementation notes:

Verification evidence:

Deferred items:

---

# Phase 7: Generalize and Harden the Verification Backend

## Objective

Turn the API from an RPR-specific in-memory prototype into a durable,
runtime-validated service that dispatches explicitly across games and versions.

## Scope

- Add a game verifier registry keyed by game ID and supported version.
- Add an explicit leaderboard category registry.
- Validate all request and stored data at runtime.
- Dispatch trace schemas and result schemas explicitly.
- Ensure verifiers return complete canonical results.
- Add transactional ticket lifecycle and durable result/trace storage.
- Define retry, reservation, expiry, rejection, and review-flag behavior.
- Add request body, trace size, frame count, and verifier execution limits.
- Fail production startup when required secrets or durable configuration are
  absent.
- Bound or externalize rate-limit state and establish trusted proxy behavior.
- Add migrations and storage interfaces suitable for the chosen database.
- Preserve stored traces needed for replay and review.

## Planning Questions

- SQLite or PostgreSQL for the first production deployment?
- How are verifier versions retained while old tickets or stored replays exist?
- What is the retention policy for rejected traces and review flags?
- Should verification execute inline, in a worker, or behind a queue for V1?
- What production topology supplies TLS, same-origin routing, and trusted client
  IP information?

## Exit Criteria

- Adding a verifier requires one game-local adapter and one registry entry, not
  route conditionals.
- Leaderboard categories use registered metric and ordering definitions.
- API restart preserves tickets, verified results, traces, and leaderboards.
- Ticket acceptance and result insertion are transactionally safe.
- Malformed or oversized requests cannot crash or exhaust the verifier.
- Production refuses known-insecure default configuration.
- API integration tests cover every ticket state and canonical verification
  field.

## Work Log

Status: `NOT STARTED`

Planning document:

Implementation notes:

Verification evidence:

Deferred items:

---

# Phase 8: Enforce Architecture and Prove Multi-Format Support

## Objective

Make architectural boundaries executable and prove that the platform works for
more than a fighting game before committing the launcher to them.

## Scope

- Add lint or dependency-boundary rules:
  - Pure packages cannot import Phaser, DOM, or game web adapters.
  - Games cannot import other games.
  - The shell cannot import game internals beyond approved adapters/manifests.
  - The API cannot import web code.
- Add contract-conformance tests.
- Build small test-only fixture games/adapters representing different shapes:
  - A deterministic button-only game.
  - An analog-input game.
  - A non-ranked game.
  - A game with different orientation, scale, and Phaser physics config.
- Test sequential game isolation and teardown.
- Test generic result presentation and replay dispatch.
- Rename and document validation commands accurately.
- Establish the required check matrix for every later game.

Fixture games are test infrastructure, not shipped arcade content. Keep them
minimal and avoid turning them into a shared engine.

## Exit Criteria

- Forbidden imports fail lint or a dedicated architecture test.
- Fixture games launch, suspend, complete, tear down, and render results through
  the same contract used by production games.
- Button and analog verification fixtures pass client/server parity tests.
- Two sequential Phaser games do not share scenes, textures, registry state,
  listeners, overlays, or audio.
- The documented validation matrix passes in CI.
- The platform has no RPR-specific conditional outside RPR-owned code and
  explicit registries.

## Work Log

Status: `NOT STARTED`

Planning document:

Implementation notes:

Verification evidence:

Deferred items:

---

# Phase 9: Adapt Crypto Crash Launcher to the Platform

## Objective

Rewrite the launcher specification as an arcade-native implementation plan that
preserves its gameplay spirit while satisfying the hardened contracts and
ranked determinism requirements.

This phase is design and planning. It must resolve authority and determinism
before full production implementation begins.

## Scope

- Replace the standalone Vite/project setup with monorepo locations and arcade
  module registration.
- Define launcher manifest metadata, capabilities, orientation, result
  presentation, input schema, result schema, and verifier adapter.
- Design a pure fixed-step launcher simulation core.
- Decide the deterministic collision and ragdoll model.
- Separate authoritative gameplay physics from Phaser presentation.
- Define content/config ownership and stable asset keys.
- Define replay serialization and terminal hashing.
- Define server-derived score, statistics, and end conditions.
- Map desktop pointer/keyboard and mobile tap into the same canonical launch
  action.
- Replace the in-Phaser result overlay with shared shell completion.
- Produce a phased launcher implementation plan with tests at every stage.

## Required Design Decision

The original launcher design assigns gameplay authority to Phaser Matter. A
ranked arcade game requires a pure, fixed-step, seeded simulation that can run
identically in web and server environments.

The selected solution may be:

- A game-specific deterministic rigid-body/constraint simulation.
- A deliberately simplified deterministic authoritative model with richer
  presentation-only ragdoll effects.
- A vetted deterministic physics implementation demonstrably identical across
  supported runtimes.

The decision must be backed by determinism fixtures and performance evidence.
Matter must not silently remain authoritative merely because it is convenient
for presentation.

## Planning Questions

- Which parts of ragdoll behavior affect score and terminal state?
- How much physical variation can be derived deterministically from the session
  seed?
- Is exact segmented-body simulation required for authority, or can a simpler
  authoritative crash model drive a richer visual ragdoll?
- What is the maximum run length and trace size?
- Which score events must be canonical and replay-visible?
- How will level configuration remain data-driven without becoming a generic
  platform format?

## Exit Criteria

- The launcher specification references the actual monorepo and platform
  contracts.
- Simulation authority is explicit and server-replayable.
- The input, result, trace, score, replay, and version schemas are defined.
- Phaser responsibilities are presentation-only for ranked state.
- The full implementation task plan is dependency-ordered and test-backed.
- No unresolved architecture question can force a foundational rewrite during
  Phase 10.

## Work Log

Status: `NOT STARTED`

Planning document:

Implementation notes:

Verification evidence:

Deferred items:

---

# Phase 10: Build and Ship Crypto Crash Launcher V1

## Objective

Deliver Crypto Crash Launcher as a finished, fast-to-replay arcade product and
the first proof that the hardened platform supports a game format fundamentally
different from Rug Pull Rumble.

## Scope

The detailed scope will come from Phase 9. At minimum it must include:

- Pure launcher simulation core.
- Deterministic launch, flight, collision, crash, scoring, and run-end logic.
- Server replay verifier and determinism fixtures.
- Phaser presentation, camera, feedback, audio, placeholder/finalizable assets,
  and responsive layout.
- Desktop and mobile one-input controls.
- Shell manifest, lifecycle, results, share flow, ranked status, replay, and
  leaderboard integration.
- Repeated-run stability and clean cross-game teardown.
- Manual first-time comprehension, feel, comedy, and replay-motivation testing.
- Static web deployment and production API verification.

## Exit Criteria

- A first-time player can launch without external instruction.
- Launch timing produces meaningfully different deterministic outcomes.
- Common runs produce entertaining collisions or crashes.
- Ranked results are accepted only after server replay.
- Tampered results and traces are rejected.
- Desktop and representative mobile flows are complete.
- Replay, result, share, personal best, verified placement, and replay actions
  work through shared platform surfaces.
- RPR and Launcher can launch sequentially without leaked state.
- Typecheck, lint, unit, determinism, API, browser, performance, and manual QA
  gates pass.
- A production decision and post-V1 backlog are recorded.

## Work Log

Status: `NOT STARTED`

Planning document:

Implementation notes:

Verification evidence:

Deferred items:

---

# Cross-Phase Validation Matrix

Every implementation phase must select the relevant checks below and record
their exact results in its Work Log.

| Area | Required Evidence |
|---|---|
| Types | `pnpm typecheck` |
| Static boundaries | `pnpm lint` plus architecture rules when introduced |
| Pure game behavior | Focused unit, fuzz, property, and determinism tests |
| Controls/protocol | Codec round trips, malformed input, canonicalization tests |
| API | Direct route tests and durable-store integration tests |
| Web shell | DOM unit/integration tests where practical |
| Browser flow | Relevant Playwright desktop and mobile projects |
| Ranked path | Real browser-to-API accepted and tampered submission cases |
| Teardown | Repeated sequential game/resource-count checks |
| Build | `pnpm build` and static preview smoke test |
| Feel | Recorded manual QA observations where automation is insufficient |

Passing a compiler is not sufficient evidence for lifecycle, verification,
determinism, or browser behavior.

# Phase Planning Template

Copy this template into the relevant phase's Work Log or a linked phase plan
before implementation:

```markdown
## Phase N Detailed Plan

Status: PLANNING
Owner:
Started:
Target completion:

### Decisions required

- ...

### In scope

- ...

### Explicitly out of scope

- ...

### Existing behavior to preserve

- ...

### Contract and data migrations

- ...

### Ordered implementation tasks

1. ...

### Files/packages expected to change

- ...

### Test plan

- Unit:
- Integration:
- Browser:
- Manual:

### Rollback/removal plan

- ...

### Completion evidence

- Command/result:
- Artifact/link:

### Deferred follow-up

- ...
```

# Decision Log

Record decisions that constrain later phases. Do not silently change an earlier
decision; add a superseding entry with rationale.

| ID | Date | Status | Decision | Rationale | Supersedes |
|---|---|---|---|---|---|
| ADR-001 | 2026-07-12 | Accepted | Keep the arcade shell thin; do not create a shared game engine, ECS, physics wrapper, or renderer abstraction. | Different games should share lifecycle and services, not gameplay architecture. | — |
| ADR-002 | 2026-07-12 | Accepted | Every ranked game uses a pure, fixed-step, seeded core replayed by the server. | The client must never be authoritative for ranked results. | — |
| ADR-003 | 2026-07-12 | Accepted | Each game core owns canonical terminal serialization, hashing, scoring, outcome, and statistics. | Prevents web/API rule drift and forged verified metadata. | — |
| ADR-004 | 2026-07-12 | Accepted | Breaking internal platform contracts is allowed during hardening. | The platform is greenfield; preserving weak seams would impose permanent cost. | — |
| ADR-005 | 2026-07-12 | Accepted | Crypto Crash Launcher will follow the harder verification-ready path rather than shipping Matter as unranked authority. | The target is a finished V1 product and a genuine proof of the platform. | — |
| ADR-006 | 2026-07-12 | Accepted | Use one exact Phaser version across the monorepo, targeting `4.2.1`. | Exact pinning prevents silent framework drift across game implementations; Phase 0 records policy without changing dependencies. | — |
| ADR-007 | 2026-07-12 | Accepted | Keep detailed planning and execution evidence in one document per phase while the roadmap remains the status index. | Phase records can be detailed without making the cross-phase roadmap difficult to navigate. | — |
| ADR-008 | 2026-07-12 | Accepted | Preserve Phase 0 defect evidence as documented non-gating probes and add permanent regression tests with Phase 1 fixes. | Main remains green while every defect has reproducible evidence and an assigned test. | — |

# Deferred Backlog

Items belong here only when deliberately excluded from the active phases. Add a
target phase or reconsideration condition.

| Item | Reason Deferred | Reconsider When |
|---|---|---|
| Accounts and authenticated identity | Not required for V1 verification | Product requires persistent identity |
| Wallet connection and payouts | Regulatory and reward design gate remains closed | Separate reviewed rewards project begins |
| Client-side anti-cheat or fingerprinting | Does not establish trustworthy results and harms scope/privacy | Only with a specific reviewed threat model |
| Generic asset pipeline package | Current asset volume does not justify it | Two or more games need the same tooling |
| Generic simulation or physics package | Games share principles, not gameplay implementation | Only after proven identical requirements exist |
| Key rebinding UI | Binding data should be ready, UI is not V1-critical | Accessibility/product priorities require it |

# Change Log

| Date | Change | Author/Phase |
|---|---|---|
| 2026-07-12 | Created the architecture hardening roadmap from the greenfield platform review and agreed direction. | Initial review |
| 2026-07-12 | Captured the Phase 0 baseline, contract inventory, seven ranked-defect probes, dependency policy, and proposed Phase 1 ranked vertical-slice plan. | Phase 0 |
| 2026-07-12 | Approved the Phase 1 ranked vertical-slice plan, completed Phase 0, and marked Phase 1 ready for implementation. | Phase 0 closure |
