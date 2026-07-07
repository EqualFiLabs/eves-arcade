/**
 * Hit and block resolution.
 *
 * Consumes {@link HitContact}s and applies damage, stun, hitstop, and events
 * (Reqs 6.1, 6.2, 6.3, 6.5). Blockable attacks met by a valid block stance
 * produce a block result with chip damage + blockstun instead of a clean hit.
 */
import type { MoveDefinition } from '../data/move-definition';
import type { MoveId } from '../primitives';
import type { FighterState } from '../state/fighter';
import type { GameState } from '../state/game';
import type { CombatEvent } from './events';
import type { HitContact } from './collision-system';
import { METER_GAIN_ON_HIT_RECEIVED, METER_GAIN_ON_PERFECT_BLOCK, PERFECT_BLOCK_WINDOW } from '../constants';
import { grantMeter } from './meter-system';

const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;

/** Clamps a fighter's health to [0, maxHealth] (Req 6.7/8.6/10.1/10.2). */
export function clampHealth(f: FighterState): void {
  f.health = clamp(f.health, 0, f.maxHealth);
}

function fighterById(state: GameState, id: GameState['player']['id']): FighterState | undefined {
  if (state.player.id === id) return state.player;
  if (state.cpu.id === id) return state.cpu;
  return undefined;
}

/**
 * A defender blocks when holding a valid grounded block stance. A block pressed
 * within {@link PERFECT_BLOCK_WINDOW} frames of impact is a "perfect" block —
 * no chip and a meter reward — so a well-timed tap beats a lazy held guard.
 */
function isBlocking(defender: FighterState): boolean {
  return defender.currentState === 'block';
}

/** True when the defender's block was pressed recently enough to perfect-block. */
const isPerfectBlock = (defender: FighterState): boolean =>
  defender.blockHeldFrames >= 1 && defender.blockHeldFrames <= PERFECT_BLOCK_WINDOW;

function applyHitstop(a: FighterState, b: FighterState, frames: number): void {
  a.hitstopFramesRemaining = Math.max(a.hitstopFramesRemaining, frames);
  b.hitstopFramesRemaining = Math.max(b.hitstopFramesRemaining, frames);
}

/**
 * Resolves a single hit contact into either a block or a clean hit, recording the
 * defender on the attacker's move (one-hit-per-move) and emitting the event.
 */
export function resolveHitContact(
  state: GameState,
  contact: HitContact,
  moves: ReadonlyMap<MoveId, MoveDefinition>,
  events: CombatEvent[],
): void {
  const attacker = fighterById(state, contact.attackerId);
  const defender = fighterById(state, contact.defenderId);
  const moveDef = moves.get(contact.moveId);
  if (!attacker || !defender || !moveDef) return;

  // Mark the target so subsequent active frames of this move do not re-hit.
  if (attacker.currentMove) {
    attacker.currentMove.hitTargets.push(defender.id);
  }

  const blocked = moveDef.blockable && isBlocking(defender);

  if (blocked) {
    const perfect = isPerfectBlock(defender);
    // Perfect block: no chip. Normal block: full chip.
    const chip = perfect ? 0 : moveDef.chipDamage;
    defender.health = clamp(defender.health - chip, 0, defender.maxHealth);
    defender.currentState = 'blockstun';
    defender.blockstunFramesRemaining = moveDef.blockstunFrames;
    defender.runtimeFlags.blocking = false;
    applyHitstop(attacker, defender, moveDef.hitstopFrames);
    // A perfectly timed read builds meter (reward) — the read is the point.
    if (perfect) {
      grantMeter(defender, METER_GAIN_ON_PERFECT_BLOCK, 'hit_received', state.frame, events);
    }
    events.push({
      type: 'block',
      frame: state.frame,
      attackerId: attacker.id,
      defenderId: defender.id,
      moveId: moveDef.id,
      chipDamage: chip,
      blockstunFrames: moveDef.blockstunFrames,
      perfect,
    });
    return;
  }

  defender.health = clamp(defender.health - moveDef.damage, 0, defender.maxHealth);
  defender.currentState = 'hitstun';
  defender.stunFramesRemaining = moveDef.hitstunFrames;
  defender.runtimeFlags.blocking = false;
  applyHitstop(attacker, defender, moveDef.hitstopFrames);
  // Meter: attacker gains on the connect, defender gains for taking the hit (Req 7.7).
  grantMeter(attacker, moveDef.meterGainOnHit, 'hit_landed', state.frame, events);
  grantMeter(defender, METER_GAIN_ON_HIT_RECEIVED, 'hit_received', state.frame, events);
  events.push({
    type: 'hit',
    frame: state.frame,
    attackerId: attacker.id,
    defenderId: defender.id,
    moveId: moveDef.id,
    damage: moveDef.damage,
    hitstunFrames: moveDef.hitstunFrames,
  });
}
