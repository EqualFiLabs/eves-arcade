/**
 * Fighter-local → world-space box transforms and overlap tests.
 *
 * Boxes are authored in fighter-local coordinates with the anchor at the feet
 * center (+x forward, +y down). Facing left mirrors the x axis.
 */
import type { Box } from '../primitives';
import type { Vec2 } from '../primitives';
import type { FacingDirection } from '../state/fighter';
import type { FighterDefinition } from '../data/fighter-definition';
import type { FighterState } from '../state/fighter';

/** Converts a fighter-local box to world space, mirroring horizontally when facing left. */
export function toWorldBox(box: Box, anchor: Vec2, facing: FacingDirection): Box {
  const x = facing === 'right' ? anchor.x + box.x : anchor.x - box.x - box.width;
  return { x, y: anchor.y + box.y, width: box.width, height: box.height };
}

/** Axis-aligned bounding-box overlap test. */
export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** The defender's active hurtbox set based on its current pose. */
export function currentHurtboxes(
  fighter: FighterState,
  def: FighterDefinition,
): readonly Box[] {
  if (fighter.currentState === 'crouch') return def.defaultHurtboxes.crouch;
  if (!fighter.grounded) return def.defaultHurtboxes.airborne;
  return def.defaultHurtboxes.stand;
}
