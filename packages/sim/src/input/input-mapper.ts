/**
 * Pure input reduction: RawInputState → CombatInput, plus multi-source merging
 * and gamepad reduction.
 *
 * Deterministic and free of DOM/Phaser. The device-side readers
 * (`KeyboardInputSource`, `GamepadInputSource`, `InputMapper` in apps/web)
 * collect one or more {@link RawInputState}s from keyboard/gamepad and call
 * these reducers to produce the simulation input (Req 5, design: InputMapper).
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
    lightHigh: raw.lightHigh,
    lightLow: raw.lightLow,
    heavyHigh: raw.heavyHigh,
    heavyLow: raw.heavyLow,
    special: raw.special,
    super: raw.super,
  };
}

/** A fully neutral raw state (no movement, actions, or meta flags). */
export const NEUTRAL_RAW: RawInputState = {
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
};

/**
 * OR-merges multiple raw sources into one (any source asserting a flag wins).
 * Lets keyboard + gamepad coexist so the keyboard stays fully playable when a
 * gamepad is also used (Req 5.11).
 */
export function mergeRawInput(sources: readonly RawInputState[]): RawInputState {
  const merged: RawInputState = { ...NEUTRAL_RAW };
  for (const s of sources) {
    merged.left ||= s.left;
    merged.right ||= s.right;
    merged.up ||= s.up;
    merged.down ||= s.down;
    merged.block ||= s.block;
    merged.lightHigh ||= s.lightHigh;
    merged.lightLow ||= s.lightLow;
    merged.heavyHigh ||= s.heavyHigh;
    merged.heavyLow ||= s.heavyLow;
    merged.special ||= s.special;
    merged.super ||= s.super;
    merged.start ||= s.start;
    merged.mute ||= s.mute;
  }
  return merged;
}

/**
 * Default V1 keyboard bindings (design.md). High/low light and heavy attacks
 * split across A/Z (light) and S/X (heavy); special/super stay on C/V. The
 * apps/web InputMapper maps these `event.code` values to {@link RawInputState}
 * flags. Keyboard stays fully playable without a gamepad (Req 5.10/5.11).
 */
export const DEFAULT_KEYBOARD_BINDINGS = {
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
  start: 'Enter',
  mute: 'KeyM',
} as const;

export type KeyboardBindingName = keyof typeof DEFAULT_KEYBOARD_BINDINGS;

/**
 * Normalized gamepad reading — what a device reader extracts from a physical
 * pad before reduction. Pure (no DOM/Phaser) so the mapping is unit-testable.
 * `axisX`/`axisY` follow the standard gamepad convention: right is +x, down is
 * +y (so up is negative y).
 */
export interface GamepadReading {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  axisX: number;
  axisY: number;
  /** Left shoulder (L1/LB) pressure 0..1 — used as the block input. */
  blockPressure: number;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  /** Right shoulder (R1/RB) — special. */
  r1: boolean;
  /** Right trigger (R2/RT) pressure 0..1 — super. */
  r2Pressure: number;
  start: boolean;
  back: boolean;
}

export const GAMEPAD_DEADZONE = 0.4;

/**
 * Default V1 gamepad face-button → action mapping (design: optional gamepad).
 *   A → lightHigh, B → lightLow, X → heavyHigh, Y → heavyLow,
 *   R1 → special, R2 → super, L1 → block, Start → start, Back → mute.
 */
export const DEFAULT_GAMEPAD_BINDINGS = {
  lightHigh: 'a',
  lightLow: 'b',
  heavyHigh: 'x',
  heavyLow: 'y',
  special: 'r1',
  super: 'r2',
  block: 'l1',
  start: 'start',
  mute: 'back',
} as const;

/**
 * Reduces a normalized gamepad reading into raw input. Stick values below the
 * deadzone are ignored to suppress drift. D-pad and stick are OR-merged.
 */
export function mapGamepad(g: GamepadReading, deadzone = GAMEPAD_DEADZONE): RawInputState {
  const xDir = g.axisX > deadzone ? 1 : g.axisX < -deadzone ? -1 : 0;
  const yDir = g.axisY > deadzone ? 1 : g.axisY < -deadzone ? -1 : 0;
  return {
    left: g.left || xDir === -1,
    right: g.right || xDir === 1,
    up: g.up || yDir === -1,
    down: g.down || yDir === 1,
    block: g.blockPressure > 0,
    lightHigh: g.a,
    lightLow: g.b,
    heavyHigh: g.x,
    heavyLow: g.y,
    special: g.r1,
    super: g.r2Pressure > 0,
    start: g.start,
    mute: g.back,
  };
}
