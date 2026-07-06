/**
 * MeterSystem — meter gain, spend, and clamping.
 *
 * Meter is built during combat (move use, landing hits, receiving hits) and spent
 * on supers. All changes clamp to [0, maxMeter] (Property 8) and emit MeterEvents
 * so the HUD and audio can react (Reqs 7.5, 7.6, 7.7, 10.3, 10.5).
 */
import type { FighterId } from '../primitives';
import type { FighterState } from '../state/fighter';
import type { CombatEvent } from './events';

/** Meter gain/charge reason, matching the `MeterEvent.reason` discriminator. */
export type MeterReason = 'attack_used' | 'hit_landed' | 'hit_received' | 'super_spent';

const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;

/** Clamps a fighter's meter to [0, maxMeter] (Property 8). */
export function clampMeter(f: FighterState): void {
  f.meter = clamp(f.meter, 0, f.maxMeter);
}

/** Adds meter, clamping at max; returns the actual amount applied (may be less than requested). */
export function gainMeter(f: FighterState, amount: number): number {
  if (amount <= 0) return 0;
  const before = f.meter;
  f.meter = clamp(f.meter + amount, 0, f.maxMeter);
  return f.meter - before;
}

/** True if the fighter can spend the requested amount (non-negative and within balance). */
export function canSpendMeter(f: FighterState, amount: number): boolean {
  return amount >= 0 && f.meter >= amount;
}

/** Deducts meter if possible; returns whether the spend succeeded. Never drops below zero. */
export function spendMeter(f: FighterState, amount: number): boolean {
  if (!canSpendMeter(f, amount)) return false;
  f.meter -= amount;
  return true;
}

/** Grants meter and emits a MeterEvent when the applied delta is non-zero. */
export function grantMeter(
  f: FighterState,
  amount: number,
  reason: MeterReason,
  frame: number,
  events: CombatEvent[],
): void {
  const delta = gainMeter(f, amount);
  if (delta !== 0) {
    events.push(meterEvent(f.id, delta, reason, frame));
  }
}

/** Spends meter for a super and emits a MeterEvent with a negative delta. */
export function chargeMeter(
  f: FighterState,
  amount: number,
  reason: MeterReason,
  frame: number,
  events: CombatEvent[],
): boolean {
  if (!spendMeter(f, amount)) return false;
  events.push(meterEvent(f.id, -amount, reason, frame));
  return true;
}

function meterEvent(fighterId: FighterId, delta: number, reason: MeterReason, frame: number) {
  return {
    type: 'meter' as const,
    frame,
    fighterId,
    delta,
    reason,
  };
}
