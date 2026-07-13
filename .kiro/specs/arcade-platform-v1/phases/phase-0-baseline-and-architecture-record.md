# Phase 0: Baseline and Architecture Record

Status: `COMPLETE`

Started: 2026-07-12

Last updated: 2026-07-12

Phase owner: project maintainers

Roadmap: `../architecture-hardening-roadmap.md`

Next phase plan: `./phase-1-ranked-vertical-slice-plan.md`

## Objective

Establish a reproducible starting point for arcade hardening, preserve evidence
for the critical ranked-flow defects, inventory the current platform contracts,
and lock the architectural decisions needed to plan Phase 1.

Phase 0 does not change production behavior. Temporary probe code was created
only to reproduce current defects and was removed immediately after its output
was captured.

## Completion State

All technical work and evidence collection for Phase 0 is complete. The Phase 1
scope was approved on 2026-07-12, satisfying the final Phase 0 exit criterion.

## Repository and Environment Baseline

Captured at `2026-07-12T21:09:42-06:00` in America/Edmonton.

| Item | Observed value |
|---|---|
| Host | `agenteve` |
| Kernel | Linux `6.17.0-40-generic`, x86_64 |
| Branch | `master` |
| Commit | `f9b7467d7440890cdc37b0aa2bd8a73b6f597594` |
| Commit date | `2026-07-08T00:24:16-06:00` |
| Commit subject | `feat(arcade): replay viewer — dev tool for trace replay (Task 8)` |
| Node | `v22.22.0` |
| pnpm | `10.23.0` |
| Playwright | `1.61.1` |
| TypeScript | `5.9.3` |
| Vite | `5.4.21` |
| Vitest | `2.1.9` |
| Hono | `4.12.28` |
| Phaser declaration | `^4.2.0` in `apps/web/package.json` |
| Phaser lock/runtime | `4.2.0` |
| Target Phaser policy | One exact monorepo pin at `4.2.1` |

### Initial workspace state

```text
?? .kiro/specs/arcade-platform-v1/architecture-hardening-roadmap.md
?? .kiro/specs/crypto-crash-launcher-prototype/
```

Both entries predated Phase 0 execution and belong to the active architecture
and launcher specification work. Phase 0 did not stage, commit, delete, or fold
them into unrelated changes.

## Dependency Installation Baseline

Command:

```sh
pnpm install --frozen-lockfile
```

Result: exit `0` in `0.7s`. pnpm reported that the lockfile was current and the
workspace was already up to date.

The command also emitted a non-fatal `ERR_PNPM_META_FETCH_FAIL` while checking
registry metadata because DNS resolution for `registry.npmjs.org` was
temporarily unavailable. No package resolution or lockfile update was needed.

## Validation Baseline

| Check | Result | Evidence |
|---|---|---|
| `pnpm typecheck` | PASS | Six workspace projects typechecked; exit `0`; `7.4s` |
| `pnpm lint` | PASS | ESLint completed with no findings; exit `0`; `5.3s` |
| `pnpm test:sim` | PASS | 20 files, 168 tests; exit `0`; Vitest duration `4.87s` |
| `pnpm build` | PASS | 83 modules transformed; exit `0`; Vite build `4.42s` |
| `pnpm test:e2e` | PASS | 17 Playwright tests across three projects; exit `0`; `1.1m` |

### Unit and integration coverage observed

The command named `test:sim` currently runs more than simulation tests:

- Simulation
- Content validation
- Controls
- Determinism fixtures
- API integration

All 168 tests passed. Renaming and documenting this command accurately remains
scheduled for Phase 8.

### Browser coverage observed

Playwright ran:

- Desktop Chromium gameplay, shell, teardown, replay, input, and results.
- Mobile portrait orientation gating.
- Mobile landscape touch stick and button input.

All 17 tests passed. The first attempt could not start Vite because the prior
execution sandbox prohibited binding `0.0.0.0:5173` with `EPERM`. The same
unchanged command passed after the environment restriction was removed, proving
that this was an execution-environment limitation rather than a repository
failure.

### Production build output

