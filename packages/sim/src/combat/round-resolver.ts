/**
 * RoundResolver — detects KO, decides the round, and stops further combat input
 * by transitioning the round status (Reqs 3.4, 3.5, 6.9, 8.7, 8.8, 10.7).
 */
import type { CombatEvent } from './events';
import type { RoundEndResult } from '../state/game';
import type { GameState } from '../state/game';

/**
 * Returns a round-end result if a fighter's health has hit zero, else null.
 * The first KO detected wins; simultaneous zero-health is resolved in favor of
 * the CPU losing only if the player struck last — here the player wins ties so a
 * double-KO edges toward a player win (V1 simplicity).
 */
export function checkRoundEnd(state: GameState): RoundEndResult | null {
  const playerDown = state.player.health <= 0 && !state.player.hasLost;
  const cpuDown = state.cpu.health <= 0 && !state.cpu.hasLost;

  if (playerDown && cpuDown) {
    return {
      winner: state.player.id,
      loser: state.cpu.id,
      reason: 'ko',
      finalFrame: state.frame,
    };
  }
  if (cpuDown) {
    return { winner: state.player.id, loser: state.cpu.id, reason: 'ko', finalFrame: state.frame };
  }
  if (playerDown) {
    return { winner: state.cpu.id, loser: state.player.id, reason: 'ko', finalFrame: state.frame };
  }
  return null;
}

/** Applies the round-end result: flags the loser, sets status, emits the round-ended event. */
export function applyRoundEnd(
  state: GameState,
  result: RoundEndResult,
  events: CombatEvent[],
): void {
  const loser = state.player.id === result.loser ? state.player : state.cpu;
  loser.hasLost = true;
  loser.currentState = 'ko';
  loser.health = 0;
  loser.velocity.x = 0;
  state.status = loser.side === 'player' ? 'cpu_win' : 'player_win';
  events.push({
    type: 'round_ended',
    frame: state.frame,
    winner: result.winner,
    loser: result.loser,
    reason: 'ko',
  });
}
