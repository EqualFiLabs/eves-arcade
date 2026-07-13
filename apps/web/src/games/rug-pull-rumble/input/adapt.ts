import type { InputFrame } from '@rpr/controls';
import type { RawInputState } from '@rpr/sim';
import type { RprButton } from './buttons';

/**
 * Adapts a controls {@link InputFrame} into the sim's {@link RawInputState}.
 *
 * The {@link RprButton} set is structurally identical to the `RawInputState`
 * gameplay keys, so the adapter is a structural copy. Scene-only start/mute
 * controls are intentionally absent from the canonical simulation trace. This is
 * the single choke point where controls-package frames meet sim-package types;
 * `mapRawInput` in `@rpr/sim` stays untouched (Req 15.3, Design Decision 4).
 */
export function frameToRaw(frame: InputFrame<RprButton>): RawInputState {
  return { ...frame.buttons } as RawInputState;
}
