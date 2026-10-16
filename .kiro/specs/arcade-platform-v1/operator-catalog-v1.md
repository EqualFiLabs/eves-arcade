# Operator catalog V1

This extension replaces RPR's fixed character identities and unconditional
static/offline-start requirements. Simulation IDs and kits remain combat roles.

## Requirements

- **OP-1 Catalog:** Store all 5,555 Mainnet base SVGs, eight named traits and
  artwork hashes in PostgreSQL. Package the exact Statics export compressed.
- **OP-2 Import:** Pin source commit/digest, chain 4663, collection, renderer
  addresses/hashes and provenance block. Validate everything before storage;
  import atomically and repeatably. No runtime RPC or running chain indexer.
- **OP-3 API:** Serve metadata, random selection with optional exclusion, and
  SVG through same-origin /api/operators. Return 400 for invalid IDs, 404 for
  missing records/artwork and 503 for unavailable/incomplete catalogs. SVGs
  include hash ETags and bounded caching.
- **OP-4 Selection:** Choose any player/CPU IDs without wallet/ownership checks.
  Both sides have Load, Randomize, preview and all traits. Explicit mirror
  matches are allowed; Randomize excludes the loaded opposing ID.
- **OP-5 Failures:** Disable Fight until both portraits load. Edits invalidate
  selections; obsolete responses cannot overwrite new state. Retry failures,
  cancel owned resources on exit and never substitute guest fighters.
- **OP-6 Preparation:** Optional game-owned prepare({mount,signal}) resolves to
  a synchronous launcher before ticket acquisition. Add PREPARING_GAME and
  preparation errors. No setup deadline; individual requests are bounded.
- **OP-7 Presentation:** Freeze appearances and reuse decoded portraits in the
  HUD. Show IDs and distinct player/CPU roles; retain placeholder bodies. Old
  replays show neutral labels. Cosmetic identity is excluded from stored
  matches, traces, canonical results and replay files.
- **OP-8 Delivery:** Migrate/import before production startup; readiness requires
  completeness. Test full import, rollback, real PostgreSQL routes, browser
  selection/retry/cancellation, keyboard/touch play and verified completion
  without configured RPC access.

## Design and graphical handoff

The catalog repository shares the verification store's PostgreSQL pool but has
its own interface. Only the fixed Mainnet collection is supported. Owners and
mutable activation tiers are excluded. SVG bytes are digest-pinned; arbitrary
uploads are unsupported. Dataset replacement requires an explicit source update.

RPR preparation captures an immutable appearance pair (ID, name, traits,
artwork hash, portrait URL) plus decoded images. The shell has no Operator
state. DOM Fight replaces the keyboard-only menu; readiness moves to FightScene
creation. Ticket fallback still applies after successful selection.

Graphics can consume Field, Boundary, Shell, Interface, Mantle, Telemetry,
Sigil and Signal. SVGs are portraits. Full bodies, rigs, animation, activation
effects and historical appearance snapshots are subsequent work.

## Delivery tasks

- [x] Package verified data, migration, importer and read API.
- [x] Add preparation, selection and fight presentation.
- [ ] Validate browser/database flows, synchronize docs and open feature PR.
