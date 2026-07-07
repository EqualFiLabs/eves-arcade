import { type CombatInput, type RawInputState, mapRawInput, mergeRawInput } from '@rpr/sim';
import type { InputSource } from './InputSource';

/**
 * InputMapper — aggregates one or more {@link InputSource}s and reduces their
 * merged raw state into a normalized {@link CombatInput} for the simulation
 * (Req 5.1–5.8, design: InputMapper).
 *
 * Sources are OR-merged: if the keyboard or a gamepad asserts a flag, it wins.
 * This keeps the keyboard fully playable while a gamepad is optional (Req
 * 5.10/5.11). The mapper itself is device-agnostic; only the sources touch the
 * browser, so this class has no Phaser dependency and is trivially testable.
 */
export class InputMapper {
  constructor(private readonly sources: readonly InputSource[]) {}

  /** Merges all sources and reduces to the simulation input for this step. */
  poll(): CombatInput {
    return mapRawInput(this.readMerged());
  }

  /** Merges all sources into a single RawInputState (includes start/mute). */
  readMerged(): RawInputState {
    return mergeRawInput(this.sources.map((s) => s.read()));
  }
}
