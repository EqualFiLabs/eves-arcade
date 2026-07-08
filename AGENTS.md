# AGENTS.md — Rug Pull Rumble (Proof of Fight V1)

This project is a **Phaser 4 crypto meme arcade in the making**. Rug Pull Rumble — a single Sminem (player) vs Bogdanoff (CPU) crypto-parody fight — is the first game; the repo is migrating to a multi-game arcade platform (DOM shell, per-game Phaser instances, shared controls package, touch/mobile, session tickets + server-side replay verification for future crypto rewards).

Specs live in `.kiro/specs/` — read the relevant one before non-trivial work:

- `.kiro/specs/crypto-fighter-v1/` — the Rug Pull Rumble fight itself (sim, content, presentation). Mostly implemented; note the supersession banners in those files.
- `.kiro/specs/arcade-platform-v1/` — the arcade platform, migration plan, mobile/touch, backend verification, and the second game (Mempool Squadron). This governs all multi-game and platform work.

A set of **Phaser 4 skills** is installed globally. Load the right skill for the task via the skill tool before writing Phaser code — they encode correct Phaser 4 APIs (not v3) and save you from guessing.

# After changes

All code changes should come with tests proving functionality

## Test Fidelity Guardrails

Prefer real flows always.

If a synthetic shortcut is still necessary, document it clearly in the test file and keep it narrow. Every such shortcut should have a concrete reason.

# Commit Messages

Commit messages: Use Conventional Commits (feat(scope): …). Title ≤72 chars. Body in bullets explaining what/where/how/why. Present tense. Format:

feat(scope): short summary  

- Key change detail  
- Another change  
- Rationale/context  

The example body is illustrative, not a quota. Use only the bullets that add useful information. One bullet or no body is acceptable for small changes; never add filler just to reach three points.


## Architecture boundary (read first)

Monorepo (pnpm workspace):

- `packages/sim/` — **pure TypeScript combat simulation. NO Phaser imports. NO skills apply here.** This is the deterministic fixed-step engine: `CombatEngine`, `MoveResolver`, `CollisionSystem`, `MeterSystem`, `RoundResolver`, `CpuController`. Tested headlessly.
- `packages/content/` — **pure data. NO Phaser imports.** Fighter/move/stage definitions, copy, distribution hooks, asset manifest.
- `apps/web/` — **the only place Phaser and the Phaser skills apply.** Scenes, input, renderers, audio, UI. Presentation reads sim state + events; it must never mutate combat state.

Hard rules:

- Never `import Phaser` (or any `phaser` types) inside `packages/sim/**` or `packages/content/**`.
- Fighter movement, collision, and timing are driven by the **sim's fixed step** (`SIM_FPS = 60`), not by Phaser physics. Do not reach for Phaser physics to move fighters.
- Phaser renderers consume `GameState` + emitted `CombatEvent[]` snapshots. Presentation follows simulation (Property 10 in `design.md`).
- All fighter/move/stage/UI data is data-driven — tune via `packages/content`, not by editing systems code (Req 16.4).

## Phaser 4 first

This is a greenfield v4 project. v4 removed/renamed many v3 APIs (FX → Filters, Pipeline → RenderNode, BitmapMask → FilterMask, `Point` → `Vector2`, `Mesh`/`Plane` removed). Before writing Phaser code:

- Load **`v4-new-features`** to know the current APIs (Filters, RenderNodes, SpriteGPULayer, new tint modes, etc.).
- If you find yourself reaching for a v3 pattern (preFX/postFX, Pipeline, BitmapMask), load **`v3-to-v4-migration`** for the correct replacement.

## Skill routing — load before you write

Match the task to the skill. When in doubt, load the skill named in the left column.

