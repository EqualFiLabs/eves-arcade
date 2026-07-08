# Implementation Plan: Arcade Platform V1

## Overview

Migrate the repo from a single Phaser game to a multi-game arcade in ordered, individually committable steps. Rug Pull Rumble stays playable at every step (Requirement 15); each numbered task ends with `pnpm typecheck`, `pnpm lint`, `pnpm test:sim`, and (where entry flow changed) updated e2e passing. Sequencing: shell boundary → shared controls → touch/mobile → result + trace → backend + verification → replay viewer → Mempool Squadron → rewards readiness. Platform packages are created only where a second consumer exists now: `packages/controls` and `packages/protocol`.

Prerequisite note: `crypto-fighter-v1` Tasks 15 (audio) and 17 (copy) can proceed independently; its Task 18 (ResultScene/ShareView) is superseded by Task 4 below.

## Tasks

- [x] 1. Extract the arcade shell boundary
  - [x] 1.1 Move Rug Pull Rumble under games/
    - Details: Move `apps/web/src/game/` → `apps/web/src/games/rug-pull-rumble/` and `support/browser-support.ts` → `apps/web/src/arcade/phaser/`. Import-path changes only; no behavior change.
    - _Requirements: 15.1, 15.4_
  - [x] 1.2 Define the shell contract types
    - Details: Add `arcade/types.ts` with `ArcadeGameManifest`, `ArcadeGameModule`, `ArcadeGameHandle`, `ArcadeGameContext`, `GameSession`, `ArcadeSettings`, `AnalyticsHook`. No Phaser types in the contract.
    - _Requirements: 2.1, 2.6_
  - [x] 1.3 Add the Phaser config factory and RPR module entry
    - Details: Refactor `GameConfig.ts` into `arcade/phaser/config-factory.ts` (`createGameConfig(overrides)`). Add `games/rug-pull-rumble/index.ts` implementing `launch(ctx)` (creates `Phaser.Game`, sets `window.__game`) and `destroy()` (destroys instance + canvas). Add `games/rug-pull-rumble/manifest.ts` (id, version, `orientation: 'landscape'`, leaderboard categories, dynamic `load()`).
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_
  - [x] 1.4 Build the DOM shell
    - Details: `arcade/shell.ts` + `registry.ts`: game selection surface (one entry), dynamic import on select, launch into container, exit/teardown path back to selection. `main.ts` boots the shell instead of Phaser. Handle module load failure with a readable error.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.5_
  - [x] 1.5 Add mobile viewport hygiene and orientation gate
    - Details: Viewport meta (`viewport-fit=cover`, no user scaling), `overscroll-behavior: none`, `dvh` units, safe-area insets. `arcade/orientation.ts`: rotate prompt when manifest orientation unmet; pause/resume via handle when supported.
    - _Requirements: 7.1, 7.2, 7.3, 7.5_
  - [x] 1.6 Add persisted settings
    - Details: `arcade/settings.ts` (localStorage). Move `muted` from Phaser registry to shell settings, passed via context. Shell start interaction doubles as audio unlock.
    - _Requirements: 2.2, 7.6_
  - [x] 1.7 Update e2e for shell entry
    - Details: Playwright specs click through the shell to launch RPR; `window.__game` asserted after launch. Add a mobile-viewport project asserting the rotate prompt for RPR in portrait.
    - _Requirements: 15.2_

- [x] 2. Checkpoint: RPR playable behind the shell
  - Details: Menu → fight → KO works via shell launch; two sequential launches leak nothing (scene keys, textures, listeners); all suites pass.
  - _Requirements: 3.4, 15.1, 15.2_

- [x] 3. Create packages/controls and port RPR input
  - [x] 3.1 Create the controls package core
    - Details: `packages/controls`: `InputFrame<B, X>`, `InputSource`, `mergeFrames` (OR buttons / max-magnitude axes). No Phaser imports anywhere in the package.
    - _Requirements: 5.1, 5.2, 5.5_
  - [x] 3.2 Implement KeyboardSource and GamepadSource
    - Details: `KeyboardSource` binds `window` keydown/keyup/blur with a `Record<Button, code>` binding table and optional digital axes. `GamepadSource` with binding table, deadzone, pressure buttons (port the `mapGamepad` pattern from `@rpr/sim`). Binding tables are data (Req 5.8).
    - _Requirements: 5.1, 5.2, 5.8_
  - [x] 3.3 Implement PointerSource
    - Details: Normalized pointer position over a target element → axes; press → button. Needed by Squadron; cheap to build with the same interface now.
    - _Requirements: 5.1_
  - [x] 3.4 Port RPR to the controls package
    - Details: Replace `apps/web/.../input/` sources with controls-package sources configured by RPR's existing bindings (kept as data in the game folder). `RawInputState` ↔ `Buttons<RprButton>` adaptation; `mapRawInput` stays in `@rpr/sim` untouched. Delete the Phaser-coupled input sources.
    - _Requirements: 5.3, 5.4, 5.6, 15.3_
  - [x] 3.5 Add controls unit tests
    - Details: `tests/controls/`: source snapshots from synthesized DOM events, merge semantics, stuck-key prevention on blur, binding-table-driven behavior.
    - _Requirements: 5.1, 5.5, 5.6_

