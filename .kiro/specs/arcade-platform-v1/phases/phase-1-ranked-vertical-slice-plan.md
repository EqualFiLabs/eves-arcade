# Phase 1 Plan: Repair the Ranked Vertical Slice

Status: `COMPLETE`

Created: 2026-07-12

Source evidence: `./phase-0-baseline-and-architecture-record.md`

Roadmap: `../architecture-hardening-roadmap.md`

## Goal

Make one complete Rug Pull Rumble ranked session work correctly from browser
ticket acquisition through server replay, canonical result storage, visible
verification status, and leaderboard placement.

Phase 1 repairs the current vertical slice. It does not attempt the final
multi-game contract, verifier registry, persistent database, or input-schema
redesign assigned to later phases.

## Success Criteria

- A real browser session obtains a signed ticket through the supported local
  same-origin topology.
- The browser plays a real fight, submits its trace, and receives an accepted
  canonical result.
- The visible result view moves through `submitting` to `verified` and displays
  canonical score and placement.
- Every client-controlled mutation covered by Phase 0 evidence is rejected.
- Only server-derived canonical data enters verified result storage.
- The exact manifest category `rpr.score` returns verified RPR entries.
- API failure still produces immediately playable unranked sessions.
- Existing RPR game feel, controls, simulation, shell navigation, replay viewer,
  and mobile behavior remain unchanged.

## Explicitly Out of Scope

- Final shell/game contract redesign.
- Generic verifier and leaderboard registries.
- Durable SQLite/PostgreSQL storage.
- Full transactional/idempotent submission recovery.
- Trace V2 or explicit action schemas.
- Analog canonicalization.
- Generic result presentation for non-fighter games.
- Generic replay dispatch.
- Shell launch-race hardening unrelated to result submission.
- Phaser version update.
- Crypto Crash Launcher implementation.

Temporary RPR-specific code is acceptable only where this plan explicitly
labels its later removal phase.

## Decisions Locked for Phase 1

### API topology

Use a same-origin `/api` browser contract.

- Session requests use `/api/sessions`.
- Result requests use `/api/results`.
- Leaderboard requests use `/api/leaderboards/:categoryId`.
- Vite proxies `/api/*` to the local API and removes the `/api` prefix.
- Production deployment must route `/api` to the API service under the same
  origin.
- No permissive wildcard CORS policy is added.

The client may still accept an explicit `VITE_API_URL` override for integration
environments, but its default is `/api`.

### Ticket binding

The session request includes:

```ts
interface SessionRequest {
  gameId: string;
  gameVersion: string;
  buildVersion: string;
}
```

The signed ticket adds `buildVersion`. The API issues a ticket only when the
requested game version and build version are supported. The shell passes the
active manifest version and `__BUILD_VERSION__` to the session client.

Development and tests explicitly allow the `dev` and `test` build identifiers.
Production known builds are configured; production must not accept arbitrary
build strings.

Phase 3 may replace this request/ticket shape as part of the final contract.

### Ticket consumption

For the current in-memory store:

1. Validate JSON shape, signature, expiry, stored ticket identity, result
   identity, supported versions, base64, trace envelope, trace bounds, and trace
   hash without consuming the ticket.
2. Atomically mark the in-memory ticket used immediately before authoritative
   replay begins.
3. Replay mismatch and canonical-claim mismatch consume the ticket.
4. Malformed transport or structurally invalid trace does not consume it.

Durable reservation, accepted-response replay, and transaction-level
idempotency are deferred to Phase 7.

### Canonical result ownership

`verifyRpr` returns the complete server-derived result material:

```ts
interface RprVerificationResult {
  outcome: 'win' | 'loss';
  score: number;
  stats: {
    damageDealt: number;
    damageTaken: number;
    frames: number;
  };
  durationMs: number;
  replayHash: string;
}
```

The API builds the stored verified result exclusively from the signed ticket,
decoded trace, computed trace hash, verifier result, and server timestamp.
Client-claimed canonical fields are used only as tamper tripwires.

Phase 2 will remove duplicated result derivation by moving these rules into the
pure RPR core.

### Submission status

Phase 1 uses this web-visible state:

```ts
type SubmissionStatus =
  | { kind: 'unranked' }
  | { kind: 'submitting' }
  | { kind: 'verified'; canonicalScore: number; placement: number; totalEntries: number }
  | { kind: 'rejected'; reason: string }
  | { kind: 'submission-failed'; message: string };
```

Do not display `Ranked` merely because a ticket exists.

## Implementation Sequence

### 1. Add runtime request and trace validation

- Add narrow manual runtime guards in `@rpr/protocol` or the API boundary for
  the existing V1 shapes; do not add a new schema dependency in Phase 1.
