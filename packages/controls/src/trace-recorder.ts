import {
  TraceCodecError,
  canonicalizeInputFrame,
  encodeTrace,
  sha256HexBytes,
  type InputSchemaDefinition,
  type TraceLimits,
} from '@rpr/protocol';
import type { InputFrame, InputSource } from './frame';

/**
 * Canonical input choke point. Every source frame is normalized to its declared
 * schema, recorded, and returned unchanged to the game simulation.
 */
export class TraceRecorder<B extends string, X extends string = never> {
  private readonly frames: InputFrame<B, X>[] = [];

  constructor(
    private readonly schema: InputSchemaDefinition<B, X>,
    private readonly limits: TraceLimits,
  ) {}

  wrap(source: InputSource<B, X>): InputSource<B, X> {
    const proxy: InputSource<B, X> = {
      get available() {
        return source.available;
      },
      read: () => {
        const frame = this.record(source.read());
        return frame;
      },
    };
    const originalDestroy = source.destroy;
    if (originalDestroy) proxy.destroy = originalDestroy.bind(source);
    return proxy;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  pack(): Uint8Array {
    return encodeTrace(this.schema, this.frames, this.limits);
  }

  async hash(): Promise<string> {
    return sha256HexBytes(this.pack());
  }

  private record(frame: InputFrame<B, X>): InputFrame<B, X> {
    if (this.frames.length >= this.limits.maxFrames) {
      throw new TraceCodecError(
        'frame-limit',
        `Trace frame count would exceed limit ${this.limits.maxFrames}`,
      );
    }
    const canonical = canonicalizeInputFrame(this.schema, frame);
    this.frames.push(canonical);
    return canonical;
  }
}
