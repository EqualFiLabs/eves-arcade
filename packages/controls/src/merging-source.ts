import type { InputFrame, InputSource } from './frame';
import { mergeFrames } from './frame';

/**
 * Merges multiple {@link InputSource}s into one, producing a single frame per
 * `read()` call. Buttons are OR-merged; axes take max magnitude (via
 * {@link mergeFrames}). Lets a game combine keyboard + gamepad + touch into one
 * traceable source — the {@link TraceRecorder} wraps this to capture the
 * canonical merged input at the single choke point (Req 8.3).
 */
export class MergingSource<B extends string, X extends string = never>
  implements InputSource<B, X>
{
  constructor(private readonly sources: readonly InputSource<B, X>[]) {}

  get available(): boolean {
    return this.sources.some((s) => s.available);
  }

  read(): InputFrame<B, X> {
    return mergeFrames<B, X>(this.sources.map((s) => s.read()));
  }

  destroy(): void {
    for (const s of this.sources) s.destroy?.();
  }
}
