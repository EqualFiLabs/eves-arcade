import { describe, expect, it } from 'vitest';
import {
  CombatEngine,
  NEUTRAL_INPUT,
  canSpendMeter,
  clampMeter,
  gainMeter,
  spendMeter,
  type CombatEvent,
  type CombatInput,
} from '@rpr/sim';
import {
  createV1FightState,
  sminemDefinition,
  bogdanoffDefinition,
  v1Moves,
} from '@rpr/content';

const LIGHT: CombatInput = { ...NEUTRAL_INPUT, lightHigh: true };
const SUPER: CombatInput = { ...NEUTRAL_INPUT, super: true };
const NEUTRAL: CombatInput = NEUTRAL_INPUT;

function makeEngine(): CombatEngine {
  return new CombatEngine({
    createInitialState: (s) => createV1FightState(s),
    definitions: [sminemDefinition, bogdanoffDefinition],
    moves: v1Moves,
    seed: 0,
  });
}

function placeAdjacent(engine: CombatEngine): void {
  engine.state.player.position.x = 153.6;
  engine.state.cpu.position.x = 217.6;
  engine.state.player.position.y = engine.state.stage.floorY;
  engine.state.cpu.position.y = engine.state.stage.floorY;
  engine.state.player.velocity.x = 0;
  engine.state.cpu.velocity.x = 0;
}

function runSteps(engine: CombatEngine, playerInput: CombatInput, n: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...engine.step(playerInput, NEUTRAL).events);
  return events;
}

const meterEvents = (events: CombatEvent[], reason: string) =>
  events.filter((e): e is Extract<CombatEvent, { type: 'meter' }> => e.type === 'meter' && e.reason === reason);

describe('MeterSystem primitives (7.1)', () => {
  it('gains meter up to maxMeter and no further', () => {
    const e = makeEngine();
    const f = e.state.player;
    f.meter = 99;
    expect(gainMeter(f, 10)).toBe(1); // clamps at 100
    expect(f.meter).toBe(100);
    expect(gainMeter(f, 5)).toBe(0); // already maxed
  });

  it('spends meter only when affordable and never goes negative', () => {
    const e = makeEngine();
    const f = e.state.player;
    f.meter = 30;
    expect(canSpendMeter(f, 50)).toBe(false);
    expect(spendMeter(f, 50)).toBe(false);
    expect(f.meter).toBe(30); // unchanged on failed spend
    expect(spendMeter(f, 30)).toBe(true);
    expect(f.meter).toBe(0);
    expect(spendMeter(f, 1)).toBe(false); // zero floor
  });

  it('clampMeter floors and ceilings', () => {
    const e = makeEngine();
    const f = e.state.player;
    f.meter = -5;
    clampMeter(f);
    expect(f.meter).toBe(0);
    f.meter = 999;
    clampMeter(f);
    expect(f.meter).toBe(f.maxMeter);
  });
});

describe('meter gain wired into combat (7.2)', () => {
  it('grants meter on move use (attack_used)', () => {
    const e = makeEngine();
    const events = runSteps(e, LIGHT, 1);
    expect(e.state.player.meter).toBe(2); // sminem_light_high.meterGainOnUse
    expect(meterEvents(events, 'attack_used')).toHaveLength(1);
    expect(meterEvents(events, 'attack_used')[0]!.delta).toBe(2);
  });

  it('grants attacker hit_landed and defender hit_received on a clean hit', () => {
    const e = makeEngine();
    placeAdjacent(e);
    const events = runSteps(e, LIGHT, 12); // light connects on frame 5
    // Player: +2 (use) +5 (hit_landed) = 7
    expect(e.state.player.meter).toBe(7);
    // CPU gains hit_received meter.
    expect(e.state.cpu.meter).toBe(4);
    expect(meterEvents(events, 'hit_landed')).toHaveLength(1);
    expect(meterEvents(events, 'hit_received')).toHaveLength(1);
  });
});

describe('super meter gating and spend (7.3, 7.4)', () => {
  it('denies the super when meter is insufficient', () => {
    const e = makeEngine();
    e.state.player.meter = 20; // < 50 cost
    const events = runSteps(e, SUPER, 1);
    expect(e.state.player.currentMove).toBeNull(); // never started
    expect(e.state.player.meter).toBe(20); // unchanged
    expect(events.find((ev) => ev.type === 'move_started')).toBeUndefined();
  });

  it('starts the super, deducts the cost once, and emits super_spent', () => {
    const e = makeEngine();
    e.state.player.meter = 50;
    const events = runSteps(e, SUPER, 1);
    expect(e.state.player.currentMove).not.toBeNull();
    expect(String(e.state.player.currentMove!.moveId)).toBe('bull_run_barrage');
    expect(e.state.player.currentMove!.spentMeter).toBe(true);
    expect(e.state.player.meter).toBe(0); // 50 - 50 cost
    const spent = meterEvents(events, 'super_spent');
    expect(spent).toHaveLength(1);
    expect(spent[0]!.delta).toBe(-50);
  });

  it('does not deduct meter again while the super continues', () => {
    const e = makeEngine();
    e.state.player.meter = 50;
    runSteps(e, SUPER, 1); // start + spend once
    const meterAfterStart = e.state.player.meter;
    runSteps(e, NEUTRAL, 5); // super still in progress
    expect(e.state.player.meter).toBe(meterAfterStart); // no second deduction
  });
});

describe('meter UI state (10.3, 10.5)', () => {
  it('meter values stay within [0, maxMeter] after sustained combat', () => {
    const e = makeEngine();
    placeAdjacent(e);
    for (let i = 0; i < 200; i++) e.step(LIGHT, NEUTRAL);
    for (const f of [e.state.player, e.state.cpu]) {
      expect(f.meter).toBeGreaterThanOrEqual(0);
      expect(f.meter).toBeLessThanOrEqual(f.maxMeter);
    }
  });
});
