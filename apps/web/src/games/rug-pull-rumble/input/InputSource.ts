import type { RawInputState } from '@rpr/sim';

/**
 * A device reader that produces a raw input snapshot each frame.
 *
 * Sources are device-specific (keyboard, gamepad) and never touch the
 * simulation directly. The {@link InputMapper} merges one or more sources and
 * reduces them to a {@link CombatInput}. This separation keeps keyboard and
 * gamepad independently testable and lets them coexist (Req 5.11).
 */
export interface InputSource {
  /** Reads the current device state into a RawInputState. */
  read(): RawInputState;

  /** True when this source is available (e.g. a gamepad is connected). */
  readonly available: boolean;
}