- [x] 4. Shared result flow and input trace
  - [x] 4.1 Add GameResult reporting from RPR
    - Details: On KO, FightScene builds `GameResult` (outcome, score, stats, durationMs) and calls `ctx.onResult` exactly once. Shell tears down the game.
    - _Requirements: 2.3, 4.1_
  - [x] 4.2 Build the shared DOM result screen
    - Details: `arcade/result-screen.ts`: outcome/score/stats, parody share copy with clipboard + visible-text fallback, distribution hooks (enabled only, safe hiding), replay and back-to-arcade actions. Supersedes `crypto-fighter-v1` Task 18 surfaces; reuse its copy/hook content from `@rpr/content`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 4.3 Inject the session seed
    - Details: Shell generates `GameSession` (local random seed for now, `ranked: false`); RPR uses `ctx.session.seed` instead of hardcoded `0`.
    - _Requirements: 8.2_
  - [x] 4.4 Add TraceRecorder to controls
    - Details: `TraceRecorder.wrap(source)` records every polled frame; versioned bit-packing to `Uint8Array`; SHA-256 via `crypto.subtle`. Wire into RPR's fight loop as the single choke point; stamp `inputTraceHash`, `replayHash` (terminal sim state hash), and `buildVersion` (git SHA via Vite define) into `GameResult`.
    - _Requirements: 8.3, 8.4, 8.5, 8.6_
  - [x] 4.5 Add determinism CI fixture for RPR
    - Details: Record a real `(seed, trace)` fixture; test replays it through `@rpr/sim` and asserts the terminal-state hash. This is the determinism tripwire.
    - _Requirements: 8.1, 8.7_
  - [x] 4.6 Add result-flow e2e coverage
    - Details: KO → result screen shows score/share/hooks; replay relaunches; clipboard fallback path.
    - _Requirements: 4.1, 4.3, 4.5, 15.2_

- [ ] 5. Touch controls and mobile playability
  - [ ] 5.1 Implement TouchOverlaySource and TouchLayout
    - Details: In `packages/controls`: DOM overlay above the canvas rendering data-driven zones (button, floating stick, drag region); pointer events with per-pointerId tracking, pointer capture, `touch-action: none`; pointer-cancel releases zones (no stuck inputs); `destroy()` removes the layer. Hidden when no touch capability.
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6_
  - [ ] 5.2 Decide and implement RPR mobile control semantics
    - Details: Collapse high/low onto stick vertical: down + light/heavy = low variant (crouching-attack convention), reducing buttons to light, heavy, special, super, block + floating stick. Keep keyboard/gamepad semantics equivalent. Prototype on a real device before locking; this is a game-design decision recorded in the RPR reducer, not the controls package.
    - _Requirements: 5.4, 6.4_
  - [ ] 5.3 Ship the RPR touch layout
    - Details: `games/rug-pull-rumble/touch-layout.ts`; merge with keyboard per Req 5.5; verify layout on phone-sized viewports (landscape).
    - _Requirements: 6.4, 6.5, 7.4_
  - [ ] 5.4 Mobile e2e + manual QA pass
    - Details: Playwright mobile project: overlay zones dispatch inputs via synthesized pointer events. Manual: real mid-range Android — control feel, safe areas, audio unlock, no scroll/zoom interference.
    - _Requirements: 6.3, 7.1, 7.6, 15.2_

- [ ] 6. Checkpoint: RPR mobile-playable MVP
  - Details: Full loop on desktop (keyboard/gamepad) and phone (touch, landscape prompt): shell → fight → KO → result → share → replay. All suites pass.
  - _Requirements: 6.4, 7.3, 15.1_

