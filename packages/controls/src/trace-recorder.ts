import type { InputFrame, InputSource } from './frame';
import { TRACE_ENCODING_VERSION } from '@rpr/protocol';

// Re-export trace encoding types from @rpr/protocol for backward compat.
export { TRACE_ENCODING_VERSION, unpackTrace } from '@rpr/protocol';
export type { DecodedTrace, DecodedTraceFrame } from '@rpr/protocol';

/**
 * Records every polled {@link InputFrame} so a play session can be replayed
 * server-side for verification (Req 8.3–8.5).
 *
 * Usage: `const recorded = recorder.wrap(source)` — the returned proxy reads
 * from the underlying source, records each frame, and returns it unchanged.
 * The game polls `recorded` instead of the raw source. After the session,
 * `pack()` produces a versioned `Uint8Array`; `hash()` SHA-256s it.
 *
 * Encoding format lives in `@rpr/protocol` so the API can decode without
 * importing a DOM-touching package.
 *
 * No Phaser. Uses `crypto.subtle` (available in browsers + Node 20+).
 */
export class TraceRecorder<B extends string, X extends string = never> {
  private frames: InputFrame<B, X>[] = [];
  private buttonKeys: readonly string[] = [];
  private axisKeys: readonly string[] = [];

  /**
   * Wraps an {@link InputSource} so every `read()` is recorded. The returned
   * proxy delegates `available` and `destroy` to the underlying source.
   */
  wrap(source: InputSource<B, X>): InputSource<B, X> {
    const proxy: InputSource<B, X> = {
      get available() {
        return source.available;
      },
      read: () => {
        const frame = source.read();
        this.record(frame);
        return frame;
      },
    };
    const origDestroy = source.destroy;
    if (origDestroy) proxy.destroy = origDestroy.bind(source);
    return proxy;
  }

  /** Number of frames recorded so far. */
  get frameCount(): number {
    return this.frames.length;
  }

  /** Packs the recorded frames into a versioned `Uint8Array` (Req 8.4). */
  pack(): Uint8Array {
    const buttonCount = this.buttonKeys.length;
    const axisCount = this.axisKeys.length;
    const buttonBytesPerFrame = Math.ceil(buttonCount / 8) || 0;
    const frameSize = buttonBytesPerFrame + axisCount * 2;
    const headerSize = 1 + 4 + 1 + 1;
    const totalSize = headerSize + this.frames.length * frameSize;
    const buf = new Uint8Array(totalSize);
    const view = new DataView(buf.buffer);

    let offset = 0;
    buf[offset++] = TRACE_ENCODING_VERSION;
    view.setUint32(offset, this.frames.length, false);
    offset += 4;
    buf[offset++] = buttonCount;
    buf[offset++] = axisCount;

    for (const frame of this.frames) {
      for (let byteI = 0; byteI < buttonBytesPerFrame; byteI++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const i = byteI * 8 + bit;
          if (i < buttonCount && frame.buttons[this.buttonKeys[i] as B]) {
            byte |= 1 << bit;
          }
        }
        buf[offset++] = byte;
      }

      for (let i = 0; i < axisCount; i++) {
        const raw = frame.axes[this.axisKeys[i] as X] ?? 0;
        const clamped = Math.max(-1, Math.min(1, raw));
        view.setInt16(offset, Math.round(clamped * 32767), false);
        offset += 2;
      }
    }

    return buf;
  }

  /** SHA-256 hex digest of the packed trace (Req 8.3). */
  async hash(): Promise<string> {
    const data = this.pack();
    const ab = new ArrayBuffer(data.byteLength);
    new Uint8Array(ab).set(data);
    const digest = await crypto.subtle.digest('SHA-256', ab);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private record(frame: InputFrame<B, X>): void {
    if (this.frames.length === 0) {
      this.buttonKeys = Object.keys(frame.buttons);
      this.axisKeys = Object.keys(frame.axes);
    }
    this.frames.push(frame);
  }
}
