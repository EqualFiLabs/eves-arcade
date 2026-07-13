# Phase 5: Game-Neutral Web Surfaces

Status: `COMPLETE`

Approved: 2026-07-13

Completed: 2026-07-13

Roadmap: `../architecture-hardening-roadmap.md`

## Goal

Remove Rug Pull Rumble assumptions from the browser platform so a game with a
different orientation, renderer, physics presentation, result shape, local-best
metric, and replay implementation can use the same shell without modifying
shared arcade code.

## Locked Decisions

- Phaser construction uses a curated configuration API. Games provide title,
  version, dimensions, background, scenes, and selected native renderer,
  render, scale, physics, input, callback, and banner settings; the platform
  does not expose an unrestricted `GameConfig` merge.
- Shared defaults remain limited to browser-level behavior: automatic renderer,
  fit and center scaling, disabled context menu, and disabled Phaser banner.
- Replay is an optional manifest capability with a lazy game-owned adapter, not
  a boolean. The adapter owns game setup, controls, progress, and teardown.
- The shared replay route accepts a minimal JSON envelope containing exact game
  identity, seed, input schema, encoding version, and base64 evidence. It
  dispatches only on exact registered game/version/schema matches.
- Result sharing and related links remain completion-owned safe text/URL data.
  The shell never accepts game markup or executable result renderers.
- Local-best label and numeric formatting live in manifest metadata so metrics
  such as score, distance, time, and placement do not inherit RPR copy.
- CSS is owned by the DOM arcade shell and imported by its entry point. Phaser
  canvases remain game-owned.
- Fixtures prove contract breadth without adding a fake second playable game.
- Automated accessibility uses axe WCAG A/AA checks plus explicit keyboard,
  focus, and short-viewport browser flows.
- The separate Crypto Crash Launcher prototype specification remains untouched.

## Chronological Implementation Plan

### 5.1 Generalize platform contracts

- Replace the replay capability boolean with lazy replay adapter contracts.
- Define the versioned replay envelope, decoded evidence, playback progress,
  controls, readiness, cancellation, and asynchronous destruction interfaces.
- Add game-owned local-best presentation metadata.
- Expand compile-time manifests across fighter, portrait launcher, score-only,
  and unranked formats.

### 5.2 Curate Phaser construction

- Remove RPR content and fixed dimensions from the shared config factory.
- Require game identity, dimensions, background, and scenes.
- Accept selected native Phaser subsystem configs while retaining neutral
  browser defaults.
- Configure RPR explicitly and prove a separate portrait Matter configuration
  can be represented without changing the factory.

### 5.3 Move replay behavior behind the game boundary

- Implement an RPR replay adapter beside the RPR game module and scenes.
- Keep seed/trace registry setup and replay-scene knowledge inside that adapter.
- Make the shared replay viewer parse, validate, resolve, load, control, poll,
  cancel, and destroy through platform contracts only.
- Coordinate shell and replay hash routes so exactly one surface owns the root.

### 5.4 Make results and local bests format-neutral

- Render game title, canonical metrics, statistics, duration, submission status,
  safe share data, and safe related links from game-owned presentation data.
- Format local best using manifest label, precision, prefix, and suffix.
- Preserve live verified/rejected/submission-failed updates and canonical result
  replacement.
- Focus the result heading and expose asynchronous status text as live regions.

### 5.5 Extract responsive, accessible shell styling

- Replace the monolithic inline document style with an imported arcade
  stylesheet and concise semantic HTML shell.
- Keep selection, pending, error, result, and replay surfaces independently
  scrollable in short viewports.
- Preserve browser zoom, visible focus, 44-pixel controls, semantic headings,
  labels, status regions, groups, and navigation.
- Correct any axe-discovered AA contrast failures.

### 5.6 Prove neutrality and regressions

- Test landscape/no-physics and portrait/Matter factory configurations.
- Test replay envelope decoding, exact adapter dispatch, schema rejection, and
  real RPR playback controls.
- Enforce that shared arcade modules do not import RPR content and only the
  registry imports game manifests.
- Test different result and local-best metric formats, safe text/URLs, canonical
  status updates, focus, keyboard launch, short viewport scrolling, and WCAG
  A/AA scans.
- Run typecheck, lint, all unit/integration tests, production build, the full
  browser suite, boundary scans, and whitespace validation.

## Implementation Log

- Added curated game-owned Phaser configuration and moved all RPR dimensions,
  copy, version, input, and scenes to the RPR adapter.
- Added replay contracts and a strict minimal envelope, rewrote the shared
  replay surface as adapter-driven infrastructure, and added the lazy RPR
  adapter with observable readiness and idempotent asynchronous teardown.
- Added active route ownership for arcade/replay hash changes and page exit.
- Made local-best copy and formatting manifest-owned and strengthened semantic,
  focus, live-status, safe-link, and scoreless/distance result rendering.
- Extracted inline CSS into the responsive arcade stylesheet and restored a
  concise semantic document with browser zoom enabled.
- Added compiled multi-format fixtures, architecture boundary tests, replay
  dispatch tests, keyboard/focus tests, short-viewport coverage, and automated
  axe WCAG A/AA checks.
- Raised result-duration contrast after the accessibility suite identified a
  4.14:1 ratio below the required 4.5:1 threshold.

## Verification Evidence

- `pnpm typecheck`: passed across seven buildable workspace projects.
- `pnpm lint`: passed.
- `pnpm test:sim`: 27 files and 226 tests passed.
- `pnpm build`: passed; 87 modules transformed.
- `pnpm test:e2e`: all 20 desktop and mobile tests passed, including replay,
  keyboard, focus, WCAG A/AA, short-viewport, and real Phaser lifecycle flows.
- `git diff --check`: passed.

## Deferred Items

- Named canonical action schemas, trace envelope evolution, size limits, and
  analog canonicalization remain Phase 6 work.
- Multi-game verifier/category registries and durable transactional storage
  remain Phase 7 work.
- Broader fixture enforcement and second-game implementation remain Phases 8–10.
