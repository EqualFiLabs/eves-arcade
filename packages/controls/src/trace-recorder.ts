import type { InputFrame, InputSource } from './frame';

/**
 * Trace encoding version. Increment when the packed layout changes; the server
 * dispatches on this to select the correct unpacker (Req 8.4).
 */
export const TRACE_ENCODING_VERSION = 1;

/**
 * A decoded trace frame — the unpacked counterpart to an {@link InputFrame}.
 * Button keys and axis keys are strings (not the game's generic types) so the
 * decoder stays game-agnostic.
 */
export interface DecodedTraceFrame {
  buttons: Record<string, boolean>;
  axes: Record<string, number>;
}

export interface DecodedTrace {
  version: number;
  buttonKeys: readonly string[];
  axisKeys: readonly string[];
  frames: readonly DecodedTraceFrame[];
}

/**
 * Records every polled {@link InputFrame} so a play session can be replayed
 * server-side for verification (Req 8.3–8.5).
 *
 * Usage: `const recorded = recorder.wrap(source)` — the returned proxy reads
 * from the underlying source, records each frame, and returns it unchanged.
 * The game polls `recorded` instead of the raw source. After the session,
 * `pack()` produces a versioned `Uint8Array`; `hash()` SHA-256s it.
 *
 * Bit-packing (version 1):
 * ```
 * [version: 1 byte]
 * [frameCount: uint32 BE]
 * [buttonCount: 1 byte]
 * [axisCount: 1 byte]
 * ─ per frame ─
 * [buttons: ceil(buttonCount / 8) bytes, LSB-first]
 * [axes: axisCount × int16 BE, scaled from -1..1 to -32767..32767]
 * ```
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
      // Pack buttons one byte at a time (avoids read-modify-write on typed arrays)
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

      // Pack axes as int16 BE
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
    // Copy into a fresh ArrayBuffer to satisfy BufferSource typing (TS 5.7+ generic typed arrays)
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

/**
 * Unpacks a versioned trace into decoded frames. Game-agnostic: button and axis
 * keys are strings. Used by the server-side verifier (and the determinism
 * fixture test) to replay a recorded session (Req 8.4, 10.3).
 */
export function unpackTrace(data: Uint8Array): DecodedTrace {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const version = data[offset++] ?? 0;
  if (version !== TRACE_ENCODING_VERSION) {
    throw new Error(`unpackTrace: unsupported encoding version ${version} (expected ${TRACE_ENCODING_VERSION})`);
  }

  const frameCount = view.getUint32(offset, false);
  offset += 4;
  const buttonCount = data[offset++] ?? 0;
  const axisCount = data[offset++] ?? 0;

  const buttonBytesPerFrame = Math.ceil(buttonCount / 8) || 0;
  const buttonKeys: string[] = [];
  const axisKeys: string[] = [];

  const frames: DecodedTraceFrame[] = [];
  for (let f = 0; f < frameCount; f++) {
    const buttons: Record<string, boolean> = {};

    for (let byteI = 0; byteI < buttonBytesPerFrame; byteI++) {
      const byte = data[offset++] ?? 0;
      for (let bit = 0; bit < 8; bit++) {
        const i = byteI * 8 + bit;
        if (i < buttonCount) {
          const key = `b${i}`;
          if (f === 0) buttonKeys.push(key);
          buttons[key] = (byte & (1 << bit)) !== 0;
        }
      }
    }

    const axes: Record<string, number> = {};
    for (let i = 0; i < axisCount; i++) {
      const val = view.getInt16(offset, false) / 32767;
      const key = `x${i}`;
      if (f === 0) axisKeys.push(key);
      axes[key] = val;
      offset += 2;
    }

    frames.push({ buttons, axes });
  }

  return { version, buttonKeys, axisKeys, frames };
}
