/**
 * Fighter definition schema.
 *
 * Static stats and references for a fighter archetype. Authored in
 * `@rpr/content`; consumed by the sim when initializing `FighterState`.
 */
import type { Box } from '../primitives';
import type { FighterDefinitionId } from '../primitives';
import type { MoveId } from '../primitives';

/** Hurtbox sets per pose, in fighter-local coordinates (anchor at feet center). */
export interface FrameBoxSet {
  /** Standing / walking / blocking pose. */
  stand: Box[];
  /** Crouching pose. */
  crouch: Box[];
  /** Airborne pose. */
  airborne: Box[];
}

/** Maps each move slot to its {@link MoveId} for this fighter. */
export interface FighterMoveMap {
  lightHigh: MoveId;
  lightLow: MoveId;
  heavyHigh: MoveId;
  heavyLow: MoveId;
  special: MoveId;
  /** Optional: boss CPU may omit a dedicated super (e.g. Bogdanoff's dump is optional). */
  super?: MoveId;
}

/** Animation keys per fighter action state, resolved by the fighter renderer. */
export interface FighterAnimationKeys {
  idle: string;
  walkForward: string;
  walkBackward: string;
  crouch: string;
  jump: string;
  block: string;
  hitstun: string;
  blockstun: string;
  ko: string;
}

/** Audio keys for fighter-emitted sounds. */
export interface FighterAudioKeys {
  attack?: string;
  hit?: string;
  ko?: string;
}

/** Copy keys resolving to parody lines in the content copy module. */
export interface FighterCopyKeys {
  win: string;
  loss: string;
}

/** Complete static definition of a fighter archetype. */
export interface FighterDefinition {
  id: FighterDefinitionId;
  displayName: string;
  /** Parody archetype label (e.g. "diamond-handed retail hero"). */
  parodyArchetype: string;
  maxHealth: number;
  maxMeter: number;
  /** Forward walk speed per simulation step. */
  walkSpeed: number;
  /** Backward walk speed per simulation step. */
  backWalkSpeed: number;
  /** Initial upward velocity on jump (negative = up, since +y is down). */
  jumpVelocity: number;
  /** Downward acceleration per step. */
  gravity: number;
  /** Max air jumps allowed after leaving the ground (0 = no air jump). */
  maxAirJumps: number;
  /** Body volume used for pushbox separation, in fighter-local coordinates. */
  pushbox: Box;
  defaultHurtboxes: FrameBoxSet;
  moves: FighterMoveMap;
  animationKeys: FighterAnimationKeys;
  audioKeys: FighterAudioKeys;
  copyKeys: FighterCopyKeys;
}
