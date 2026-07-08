# Requirements Document

## Introduction

Arcade Platform V1 evolves the project from a single Phaser 4 game (Rug Pull Rumble) into a multi-game crypto meme arcade: a shared shell that lists, launches, and tears down small short-session games while each game keeps its own feel, physics, and tuning. The platform shall add mobile/touch playability, a shared controls layer, a shared result/share flow, and — because players will eventually be rewarded with crypto — a verifiable score pipeline built on deterministic simulation, session tickets, and server-side replay verification. A second game, Mempool Squadron (a pseudo-3D rail shooter), shall prove the multi-game contract. Games are fun first, not protocol explainers. The platform shall not become a generic game engine; it provides boundaries and services, never gameplay abstractions.

Rug Pull Rumble V1 (spec: `crypto-fighter-v1`) remains the record for the fighting game itself. This spec governs the platform, the migration, and the second game.

## Glossary

- **Arcade Shell:** The DOM-based (non-Phaser) application chrome: game selection, result/share screens, settings, orientation prompts.
- **Game Module:** A self-contained game implementing the platform contract (`ArcadeGameModule`), launched and destroyed by the shell.
- **Game Manifest:** Static metadata describing a game (`ArcadeGameManifest`): id, title, version, orientation, leaderboard categories, and a dynamic-import loader.
- **Game Context:** The object (`ArcadeGameContext`) the shell passes into a game at launch: mount point, session, settings, and result/analytics callbacks.
- **Controls Package:** `packages/controls` — the shared, Phaser-free input layer: input frames, device sources (keyboard, gamepad, pointer, touch overlay), merging, and layout schemas.
- **Protocol Package:** `packages/protocol` — types shared between the web client and the API: results, tickets, submissions, leaderboard categories.
- **Input Frame:** A per-step snapshot of player intent: named boolean buttons plus normalized `-1..1` axes.
- **Input Trace:** The recorded sequence of input frames for one session, bit-packed for submission.
- **Session Ticket:** A server-issued, HMAC-signed grant to play one ranked session: session id, game id, game version, seed, expiry.
- **Ranked Session:** A session played under a valid ticket whose result is submitted for verification and leaderboards.
- **Unranked Session:** A session played with a locally generated seed when no ticket is available; never submitted.
- **Replay Verification:** Server-side re-execution of a game's deterministic simulation from `(seed, input trace)` to recompute the score independently of the client's claim.
- **Touch Overlay:** The shared DOM layer above the game canvas that renders a game-supplied touch layout and reports touches as an input source.
- **Touch Layout:** Data describing a game's touch zones (buttons, floating stick, drag regions); owned by the game, rendered by the shared overlay.
- **Mempool Squadron:** The second game: a pseudo-3D rail shooter using depth scaling, not a 3D engine.

## Requirements

### Requirement 1: Arcade Shell and Game Selection

**User Story:** As a player, I want to open the arcade, pick a game, and play, so that one link gives me the whole collection.

#### Acceptance Criteria

1. WHEN the arcade URL loads, THE shell SHALL present a game selection surface listing every registered game manifest.
2. WHEN the Player selects a game, THE shell SHALL dynamically import that game's module and launch it into the game container.
3. WHEN a game session ends or the Player exits, THE shell SHALL destroy the game instance, remove its canvas, and return to shell control.
4. THE shell SHALL be implemented in DOM/TypeScript, not as Phaser scenes.
5. WHEN only one game is registered, THE shell SHALL still function (a one-item arcade is valid).
6. WHEN a game module fails to load, THE shell SHALL show a readable error and return to game selection without breaking other games.

### Requirement 2: Game Module Contract

**User Story:** As the developer, I want each game behind one small interface, so that the shell never knows game internals and games never know shell internals.

#### Acceptance Criteria

1. THE platform SHALL define `ArcadeGameManifest`, `ArcadeGameModule`, `ArcadeGameHandle`, `ArcadeGameContext`, and `GameResult` as the complete shell↔game contract.
2. WHEN the shell launches a game, THE game SHALL receive an `ArcadeGameContext` containing the mount element, the session (seed, ranked flag, optional ticket), shell settings, and result/analytics callbacks.
3. WHEN a session reaches a terminal state, THE game SHALL call the context's result callback exactly once with a `GameResult`.
4. IF a game supports pause, THEN THE game handle SHALL expose `pause()` and `resume()`; otherwise the shell SHALL treat the game as unpausable.
5. THE game module SHALL NOT import shell internals, and THE shell SHALL NOT import game internals beyond the manifest and module entry point.
6. THE contract types SHALL NOT reference Phaser types.

