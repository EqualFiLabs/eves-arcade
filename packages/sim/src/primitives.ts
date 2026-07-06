/**
 * Primitive simulation types shared across state, combat, content, and debug.
 *
 * Pure data — no methods, no Phaser, no DOM. Designed to be serializable so
 * GameState snapshots stay deterministic and replayable.
 */

/** A 2D vector in world or local space. */
export interface Vec2 {
  x: number;
  y: number;
}

/** An axis-aligned box in local fighter coordinates. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A box active only during a frame range. Used for per-phase hitboxes/hurtboxes.
 */
export interface TimedBox extends Box {
  /** Inclusive first frame the box is active (relative to move start). */
  frameStart: number;
  /** Inclusive last frame the box is active (relative to move start). */
  frameEnd: number;
}

/**
 * Coordinate convention (see design.md):
 * - `position.x` / `position.y` is the fighter anchor.
 * - Positive x moves right; positive y moves down.
 * - Boxes are local to the fighter anchor.
 * - Facing flips boxes horizontally.
 */

/**
 * Branded nominal ID types. A `MoveId` cannot be passed where a `FighterId` is
 * expected even though both are strings at runtime. Construct via the factories
 * below; concrete values are declared in `@rpr/content`.
 */
export type FighterId = string & { readonly __brand: 'FighterId' };
export type MoveId = string & { readonly __brand: 'MoveId' };
export type StageId = string & { readonly __brand: 'StageId' };
export type FighterDefinitionId = string & { readonly __brand: 'FighterDefinitionId' };

/** Constructs a {@link FighterId} from a raw string. */
export const fighterId = (value: string): FighterId => value as FighterId;

/** Constructs a {@link MoveId} from a raw string. */
export const moveId = (value: string): MoveId => value as MoveId;

/** Constructs a {@link StageId} from a raw string. */
export const stageId = (value: string): StageId => value as StageId;

/** Constructs a {@link FighterDefinitionId} from a raw string. */
export const fighterDefinitionId = (value: string): FighterDefinitionId =>
  value as FighterDefinitionId;
