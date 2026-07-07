/**
 * Fighter state models for the combat simulation.
 */
import type { Vec2 } from '../primitives';
import type { FighterDefinitionId, FighterId, MoveId } from '../primitives';
import type { CombatInput } from '../input/combat-input';

/** Which side of the match a fighter occupies. */
export type FighterSide = 'player' | 'cpu';

/** Horizontal facing. Flipping facing mirrors a fighter's local boxes. */
export type FacingDirection = 'left' | 'right';

/**
 * High-level fighter action state. Movement and move phases are mutually
 * exclusive with controllable states; see Property 4 (invalid input safety).
 */
export type FighterActionState =
  | 'idle'
  | 'walk_forward'
  | 'walk_backward'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'block'
  | 'hitstun'
  | 'blockstun'
  | 'ko';

/** Phase of an executing move's timeline. */
export type MovePhase = 'startup' | 'active' | 'recovery' | 'complete';

/** Runtime state of a move currently being executed by a fighter. */
export interface MoveRuntimeState {
  moveId: MoveId;
  /** Frames elapsed since the move started. */
  elapsedFrames: number;
  phase: MovePhase;
  /** Fighters already struck by this execution — enforces one-hit-per-move (Property 5). */
  hitTargets: FighterId[];
  /** True once the move's meter cost has been deducted. */
  spentMeter: boolean;
}

/** A buffered input awaiting cancellation into a legal action. */
export interface BufferedInput {
  input: CombatInput;
  /** Frame the input was recorded, used for buffer expiry. */
  frame: number;
}

/**
 * Transient per-frame flags that supplement {@link FighterActionState}.
 * Distinct from stun counters and move state; extended by later combat tasks.
 */
export interface FighterRuntimeFlags {
  /** True while the fighter is holding block intent this frame. */
  blocking: boolean;
  /** Which guard the fighter is holding while blocking (read at hit resolution). */
  blockHeight: 'high' | 'low';
}

/** Complete per-fighter simulation state. */
export interface FighterState {
  /** Unique participant identifier within this match. */
  id: FighterId;
  /** Which definition (e.g. Sminem, Bogdanoff) this fighter instantiates. */
  definitionId: FighterDefinitionId;
  side: FighterSide;
  health: number;
  maxHealth: number;
  meter: number;
  maxMeter: number;
  /** World-space anchor position (positive x = right, positive y = down). */
  position: Vec2;
  velocity: Vec2;
  facing: FacingDirection;
  /** True while the fighter's anchor is on the floor. */
  grounded: boolean;
  /** Air jumps used since leaving the ground (resets on landing). */
  airJumpsUsed: number;
  /** Edge-detect latch: true once the jump input has been released since the last jump. */
  airJumpReady: boolean;
  currentState: FighterActionState;
  currentMove: MoveRuntimeState | null;
  inputBuffer: BufferedInput[];
  /** Hitstun frames remaining; fighter cannot act while > 0. */
  stunFramesRemaining: number;
  /** Blockstun frames remaining; fighter cannot act while > 0. */
  blockstunFramesRemaining: number;
  /** Hitstop freeze frames remaining; simulation pauses the fighter's timeline. */
  hitstopFramesRemaining: number;
  /** True once this fighter has been KO'd for the round. */
  hasLost: boolean;
  runtimeFlags: FighterRuntimeFlags;
}