### Requirement 3: Per-Game Phaser Lifecycle

**User Story:** As the developer, I want each launched game to own its own Phaser instance, so that games cannot leak scenes, textures, audio, or registry state into each other.

#### Acceptance Criteria

1. WHEN a game launches, THE game module SHALL create its own `Phaser.Game` instance inside the provided mount element.
2. WHEN the shell destroys a game handle, THE game SHALL destroy its Phaser instance and remove its canvas.
3. THE platform SHALL provide a shared game-config factory covering common options (parent, scale, background, banner) with per-game overrides.
4. WHEN two games are launched sequentially, THE second game SHALL start with no scene keys, textures, sounds, or registry values from the first.
5. WHEN a game is loaded, THE game code SHALL arrive via dynamic import so the initial shell payload does not include game bundles.
6. Each game SHALL preload only shared assets plus its own asset manifest.

### Requirement 4: Shared Result and Share Flow

**User Story:** As a player, I want a consistent result screen with score, share text, and links after any game, so that finishing a game always lands somewhere satisfying and shareable.

#### Acceptance Criteria

1. WHEN a game reports a `GameResult`, THE shell SHALL tear down the game and present a shared DOM result screen.
2. THE result screen SHALL show outcome, score, and game-specific stats from the result object.
3. THE result screen SHALL provide share copy in parody meme tone with a clipboard action and a visible-text fallback.
4. THE result screen SHALL render enabled distribution hooks and hide disabled or invalid hooks without breaking.
5. THE result screen SHALL offer replay (relaunch the same game) and return-to-arcade actions.
6. THE shared result flow SHALL replace the in-Phaser `ResultScene` planned in `crypto-fighter-v1` Task 18; restart-without-refresh (Req 3.6 there) SHALL be satisfied via shell relaunch.

### Requirement 5: Shared Controls Package

**User Story:** As the developer, I want one input layer for all games and devices, so that keyboard, gamepad, pointer, and touch are implemented once and each game only defines what its actions mean.

#### Acceptance Criteria

1. THE platform SHALL provide `packages/controls` exporting `InputFrame<Buttons, Axes>`, an `InputSource` interface, frame merging, and device sources for keyboard, gamepad, and pointer.
2. THE controls package SHALL NOT import Phaser; keyboard sources SHALL bind to DOM events directly.
3. Each game SHALL declare its own action unions (e.g. fighting: move/jump/block/light/heavy/special/super; shooter: aim x/y, move x/y, fire, boost, barrel roll, bomb); THE platform SHALL NOT define a central cross-game action enum.
4. THE semantic reduction from input frames to simulation input SHALL remain per-game (e.g. `mapRawInput` stays in `@rpr/sim`).
5. WHEN multiple sources are active, THE controls package SHALL merge frames (boolean OR for buttons, largest magnitude for axes) so keyboard remains fully playable alongside other devices.
6. WHEN Rug Pull Rumble is ported to the controls package, THE fight SHALL remain playable with the existing default keyboard and gamepad bindings.
7. Games SHALL poll one input frame per fixed simulation step; the controls package SHALL NOT push events into simulations.
8. Binding tables SHALL be data, structured so a future rebinding UI can edit them without code changes.

### Requirement 6: Touch Controls

**User Story:** As a mobile player, I want on-screen controls tuned per game, so that I can actually play on my phone.

#### Acceptance Criteria

1. THE controls package SHALL provide a touch overlay: a DOM layer above the canvas that renders a game-supplied touch layout and acts as an input source.
2. Touch layouts SHALL be data (button zones, floating stick zones, drag regions) supplied per game, not per-game overlay code.
3. THE overlay SHALL support multi-touch via pointer events with per-pointer tracking, pointer capture, and no browser gesture interference (`touch-action: none`).
4. Rug Pull Rumble SHALL ship a touch layout with a floating movement stick and attack buttons, WHERE holding down plus an attack produces the low variant so the button count stays thumb-viable; keyboard, gamepad, and touch SHALL express the same control semantics.
5. WHEN no touch capability is detected, THE overlay SHALL NOT be shown; WHEN touch is used alongside keyboard, both SHALL merge per Requirement 5.5.
6. THE overlay SHALL survive game teardown (it is shell-owned) and SHALL be reconfigured per launched game.

### Requirement 7: Mobile Viewport and Orientation

**User Story:** As a mobile player, I want the arcade and its games to render correctly on my phone, so that nothing is cut off, scrolled, or zoomed by accident.

#### Acceptance Criteria