| Artifact | Minified | Gzip |
|---|---:|---:|
| Shell `index.html` | 12.44 kB | 2.41 kB |
| Main game chunks | approximately 22.4 kB each | approximately 7.5 kB each |
| Phaser ESM chunk | 1,685.87 kB | 381.71 kB |

Vite warned that Phaser exceeds the default 500 kB chunk warning. Phaser is
dynamically separated from the initial shell path, so Phase 0 records this as a
size baseline rather than a blocker. Premature framework-level bundle work is
not part of Phase 1.

## Current Platform Contract Inventory

### Shell and game lifecycle

| Surface | Definition | Current consumers | Current assumption/risk | Target phase |
|---|---|---|---|---|
| `ArcadeGameManifest` | `apps/web/src/arcade/types.ts` | Shell registry, RPR manifest, results, orientation | Carries metadata but no explicit ranked/evidence capabilities | Phase 3 |
| `ArcadeGameModule.launch` | `apps/web/src/arcade/types.ts` | Shell, RPR module | Synchronous; cannot report asynchronous boot/preload failure | Phase 4 |
| `ArcadeGameHandle` | `apps/web/src/arcade/types.ts` | Shell, RPR module | Pause/resume optional; teardown evidence is shallow | Phase 4 |
| `ArcadeGameContext` | `apps/web/src/arcade/types.ts` | Shell, FightScene | Completion always requires `Uint8Array` trace | Phase 3 |
| Game registry | `apps/web/src/arcade/registry.ts` | Shell | Correct explicit web registry; contains one game | Preserve; Phase 8 proves extension |
| Shell lifecycle | `apps/web/src/arcade/shell.ts` | Web entry point | Async launch races and premature ranked presentation | Phases 1 and 4 |

### Shared web surfaces

| Surface | Definition | Current consumers | Current assumption/risk | Target phase |
|---|---|---|---|---|
| Phaser config factory | `apps/web/src/arcade/phaser/config-factory.ts` | RPR launch, replay viewer | Imports RPR copy; no physics/full scale override | Phase 5 |
| Result screen | `apps/web/src/arcade/result-screen.ts` | Shell | Imports RPR win/loss/share/hooks and labels ticketed as ranked | Phases 1 and 5 |
| Replay viewer | `apps/web/src/arcade/replay.ts` | Dev hash route | Arcade-owned entry imports RPR scene directly | Phase 5 |
| Orientation gate | `apps/web/src/arcade/orientation.ts` | Shell | Optional pause cannot guarantee ranked suspension | Phase 4 |
| Settings | `apps/web/src/arcade/settings.ts` | Shell, RPR registry bridge | Small and appropriately shell-owned | Preserve |

### Input and evidence

| Surface | Definition | Current consumers | Current assumption/risk | Target phase |
|---|---|---|---|---|
| `InputFrame` / `InputSource` | `packages/controls/src/frame.ts` | Device sources and RPR input | Generic and Phaser-free | Preserve |
| Merge semantics | `packages/controls/src/frame.ts` | `MergingSource` | OR buttons/max magnitude axes | Preserve and expand tests |
| `TraceRecorder` | `packages/controls/src/trace-recorder.ts` | RPR FightScene | Infers action order from first-frame object keys | Phase 6 |
| Trace V1 codec | `packages/protocol/src/trace.ts` | Controls, replay, API verifier | No explicit game schema; incomplete strict length bounds | Phases 1 and 6 |
| Touch overlay | `packages/controls/src/touch-overlay.ts` | RPR touch adapter | Drag zones capture but do not emit axes | Phase 6 |
| Pointer source | `packages/controls/src/pointer-source.ts` | Tests/future games | Cancellation and lost-capture paths incomplete | Phase 6 |

### Protocol, verification, and storage

