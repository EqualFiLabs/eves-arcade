# Operator fighter visual prototype V1

This extension supersedes the placeholder-body clause of OP-7. The user chose
to proceed with an art prototype; direction is B's athletic armor proportions
with C's restrained vector finish. Branch `feat/operator-fighter-prototype`
depends on unmerged `feat/operator-nft-plumbing` (PR #1); deliver a stacked PR.

## Acceptance criteria

- One articulated, layered armor rig renders both combat roles. Reuse exact
  Shell, Interface and Sigil geometry from the verified base portrait catalog.
  Signal controls accent color; Mantle controls collar/coat silhouette, Field
  controls torso pattern, Telemetry controls panel marks, Boundary controls a
  cosmetic ground seal. All eight traits remain cosmetic.
- Standing height follows existing fighter dimensions. Idle, walk, crouch,
  jump, punch, kick, special/super, guard, hit reaction and fallen KO have
  distinct poses driven by simulation frames and move definitions. Hitstop and
  paused replays freeze the pose. Presentation never writes simulation state.
- Live fights retain IDs, source portraits and distinct player/CPU markers.
  Mirror matches use independent rigs. Old replays use neutral robots and role
  labels because historical appearance snapshots are not stored.
- Bake vector parts once per renderer; update transforms during fights. Own
  and release all generated textures and objects on teardown, including replay.
- Permit closer camera framing (maximum zoom 1.8) to read the new art. Retain
  dual-target fit, world bounds, margins and simulation dimensions. Fit airborne
  fighter extents, zoom out immediately when needed and smooth inward motion.
- Keep combat, input, hitboxes, scoring, verification, traces, stored matches,
  API and catalog schema unchanged. Final art, sound, stage redesign, animation
  authoring tools and historical identity persistence are outside this slice.

## Implementation and validation

1. Reproducible extraction of portrait feature geometry from the pinned seed;
   document provenance and test all 5,555 trait combinations.
2. Pure frame-driven pose sampler and baked vector armor renderer; test move
   phases, immutability, hitstop, mirrored rigs and lifecycle ownership.
3. Browser visual inspection at game scale, keyboard/touch fights, replay and
   teardown checks. Run fast checks, architecture, PostgreSQL and browser gates.
4. Commit candidate, independent local review, resolve findings, then publish
   feature branch/stacked PR with evidence and observe CI to completion.

This is a playable art-direction prototype. Shared armor and procedural joint
motion are intentional; bespoke silhouettes, animation polish and final asset
production follow visual approval.
