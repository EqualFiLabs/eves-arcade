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

/** Meter granted to the defender when it takes a clean hit (tunable, Req 7.7). */
export const METER_GAIN_ON_HIT_RECEIVED = 4;

/**
 * Window after the block button is first pressed during which an incoming hit
 * is "perfect-blocked": no chip damage + meter reward (tunable). Tighter than
 * typical attack startup so it rewards a deliberate read rather than spam.
 */
export const PERFECT_BLOCK_WINDOW = 6;

/** Meter granted to the defender on a perfect block (tunable). */
export const METER_GAIN_ON_PERFECT_BLOCK = 8;

/**
 * Anchor-to-anchor distance (world units) at which the CPU treats the opponent
 * as "close" and may attack/block/retreat (Req 9.3). Tunable.
 */
export const CPU_CLOSE_RANGE = 96;

/**
 * Distance at which the CPU may use a ranged/advancing action such as a special
 * (Req 9.2). Between close and this range the CPU preferentially approaches.
 * Tunable.
 */
export const CPU_SPECIAL_RANGE = 150;

/**
 * Consecutive frames the player must block before the CPU treats it as passive
 * blocking and applies pressure (Req 9.4). Tunable.
 */
export const CPU_PASSIVE_BLOCK_FRAMES = 45;