| Surface | Definition | Current consumers | Current assumption/risk | Target phase |
|---|---|---|---|---|
| `SessionTicket` | `packages/protocol/src/types.ts` | Web sessions, API crypto/routes | Does not bind build version | Phases 1 and 3 |
| `GameResult` | `packages/protocol/src/types.ts` | RPR, shell, API | Fighter-shaped outcome and client-owned canonical fields | Phases 1 and 3 |
| Session client | `apps/web/src/arcade/services/sessions.ts` | Shell | Defaults to cross-origin API without CORS | Phase 1 |
| Result client | `apps/web/src/arcade/services/results.ts` | Shell | Sends claim but visible UI ignores response | Phase 1 |
| API routing | `apps/api/src/server.ts` | Node adapter/tests | RPR conditional, incomplete validation, category parsing | Phases 1 and 7 |
| RPR verifier | `apps/api/src/verify/rpr.ts` | API route/tests | Duplicates decoding/scoring and returns raw state as hash | Phases 1 and 2 |
| Store | `apps/api/src/store.ts` | API route/tests | In-memory, non-transactional, accepts client metadata | Phases 1 and 7 |
| API config | `apps/api/src/config.ts` | API entry/tests | Known games duplicated; insecure default secret allowed | Phase 7 |

## Ranked Defect Evidence

A temporary five-test Vitest probe was added at
`tests/api/phase0-ranked-probes.test.ts`, run alone, and deleted. It exited `0`
because each test asserted the observed broken behavior. It is not present in
the final Phase 0 diff and did not alter the normal suite.

Command:

```sh
pnpm exec vitest run tests/api/phase0-ranked-probes.test.ts --reporter=verbose
```

Result: five probe tests passed in `516ms`.

### P0-RANK-001: Terminal hash representation mismatch

Observed:

```text
verifierPrefix: {"frame":1,"seed":42,"status":"active","player":
clientHash: 7236e351ca7b8ac811a7b98a56bb56bdd849a298fb62e883c15272157afbeede
equal: false
```

The web client hashes `serializeGameState` with SHA-256. `verifyRpr` returns the
raw serialization in its `replayHash` field. `POST /results` compares these
incompatible representations.

Expected Phase 1 regression:

- Submit a real trace using the same representation the browser produces.
- Assert server acceptance and exact canonical replay hash.
- Assert a one-byte terminal-hash mutation is rejected.

Long-term owner: Phase 2 moves serialization, hashing, and result derivation to
the game core.

### P0-RANK-002: Default browser/API topology has no CORS path

Observed simulated preflight:

```text
status: 404
access-control-allow-origin: null
access-control-allow-methods: null
```

The browser defaults to `http://localhost:3000` while Vite serves the web app on
`http://localhost:5173`. The API has no CORS middleware or preflight route, so
the session client falls back to unranked under the default topology.

Expected Phase 1 regression:

- Use the chosen same-origin `/api` topology.
- Run a real Playwright browser through ticket request and result submission.
- Preserve a separate API-unavailable test proving unranked fallback.

### P0-RANK-003: Declared leaderboard category resolves the wrong game

Observed with one verified `rug-pull-rumble` row:

```text
rpr.score entries: 0
rug-pull-rumble.score entries: 1
```

The manifest declares `rpr.score`, while the API splits the category ID and
queries game `rpr`. Stored results use `rug-pull-rumble`.

Expected Phase 1 regression:

- Insert an accepted RPR result.
- Fetch the exact manifest category ID `rpr.score`.
- Assert the canonical score and placement are returned.

Long-term owner: Phase 7 introduces a category registry with metric and order.

### P0-RANK-004: Verified storage retains client-owned canonical metadata

The probe submitted a structurally valid trace while claiming forged metadata.
The route returned HTTP `200` and `accepted: true`. It recomputed score `0` but
stored:

```text
buildVersion: forged-build
outcome: win
stats: { frames: 1, forgedMetric: 777 }
traceEncodingVersion: 99
inputTraceHash: not-the-trace-hash
```

Expected Phase 1 regression:

- Assert verified storage contains only verifier-derived outcome, score,
  statistics, duration, trace hash, and replay hash.
- Assert a client cannot create or rank by a forged statistic.

### P0-RANK-005: Result identity and trace metadata are not bound

The same accepted probe used:

```text
claimed seed: 999999
ticket seed: 42
claimed session: different-session
ticket session: signed UUID
outer trace version: 99
trace header version: 1
input trace hash: not-the-trace-hash
```