| Task / situation | Skill(s) to load |
|---|---|
| `GameConfig`, scale mode, parent, canvas, registering scenes (Task 10.1) | `game-setup-and-config`, `scale-and-responsive` |
| Boot/Preload/Menu/Fight/Result scenes, lifecycle, transitions, restart (Tasks 10.2–10.7, 18.1, 18.2) | `scenes` |
| `PreloadScene`, asset manifest, load progress/errors (Task 10.4) | `loading-assets` |
| Keyboard / gamepad input sources, `InputMapper` (Tasks 11.1–11.3) | `input-keyboard-mouse-touch` |
| `FighterRenderer` sprites/images tied to `FighterState` (Tasks 13.2, 13.3) | `sprites-and-images` |
| Fighter state animations: idle/walk/crouch/jump/attack/block/hitstun/KO (Task 13.3) | `animations` |
| Placeholder shapes for fighters/stage; `DebugRenderer` hitbox/hurtbox/pushbox viz (Tasks 13.1, 13.2, 19.2) | `graphics-and-shapes` |
| Stage camera, keeping both fighters visible, deadzone (Task 13.4) | `cameras` |
| `marketControlRoom` stage if built from a tilemap (Tasks 3.8, 13.1) | `tilemaps` |
| `HudView` health/meter bars, round/KO/win/loss text (Task 13.5) | `text-and-bitmaptext` |
| Hit sparks, block sparks, special/super emphasis, KO presentation, screen shake, freeze (Tasks 14.1–14.6) | `particles`, `tweens`, `filters-and-postfx` |
| Super/special visual emphasis using v4 Filters (Tasks 14.3, 14.4) | `filters-and-postfx` (v4: `filters.internal`/`external`, not FX) |
| `AudioController`: play UI/attack/hit/block/special/super/KO/win/loss, mute, autoplay unlock (Tasks 15.1–15.5) | `audio-and-sound` |
| Fixed-step accumulator, frame-stall cap, timers (Task 10.7) | `time-and-timers` |
| Emitting/listening for `CombatEvent[]` to drive FX + audio (Property 10) | `events-system` |
| World-space box transforms, AABB overlap checks on the presentation side (Task 6.2 lives in sim; only load if sim-side help needed) | `geometry-and-math` |
| Grouping/layering renderers, containers (FighterRenderer/StageRenderer/EffectsRenderer) | `groups-and-containers`, `game-object-components` |
| `ShareView`, `DistributionHookView` text surfaces (Tasks 18.3, 18.6) | `text-and-bitmaptext` |
| Projectile arcs for `green_candle` / `red_candle` presentation | `curves-and-paths` |
| Capture/mask/lighting tricks, gradient/noise backgrounds | `render-textures`, `v4-new-features` |

## Use Phaser physics sparingly (or not at all)

The sim owns fighter movement and collision. **Do not** use `physics-arcade` or `physics-matter` to drive fighter position/velocity/hitboxes — that would corrupt the deterministic sim and violate the architecture boundary.

Only consider those skills if a genuinely presentation-only physical effect is needed (e.g., cosmetic debris). When unsure, ask rather than assume.

## Conventions

- TypeScript strict mode everywhere. Package-level `tsconfig.json` extends `tsconfig.base.json`.
- Default keyboard bindings are defined in `design.md` (`InputMapper` section) — ArrowKeys + Z/X/C/V + Shift + Enter + M. Keep keyboard fully playable; gamepad is optional (Req 5.10/5.11).
- Copy is parody meme tone but legally safe: no copyrighted assets, no protected brands as identity, no unverified factual claims (Reqs 4, 12.8, 17). Put copy in `packages/content`, never hardcode into scenes.
- Debug overlays off by default in production; toggle via dev flag/query param (Reqs 16.3, 16.6).
- No backend, no wallet, no accounts, no blockchain (Req 18). Static deploy only.

## Definition of done for a task

Before declaring a task from `tasks.md` complete:

1. `pnpm typecheck` passes (strict).
2. `pnpm lint` passes.
3. `pnpm test:sim` passes if the task touched `packages/sim` or `packages/content`.
4. The relevant skill was actually consulted (don't write Phaser code from memory — verify against the skill).
5. No Phaser import leaked into `packages/sim` or `packages/content`.

If you can't find the right command, ask the user and then record it here.
