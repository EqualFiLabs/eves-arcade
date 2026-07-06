import { describe, expect, it } from 'vitest';
import { CombatEngine, NEUTRAL_INPUT, type CombatEvent, type CombatInput } from '@rpr/sim';
import {
  createV1FightState,
  sminemDefinition,
  bogdanoffDefinition,
  v1Moves,
} from '@rpr/content';

/**
 * Task 8 checkpoint: a fully headless fight stepped from initialization to KO
 * with scripted inputs — no Phaser, no DOM. Exercises approach (movement),
 * repeated attacks (meter build), a meter-gated super, and KO resolution.
 */

const RIGHT: CombatInput = { ...NEUTRAL_INPUT, horizontal: 1 };
const HEAVY: CombatInput = { ...NEUTRAL_INPUT, heavy: true };
const SUPER: CombatInput = { ...NEUTRAL_INPUT, super: true };

function makeEngine(): CombatEngine {
  return new CombatEngine({
    createInitialState: (s) => createV1FightState(s),
    definitions: [sminemDefinition, bogdanoffDefinition],
    moves: v1Moves,
    seed: 0,
  });
}

/** Walk the player toward the CPU until pushboxes touch. */
function approach(engine: CombatEngine): void {
  for (let i = 0; i < 400; i++) {
    if (engine.state.status !== 'active') break;
    engine.step(RIGHT, NEUTRAL_INPUT);
    if (Math.abs(engine.state.player.position.x - engine.state.cpu.position.x) <= 65) break;
  }
}

/**
 * Performs one attack: starts the move, then steps neutrally until the player's
 * move completes (or the round ends). Returns the events emitted.
 */
function performAttack(engine: CombatEngine, input: CombatInput): CombatEvent[] {
  const events: CombatEvent[] = [];
  if (engine.state.status !== 'active') return events;
  events.push(...engine.step(input, NEUTRAL_INPUT).events);
  for (let i = 0; i < 60; i++) {
    if (engine.state.status !== 'active') break;
    events.push(...engine.step(NEUTRAL_INPUT, NEUTRAL_INPUT).events);
    if (!engine.state.player.currentMove && engine.state.player.currentState === 'idle') break;
  }
  return events;
}

describe('headless full fight: initialization → KO (Task 8)', () => {
  it('Sminem KOs Bogdanoff using scripted inputs, including a meter-gated super', () => {
    const engine = makeEngine();
    expect(engine.state.frame).toBe(0);
    expect(engine.state.status).toBe('active');

    approach(engine);
    expect(Math.abs(engine.state.player.position.x - engine.state.cpu.position.x)).toBeLessThanOrEqual(65);

    const allEvents: CombatEvent[] = [];
    let superFired = false;
    let koEvent: CombatEvent | undefined;

    for (let n = 0; n < 200 && !koEvent; n++) {
      const input = !superFired && engine.state.player.meter >= 50 ? SUPER : HEAVY;
      if (input === SUPER) superFired = true;
      const events = performAttack(engine, input);
      allEvents.push(...events);
      koEvent = events.find((e) => e.type === 'round_ended');
    }

    // The fight reached KO with a player win.
    expect(koEvent).toBeTruthy();
    expect(engine.state.status).toBe('player_win');
    expect(engine.state.cpu.hasLost).toBe(true);
    expect(engine.state.cpu.currentState).toBe('ko');
    expect(engine.state.cpu.health).toBe(0);

    // A super was gated by meter, fired, and paid for during the fight.
    expect(superFired).toBe(true);
    expect(allEvents.some((e) => e.type === 'meter' && e.reason === 'super_spent')).toBe(true);

    // Meter stayed within bounds for the entire fight (Property 8).
    for (const f of [engine.state.player, engine.state.cpu]) {
      expect(f.meter).toBeGreaterThanOrEqual(0);
      expect(f.meter).toBeLessThanOrEqual(f.maxMeter);
    }

    // Health stayed clamped; player was never KO'd.
    expect(engine.state.player.health).toBeGreaterThan(0);
    expect(engine.state.player.hasLost).toBe(false);
  });

  it('a fresh engine can be reset and fought again deterministically', () => {
    const engine = makeEngine();
    approach(engine);
    for (let i = 0; i < 10; i++) performAttack(engine, HEAVY);
    expect(engine.state.frame).toBeGreaterThan(0);

    engine.reset(0);
    expect(engine.state.frame).toBe(0);
    expect(engine.state.status).toBe('active');
    expect(engine.state.cpu.health).toBe(engine.state.cpu.maxHealth);
    expect(engine.state.player.meter).toBe(0);
  });
});
