/**
 * Deterministic combat simulation package.
 *
 * Pure TypeScript. This package MUST NOT import Phaser or any DOM APIs — the
 * `packages/sim` tsconfig omits the DOM lib so such usage fails typecheck.
 * Fighter movement, collision, and timing advance at the fixed step defined in
 * {@link ./constants.ts}.
 *
 * Public surface is re-exported here; import from `@rpr/sim`.
 */

export * from './constants';
export * from './primitives';
export * from './input/combat-input';
export * from './state/fighter';
export * from './state/game';
export * from './state/factory';
export * from './combat/events';
export * from './combat/movement';
export * from './combat/box-transform';
export * from './combat/collision-system';
export * from './combat/move-resolver';
export * from './combat/hit-resolution';
export * from './combat/round-resolver';
export * from './combat/combat-engine';
export * from './data/move-definition';
export * from './data/fighter-definition';
export * from './data/stage-definition';
export * from './debug/debug-snapshot';
