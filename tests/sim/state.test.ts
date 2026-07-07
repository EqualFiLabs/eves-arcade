import { describe, expect, it } from 'vitest';
import {
  type FighterState,
  type GameState,
  type RoundEndResult,
  fighterDefinitionId,
  fighterId,
  moveId,
  stageId,
} from '@rpr/sim';

function makeFighter(side: 'player' | 'cpu'): FighterState {
  return {
    id: fighterId(side),
    definitionId: fighterDefinitionId(side === 'player' ? 'sminem' : 'bogdanoff'),
    side,
    health: 100,
    maxHealth: 100,
    meter: 0,
    maxMeter: 100,
    position: { x: side === 'player' ? -200 : 200, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: side === 'player' ? 'right' : 'left',
    grounded: true,
    blockHeldFrames: 0,
    airJumpsUsed: 0,
    airJumpReady: false,
    currentState: 'idle',
    currentMove: null,
    inputBuffer: [],
    stunFramesRemaining: 0,
    blockstunFramesRemaining: 0,
    hitstopFramesRemaining: 0,
    hasLost: false,
    runtimeFlags: { blocking: false },
  };
}

describe('game state model', () => {
  it('constructs a complete, internally consistent initial state', () => {
    const state: GameState = {
      frame: 0,
      seed: 12345,
      status: 'intro',
      player: makeFighter('player'),
      cpu: makeFighter('cpu'),
      stage: {
        stageId: stageId('marketControlRoom'),
        worldBounds: { x: -640, y: 0, width: 1280, height: 720 },
        floorY: 600,
      },
      lastEvents: [],
    };

    expect(state.status).toBe('intro');
    expect(state.player.facing).toBe('right');
    expect(state.cpu.facing).toBe('left');
    expect(state.player.health).toBe(state.player.maxHealth);
    expect(state.player.meter).toBeLessThanOrEqual(state.player.maxMeter);
    expect(state.lastEvents).toHaveLength(0);
  });

  it('models an executing move with one-hit-per-move tracking', () => {
    const fighter = makeFighter('player');
    fighter.currentMove = {
      moveId: moveId('sminem_heavy_high'),
      elapsedFrames: 6,
      phase: 'active',
      hitTargets: [fighterId('cpu')],
      spentMeter: false,
    };

    expect(fighter.currentMove.phase).toBe('active');
    // A second hit on the same target must be suppressed by the resolver.
    expect(fighter.currentMove.hitTargets).toContain(fighterId('cpu'));
  });

  it('round end result identifies winner and loser at a frame', () => {
    const result: RoundEndResult = {
      winner: fighterId('player'),
      loser: fighterId('cpu'),
      reason: 'ko',
      finalFrame: 312,
    };

    expect(result.reason).toBe('ko');
    expect(result.winner).not.toBe(result.loser);
    expect(result.finalFrame).toBeGreaterThan(0);
  });
});
