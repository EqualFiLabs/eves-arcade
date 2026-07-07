import { describe, expect, it } from 'vitest';
import {
  type RawInputState,
  type GamepadReading,
  DEFAULT_KEYBOARD_BINDINGS,
  GAMEPAD_DEADZONE,
  mapRawInput,
  mapGamepad,
  mergeRawInput,
  NEUTRAL_INPUT,
  NEUTRAL_RAW,
} from '@rpr/sim';

const raw = (over: Partial<RawInputState>): RawInputState => ({
  left: false,
  right: false,
  up: false,
  down: false,
  block: false,
  lightHigh: false,
  lightLow: false,
  heavyHigh: false,
  heavyLow: false,
  special: false,
  super: false,
  start: false,
  mute: false,
  ...over,
});

describe('mapRawInput (Req 5)', () => {
  it('reduces a neutral raw state to the neutral combat input', () => {
    expect(mapRawInput(raw({}))).toEqual(NEUTRAL_INPUT);
  });

  it('maps arrow keys to world-relative horizontal/vertical axes', () => {
    expect(mapRawInput(raw({ right: true })).horizontal).toBe(1);
    expect(mapRawInput(raw({ left: true })).horizontal).toBe(-1);
    // Opposing directions cancel to neutral.
    expect(mapRawInput(raw({ left: true, right: true })).horizontal).toBe(0);

    expect(mapRawInput(raw({ down: true })).vertical).toBe(1);
    expect(mapRawInput(raw({ up: true })).vertical).toBe(-1);
    expect(mapRawInput(raw({ up: true, down: true })).vertical).toBe(0);
  });

  it('maps action buttons directly onto the combat input', () => {
    const out = mapRawInput(
      raw({ block: true, lightHigh: true, lightLow: true, heavyHigh: true, heavyLow: true, special: true, super: true }),
    );
    expect(out).toMatchObject({
      block: true,
      lightHigh: true,
      lightLow: true,
      heavyHigh: true,
      heavyLow: true,
      special: true,
      super: true,
    });
  });

  it('preserves simultaneous movement + attack intent (e.g. jump-in heavy high)', () => {
    const out = mapRawInput(raw({ up: true, right: true, heavyHigh: true }));
    expect(out.horizontal).toBe(1);
    expect(out.vertical).toBe(-1);
    expect(out.heavyHigh).toBe(true);
  });

  it('exposes the default keyboard bindings used by the device mapper', () => {
    const b = DEFAULT_KEYBOARD_BINDINGS;
    expect(b.left).toBe('ArrowLeft');
    expect(b.right).toBe('ArrowRight');
    expect(b.up).toBe('ArrowUp');
    expect(b.down).toBe('ArrowDown');
    expect(b.block).toBe('ShiftLeft');
    expect(b.lightHigh).toBe('KeyA');
    expect(b.lightLow).toBe('KeyZ');
    expect(b.heavyHigh).toBe('KeyS');
    expect(b.heavyLow).toBe('KeyX');
    expect(b.special).toBe('KeyC');
    expect(b.super).toBe('KeyV');
    expect(b.start).toBe('Enter');
    expect(b.mute).toBe('KeyM');
  });
});

describe('mergeRawInput (Req 5.11 — keyboard + gamepad coexist)', () => {
  it('returns a neutral raw state when given no sources', () => {
    expect(mergeRawInput([])).toEqual(NEUTRAL_RAW);
  });

  it('OR-merges flags so any source asserting a flag wins', () => {
    const keyboard: RawInputState = { ...NEUTRAL_RAW, right: true, lightHigh: true };
    const pad: RawInputState = { ...NEUTRAL_RAW, up: true, heavyLow: true };
    const merged = mergeRawInput([keyboard, pad]);
    expect(merged).toEqual({ ...NEUTRAL_RAW, right: true, up: true, lightHigh: true, heavyLow: true });
  });

  it('preserves meta flags (start/mute) from any source', () => {
    const merged = mergeRawInput([{ ...NEUTRAL_RAW, start: true }, { ...NEUTRAL_RAW, mute: true }]);
    expect(merged.start).toBe(true);
    expect(merged.mute).toBe(true);
  });
});

describe('mapGamepad (Req 5.11 — optional gamepad)', () => {
  const neutral: GamepadReading = {
    left: false,
    right: false,
    up: false,
    down: false,
    axisX: 0,
    axisY: 0,
    blockPressure: 0,
    a: false,
    b: false,
    x: false,
    y: false,
    r1: false,
    r2Pressure: 0,
    start: false,
    back: false,
  };

  it('reduces a resting pad to a neutral raw state', () => {
    expect(mapGamepad(neutral)).toEqual(NEUTRAL_RAW);
  });

  it('maps the left stick to direction flags beyond the deadzone and ignores drift', () => {
    expect(mapGamepad({ ...neutral, axisX: 1 }).right).toBe(true);
    expect(mapGamepad({ ...neutral, axisX: -1 }).left).toBe(true);
    expect(mapGamepad({ ...neutral, axisY: -1 }).up).toBe(true);
    expect(mapGamepad({ ...neutral, axisY: 1 }).down).toBe(true);
    // Below the deadzone → no movement.
    expect(mapGamepad({ ...neutral, axisX: GAMEPAD_DEADZONE - 0.01 }).right).toBe(false);
  });

  it('OR-merges the D-pad with the stick', () => {
    expect(mapGamepad({ ...neutral, left: true }).left).toBe(true);
    expect(mapGamepad({ ...neutral, left: true, axisX: 1 }).right).toBe(true);
  });

  it('maps face buttons to the 4 normals, shoulders to special/super, L1 to block', () => {
    const out = mapGamepad({
      ...neutral,
      a: true,
      b: true,
      x: true,
      y: true,
      r1: true,
      r2Pressure: 0.6,
      blockPressure: 0.6,
      start: true,
      back: true,
    });
    expect(out.lightHigh).toBe(true);
    expect(out.lightLow).toBe(true);
    expect(out.heavyHigh).toBe(true);
    expect(out.heavyLow).toBe(true);
    expect(out.special).toBe(true);
    expect(out.super).toBe(true);
    expect(out.block).toBe(true);
    expect(out.start).toBe(true);
    expect(out.mute).toBe(true);
  });

  it('treats any positive block pressure as blocking', () => {
    expect(mapGamepad({ ...neutral, blockPressure: 0.05 }).block).toBe(true);
    expect(mapGamepad(neutral).block).toBe(false);
  });
});
