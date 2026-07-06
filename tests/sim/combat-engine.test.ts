import { describe, expect, it } from 'vitest';
import { CombatEngine, NEUTRAL_INPUT, type CombatEvent } from '@rpr/sim';
import { createV1FightState, sminemDefinition, bogdanoffDefinition } from '@rpr/content';

function makeEngine(seed = 0): CombatEngine {
  return new CombatEngine({
    createInitialState: (s) => createV1FightState(s),
    definitions: [sminemDefinition, bogdanoffDefinition],
    seed,
  });
}

describe('CombatEngine API (5.1)', () => {
  it('step() returns state, events, and a debug snapshot', () => {
    const e = makeEngine();
    const result = e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    expect(result.state).toBe(e.state);
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.debug.frame).toBe(1);
    expect(result.debug.status).toBe('active');
    expect(result.debug.player.state).toBe('idle');
  });

  it('advances the frame counter once per step', () => {
    const e = makeEngine();
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    expect(e.state.frame).toBe(2);
  });

  it('emits no events during pure movement (events arrive in Task 6)', () => {
    const e = makeEngine();
    const result = e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    const empty: CombatEvent[] = [];
    expect(result.events).toEqual(empty);
    expect(e.state.lastEvents).toEqual(empty);
  });

  it('accepts no combat input once the round is decided (Req 6.9)', () => {
    const e = makeEngine();
    e.state.status = 'player_win';
    const x0 = e.state.player.position.x;
    const frameBefore = e.state.frame;
    e.step({ ...NEUTRAL_INPUT, horizontal: 1 }, NEUTRAL_INPUT);
    expect(e.state.player.position.x).toBe(x0); // no movement
    expect(e.state.frame).toBe(frameBefore); // frame frozen after round end
  });

  it('reset() rebuilds the fight from a seed', () => {
    const e = makeEngine();
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    expect(e.state.frame).toBe(2);
    e.reset(7);
    expect(e.state.frame).toBe(0);
    expect(e.state.seed).toBe(7);
  });

  it('getDebugSnapshot() returns an independent copy', () => {
    const e = makeEngine();
    const snap = e.getDebugSnapshot();
    snap.frame = 999;
    expect(e.state.frame).toBe(0);
    // Mutating snapshot position must not move the fighter.
    snap.player.position.x = -1234;
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    expect(e.state.player.position.x).not.toBe(-1234);
  });

  it('throws if a fighter definition is missing', () => {
    const e = new CombatEngine({
      createInitialState: (s) => createV1FightState(s),
      definitions: [], // no definitions supplied
      seed: 0,
    });
    expect(() => e.step(NEUTRAL_INPUT, NEUTRAL_INPUT)).toThrow(/missing definition/);
  });
});
