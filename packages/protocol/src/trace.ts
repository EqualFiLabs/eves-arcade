/**
 * Versioned input-trace encoding (Req 8.4). Shared between the controls package
 * (which packs traces via `TraceRecorder`) and the API (which unpacks them for
 * replay verification). Lives here — not in controls — so the API never depends
 * on a DOM-touching package.
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
 */

/** Increment when the packed layout changes; the server dispatches on this. */
export const TRACE_ENCODING_VERSION = 1;

/** A decoded trace frame — game-agnostic (positional key names). */
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

export interface TraceDecodeLimits {
  maxFrames?: number;
  maxButtons?: number;
  maxAxes?: number;
}

/**
 * Unpacks a versioned trace into decoded frames. Used by the server-side
 * verifier and the determinism fixture test to replay a recorded session
 * (Req 8.4, 10.3).
 */
export function unpackTrace(
  data: Uint8Array,
  limits: TraceDecodeLimits = {},
): DecodedTrace {
  if (data.byteLength < 7) {
    throw new Error(`unpackTrace: trace is too short (${data.byteLength} bytes; expected at least 7)`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const version = data[offset++] ?? 0;
  if (version !== TRACE_ENCODING_VERSION) {
    throw new Error(
      `unpackTrace: unsupported encoding version ${version} (expected ${TRACE_ENCODING_VERSION})`,
    );
  }

  const frameCount = view.getUint32(offset, false);
  offset += 4;
  const buttonCount = data[offset++] ?? 0;
  const axisCount = data[offset++] ?? 0;

  const maxFrames = limits.maxFrames ?? 1_000_000;
  const maxButtons = limits.maxButtons ?? 64;
  const maxAxes = limits.maxAxes ?? 16;
  if (!Number.isSafeInteger(maxFrames) || maxFrames < 0 || frameCount > maxFrames) {
    throw new Error(`unpackTrace: frame count ${frameCount} exceeds limit ${maxFrames}`);
  }
  if (!Number.isSafeInteger(maxButtons) || maxButtons < 0 || buttonCount > maxButtons) {
    throw new Error(`unpackTrace: button count ${buttonCount} exceeds limit ${maxButtons}`);
  }
  if (!Number.isSafeInteger(maxAxes) || maxAxes < 0 || axisCount > maxAxes) {
    throw new Error(`unpackTrace: axis count ${axisCount} exceeds limit ${maxAxes}`);
  }

  const buttonBytesPerFrame = Math.ceil(buttonCount / 8) || 0;
  const frameSize = buttonBytesPerFrame + axisCount * 2;
  const expectedSize = 7 + frameCount * frameSize;
  if (!Number.isSafeInteger(expectedSize) || expectedSize !== data.byteLength) {
    throw new Error(
      `unpackTrace: payload length ${data.byteLength} does not match expected ${expectedSize}`,
    );
  }
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
