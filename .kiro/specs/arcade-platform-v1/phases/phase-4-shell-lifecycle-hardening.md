# Phase 4: Shell Lifecycle Hardening

Status: `COMPLETE`

Approved: 2026-07-12

Completed: 2026-07-12

Roadmap: `../architecture-hardening-roadmap.md`

## Goal

Turn the DOM shell into the authoritative owner of one game operation at a
time. Loading, ticket acquisition, game boot, suspension, completion,
submission, cancellation, and teardown must remain correct when asynchronous
work resolves late or the player changes direction mid-flow.

## Locked Decisions

- The shell exposes a read-only state snapshot plus subscriptions; callers do
  not mutate lifecycle state directly.
- Every launch and result flow receives a monotonically increasing operation
  ID. Asynchronous continuations validate ownership before changing the DOM or
  state.
- Each operation owns an `AbortController`. Explicit player/shell cancellation
  propagates as cancellation rather than silently starting an unranked game.
- Session acquisition has an 8-second deadline. Network failure or that
  deadline starts an explicitly unranked session; HTTP policy/validation
  rejection remains an error.
- Game readiness defaults to 30 seconds and may be declared per manifest with
  `lifecycle.readyTimeoutMs`. Values are clamped to 1–120 seconds.
- `ArcadeGameHandle.destroy()` is asynchronous and idempotent. It resolves only
  after the game has released its owned resources.
- The shell waits at most 5 seconds for defensive teardown. A broken game is
  diagnosed without trapping the player in teardown forever.
- Page visibility suspends and resumes the same session ticket. Orientation is
  an independent suspension reason; clearing one reason never clears another.
- Ranked manifests must declare suspension, and a declaring module must return
  both `suspend` and `resume` functions.
- Completion is accepted exactly once and only from `PLAYING`. Early,
  duplicate, and stale completion callbacks are ignored and diagnosed; early
  completion is a recoverable contract error.
- Result submission belongs to a separate result operation. Leaving results
  aborts it and prevents a late response from rewriting a newer screen.

## State Model

```text
SELECTING
  -> LOADING_MODULE
  -> ACQUIRING_SESSION
  -> LAUNCHING
  -> PLAYING
  -> COMPLETING
  -> TEARING_DOWN
  -> RESULTS
```

Cancellation from any launch state passes through `TEARING_DOWN` and returns to
`SELECTING`. Module, session, launch, readiness, and contract failures pass
through `TEARING_DOWN` and enter a retryable `ERROR` state. Shell destruction
releases listeners and the active operation before entering terminal
`DESTROYED`.

Every transition emits `arcade_state_transition` with the previous state, next
state, operation ID, game ID, and error stage where applicable.

## Chronological Implementation Plan

### 4.1 Define lifecycle contracts

- Extend `ArcadeGameHandle.destroy()` to return `Promise<void>`.
- Add the optional bounded manifest readiness timeout.
- Define immutable public snapshots, allowed transitions, error stages, and
  subscription behavior.
- Add injectable lifecycle services and deadlines so races can be tested
  without real network or Phaser instances.

### 4.2 Make service cancellation explicit

- Give session acquisition a composed internal timeout signal and caller abort
  relay.
- Preserve the distinction between explicit abort, service unavailability, and
  server rejection.
- Pass a result-operation signal through evidence preparation and result fetch.
- Discard submission responses whose operation no longer owns the result view.

### 4.3 Replace implicit shell flow with owned operations

- Guard repeated selection so only the first launch begins.
- Revalidate operation ownership after module load, session acquisition,
  readiness, teardown, and result submission.
- Render cancellation controls while loading and booting.
- Classify failures by module, session, launch, ready, contract, or teardown
  stage and retain a fresh-operation retry path.
- Serialize completion, teardown, result rendering, play-again, and back flows.

### 4.4 Compose interruption handling

- Listen for document visibility and viewport orientation changes at shell
  startup; remove both subscriptions during shell destruction.
- Track active suspension reasons per launch and send only edge transitions to
  the game handle.
- Keep the current session and simulation instance suspended while hidden or
  incorrectly oriented.
- Destroy the shell on browser `pagehide`.

### 4.5 Make Rug Pull Rumble teardown observable

- Resolve readiness after the menu scene has completed creation.
- Reject unsettled readiness when destruction wins the boot race.
- Return the same destroy promise to every caller.
- Wait for Phaser's game `DESTROY` event, using `noReturn = false`, before
  clearing the mount and resolving teardown.
- Remove explicit loader, keyboard, and delayed-result listeners/timers.
- Prevent asynchronous result derivation from completing after context abort.
- Clear debug globals and scene-owned sources/renderers.

### 4.6 Prove race and resource behavior

- Unit-test normal state order, rapid selection, cancellation during module,
  session, and boot waits, stale continuations, retry, readiness rejection and
  timeout, launch failure, contract failure, exactly-once completion,
  visibility/orientation composition, late submissions, hung teardown, and
  idempotent shell destruction.
- Test session caller abort and service timeout semantics.
- Exercise repeated real Phaser launch/exit cycles and assert a single canvas,
  fresh instance, cleared globals, and no leftover canvas after each exit.
- Run typecheck, lint, all unit/integration tests, production build, end-to-end
  tests, boundary checks, and whitespace validation.

## Implementation Log

- Added the explicit shell state machine, read-only snapshots, state
  subscriptions, owned launch/result operations, transition analytics, and
  retryable error surface.
- Added abort-aware session/result services, bounded readiness, defensive
  teardown, exactly-once completion, and late-response protection.
- Added edge-triggered visibility/orientation suspension and ranked suspension
  contract checks.
- Updated the RPR Phaser adapter and scenes for observable readiness,
  asynchronous idempotent destruction, timer/listener cleanup, and abort-safe
  completion.
- Added lifecycle and service race suites and expanded the repeated-launch
  browser flow.

## Verification Evidence

- Targeted lifecycle/service tests: 21 tests passed.
- `pnpm typecheck`: passed across seven buildable workspace projects.
- `pnpm lint`: passed.
- `pnpm test:sim`: 26 files and 222 tests passed.
- `pnpm build`: passed; 86 modules transformed.
- `pnpm test:e2e`: all 17 desktop and mobile tests passed, including three
  consecutive real Phaser launch/teardown cycles.
- `git diff --check`: passed.

## Deferred Items

- Phaser factory neutrality, shared CSS extraction, replay adapter dispatch,
  and result-surface accessibility remain Phase 5 work.
- Named canonical action schemas and Trace V2 remain Phase 6 work.
- Multi-game verifier/category registries and durable transactional storage
  remain Phase 7 work.