The route accepted all mismatches.

Expected Phase 1 regressions:

- Reject seed mismatch.
- Reject session mismatch.
- Reject unsupported build and game versions.
- Reject outer/header trace version mismatch.
- Reject computed trace hash mismatch.
- Reject truncated, oversized, or length-inconsistent V1 traces cleanly.

### P0-RANK-006: Malformed submission consumes the ticket too early

Observed:

```text
responseStatus: 422
canConsumeAfterFailure: false
```

The route consumes a valid signed ticket before base64 and trace validation.
A malformed transport payload burns the ticket without replay beginning.

Expected Phase 1 regression:

- Reject malformed transport/trace data without consuming the ticket.
- Consume the ticket once structural validation succeeds and authoritative
  replay begins.
- Consume replay mismatches so a rejected gameplay claim cannot be retried.

Durable idempotent acceptance and transactional storage remain Phase 7 work.

### P0-RANK-007: Ticketed is rendered as ranked before verification

Static flow evidence:

```sh
sed -n '143,185p' apps/web/src/arcade/shell.ts
sed -n '25,50p' apps/web/src/arcade/result-screen.ts
```

`onGameResult` starts `submitResult` without awaiting it, then immediately calls
`renderResultScreen` with `ranked: session.ranked`. The result screen renders a
`Ranked` badge from that boolean. The eventual accepted/rejected response is
sent only to analytics.

Expected Phase 1 regression:

- Render ticketed/submitting while the request is active.
- Render verified plus canonical score and placement on acceptance.
- Render rejected or submission-failed without claiming verification.
- Keep genuinely unranked play labeled unranked.

## Architecture and Dependency Decisions Confirmed

1. Keep the arcade shell thin; do not introduce a shared game engine, ECS,
   physics wrapper, renderer abstraction, or universal simulation state.
2. Every ranked game uses a pure, fixed-step, seeded core replayed server-side.
3. Each game core owns canonical input semantics, terminal serialization,
   hashing, scoring, outcome, and statistics.
4. Breaking internal contracts is allowed during greenfield hardening.
5. Crypto Crash Launcher follows the verification-ready path; Phaser Matter is
   not silently authoritative for ranked state.
6. Phaser uses one exact version across the monorepo. The target is `4.2.1`.
   Phase 0 records the policy but does not change dependencies.
7. Detailed planning and execution evidence lives in one document per phase;
   the roadmap remains the summary and status index.
8. Known failures are preserved as documented non-gating probes in Phase 0 and
   converted to permanent regression tests with their fixes in Phase 1.

## Phase 0 Exit Criteria

| Criterion | State | Evidence |
|---|---|---|
| Critical ranked defects have reproducible evidence | MET | P0-RANK-001 through P0-RANK-007 |
| Commands, versions, and workspace state recorded | MET | Environment and validation sections |
| Complete baseline validation executed | MET | 168 Vitest and 17 Playwright tests pass |
| Public contracts and consumers inventoried | MET | Contract inventory |
| Exact Phaser dependency policy recorded | MET | Target exact `4.2.1` |
| No production behavior changed | MET | Documentation-only retained diff |
| Detailed Phase 1 plan produced | MET | Linked Phase 1 document |
| Phase 1 scope reviewed and approved | MET | Approved by the user on 2026-07-12 |

## Deferred Items

- All production fixes belong to Phase 1 or later.
- Exact Phaser `4.2.1` dependency and lockfile update occurs with focused
  compatibility validation in the first Phaser implementation phase.
- Persistent storage, transactional idempotency, verifier registry, and
  production rate limiting remain Phase 7.
- Full input-schema redesign remains Phase 6; Phase 1 adds only strict safe V1
  validation needed for the ranked vertical slice.
- Bundle-size optimization is not scheduled until measured player load
  performance makes it necessary.

## Final Verification Before Closure

Phase 0 closure was recorded by:

1. Updating this document to `COMPLETE` and recording the approval date.
2. Updating the roadmap Phase Summary and Phase 0 Work Log to `COMPLETE`.
3. Keeping the previously recorded final validation and workspace evidence.
