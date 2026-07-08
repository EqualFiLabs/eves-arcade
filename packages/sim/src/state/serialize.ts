/**
 * Deterministic game-state serialization for replay verification (Req 8.5).
 *
 * Produces a canonical string from a {@link GameState} that the server
 * re-computes independently after replaying a trace. Captures all fields that
 * determine the outcome (health, meter, positions, status, frame count) so any
 * divergence between a claimed and recomputed terminal state is detected.
 *
 * Pure TypeScript — no DOM, no async. The caller hashes the returned string
 * (e.g. via `crypto.subtle.digest`) to produce `replayHash`.
 */
import type { GameState } from '../state/game';

/**
 * Serializes a terminal GameState into a canonical JSON string.
 *
 * Field order is deterministic (alphabetical within each object) so the same
 * state always produces the same string regardless of property insertion order.
 */
export function serializeGameState(state: GameState): string {
  return JSON.stringify({
    frame: state.frame,
    seed: state.seed,
    status: state.status,
    player: serializeFighter(state.player),
    cpu: serializeFighter(state.cpu),
  });
}

function serializeFighter(f: GameState['player']): Record<string, unknown> {
  return {
    currentState: f.currentState,
    facing: f.facing,
    hasLost: f.hasLost,
    health: f.health,
    meter: f.meter,
    position: [f.position.x, f.position.y],
  };
}
