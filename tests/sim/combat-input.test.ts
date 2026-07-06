import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_INPUT,
  isNeutralInput,
  type CombatInput,
  type InputDirection,
  type RawInputState,
} from '@rpr/sim';

describe('combat input', () => {
  it('NEUTRAL_INPUT is fully neutral and detected as such', () => {
    expect(NEUTRAL_INPUT.horizontal).toBe(0);
    expect(NEUTRAL_INPUT.vertical).toBe(0);
    for (const key of ['block', 'light', 'heavy', 'special', 'super'] as const) {
      expect(NEUTRAL_INPUT[key]).toBe(false);
    }
    expect(isNeutralInput(NEUTRAL_INPUT)).toBe(true);
  });

  it.each([
    ['light', { ...NEUTRAL_INPUT, light: true }],
    ['heavy', { ...NEUTRAL_INPUT, heavy: true }],
    ['block', { ...NEUTRAL_INPUT, block: true }],
    ['special', { ...NEUTRAL_INPUT, special: true }],
    ['super', { ...NEUTRAL_INPUT, super: true }],
    ['forward', { ...NEUTRAL_INPUT, horizontal: 1 as InputDirection }],
    ['back', { ...NEUTRAL_INPUT, horizontal: -1 as InputDirection }],
    ['up/jump', { ...NEUTRAL_INPUT, vertical: -1 as InputDirection }],
    ['crouch', { ...NEUTRAL_INPUT, vertical: 1 as InputDirection }],
  ] as const)('detects non-neutral input: %s', (_label, input: CombatInput) => {
    expect(isNeutralInput(input)).toBe(false);
  });

  it('RawInputState carries the full unmapped device schema', () => {
    const raw: RawInputState = {
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
    };
    expect(Object.keys(raw).sort()).toEqual(
      ['block', 'down', 'heavy', 'left', 'light', 'mute', 'right', 'special', 'start', 'super', 'up'],
    );
  });
});
