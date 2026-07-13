import { type CombatInput, type RawInputState, mapRawInput } from '@rpr/sim';
import { type InputFrame, type InputSource, mergeFrames } from '@rpr/controls';
import type { RprButton } from './buttons';
import { frameToRaw } from './adapt';

/**
 * InputMapper — aggregates one or more controls-package {@link InputSource}s
 * and reduces their merged frame into a normalized {@link CombatInput} for the
 * simulation (Req 5.1–5.8, design: InputMapper).
 *
 * Sources are OR-merged via {@link mergeFrames}: if any source (keyboard,
 * gamepad, touch) asserts a button, it wins. This keeps the keyboard fully
 * playable while a gamepad is optional (Req 5.10/5.11). The mapper is
 * device-agnostic — only the sources touch the browser.
 */
export class InputMapper {
  constructor(private readonly sources: readonly InputSource<RprButton>[]) {}

  /** Merges all sources and reduces to the simulation input for this step. */
  poll(): CombatInput {
    return mapRawInput(this.readMergedRaw());
  }

  /** Merges all sources into one simulation-only RawInputState. */
  readMergedRaw(): RawInputState {
    return frameToRaw(this.readMergedFrame());
  }

  /** Merges all sources into a single controls frame. */
  readMergedFrame(): InputFrame<RprButton> {
    return mergeFrames<RprButton>(this.sources.map((s) => s.read()));
  }
}
