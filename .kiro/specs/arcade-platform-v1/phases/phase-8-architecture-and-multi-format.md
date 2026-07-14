# Phase 8 — Architecture Enforcement and Multi-Format Proof

Status: COMPLETE

Completed: 2026-07-13

Baseline: current local source checkout

## Outcome

The arcade boundary is now executable, and the platform has been exercised by
three deliberately different game shapes without shipping those fixtures as
content. A new game must satisfy registry and completion contracts, respect the
dependency graph, verify canonical input in direct and worker execution, and
survive the same real browser lifecycle used by Rug Pull Rumble.

## Implemented Work

### 1. Executable architecture boundaries

`tests/architecture/dependency-rules.ts` parses TypeScript imports, re-exports,
dynamic imports, browser-global references, and workspace package manifests.
It enforces these rules:

- `sim`, `content`, `protocol`, and game-core packages remain pure and cannot
  import Phaser, Node-only APIs, browser globals, or application code.
- Shared controls cannot depend on game packages or application code.
- The API cannot import Phaser, controls, or web code.
- Shared arcade code cannot import game internals except at the explicit web
  registry.
- A web game cannot import a sibling game or shell implementation details.
- RPR-specific conditionals are confined to RPR-owned code and explicit
  registries.

The suite tests the live graph and intentionally invalid synthetic sources, so
the rules prove they can fail and are not passive documentation.

### 2. Runtime contract enforcement

`defineArcadeRegistry`, `validateManifest`, and `validateCompletion` make the
shared contracts fail closed. Registry construction rejects duplicate or
invalid identities, ranked games without suspension/replay support, incompatible
leaderboards, and incomplete result presentation. The shell validates a game's
completion before teardown and reports violations as recoverable contract
errors.

The API no longer carries a Rug Pull Rumble build list. It validates a global
known-build set, while the verifier and leaderboard registries remain the
authority for supported game/version/schema combinations.

### 3. DEV-only multi-format fixtures

The fixture registry is activated only by `?arcadeFixtures=1` under
`import.meta.env.DEV`:

| Fixture | Ranking | Input/shape | Purpose |
|---|---|---|---|
| Button Fixture | Ranked | Digital button, landscape | Minimal deterministic trace and verified score |
| Analog Fixture | Ranked | Quantized axes, portrait, pointer/keyboard | Different scale/orientation and analog canonicalization |
| Unranked Fixture | Unranked | Digital button, any orientation | No session ticket, submission, replay, or leaderboard |

Each fixture creates and destroys a real Phaser 4 instance. The analog fixture
uses Arcade Physics only for a cosmetic sprite; its fixed-step pure state owns
the canonical result. This preserves the platform rule that Phaser physics
cannot become ranked simulation authority.

### 4. Parity, isolation, and replay proof

Button and analog traces are encoded, decoded, quantized, replayed, and checked
through direct API submission. A worker task runs both verifier formats through
the production worker executor boundary. A mismatch test proves that a forged
canonical claim is rejected.

Playwright launches button, analog, and unranked games sequentially through the
real shell. It checks fresh texture, animation, registry, sound, and scene
managers; absent inherited keys; owned overlay and global-listener cleanup;
cosmetic physics presence; generic result presentation; ranked/unranked service
behavior; and exact replay-adapter dispatch.

### 5. Validation and CI

The command surface is now explicit:

- `pnpm test:unit` — all non-Docker Vitest suites.
- `pnpm test:sim` — simulation-only regression suite.
- `pnpm test:architecture` — executable dependency rules.
- `pnpm test:api:integration` — real PostgreSQL suite.
- `pnpm test:e2e` — real browser flows.
- `pnpm build:all` — API and web production builds.
- `pnpm check:bundle` — proves DEV fixtures are absent from web output.
- `pnpm check:fast` / `pnpm check:all` — local and full gates.

GitHub Actions separates the fast, PostgreSQL, and browser jobs so failure
ownership remains clear while independent checks run concurrently.

## Completion Evidence

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS — seven workspace projects |
| `pnpm lint` | PASS |
| `pnpm test:unit` | PASS — 32 files, 288 passed, 5 Docker-gated skipped |
| `pnpm test:sim` | PASS — 12 files, 100 tests |
| `pnpm test:architecture` | PASS — 9 tests |
| `pnpm test:api:integration` | PASS — 5 PostgreSQL tests |
| `pnpm build:all` | PASS — API and Vite production builds |
| `pnpm check:bundle` | PASS — no DEV fixture markers in production output |
| `pnpm test:e2e` | PASS — 22 browser tests |
| `git diff --check` | PASS |

## Phase 9 Handoff

Phase 9 can adapt Crypto Crash Launcher against enforced contracts rather than
assumed conventions. It must define the launcher game/result/input identities,
deterministic authority, verifier descriptor, manifest capabilities, result
presentation, and replay adapter. The Phase 8 fixtures are proof infrastructure,
not a generic mini-engine and not templates that the launcher must inherit.