- [ ] 7. Protocol package and API with replay verification
  - [ ] 7.1 Create packages/protocol
    - Details: `SessionTicket`, `GameResult`, `ScoreSubmission`, `LeaderboardCategory`, trace encoding (moved from controls or re-exported), encoding version constants. Consumed by web and api.
    - _Requirements: 9.1, 14.1_
  - [ ] 7.2 Build apps/api skeleton
    - Details: Fastify/Hono service: `POST /sessions` (HMAC-signed ticket, server seed, expiry = max session + slack, per-IP rate limit), `POST /results`, `GET /leaderboards/:categoryId`. SQLite/Postgres store: results, traces, review flags. Unique index on sessionId enforces single-use.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_
  - [ ] 7.3 Implement verify/rpr.ts
    - Details: Import `@rpr/sim` + `@rpr/content`; replay `(ticket.seed, trace)` headlessly; recompute `GameResult`; accept on match, reject + flag on mismatch. Validate plausibility: duration vs frames, trace bounds, known build version, pinned game version.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [ ] 7.4 Wire shell session service with unranked fallback
    - Details: `arcade/services/sessions.ts`: request ticket with short timeout; on failure → local seed, `ranked: false`, badge session unranked. `results.ts`: submit ranked results, show placement; store unranked personal bests locally only.
    - _Requirements: 9.5, 9.7, 11.3, 11.4_
  - [ ] 7.5 Add API and integration tests
    - Details: Ticket lifecycle (sign/expire/single-use), verify accept/reject/mismatch-flag, leaderboard excludes unverified, client fallback when API down (Property 7).
    - _Requirements: 9.3, 9.4, 9.5, 10.2, 11.2_

- [ ] 8. Replay viewer (developer/review tool)
  - Details: Dev-flagged route: load `(seed, trace)` → instantiate RPR engine + existing renderers → step with speed control. No new rendering code. This is the manual-review tool for top scores (Req 14.2) and a combat debugging tool.
  - _Requirements: 10.5, 14.2_

- [ ] 9. Mempool Squadron prototype
  - [ ] 9.1 Build the Squadron simulation
    - Details: Pure fixed-step sim (start as `games/mempool-squadron/sim/`, extract to `packages/squadron-sim` when the api verifier needs it): entity array with `z ∈ [0..1]`, seeded spawner (copy the ~50-line seeded RNG from `@rpr/sim`; do not create a shared util package), z-window hitscan shots, hazard kinds with telegraph frames, combo/graze scoring, events out. Headless tests: spawn timeline, hit resolution, scoring, determinism fixture.
    - _Requirements: 8.1, 12.1, 12.2, 12.5, 16.2_
  - [ ] 9.2 Author mission content as data
    - Details: One 90-second timeline: two enemy kinds + one hazard (red candle columns), boss with two hp-threshold phases. Scoring: kills × decaying combo + survival + graze ("gas saved").
    - _Requirements: 12.3, 12.4, 12.5_
  - [ ] 9.3 Build the projection renderer and scenes
    - Details: `scale(z) = near/(near + z·depth)` positioning, sprite scale, depth sort, fog tint; reticle + lagging ship; Graphics-generated placeholder textures; shared preload factory; portrait config via config-factory overrides.
    - _Requirements: 12.1, 12.6, 12.7, 3.3_
  - [ ] 9.4 Wire Squadron controls
    - Details: Touch drag-to-move/aim (drag region), autofire default, bomb/barrel-roll buttons; keyboard fallback (arrows/WASD + fire/boost/roll/bomb). Trace recording via the same choke point.
    - _Requirements: 5.3, 6.2, 8.3, 12.6_
  - [ ] 9.5 Register Squadron in the arcade
    - Details: Manifest (portrait, leaderboard category), registry entry, dynamic import, `GameResult` reporting, verify/squadron.ts on the api. No game-specific shell code (Req 12.8). E2e: select → play → result.
    - _Requirements: 1.1, 2.1, 10.1, 12.8_

- [ ] 10. Checkpoint: two-game arcade
  - Details: Both games launch/destroy cleanly in sequence from the shell on desktop and mobile; ranked flow verifies both; determinism fixtures pass for both; game-isolation lint holds (no cross-game imports).
  - _Requirements: 1.5, 3.4, 15.1, 16.1_

- [ ] 11. Rewards readiness (seams only — no payouts)
  - [ ] 11.1 Verify reward seams are complete
    - Details: Confirm protocol fields (seed, hashes, versions, optional signature/season), stored traces for accepted scores, replay viewer usable for review. No wallet, payout, or reward UI anywhere in the client.
    - _Requirements: 14.1, 14.2, 14.4_
  - [ ] 11.2 Document the reward release gate
    - Details: Record in this spec: payouts require (a) jurisdictional/regulatory review, (b) capped season/review-window reward design, (c) review tooling in use. Optional later: server-side humanness heuristics over stored traces.
    - _Requirements: 14.3, 14.5, 14.6_

- [ ] 12. Final checkpoint: platform V1
  - Details: Run typecheck, lint, all unit suites (sim, controls, protocol, squadron), api tests, e2e (desktop + mobile projects), and manual phone QA. Confirm: shell lists/launches/tears down both games; RPR unchanged in feel; ranked submissions verified server-side; offline play works unranked; no accounts/wallets/payouts anywhere; no cross-game imports; no shared engine code emerged.
  - _Requirements: 1 through 16_