- Validate required object/string/number fields before signature verification.
- Reject non-finite, fractional where integer is required, negative, or
  out-of-range values.
- Validate base64 strictly rather than accepting partially decoded data.
- Strengthen V1 trace decoding to reject:
  - Fewer than seven header bytes.
  - Unsupported encoding version.
  - Outer/header version mismatch.
  - Frame count above the configured session limit.
  - Button or axis counts outside V1 limits.
  - Payload shorter or longer than the exact calculated size.
  - Arithmetic overflow while calculating payload size.
- Convert all validation failures into controlled `400` or `422` JSON
  responses; malformed input must not escape as HTTP `500`.

Compatibility requirement: valid existing RPR V1 traces continue decoding
unchanged.

### 2. Bind sessions to the exact client build

- Extend protocol ticket signing and verification with `buildVersion`.
- Change the session API to accept `SessionRequest`.
- Replace “choose latest known game version” with exact supported-version
  validation.
- Configure supported RPR game/build pairs for development and tests.
- Have the shell request a session with manifest and build versions.
- Add signature tests proving that changing build version invalidates a ticket.

Migration: no deployed persistent ticket store exists. Existing in-memory
tickets are invalidated on API restart, so no backward ticket migration is
required.

### 3. Establish the same-origin API path

- Default both web service clients to `/api`.
- Add a Vite proxy from `/api` to `http://127.0.0.1:3000` with prefix removal.
- Preserve `VITE_API_URL` as an explicit override.
- Update local-development documentation and browser test startup so the API and
  Vite run together.
- Do not silently treat an API rejection as network unavailability during
  session acquisition; only network, timeout, or service-unavailable failures
  trigger unranked fallback.

### 4. Align replay and trace hashes

- Compute SHA-256 of the exact packed trace bytes on the server and compare it
  with `claimedResult.inputTraceHash` before replay.
- Make `verifyRpr` compute SHA-256 of the stable serialized terminal state, the
  same representation produced by the browser.
- Keep hash output lowercase 64-character hexadecimal.
- Use Web Crypto available in Node 22 and supported browsers; do not introduce a
  hashing dependency.
- Change `verifyRpr` and callers to async where required.

Temporary duplication note: Phase 1 aligns web and API implementations. Phase 2
replaces them with one game-core-owned implementation.

### 5. Verify and store the complete canonical result

- Replay using only the signed ticket seed and validated trace.
- Derive outcome, score, damage dealt, damage taken, frames, duration, and replay
  hash on the server.
- Compare every claimed canonical field with the server-derived value.
- Reject and review-flag replay-valid submissions whose claim differs.
- Build verified storage rows from server data only.
- Store the server-computed trace hash and actual trace encoding version.
- Store ticket game ID, game version, build version, and session ID rather than
  client duplicates.
- Retain rejected replay traces and the client claim for review only when replay
  began; structural validation failures are not stored as game results.

### 6. Repair ticket state ordering

- Split store operations into read/validate and `consumeIfUnused`.
- Confirm the submitted signed ticket exactly matches the stored issued ticket.
- Consume immediately before replay, after all structural checks pass.
- Return a specific already-used response for subsequent different
  submissions.
- Keep consumption single-thread safe within the current process by performing
  the check-and-mark synchronously in one store method.

### 7. Resolve the declared leaderboard category

- In Phase 1, add an explicit RPR category map in API configuration:

```ts
{
  'rpr.score': {
    gameId: 'rug-pull-rumble',
    metric: 'score',
    order: 'desc',
  },
}
```

- Reject unknown categories instead of parsing them.
- Query the configured game and order.
- Return only verified rows.
- Keep generalized category/verifier registration scheduled for Phase 7.

### 8. Render honest submission state

- Render the shared result screen immediately after game teardown.
- For ticketed sessions, initialize it as `submitting`, not `ranked`.
- Update the existing DOM view in place when submission resolves.
- On acceptance, replace displayed score with canonical score and show placement
  plus total entries.
- On rejection, show a concise generic player message and retain the detailed
  reason only in technical details/analytics.
- On timeout/network failure, show `Submission failed — result saved locally`
  and store the score as a local unranked best.
- Unranked sessions continue to show personal best and never submit.
- Prevent Play Again/Back navigation from allowing a late promise to mutate a
  newer screen; use a result-view token local to this flow. Full shell operation
  tokens remain Phase 4.

### 9. Update documentation and remove temporary compatibility code

- Document same-origin API development and ranked/unranked behavior.
- Update protocol comments so `replayHash`, `inputTraceHash`, and ticketed versus
  verified terminology are exact.
- Mark every RPR-specific Phase 1 map/helper with its scheduled Phase 2, 3, or 7
  removal owner.
- Update the Phase 1 work log with commands, test counts, and any deviations.

