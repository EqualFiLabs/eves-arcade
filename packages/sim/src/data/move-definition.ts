/**
 * Move definition schema.
 *
 * Pure data describing a fighter action's timing, damage, meter, collision, and
 * presentation. Consumed by `MoveResolver`, `CollisionSystem`, and `MeterSystem`
 * in the sim; values are authored in `@rpr/content`.
 */
import type { MoveId } from '../primitives';
import type { TimedBox } from '../primitives';
import type { InputDirection } from '../input/combat-input';

/** Functional category of a move (drives scaling, cancels, and CPU weighting). */
export type MoveCategory = 'light' | 'heavy' | 'special' | 'super' | 'boss';

/**
 * Attack height — determines which block stance can guard the move.
 * `high` is blocked only by a high block, `low` only by a low block, `mid` by
 * either. The height label governs blocking only; whether a hit connects at all
 * is still decided by hitbox/hurtbox geometry.
 */
export type AttackHeight = 'high' | 'mid' | 'low';

/** Button that triggers a move, matching the {@link import('../input/combat-input').CombatInput} flags. */
export type MoveInputButton = 'light' | 'heavy' | 'special' | 'super';

/** Input required to start a move. V1 moves use a single button; `direction` is reserved for future command inputs. */
export interface MoveInputCommand {
  button: MoveInputButton;
  /** Optional directional prerequisite, interpreted relative to facing. */
  direction?: InputDirection;
}

/** Frame window during which a move may cancel into another category. */
export interface CancelWindow {
  /** Inclusive start frame relative to move start. */
  frameStart: number;
  /** Inclusive end frame relative to move start. */
  frameEnd: number;
  /** Move categories this move can cancel into. */
  intoCategories: MoveCategory[];
  /** Hit states that permit the cancel. */
  timing: ('hit' | 'block' | 'whiff')[];
}

/** Presentation keys consumed by the Phaser renderers / audio controller. */
export interface MovePresentation {
  /** Animation key resolved by the fighter renderer. */
  animationKey: string;
  /** Audio key for the attack startup/swing. */
  audioKey?: string;
  /** Visual effect key for special/super emphasis. */
  effectKey?: string;
}

/** Complete definition of a single move. */
export interface MoveDefinition {
  id: MoveId;
  displayName: string;
  inputCommand: MoveInputCommand;
  category: MoveCategory;
  /** Which block stance can guard this move (governs blocking only). */
  attackHeight: AttackHeight;
  /** Frames before the first active frame. */
  startupFrames: number;
  /** Frames hitboxes are live. */
  activeFrames: number;
  /** Frames after active before returning to idle. */
  recoveryFrames: number;
  damage: number;
  /** Damage applied through a successful block. */
  chipDamage: number;
  /** Hitstun applied on a clean hit. */
  hitstunFrames: number;
  /** Blockstun applied on a blocked hit. */
  blockstunFrames: number;
  /** Hitstop freeze frames on contact. */
  hitstopFrames: number;
  /** Meter gained when the move starts. */
  meterGainOnUse: number;
  /** Meter gained when the move connects. */
  meterGainOnHit: number;
  /** Meter required and deducted when the move starts. */
  meterCost: number;
  /** Whether the move can be blocked. */
  blockable: boolean;
  /** Whether the move can be performed while airborne. */
  airborne: boolean;
  cancelWindows: CancelWindow[];
  /** Active hitboxes, in fighter-local coordinates, active during the active phase. */
  hitboxes: TimedBox[];
  /** Optional override hurtboxes during this move; falls back to fighter defaults. */
  hurtboxes?: TimedBox[];
  effects: MovePresentation;
}
