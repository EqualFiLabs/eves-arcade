/**
 * Normalized combat input consumed by the simulation.
 *
 * The raw device state (`RawInputState`, defined in apps/web's `InputMapper`)
 * is reduced to this deterministic shape so the sim never touches the DOM.
 */

/** A discrete horizontal or vertical input axis. */
export type InputDirection = -1 | 0 | 1;

/**
 * Player or CPU input for a single simulation step.
 *
 * `horizontal`: -1 = walk toward the back (away from opponent), +1 = toward the
 * opponent; resolved by the mapper considering facing. `vertical`: -1 = up/jump
 * intent (positive y is down), +1 = down/crouch intent.
 */
export interface CombatInput {
  horizontal: InputDirection;
  vertical: InputDirection;
  block: boolean;
  /** High light attack (upper-body hitbox). */
  lightHigh: boolean;
  /** Low light attack (leg-level hitbox). */
  lightLow: boolean;
  /** High heavy attack (upper-body hitbox). */
  heavyHigh: boolean;
  /** Low heavy attack (leg-level hitbox). */
  heavyLow: boolean;
  special: boolean;
  super: boolean;
}

/**
 * Raw, unmapped device state produced by an input source. The `InputMapper`
 * (apps/web) converts this into {@link CombatInput}. Lives in the sim package so
 * input sources, tests, and the mapper share one canonical schema.
 */
export interface RawInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  block: boolean;
  lightHigh: boolean;
  lightLow: boolean;
  heavyHigh: boolean;
  heavyLow: boolean;
  special: boolean;
  super: boolean;
  start: boolean;
  mute: boolean;
}

/** A fully neutral input — no movement, no actions, no block. */
export const NEUTRAL_INPUT: CombatInput = {
  horizontal: 0,
  vertical: 0,
  block: false,
  lightHigh: false,
  lightLow: false,
  heavyHigh: false,
  heavyLow: false,
  special: false,
  super: false,
};

/** True when the input carries no movement, action, or block intent. */
export const isNeutralInput = (input: CombatInput): boolean =>
  input.horizontal === 0 &&
  input.vertical === 0 &&
  !input.block &&
  !input.lightHigh &&
  !input.lightLow &&
  !input.heavyHigh &&
  !input.heavyLow &&
  !input.special &&
  !input.super;
