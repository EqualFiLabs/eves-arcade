/**
 * Debug snapshot of combat state.
 *
 * A frozen, serializable view consumed by the DebugRenderer (Task 19) and the
 * engine's getDebugSnapshot(). Task 19 extends it with hitbox/hurtbox/pushbox
 * geometry and CPU decision data.
 */
import type { Vec2 } from '../primitives';
import type { FighterActionState } from '../state/fighter';
import type { FacingDirection } from '../state/fighter';
import type { FighterRuntimeFlags } from '../state/fighter';
import type { FighterSide } from '../state/fighter';
import type { MoveRuntimeState } from '../state/fighter';
import type { FighterDefinitionId } from '../primitives';
import type { FighterId } from '../primitives';
import type { RoundStatus } from '../state/game';

export interface FighterDebugSnapshot {
  id: FighterId;
  definitionId: FighterDefinitionId;
  side: FighterSide;
  state: FighterActionState;
  facing: FacingDirection;
  grounded: boolean;
  position: Vec2;
  velocity: Vec2;
  health: number;
  meter: number;
  stunFramesRemaining: number;
  blockstunFramesRemaining: number;
  hitstopFramesRemaining: number;
  currentMove: MoveRuntimeState | null;
  runtimeFlags: FighterRuntimeFlags;
}

export interface CombatDebugSnapshot {
  frame: number;
  status: RoundStatus;
  player: FighterDebugSnapshot;
  cpu: FighterDebugSnapshot;
}
