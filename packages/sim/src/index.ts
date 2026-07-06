/**
 * Deterministic combat simulation package.
 *
 * Pure TypeScript. This package MUST NOT import Phaser or any DOM APIs.
 * Fighter movement, collision, and timing advance at the fixed step below.
 */

/** Fixed simulation framerate. Render rate may vary; the sim always steps at 60 Hz. */
export const SIM_FPS = 60 as const;

/** Wall-clock milliseconds per simulation step, derived from {@link SIM_FPS}. */
export const SIM_STEP_MS: number = 1000 / SIM_FPS;

/** Maximum number of fixed steps processed in a single render frame after a stall. */
export const MAX_STEPS_PER_FRAME = 5 as const;

/** Simulation package version. */
export const SIM_VERSION = '0.0.0';
