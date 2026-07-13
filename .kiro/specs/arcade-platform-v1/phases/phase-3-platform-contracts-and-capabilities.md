# Phase 3: Platform Contracts and Capabilities

Status: `COMPLETE`

Approved and completed: 2026-07-12

Roadmap: `../architecture-hardening-roadmap.md`

## Goal

Replace the prototype's Rug Pull Rumble-shaped platform API with a small,
versioned contract that can represent fighters, launchers, score attacks, and
games with no ranked backend. Make the breaking cutover once, without aliases
or compatibility shims, while preserving the working ranked RPR vertical slice.

## Locked Decisions

- `GameContractDescriptor` is the shared machine-readable identity. Web-only
  title, orientation, controls, and presentation remain in the web manifest.
- `launch()` returns a teardown handle synchronously. The handle's `ready`
  promise resolves only when play is available and rejects when boot cannot
  complete.
- Ranked capability is the verification descriptor: `input-trace` games request
  tickets; `none` games start locally and never contact the session API.
- Sessions use a discriminated `ticketed | unranked` model. Submission states
  remain distinct through submitting, verified, rejected, and transport failure.
- Canonical results contain only schema identity, outcome, numeric metrics,
  duration, and optional replay hash. They contain no DOM copy or ranking state.
- Result presentation travels with completion because it may depend on the run.
  It permits text, numeric format metadata, and validated HTTP(S) links only;
  raw HTML and game-owned renderer functions are forbidden.
- Lifecycle suspension is reasoned so orientation, visibility, and shell causes
  can compose without one resume accidentally clearing another pause.

## Versioning Rules

| Identity | Bump when | Do not use it for |
|---|---|---|
| Game version | Deterministic rules, scoring meaning, terminal rules, or game-owned canonical behavior changes | A new deployment of unchanged rules |
| Result schema | Result fields, metric names, types, or their wire meaning changes | Presentation copy or CSS changes |
| Input schema | The named action vocabulary or action semantics change | Re-encoding the same actions |
| Trace encoding version | Byte/serialization format for the same input schema changes | Gameplay rule changes |
| Build version | A deployable client/server artifact changes | Substituting for game or schema compatibility |

Tickets bind exact game and build identities. Claims repeat those identities and
the API compares them before replay. Evidence and canonical results carry their
own schema identities, which the verifier validates before consuming a ticket.

## Implemented Contract

- `@rpr/protocol` owns DOM-free game/schema identities, descriptors, sessions,
  evidence, claims, canonical results, submissions, and leaderboard responses.
- `apps/web/src/arcade/types.ts` owns the DOM boundary: manifests, launch
  context/handle, capabilities, safe result presentation, and completion.
- `RPR_CONTRACT` is the single RPR game/result/input/codec descriptor exported
  by the pure game core and consumed by the web manifest and API.
- RPR core canonical derivation now returns the shared result shape directly;
  web and API no longer translate a legacy `score + stats` result.
- The shell skips session acquisition for unverifiable games, passes an
  `AbortSignal`, waits for observable game readiness, routes reasoned
  orientation suspension, and maintains explicit submission status.
- The generic DOM result screen renders arbitrary declared metrics, scoreless
  results, neutral outcomes, duration, share copy, and safe links. It replaces
  local claims with the server's canonical result after verification.
- API validation accepts large bounded evidence separately from short metadata,
  validates exact result/input schema identities, and returns canonical results
  and category placements in the new protocol.

## Multi-Format Evidence

`contract-examples.ts` is compiled with the web application and defines four
cast-free manifests:

- a landscape fighter with replay verification and score ranking;
- a portrait launcher with a different result, input schema, and distance rank;
- a pointer/touch score attack with local bests but no backend verification;
- an unranked sandbox with no leaderboard or meaningless local-best field.

Runtime contract tests assert their capability and orientation distinctions.
Result-screen tests additionally prove non-score primary metrics, absent stats,
neutral tone, text escaping, unsafe URL rejection, and canonical replacement.

## Compatibility and Deferred Work

- This is a deliberate breaking cutover. Removed flat fields such as `gameId`,
  `gameVersion`, `ranked`, `inputTrace`, and `canonicalScore` have no aliases.
- Phase 4 owns the full shell state machine, operation IDs, async cancellation
  races, visibility suspension, and repeated-launch resource accounting.
- Phase 5 still owns configurable shared Phaser construction, replay-route
  neutrality, CSS extraction, and accessibility. Only the contract-dependent
  generic result surface was completed here.
- Trace V1 remains positional. Phase 6 owns named canonical action schemas and
  Trace V2 rather than extending the compatibility codec in this phase.
- The backend still dispatches the sole RPR verifier/category directly and uses
  its existing in-memory store. Phase 7 owns registries and durable transactions.

## Validation

- `pnpm typecheck` — pass across seven buildable workspace projects.
- `pnpm lint` — pass.
- `pnpm test:sim` — 25 files and 204 tests passed.
- `pnpm build` — pass, 86 modules transformed.
- `pnpm test:e2e` — all 17 desktop and mobile tests passed.
- `git diff --check` — pass.

The required Phaser 4 setup and scene lifecycle skills were consulted for the
launch/readiness changes. No Phaser import entered protocol, sim, content, or
the pure RPR core. The pre-existing untracked Crypto Crash Launcher specification
remains outside the Phase 3 change set.
