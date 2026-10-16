# Operator fighter prototype

The chosen direction combines athletic segmented armor (concept B) with the
clean dark plates, pale contours and colored seams of concept C. It is a
playable visual prototype with one shared articulated body. It is ready for
feedback on silhouette, identity recognition and motion before final assets.

## Identity mapping

| Catalog trait | Fighter presentation |
| --- | --- |
| Shell | Exact original helmet outline and inset detail |
| Interface | Exact original visor or face glyph |
| Sigil | Exact original symbol, fitted to the breastplate |
| Signal | Helmet, armor seams, panels and ground-seal accent |
| Mantle | Collar, wrap or split/coat panels |
| Field | Variation in chest etching |
| Telemetry | Variation in illuminated waist readout |
| Boundary | Original boundary geometry projected as a ground seal |

PLAYER and CPU labels retain their separate green/red role colors even when
both NFTs use the same Signal. Explicit mirror matches share appearance only;
each fighter owns an independent rig and textures.

## Artwork source and regeneration

Helmet, interface, sigil and boundary paths are extracted from the approved
Statics base artwork already packaged in `apps/api/data/operators-base-v1.json.gz`.
See [catalog provenance](operator-catalog.md) for the source commits, collection,
renderer hashes and Mainnet verification block. The source content digest is
`sha256:b9639daf8d898b663dc7b040f1698d89336af6bf89e9c0739b979b9a2524f0f5`.
These are EqualFiLabs/Statics portrait assets, not new interpretations of the
original NFT glyphs. Armor geometry and poses are original project work.

```sh
node scripts/operator-vector-features.mjs
node scripts/operator-vector-features.mjs --check
```

The offline extractor rejects an unapproved digest and inconsistent geometry
across all 5,555 records. It emits 30 reusable features in the pure content
package, with Signal colors replaced by a controlled parameter. No runtime SVG
parsing, RPC, AI generation or external image service is involved. Original
portrait bytes still come from the database and remain visible in the HUD.

## Runtime and boundaries

Canvas paths are baked at three times display resolution into one texture atlas
per fighter. This also avoids clipping observed with many separate canvas
textures in the WebGL renderer. A shallow Phaser container articulates images using a pure pose
sampler. Simulation frame and current move definitions drive motion; the
renderer holds joint poses during hitstop. Paused replays remain still. Each
renderer removes its own objects and textures during teardown.
The existing camera can zoom closer (up to 1.8) and fits both airborne fighters
with space for helmets and labels. It zooms out immediately when a jump needs
room and returns inward smoothly. Fighter dimensions remain unchanged.

Combat, hitboxes, movement, input, damage, scoring, traces and verification are
unchanged. The rig is visual and is not a hitbox diagnostic. High strikes use
arm extension, low strikes use kicks, and special/super moves use a two-arm
thrust. Historical replays show neutral white robots with PLAYER/CPU labels
because appearance persistence is deferred.

The stage, procedural motion and shared armor are provisional. Bespoke body
silhouettes, polished transition/anticipation animations, final effects,
sound and a production animation asset pipeline remain future art work.

## Trying it

Follow the [local setup](../README.md#local-development), choose Rug Pull
Rumble, and load both IDs. Suggested comparisons: 42/5555, 24/123, 520/16 and
16/16. Use arrows to move, A/S for high strikes, Z/X for low strikes, C/V for
special/super and Shift to guard, or touch controls
in landscape. The existing result, rematch and replay flows are preserved.
