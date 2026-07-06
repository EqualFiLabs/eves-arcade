/**
 * MoveResolver — starts moves from legal input and advances their phase timeline
 * (startup → active → recovery → complete).
 */
import type { MoveDefinition } from '../data/move-definition';
import type { MoveId } from '../primitives';
import type { FighterState } from '../state/fighter';
import type { MoveRuntimeState } from '../state/fighter';
import { canControl } from './movement';

export interface MoveAdvanceResult {
  completed: boolean;
}

/**
 * Whether a fighter may begin a move right now. Requires controllability, no
 * move in progress, and sufficient meter for meter-gated moves (Property 4, Req 6.4).
 */
export function canStartMove(
  f: FighterState,
  moveId: MoveId,
  moves: ReadonlyMap<MoveId, MoveDefinition>,
): boolean {
  if (!canControl(f)) return false;
  if (f.currentMove) return false;
  const def = moves.get(moveId);
  if (!def) return false;
  if (def.meterCost > f.meter) return false;
  return true;
}

/** Begins a move: creates runtime state, enters the attack state, halts horizontal motion. Returns the runtime state. */
export function startMove(
  f: FighterState,
  moveId: MoveId,
  moves: ReadonlyMap<MoveId, MoveDefinition>,
): MoveRuntimeState | undefined {
  const def = moves.get(moveId);
  if (!def) return undefined;
  const runtime: MoveRuntimeState = {
    moveId,
    elapsedFrames: 0,
    phase: 'startup',
    hitTargets: [],
    spentMeter: false,
  };
  f.currentMove = runtime;
  f.currentState = 'attack';
  f.velocity.x = 0;
  return runtime;
}

/** Advances one frame of a move's timeline; clears it (and returns to idle) on completion. */
export function advanceMove(
  f: FighterState,
  moves: ReadonlyMap<MoveId, MoveDefinition>,
): MoveAdvanceResult {
  const move = f.currentMove;
  if (!move) return { completed: false };

  const def = moves.get(move.moveId);
  if (!def) {
    f.currentMove = null;
    if (f.currentState === 'attack') f.currentState = 'idle';
    return { completed: true };
  }

  move.elapsedFrames += 1;
  const e = move.elapsedFrames;
  const activeStart = def.startupFrames;
  const activeEnd = def.startupFrames + def.activeFrames;
  const total = activeEnd + def.recoveryFrames;

  if (e >= total) {
    move.phase = 'complete';
    f.currentMove = null;
    if (f.currentState === 'attack') f.currentState = 'idle';
    f.velocity.x = 0;
    return { completed: true };
  }
  if (e >= activeEnd) move.phase = 'recovery';
  else if (e >= activeStart) move.phase = 'active';
  else move.phase = 'startup';
  return { completed: false };
}
