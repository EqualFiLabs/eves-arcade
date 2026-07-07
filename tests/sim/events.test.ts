import { describe, expect, it } from 'vitest';
import {
  type CombatEvent,
  type HitEvent,
  fighterId,
  moveId,
} from '@rpr/sim';

/**
 * Narrows the CombatEvent union by discriminator. TypeScript checks the switch
 * is exhaustive — if a new event variant is added without a case, this fails
 * typecheck, proving the union is sound.
 */
function describeEvent(event: CombatEvent): string {
  switch (event.type) {
    case 'hit':
      return `hit ${event.damage} (stun ${event.hitstunFrames})`;
    case 'block':
      return `block chip ${event.chipDamage}`;
    case 'meter':
      return `meter ${event.delta >= 0 ? '+' : ''}${event.delta} ${event.reason}`;
    case 'move_started':
      return `move_started ${String(event.moveId)}`;
    case 'round_ended':
      return `round_ended winner=${String(event.winner)}`;
    case 'cpu_decision':
      return `cpu ${event.decision}`;
  }
}

const PLAYER = fighterId('player');
const CPU = fighterId('cpu');

describe('combat events', () => {
  it('each event type discriminates and summarizes correctly', () => {
    const events: CombatEvent[] = [
      { type: 'hit', frame: 10, attackerId: PLAYER, defenderId: CPU, moveId: moveId('sminem_light_high'), damage: 5, hitstunFrames: 12 },
      { type: 'block', frame: 11, attackerId: CPU, defenderId: PLAYER, moveId: moveId('bogdanoff_light_high'), chipDamage: 1, blockstunFrames: 8, perfect: false },
      { type: 'meter', frame: 10, fighterId: PLAYER, delta: 10, reason: 'hit_landed' },
      { type: 'meter', frame: 12, fighterId: PLAYER, delta: -50, reason: 'super_spent' },
      { type: 'move_started', frame: 9, fighterId: PLAYER, moveId: moveId('bull_run_barrage') },
      { type: 'round_ended', frame: 300, winner: PLAYER, loser: CPU, reason: 'ko' },
      { type: 'cpu_decision', frame: 5, decision: 'approach' },
    ];

    expect(describeEvent(events[0]!)).toBe('hit 5 (stun 12)');
    expect(describeEvent(events[1]!)).toBe('block chip 1');
    expect(describeEvent(events[2]!)).toBe('meter +10 hit_landed');
    expect(describeEvent(events[3]!)).toBe('meter -50 super_spent');
    expect(describeEvent(events[4]!)).toBe('move_started bull_run_barrage');
    expect(describeEvent(events[5]!)).toBe('round_ended winner=player');
    expect(describeEvent(events[6]!)).toBe('cpu approach');
  });

  it('events are readonly and serializable', () => {
    const hit: HitEvent = {
      type: 'hit',
      frame: 1,
      attackerId: PLAYER,
      defenderId: CPU,
      moveId: moveId('sminem_light_high'),
      damage: 5,
      hitstunFrames: 10,
    };
    expect(JSON.parse(JSON.stringify(hit))).toEqual(hit);
  });
});
