# Phase 2: Make Each Game Core the Source of Truth

Status: `COMPLETE`

Approved and completed: 2026-07-12

Roadmap: `../architecture-hardening-roadmap.md`

## Goal

Make one pure Rug Pull Rumble core the sole authority for match wiring, trace
interpretation, terminal detection, serialization, replay hashing, score,
outcome, statistics, and duration. Phaser presents the core and the API replays
it; neither independently implements game rules.

## Locked Decisions

- Introduce `@rpr/rug-pull-rumble-core` rather than placing game-specific rules
  in the generic `@rpr/sim` engine or data-oriented `@rpr/content` package.
- Keep cross-runtime SHA-256 in `@rpr/protocol` as a platform primitive.
- Preserve the exact V1 terminal serialization and game version `0.1.0`.
- Require a game-version bump for future changes to match wiring, CPU behavior,
  input interpretation, terminal serialization, canonical results, or scoring.
- Keep Trace V1 positional encoding until the explicit schema work in Phase 6.
- Reject replay traces that end before KO or continue after the terminal frame.
  Replay has begun in both cases, so the ticket is consumed and the trace and
  claim are retained as unverified review evidence.

## Implemented Core Contract

The pure package exports:

- `RPR_GAME_ID`, `RPR_GAME_VERSION`, and V1 trace shape constants.
- `RprMatch`, which owns exact engine, content, and deterministic CPU wiring.
- `decodeRprTrace`, the only V1 positional trace-to-`CombatInput` decoder.
- `serializeRprTerminalState` and `deriveRprCanonicalResult`.
- `replayRprInputs` and typed `RprReplayError` failure codes.
- Exact `RprCanonicalResult` and `RprStats` types.

The web manifest and API configuration import the same game/version constants.
The live fight attaches only platform/session/trace identity to the core result.
The replay viewer consumes decoded core inputs and stops at trace exhaustion.
The API verifier is now a thin adapter over core replay.

## Compatibility and Deferred Work

- The `GameResult`, session, and submission wire shapes are unchanged. Phase 3
  owns their redesign.
- Trace encoding remains V1 with 13 positional buttons and no axes. Phase 6
  owns named, versioned action schemas.
- RPR verifier/category registration and durable review storage remain Phase 7.
- Low-level simulation tests continue constructing `CombatEngine` directly
  because they verify the reusable engine rather than composed RPR behavior.

## Permanent Regression Evidence

- The canonical fixture drives a real core match, records packed input, decodes
  it through the core, replays it through the API path, and compares the entire
  canonical result.
- The pinned V1 fixture is loss, score `555`, damage dealt `111`, damage taken
  `100`, frame `677`, duration `11283`, replay hash
  `254078a57fb035a7bfefeff53e62ec9723115f311a033ef99b6e92025d03d7b4`.
- Unit tests cover exact positional mapping, invalid action shapes, terminal
  enforcement, win/loss derivation, incomplete traces, trailing input, stable
  serialization, and seed sensitivity.
- API tests prove malformed action shapes remain retryable while incomplete and
  trailing replays consume tickets and create review records.
- An architecture test prohibits Phaser and application imports in the core;
  its DOM-free TypeScript configuration provides a second boundary check.

## Validation

- `pnpm typecheck` — pass across seven buildable workspace projects.
- `pnpm lint` — pass.
- `pnpm test:sim` — 24 files and 205 tests passed.
- `pnpm build` — pass, 86 modules transformed.
- `pnpm test:e2e` — all 17 desktop and mobile tests passed.
- `git diff --check` — pass.

No Phaser API, visual behavior, dependency version, or trace wire format changed.
The pre-existing untracked Crypto Crash Launcher specification remains outside
the Phase 2 change set.
