# Phase 6: Canonical Input and Trace V2

Status: `COMPLETE`

Approved: 2026-07-13

Completed: 2026-07-13

Roadmap: `../architecture-hardening-roadmap.md`

## Goal

Make ranked input evidence explicit, stable, deterministic for both digital and
analog games, and bounded when decoded from untrusted submissions. The exact
canonical frame consumed by a live game must be the frame encoded and later
consumed by replay verification.

## Locked Decisions

- Trace V1 is removed rather than retained behind compatibility code. The
  platform is greenfield and has no production trace inventory to migrate.
- Trace V2 is a fixed-width positional payload selected through an exact,
  registered input schema identity. Semantic action names are not repeated in
  each trace.
- Schema order is protocol order. JavaScript object construction order never
  affects the bytes.
- Analog values are clamped to `[-1, 1]`, quantized onto signed int16 values
  `[-32767, 32767]`, and converted back to that exact canonical grid before the
  simulation reads them. The non-canonical int16 value `-32768` is rejected.
- Trace V2 is not compressed. Its fixed-width form makes byte and execution
  bounds straightforward; compression can be justified later using real trace
  data.
- Suspension produces no input frames or markers because the game simulation
  does not advance while suspended.
- Rug Pull Rumble keeps game version `0.1.0`, advances its input schema to
  `rpr.input@2`, uses Trace V2, and accepts at most 10,800 frames (180 seconds at
  60 simulation steps per second).
- RPR records only the 11 actions consumed by its deterministic core. Shell
  actions such as start and mute are excluded from ranked evidence.
- Touch drag zones report absolute normalized position within their declared
  region. Each stick or drag zone has at most one active pointer owner.
- Pointer cancellation, pointer leave, lost capture, browser blur, and source
  teardown all neutralize retained state.
- Durable storage, verifier registries, queues/workers, and retained verifier
  versions remain Phase 7 responsibilities.
- The separate Crypto Crash Launcher prototype specification remains untouched.

## Trace V2 Wire Contract

The selected schema declares an ordered button list and an ordered axis list.
The trace contains:

```text
[encodingVersion: uint8 = 2]
[frameCount: uint32 big-endian]
repeat frameCount times:
  [buttons: ceil(schema.buttons / 8) bytes, LSB first]
  [axes: schema.axes * int16 big-endian]
```

The schema identity travels in the surrounding replay or submission envelope.
The decoder selects the registered schema first and then derives the only valid
payload width. It rejects unknown versions, frame counts outside the selected
game limits, byte limits, truncated or trailing data, non-zero unused button
bits, and the non-canonical `-32768` axis representation.

RPR's schema order is:

```text
left, right, up, down, block,
lightHigh, lightLow, heavyHigh, heavyLow, special, super
```

It has no analog axes. Each RPR frame therefore occupies two bytes, and its
maximum accepted trace is 21,605 bytes including the five-byte header.

## Chronological Implementation Plan

### 6.1 Define the protocol contract

- Replace the self-describing Trace V1 counts with schema-selected Trace V2.
- Add runtime-validated, immutable input schema definitions.
- Add canonical frame normalization and stable int16 analog quantization.
- Require explicit frame and byte limits for both encode and decode paths.
- Reject alternate encodings of the same logical input.

### 6.2 Put canonicalization before simulation

- Construct `TraceRecorder` from a schema and limits.
- Canonicalize every source frame during `read()`.
- Return the canonical frame to the game and retain that same frame for packing.
- Enforce the frame ceiling as frames are collected, not only at submission.

### 6.3 Migrate RPR and the ranked API

- Define the RPR action vocabulary and limits in its pure core package.
- Remove start and mute from fight evidence and decode semantic actions directly
  into `CombatInput`.
- Move the browser recorder, replay adapter, fixtures, and API verifier to the
  RPR schema and Trace V2 identity.
- Preflight decoded base64 size before allocating the submitted evidence.
- Reject legacy V1 evidence without consuming its session ticket.

### 6.4 Complete and harden device sources

- Implement absolute normalized touch drag axes.
- Clamp pointer and touch axes at source boundaries.
- Give analog regions explicit pointer ownership and ignore competing pointers.
- Reference-count simultaneous pointers pressing the same button.
- Neutralize all buttons and axes on cancellation, leave, lost capture, blur,
  and destruction.

### 6.5 Prove strictness and regressions

- Pin Trace V2 golden bytes and order-independent source frames.
- Prove analog int16 endpoints, clamping, canonical live/replay equality, and
  missing-action neutralization.
- Reject unknown actions, non-finite axes, V1, truncation, trailing bytes,
  padding bits, `-32768`, and frame/byte limit violations.
- Cover RPR deterministic replay, the API ticket lifecycle, pointer loss,
  multi-pointer touch behavior, and real browser replay/mobile flows.

## Implementation Log

- Replaced the protocol trace codec with schema-keyed fixed-width Trace V2 and
  structured validation errors.
- Added immutable schema definitions, exact byte-length calculation, canonical
  int16 analog normalization, and mandatory decode limits.
- Rebuilt `TraceRecorder` as the canonical input choke point so live and replay
  paths receive byte-equivalent frames.
- Added `rpr.input@2`, its ordered 11-action definition, the 10,800-frame cap,
  and the exact 21,605-byte RPR trace cap to the RPR core.
- Migrated the fight, replay surface, API verifier, contract examples, terminal
  fixture, and browser fixture to Trace V2.
- Added base64 decoded-size preflight before allocation in the API.
- Completed touch drag axes and neutral-state recovery across pointer cancel,
  leave, lost capture, blur, competing pointers, and teardown.
- Added protocol, recorder, RPR replay, API rejection, pointer, touch, and
  browser regression coverage.

## Verification Evidence

- `pnpm typecheck`: passed across all buildable workspace projects.
- `pnpm lint`: passed.
- `pnpm test:sim`: 28 files and 247 tests passed.
- `pnpm build`: passed; 87 modules transformed.
- `pnpm test:e2e`: all 20 desktop and mobile tests passed, including Trace V2
  replay playback and real mobile touch input.
- Architecture scan: no Phaser import was introduced in `packages/sim` or
  `packages/content`.
- `git diff --check`: passed.

## Deferred Items

- Phase 7 owns verifier dispatch registries, durable transactional storage,
  retained verifier versions, worker/queue topology, and production limits.
- Compression remains deliberately absent until representative traces show a
  material transport or storage benefit.
- Legacy trace migration is closed for the greenfield baseline. It must be
  reconsidered only if production Trace V2 evidence exists before another wire
  change.
