/**
 * Combat events emitted by the simulation each step.
 *
 * Presentation (Phaser renderers + audio) consumes these to drive FX and sound
 * without ever mutating combat state (Property 10).
 */
import type { FighterId, MoveId } from '../primitives';

/** A move's active hitbox connected with a defender's hurtbox. */
export interface HitEvent {
  readonly type: 'hit';
  readonly frame: number;
  readonly attackerId: FighterId;
  readonly defenderId: FighterId;
  readonly moveId: MoveId;
  readonly damage: number;
  readonly hitstunFrames: number;
}

/** A blockable attack was blocked by a defending fighter. */
export interface BlockEvent {
  readonly type: 'block';
  readonly frame: number;
  readonly attackerId: FighterId;
  readonly defenderId: FighterId;
  readonly moveId: MoveId;
  readonly chipDamage: number;
  readonly blockstunFrames: number;
  /** True if the block was timed within the perfect-block window (no chip + meter reward). */
  readonly perfect: boolean;
}

/** Meter was gained or spent. */
export interface MeterEvent {
  readonly type: 'meter';
  readonly frame: number;
  readonly fighterId: FighterId;
  /** Signed meter delta (positive = gain, negative = spend). */
  readonly delta: number;
  readonly reason: 'attack_used' | 'hit_landed' | 'hit_received' | 'super_spent';
}

/** A fighter began executing a move. */
export interface MoveStartedEvent {
  readonly type: 'move_started';
  readonly frame: number;
  readonly fighterId: FighterId;
  readonly moveId: MoveId;
}

/** The round ended (KO). */
export interface RoundEndedEvent {
  readonly type: 'round_ended';
  readonly frame: number;
  readonly winner: FighterId;
  readonly loser: FighterId;
  readonly reason: 'ko';
}

/** A CPU decision was made this step (debug + replay visibility). */
export interface CpuDecisionEvent {
  readonly type: 'cpu_decision';
  readonly frame: number;
  /** Human-readable decision label from the CPU brain. */
  readonly decision: string;
}

/** Discriminated union of all combat events emitted in a step. */
export type CombatEvent =
  | HitEvent
  | BlockEvent
  | MeterEvent
  | MoveStartedEvent
  | RoundEndedEvent
  | CpuDecisionEvent;