1. THE shell SHALL apply mobile viewport hygiene: `viewport-fit=cover`, disabled user scaling, `overscroll-behavior: none`, dynamic viewport units, and safe-area insets.
2. Each game manifest SHALL declare an orientation requirement (`landscape`, `portrait`, or `any`).
3. WHEN the device orientation does not satisfy the launched game's requirement, THE shell SHALL show a rotate prompt and pause the game if it supports pause.
4. Rug Pull Rumble SHALL declare `landscape`; Mempool Squadron SHALL target `portrait` first.
5. THE shell's own surfaces (selection, result, settings) SHALL be responsive across phone and desktop widths.
6. WHEN audio is blocked pending a user gesture, THE shell's start interaction SHALL double as the audio unlock.

### Requirement 8: Deterministic Sessions and Input Trace

**User Story:** As the developer, I want every ranked session reproducible from a seed and an input trace, so that scores can be verified without trusting the client.

#### Acceptance Criteria

1. Every game's simulation SHALL be a pure, fixed-step, seeded function of `(seed, input trace)` with no Phaser, DOM, wall-clock, or unseeded randomness dependencies.
2. THE game SHALL use the session seed provided in the game context; games SHALL NOT hardcode or self-select ranked seeds (this supersedes the current fixed `seed: 0` in `FightScene`).
3. THE controls layer SHALL record every polled input frame of a session into an input trace at a single choke point.
4. THE input trace SHALL bit-pack to a compact wire format and include the trace encoding version.
5. WHEN a session ends, THE client SHALL compute the trace hash and a terminal-state (replay) hash into the `GameResult`.
6. THE build SHALL stamp a build version (git SHA) into every `GameResult`.
7. A CI test SHALL replay a recorded trace through each game's simulation and assert the terminal-state hash, so determinism regressions fail the build.

### Requirement 9: Session Backend and Tickets

**User Story:** As the operator, I want the server to control ranked sessions, so that clients cannot grind seeds or submit fabricated sessions.

#### Acceptance Criteria

1. THE platform SHALL include a minimal API service (`apps/api`) exposing session issuance, result submission, and leaderboard reads.
2. WHEN a ranked session is requested, THE API SHALL issue a signed session ticket containing session id, game id, game version, server-chosen seed, and expiry.
3. WHEN a submission arrives, THE API SHALL reject tickets that are unsigned, expired, already used, or version-mismatched.
4. ONE submission SHALL be accepted per ticket.
5. WHEN the API is unreachable, THE shell SHALL fall back to unranked play with a locally generated seed, and THE game SHALL remain fully playable offline.
6. THE API SHALL NOT require accounts, wallets, or authentication in V1; player handle and wallet address are untrusted labels.
7. THE client SHALL never be the authority on a ranked score; the server's recomputed score is canonical.

### Requirement 10: Server-Side Replay Verification

**User Story:** As the operator, I want every ranked submission re-simulated on the server, so that forged scores are structurally impossible rather than merely discouraged.

#### Acceptance Criteria

1. WHEN a ranked submission arrives, THE API SHALL re-run the game's simulation from the ticket seed and submitted input trace and recompute the result server-side.
2. IF the recomputed result differs from the claimed result, THEN THE API SHALL reject the submission and flag it for review.
3. THE verification SHALL import the same simulation packages the client uses, pinned to the ticket's game version.
4. THE API SHALL validate plausibility: wall-clock duration consistent with simulated frames, trace length within session bounds, and known build version.
5. Submitted traces for accepted scores SHALL be stored so top scores can be manually reviewed and replayed.
6. THE platform SHALL acknowledge that replay verification authenticates the simulation, not the human; bot mitigation is handled by reward design and review (Requirement 14), not client-side anti-cheat.

### Requirement 11: Leaderboards

**User Story:** As a player, I want per-game leaderboards, so that scores mean something across the arcade.

#### Acceptance Criteria

1. Game manifests SHALL declare leaderboard categories (`id`, `gameId`, `label`, metric, sort order, optional season).
2. THE API SHALL serve leaderboard reads per category from verified submissions only.
3. THE shell result screen SHALL show leaderboard placement for ranked sessions when available.
4. Unranked results SHALL be kept locally (personal bests) and SHALL NOT be submitted.
5. Leaderboard identity SHALL be an optional untrusted handle in V1.

### Requirement 12: Mempool Squadron Prototype

**User Story:** As a player, I want a second, totally different-feeling game in the arcade, so that the collection is more than one joke.

#### Acceptance Criteria

