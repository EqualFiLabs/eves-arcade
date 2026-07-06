/**
 * Round and match-level game state.
 */
import type { Box, FighterId, StageId } from '../primitives';
import type { CombatEvent } from '../combat/events';
import type { FighterState } from './fighter';

/** Round lifecycle status. */
export type RoundStatus = 'intro' | 'active' | 'player_win' | 'cpu_win' | 'paused';

/**
 * Sim-relevant stage runtime state. Presentation-only stage data (camera
 * config, background assets, audio) lives in `@rpr/content` / apps/web.
 */
export interface StageRuntimeState {
  stageId: StageId;
  /** World-space play area bounds. */
  worldBounds: Box;
  /** Anchor Y of the floor; fighters clamp their anchor here when grounded. */
  floorY: number;
}

/** Complete simulation state for a single step. */
export interface GameState {
  /** Monotonic frame counter, advanced once per fixed step. */
  frame: number;
  /** Deterministic seed used by the CPU brain and any sim-side RNG. */
  seed: number;
  status: RoundStatus;
  player: FighterState;
  cpu: FighterState;
  stage: StageRuntimeState;
  /** Events emitted during the most recent step. */
  lastEvents: CombatEvent[];
}

/** Outcome of a finished round, produced by the `RoundResolver`. */
export interface RoundEndResult {
  winner: FighterId;
  loser: FighterId;
  reason: 'ko';
  /** Frame at which the round was decided. */
  finalFrame: number;
}
