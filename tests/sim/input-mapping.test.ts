import { describe, expect, it } from 'vitest';
import {
  type RawInputState,
  DEFAULT_KEYBOARD_BINDINGS,
  mapRawInput,
  NEUTRAL_INPUT,
} from '@rpr/sim';

const raw = (over: Partial<RawInputState>): RawInputState => ({
  left: false,
  right: false,
  up: false,
  down: false,
  block: false,
  light: false,
  heavy: false,
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
    const out = mapRawInput(raw({ block: true, light: true, heavy: true, special: true, super: true }));
    expect(out).toMatchObject({ block: true, light: true, heavy: true, special: true, super: true });
  });

  it('preserves simultaneous movement + attack intent (e.g. jump-in heavy)', () => {
    const out = mapRawInput(raw({ up: true, right: true, heavy: true }));
    expect(out.horizontal).toBe(1);
    expect(out.vertical).toBe(-1);
    expect(out.heavy).toBe(true);
  });

  it('exposes the default keyboard bindings used by the device mapper', () => {
    const b = DEFAULT_KEYBOARD_BINDINGS;
    expect(b.left).toBe('ArrowLeft');
    expect(b.right).toBe('ArrowRight');
    expect(b.up).toBe('ArrowUp');
    expect(b.down).toBe('ArrowDown');
    expect(b.block).toBe('ShiftLeft');
    expect(b.light).toBe('KeyZ');
    expect(b.heavy).toBe('KeyX');
    expect(b.special).toBe('KeyC');
    expect(b.super).toBe('KeyV');
    expect(b.start).toBe('Enter');
    expect(b.mute).toBe('KeyM');
  });
});
