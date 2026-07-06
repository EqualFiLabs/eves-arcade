/**
 * Pure input reduction: RawInputState → CombatInput.
 *
 * Deterministic and free of DOM/Phaser. The device-side reader (`InputMapper`
 * in apps/web) collects a {@link RawInputState} from keyboard/gamepad and calls
 * this reducer to produce the simulation input (Req 5, design: InputMapper).
 *
 * Horizontal/vertical are resolved in *world space*: pressing right yields
 * horizontal +1 (move +x). The engine's movement code applies forward/backward
 * walk speed based on facing, so "toward the opponent" naturally gets the
 * forward speed bonus.
 */
import type { CombatInput, InputDirection, RawInputState } from './combat-input';

const toDir = (n: number): InputDirection => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** Reduces raw device state into a single normalized simulation input. */
export function mapRawInput(raw: RawInputState): CombatInput {
  const horizontal = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
  const vertical = (raw.down ? 1 : 0) - (raw.up ? 1 : 0);
  return {
    horizontal: toDir(horizontal),
    vertical: toDir(vertical),
    block: raw.block,
    light: raw.light,
    heavy: raw.heavy,
    special: raw.special,
    super: raw.super,
  };
}

/**
 * Default V1 keyboard bindings (design.md). The apps/web InputMapper maps these
 * `event.code` values to {@link RawInputState} flags. Keyboard stays fully
 * playable without a gamepad (Req 5.10/5.11).
 */
export const DEFAULT_KEYBOARD_BINDINGS = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  block: 'ShiftLeft',
  light: 'KeyZ',
  heavy: 'KeyX',
  special: 'KeyC',
  super: 'KeyV',
  start: 'Enter',
  mute: 'KeyM',
} as const;

export type KeyboardBindingName = keyof typeof DEFAULT_KEYBOARD_BINDINGS;
