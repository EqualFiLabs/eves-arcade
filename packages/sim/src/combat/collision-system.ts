/**
 * Collision system.
 *
 * `resolvePushboxes` prevents invalid fighter overlap (Req 6.6).
 * `findHitContacts` detects active hitboxes overlapping defender hurtboxes (Req 6.1/6.2).
 */
import type { FighterDefinition } from '../data/fighter-definition';
import type { FighterDefinitionId } from '../primitives';
import type { FighterId } from '../primitives';
import type { MoveDefinition } from '../data/move-definition';
import type { MoveId } from '../primitives';
import type { Box } from '../primitives';
import type { FighterState } from '../state/fighter';
import type { GameState } from '../state/game';
import { boxesOverlap, currentHurtboxes, toWorldBox } from './box-transform';

interface PositionRange {
  lo: number;
  hi: number;
}

/** The allowed position.x range keeping a fighter's pushbox inside the world bounds. */
function pushboxPositionRange(pushbox: Box, worldBounds: Box): PositionRange {
  return {
    lo: worldBounds.x - pushbox.x,
    hi: worldBounds.x + worldBounds.width - pushbox.x - pushbox.width,
  };
}

/**
 * Resolves horizontal pushbox overlap between the two fighters, respecting world
 * bounds. The overlap is split evenly when both fighters have room; if one is
 * against a wall (no room to yield) the other absorbs the remainder, so fighters
 * can never be pushed out of bounds or through each other.
 */
export function resolvePushboxes(
  state: GameState,
  definitions: ReadonlyMap<FighterDefinitionId, FighterDefinition>,
): void {
  const p = state.player;
  const c = state.cpu;
  const pDef = definitions.get(p.definitionId);
  const cDef = definitions.get(c.definitionId);
  if (!pDef || !cDef) return;

  const wb = state.stage.worldBounds;
  const pRange = pushboxPositionRange(pDef.pushbox, wb);
  const cRange = pushboxPositionRange(cDef.pushbox, wb);

  const pMin = p.position.x + pDef.pushbox.x;
  const pMax = pMin + pDef.pushbox.width;
  const cMin = c.position.x + cDef.pushbox.x;
  const cMax = cMin + cDef.pushbox.width;
  const overlap = Math.min(pMax, cMax) - Math.max(pMin, cMin);
  if (overlap <= 0) return;

  const playerLeft = p.position.x <= c.position.x;
  const pDir: -1 | 1 = playerLeft ? -1 : 1;
  const cDir: -1 | 1 = playerLeft ? 1 : -1;

  const pBudget = pDir < 0 ? p.position.x - pRange.lo : pRange.hi - p.position.x;
  const cBudget = cDir < 0 ? c.position.x - cRange.lo : cRange.hi - c.position.x;

  let pShift = Math.min(overlap / 2, Math.max(pBudget, 0));
  let cShift = Math.min(overlap / 2, Math.max(cBudget, 0));

  // Hand any unresolved remainder (e.g. a wall-bound opponent) to whoever still has room.
  let remaining = overlap - (pShift + cShift);
  if (remaining > 0) {
    const pExtra = Math.min(remaining, Math.max(pBudget - pShift, 0));
    pShift += pExtra;
    remaining -= pExtra;
    const cExtra = Math.min(remaining, Math.max(cBudget - cShift, 0));
    cShift += cExtra;
  }

  p.position.x += pDir * pShift;
  c.position.x += cDir * cShift;
}

/** A detected overlap between an attacker's active hitbox and a defender's hurtbox. */
export interface HitContact {
  attackerId: FighterId;
  defenderId: FighterId;
  moveId: MoveId;
}

/**
 * Finds hit contacts for the current frame: for each attacker with a live move,
 * any active hitbox (per its TimedBox frame range) overlapping the defender's
 * current hurtbox set yields a contact. Already-hit targets are skipped, which
 * enforces one-hit-per-move (Property 5) until the resolver marks the target.
 */
export function findHitContacts(
  state: GameState,
  moves: ReadonlyMap<MoveId, MoveDefinition>,
  definitions: ReadonlyMap<FighterDefinitionId, FighterDefinition>,
): HitContact[] {
  const contacts: HitContact[] = [];
  const pairs: ReadonlyArray<readonly [FighterState, FighterState]> = [
    [state.player, state.cpu],
    [state.cpu, state.player],
  ];

  for (const [attacker, defender] of pairs) {
    const move = attacker.currentMove;
    if (!move) continue;
    // One-hit-per-move: skip defenders already struck by this execution.
    if (move.hitTargets.includes(defender.id)) continue;

    const def = moves.get(move.moveId);
    if (!def) continue;

    const e = move.elapsedFrames;
    const liveHitboxes = def.hitboxes.filter((b) => e >= b.frameStart && e <= b.frameEnd);
    if (liveHitboxes.length === 0) continue;

    const defenderDef = definitions.get(defender.definitionId);
    if (!defenderDef) continue;
    const hurtboxes = currentHurtboxes(defender, defenderDef);

    let connected = false;
    for (const hb of liveHitboxes) {
      const worldHit = toWorldBox(hb, attacker.position, attacker.facing);
      for (const hurt of hurtboxes) {
        const worldHurt = toWorldBox(hurt, defender.position, defender.facing);
        if (boxesOverlap(worldHit, worldHurt)) {
          connected = true;
          break;
        }
      }
      if (connected) break;
    }

    if (connected) {
      contacts.push({ attackerId: attacker.id, defenderId: defender.id, moveId: def.id });
    }
  }

  return contacts;
}
