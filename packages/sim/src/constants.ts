/** Fixed simulation framerate. Render rate may vary; the sim always steps at 60 Hz. */
export const SIM_FPS = 60;

/** Wall-clock milliseconds per simulation step, derived from {@link SIM_FPS}. */
export const SIM_STEP_MS: number = 1000 / SIM_FPS;

/**
 * Maximum number of fixed steps processed in a single render frame.
 * Caps the accumulator after a tab stall to avoid a spiral-of-death (Req 15.4).
 */
export const MAX_STEPS_PER_FRAME = 5;

/** Simulation package version. */
export const SIM_VERSION = '0.0.0';