1. Mempool Squadron SHALL be a pseudo-3D rail shooter using depth-scaled 2D sprites (scale, position, depth-sort, fog by `z`), not a 3D engine.
2. THE Squadron simulation SHALL follow the same purity rules as `@rpr/sim`: fixed-step, seeded, Phaser-free, event-emitting, replay-verifiable per Requirement 8.
3. THE core loop SHALL be: player controls ship/reticle; enemies and hazards approach the camera; player shoots enemies and dodges hazards (red candles, gas spikes, MEV bots, liquidation beams, sequencer hazards).
4. Missions SHALL be data-driven timelines of 60–120 seconds ending in a boss with at least two phases.
5. Scoring SHALL combine survival, enemies destroyed, combo multiplier, damage avoided, and a "gas saved" bonus, reported through the standard `GameResult`.
6. THE prototype SHALL be touch-first (drag to move/aim, autofire default, buttons for bomb/barrel roll) and portrait-oriented, with keyboard support for desktop.
7. THE prototype MAY use generated placeholder textures; art polish is out of scope.
8. Squadron SHALL be built on the platform contract, controls package, and trace/verify pipeline with no game-specific shell code.

### Requirement 13: Asset Organization and Key Conventions

**User Story:** As the developer, I want predictable namespaced asset keys and folders, so that multiple games' assets never collide or confuse.

#### Acceptance Criteria

1. Assets SHALL be organized as `assets/shared/{ui,fx,audio}` and `assets/games/<game-id>/...`.
2. Asset keys SHALL be namespaced `<prefix>.<domain>.<thing>.<variant>` (e.g. `rpr.stage.marketControl.bg`, `squadron.enemy.mevBot.fly`, `shared.fx.hitSpark`).
3. New assets SHALL follow the convention immediately; renaming existing Rug Pull Rumble keys is optional cleanup because per-game Phaser instances cannot collide.
4. Asset manifests SHALL remain per-game data with licensing metadata, using the shared `AssetEntry` shape.

### Requirement 14: Rewards Readiness

**User Story:** As the operator, I want the data and seams for crypto rewards in place, so that payouts can be added later without re-architecting — while shipping zero reward mechanics now.

#### Acceptance Criteria

1. `GameResult` and submission types SHALL carry the fields future rewards need: seed, hashes, build version, game version, and optional signature/season fields.
2. THE platform SHALL provide a replay viewer (developer tool) that re-runs a stored trace through the simulation with the game's renderers, for manual review of top scores.
3. Reward design SHALL assume bots exist: payouts (when added) SHALL be capped, season/review-window based, and never instant-per-game.
4. THE game client SHALL NOT contain wallet connection, payout logic, or reward UI in V1.
5. BEFORE any reward mechanic ships, THE operator SHALL obtain a jurisdictional/regulatory review; this is a release gate, not a code task.
6. Humanness heuristics over stored traces (reaction-time distributions, frame-perfect ratios, duplicate traces) MAY be added server-side later; V1 only stores the data that makes them possible.

### Requirement 15: Migration Safety

**User Story:** As the developer, I want Rug Pull Rumble playable at every migration step, so that the platform work never breaks the shipped game.

#### Acceptance Criteria

1. Every migration task SHALL leave Rug Pull Rumble playable end-to-end (menu → fight → KO → result).
2. Existing sim, content, and e2e tests SHALL pass at every step, updated only where the shell changes entry flow (e.g. `window.__game` now set at launch).
3. THE Rug Pull Rumble combat simulation and renderers SHALL NOT be modified except: seed injection (Req 8.2), input port (Req 5.6), and result reporting (Req 2.3).
4. Migration steps SHALL be individually committable and reviewable.

### Requirement 16: Platform Non-Goals

**User Story:** As the developer, I want the platform scoped hard, so that it stays a thin arcade instead of becoming an engine project.

#### Acceptance Criteria

1. THE platform SHALL NOT provide a shared game loop, entity system, ECS, physics wrapper, or renderer abstraction.
2. THE platform SHALL NOT unify game simulations into a shared engine package; simulations share a philosophy, not code (small utilities like seeded RNG may be duplicated).
3. THE platform SHALL NOT require accounts, wallet login, matchmaking, or online multiplayer.
4. THE platform SHALL NOT implement client-side anti-cheat, fingerprinting, or obfuscation.
5. THE platform SHALL NOT implement payouts, token transactions, or reward settlement in V1.
6. THE platform SHALL NOT add an asset pipeline/tooling package while asset counts remain small.
7. THE platform SHALL NOT add a key-rebinding UI in V1 (binding data structures only).
8. Shell code SHALL remain a folder in `apps/web` until a second consumer exists; only `controls` and `protocol` become packages now.