## Permanent Regression Test Plan

### Protocol and codec tests

- Ticket signature includes build version.
- V1 trace accepts an exact valid payload.
- Reject short header, unsupported version, version mismatch, excessive frame
  count, excessive action counts, truncated payload, and trailing bytes.
- Computed packed-trace SHA-256 matches browser output.

### API route tests

- Exact supported game/build request issues a signed ticket.
- Unknown game, version, or build is rejected.
- Tampered ticket fields invalidate the signature.
- Genuine replay claim is accepted.
- Mutated seed, session, build, game version, trace version, trace hash, replay
  hash, score, outcome, duration, or statistic is rejected.
- Verified storage contains canonical server data.
- Malformed base64/trace does not consume the ticket.
- Replay or claim mismatch consumes the ticket and creates a review record.
- Reusing a consumed ticket fails.
- `rpr.score` returns only verified RPR rows in descending score order with
  correct placement.

### Web service and DOM tests

- Default service URLs use `/api`.
- Network/session timeout falls back to unranked.
- API validation rejection does not masquerade as offline fallback.
- Result badge transitions from submitting to verified.
- Accepted response displays canonical score, placement, and total.
- Rejection and submission failure never display verified/ranked.
- Late submission completion cannot mutate a newer shell screen.

### Browser tests

- Start both API and Vite through Playwright configuration.
- Complete a real RPR fight and observe:
  - Ticket acquisition.
  - Submitting state.
  - Verified state.
  - Canonical score.
  - Placement from `rpr.score`.
- Run a separate API-unavailable case and prove full unranked play/results.
- Preserve existing desktop, mobile orientation, touch, replay, teardown, copy,
  and navigation tests.

## Validation Commands

Before Phase 1 is complete:

```sh
pnpm typecheck
pnpm lint
pnpm test:sim
pnpm build
pnpm test:e2e
git diff --check
```

Additionally run focused protocol/API/web tests during implementation so a
failure can be attributed to the current task rather than the final aggregate.

## Migration and Rollback

- Ticket wire format changes are intentionally breaking. There is no persistent
  ticket store, so restart invalidation is acceptable.
- Trace encoding remains V1; valid stored trace bytes remain replayable.
- Result storage remains in memory and may change shape without database
  migration.
- If the ranked browser test fails after deployment topology changes, the shell
  must fail closed to unranked play rather than submit unverifiable results.
- Reverting Phase 1 restores the existing unranked fallback but also restores
  known ranked defects; do not partially revert protocol and API ticket changes.

## Completion Evidence Required

- Link each permanent regression test to P0-RANK-001 through P0-RANK-007.
- Record final test counts and command outputs.
- Record one accepted real browser session ID, canonical score, placement, and
  trace/replay hash prefixes from the local integration environment.
- Record one rejected tamper case and one offline fallback case.
- Confirm no client-derived canonical metadata appears in verified storage.
- Confirm no unrelated dirty or untracked work was included.

## Approval Record

Approval status: `APPROVED`

Approved by: user

Approval date: 2026-07-12

Approved deviations:

- The browser acceptance test records and asserts canonical score/placement in
  the visible DOM but does not persist a random session ID or full hash in this
  document; those values are ephemeral and the API integration tests assert the
  exact stored hashes deterministically.

## Completion Record

Completed: 2026-07-12

Implemented:

- P0-RANK-001: browser and verifier now share SHA-256 byte hashing for packed
  traces and stable serialized replay state.
- P0-RANK-002: web services default to same-origin `/api`; Vite proxies to the
  API, while genuine service unavailability alone produces unranked fallback.
- P0-RANK-003: `rpr.score` resolves through an explicit configured category and
  returns verified RPR results in descending score order.
- P0-RANK-004/005: exact build-bound ticket identity, strict request/base64/trace
  validation, and complete canonical replay comparison prevent client metadata
  from entering verified rows.
- P0-RANK-006: structural failures leave tickets retryable; a synchronous
  compare-and-consume operation runs immediately before replay.
- P0-RANK-007: ticketed results display `Verifying` until acceptance, then show
  server score and placement; rejection, submission failure, and unranked play
  remain visually distinct.

Validation evidence:

- `pnpm typecheck` — pass.
- `pnpm lint` — pass.
- `pnpm test:sim` — 23 files, 197 tests passed.
- `pnpm build` — pass (84 modules transformed).
- `pnpm test:e2e` — 17 tests passed across Chromium, mobile portrait, and
  mobile landscape.
- `git diff --check` — pass.

Scope confirmation:

- No Phaser API or simulation-authority boundary changed.
- No dependency or lockfile changed.
- The pre-existing untracked Crypto Crash Launcher specification remains outside
  the Phase 1 commit.
