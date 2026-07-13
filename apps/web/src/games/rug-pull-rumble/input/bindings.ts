import type { GamepadBindings } from '@rpr/controls';
import type { RprButton } from './buttons';

/**
 * RPR keyboard bindings (data, Req 5.8) — maps each {@link RprButton} to a
 * `KeyboardEvent.code`.
 *
 * Matches the sim's `DEFAULT_KEYBOARD_BINDINGS` (which stays in `@rpr/sim` for
 * its own tests); the game folder owns this copy so the controls source can be
 * configured without importing sim internals.
 *
 * High/low light and heavy attacks split across A/Z (light) and S/X (heavy);
 * special/super on C/V. Movement on arrows, block on Left Shift (design.md).
 * Menu start and mute are scene controls and are intentionally outside the
 * deterministic fight input schema.
 */
export const RPR_KEYBOARD_BINDINGS: Readonly<Record<RprButton, string>> = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  block: 'ShiftLeft',
  lightHigh: 'KeyA',
  lightLow: 'KeyZ',
  heavyHigh: 'KeyS',
  heavyLow: 'KeyX',
  special: 'KeyC',
  super: 'KeyV',
};

/**
 * RPR gamepad bindings (data, Req 5.8) — maps each {@link RprButton} to one or
 * more Standard Gamepad inputs.
 *
 * Directions bind to BOTH the D-pad and the left stick (OR-merged within the
 * source), so either works for movement. Face buttons → the four high/low
 * normals; L1 → block; R1 → special; R2 (pressure) → super; Start/Back →
 * Deadzone 0.4 matches the sim's `GAMEPAD_DEADZONE`.
 */
export const RPR_GAMEPAD_BINDINGS: GamepadBindings<RprButton> = {
  buttons: {
    left: [{ axis: 'leftX', sign: -1 }, 'left'],
    right: [{ axis: 'leftX', sign: 1 }, 'right'],
    up: [{ axis: 'leftY', sign: -1 }, 'up'],
    down: [{ axis: 'leftY', sign: 1 }, 'down'],
    block: 'l1',
    lightHigh: 'a',
    lightLow: 'b',
    heavyHigh: 'x',
    heavyLow: 'y',
    special: 'r1',
    super: 'r2',
  },
  deadzone: 0.4,
};
