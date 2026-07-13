import type { SchemaIdentity } from './types';

/** Fixed-width, schema-keyed trace encoding. */
export const TRACE_ENCODING_VERSION = 2;
export const TRACE_HEADER_BYTES = 5;

const MAX_SCHEMA_BUTTONS = 64;
const MAX_SCHEMA_AXES = 16;
const INT16_SCALE = 32_767;
const MAX_UINT32 = 0xffff_ffff;

export type TraceCodecErrorCode =
  | 'invalid-schema'
  | 'invalid-limits'
  | 'invalid-frame'
  | 'unsupported-version'
  | 'frame-limit'
  | 'byte-limit'
  | 'length-mismatch'
  | 'noncanonical-padding'
  | 'noncanonical-axis';

export class TraceCodecError extends Error {
  constructor(readonly code: TraceCodecErrorCode, message: string) {
    super(message);
    this.name = 'TraceCodecError';
  }
}

export interface InputSchemaDefinition<B extends string = string, X extends string = string> {
  readonly identity: SchemaIdentity;
  readonly buttons: readonly B[];
  readonly axes: readonly X[];
}

export interface TraceFrame<B extends string = string, X extends string = string> {
  readonly buttons: Readonly<Record<B, boolean>>;
  readonly axes: Readonly<Record<X, number>>;
}

export interface TraceLimits {
  readonly minFrames?: number;
  readonly maxFrames: number;
  readonly maxBytes: number;
}

export interface DecodedTrace<B extends string = string, X extends string = string> {
  readonly version: typeof TRACE_ENCODING_VERSION;
  readonly schema: InputSchemaDefinition<B, X>;
  readonly frameCount: number;
  readonly frames: readonly TraceFrame<B, X>[];
}

/** Defines and runtime-validates the stable action order for one input schema. */
export function defineInputSchema<const B extends string, const X extends string = never>(
  definition: {
    readonly identity: SchemaIdentity;
    readonly buttons: readonly B[];
    readonly axes: readonly X[];
  },
): InputSchemaDefinition<B, X> {
  validateIdentity(definition.identity);
  validateNames(definition.buttons, 'button', MAX_SCHEMA_BUTTONS);
  validateNames(definition.axes, 'axis', MAX_SCHEMA_AXES);
  if (definition.buttons.length + definition.axes.length === 0) {
    fail('invalid-schema', 'Input schema must define at least one button or axis');
  }
  return Object.freeze({
    identity: Object.freeze({ ...definition.identity }),
    buttons: Object.freeze([...definition.buttons]),
    axes: Object.freeze([...definition.axes]),
  });
}

/** Number of bytes required for a V2 trace with the supplied schema and frame count. */
export function traceByteLength(
  schema: InputSchemaDefinition,
  frameCount: number,
): number {
  if (!Number.isSafeInteger(frameCount) || frameCount < 0 || frameCount > MAX_UINT32) {
    fail('invalid-frame', `Trace frame count must fit uint32; received ${frameCount}`);
  }
  const size = TRACE_HEADER_BYTES + frameCount * frameByteLength(schema);
  if (!Number.isSafeInteger(size)) fail('byte-limit', 'Trace byte length exceeds safe integer bounds');
  return size;
}

/**
 * Produces the exact frame consumed by both the simulation and trace encoder.
 * Missing actions are neutral; undeclared actions are programming errors.
 */
export function canonicalizeInputFrame<B extends string, X extends string>(
  schema: InputSchemaDefinition<B, X>,
  frame: TraceFrame<B, X>,
): TraceFrame<B, X> {
  rejectUnknownKeys(frame.buttons, schema.buttons, 'button');
  rejectUnknownKeys(frame.axes, schema.axes, 'axis');

  const buttons = {} as Record<B, boolean>;
  for (const name of schema.buttons) buttons[name] = frame.buttons[name] === true;

  const axes = {} as Record<X, number>;
  for (const name of schema.axes) {
    const raw = frame.axes[name] ?? 0;
    if (!Number.isFinite(raw)) fail('invalid-frame', `Axis ${name} must be finite`);
    const integer = Math.round(Math.max(-1, Math.min(1, raw)) * INT16_SCALE);
    const canonical = integer / INT16_SCALE;
    axes[name] = Object.is(canonical, -0) ? 0 : canonical;
  }
  return { buttons, axes };
}

/** Encodes canonical frames using the registered schema order. */
export function encodeTrace<B extends string, X extends string>(
  schema: InputSchemaDefinition<B, X>,
  frames: readonly TraceFrame<B, X>[],
  limits: TraceLimits,
): Uint8Array {
  validateLimits(limits);
  validateFrameCount(frames.length, limits);
  const totalBytes = traceByteLength(schema, frames.length);
  if (totalBytes > limits.maxBytes) {
    fail('byte-limit', `Trace byte length ${totalBytes} exceeds limit ${limits.maxBytes}`);
  }

  const bytes = new Uint8Array(totalBytes);
  const view = new DataView(bytes.buffer);
  bytes[0] = TRACE_ENCODING_VERSION;
  view.setUint32(1, frames.length, false);
  let offset = TRACE_HEADER_BYTES;
  const buttonBytes = Math.ceil(schema.buttons.length / 8);

  for (const input of frames) {
    const frame = canonicalizeInputFrame(schema, input);
    for (let byteIndex = 0; byteIndex < buttonBytes; byteIndex += 1) {
      let packed = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const index = byteIndex * 8 + bit;
        const name = schema.buttons[index];
        if (name !== undefined && frame.buttons[name]) packed |= 1 << bit;
      }
      bytes[offset++] = packed;
    }
    for (const name of schema.axes) {
      view.setInt16(offset, Math.round(frame.axes[name] * INT16_SCALE), false);
      offset += 2;
    }
  }
  return bytes;
}

/** Strictly decodes a V2 trace through an already-selected schema. */
export function decodeTrace<B extends string, X extends string>(
  bytes: Uint8Array,
  schema: InputSchemaDefinition<B, X>,
  limits: TraceLimits,
): DecodedTrace<B, X> {
  validateLimits(limits);
  if (bytes.byteLength > limits.maxBytes) {
    fail('byte-limit', `Trace byte length ${bytes.byteLength} exceeds limit ${limits.maxBytes}`);
  }
  if (bytes.byteLength < TRACE_HEADER_BYTES) {
    fail('length-mismatch', `Trace is too short; expected at least ${TRACE_HEADER_BYTES} bytes`);
  }
  if (bytes[0] !== TRACE_ENCODING_VERSION) {
    fail('unsupported-version', `Unsupported trace encoding version ${bytes[0] ?? 'missing'}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameCount = view.getUint32(1, false);
  validateFrameCount(frameCount, limits);
  const expectedBytes = traceByteLength(schema, frameCount);
  if (bytes.byteLength !== expectedBytes) {
    fail(
      'length-mismatch',
      `Trace payload length ${bytes.byteLength} does not match expected ${expectedBytes}`,
    );
  }

  const frames: TraceFrame<B, X>[] = [];
  const buttonBytes = Math.ceil(schema.buttons.length / 8);
  const remainder = schema.buttons.length % 8;
  const finalButtonMask = remainder === 0 ? 0xff : (1 << remainder) - 1;
  let offset = TRACE_HEADER_BYTES;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const buttons = {} as Record<B, boolean>;
    for (let byteIndex = 0; byteIndex < buttonBytes; byteIndex += 1) {
      const packed = bytes[offset++]!;
      if (byteIndex === buttonBytes - 1 && (packed & ~finalButtonMask) !== 0) {
        fail('noncanonical-padding', `Trace frame ${frameIndex} sets unused button bits`);
      }
      for (let bit = 0; bit < 8; bit += 1) {
        const index = byteIndex * 8 + bit;
        const name = schema.buttons[index];
        if (name !== undefined) buttons[name] = (packed & (1 << bit)) !== 0;
      }
    }

    const axes = {} as Record<X, number>;
    for (const name of schema.axes) {
      const integer = view.getInt16(offset, false);
      offset += 2;
      if (integer === -32_768) {
        fail('noncanonical-axis', `Trace frame ${frameIndex} axis ${name} uses -32768`);
      }
      const value = integer / INT16_SCALE;
      axes[name] = Object.is(value, -0) ? 0 : value;
    }
    frames.push({ buttons, axes });
  }

  return {
    version: TRACE_ENCODING_VERSION,
    schema,
    frameCount,
    frames,
  };
}

function frameByteLength(schema: InputSchemaDefinition): number {
  return Math.ceil(schema.buttons.length / 8) + schema.axes.length * 2;
}

function validateIdentity(identity: SchemaIdentity): void {
  if (!identity.id || identity.id.length > 200 || !Number.isSafeInteger(identity.version) || identity.version < 0) {
    fail('invalid-schema', 'Input schema identity is invalid');
  }
}

function validateNames(names: readonly string[], kind: string, max: number): void {
  if (names.length > max) fail('invalid-schema', `Input schema exceeds ${max} ${kind}s`);
  const seen = new Set<string>();
  for (const name of names) {
    if (!name || name.length > 100 || seen.has(name)) {
      fail('invalid-schema', `Input schema contains an invalid or duplicate ${kind}: ${name}`);
    }
    seen.add(name);
  }
}

function rejectUnknownKeys(
  values: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  kind: string,
): void {
  const allowedSet = new Set(allowed);
  for (const name of Object.keys(values)) {
    if (!allowedSet.has(name)) fail('invalid-frame', `Input frame contains unknown ${kind}: ${name}`);
  }
}

function validateLimits(limits: TraceLimits): void {
  const minFrames = limits.minFrames ?? 0;
  if (!Number.isSafeInteger(minFrames) || minFrames < 0
    || !Number.isSafeInteger(limits.maxFrames) || limits.maxFrames < minFrames
    || limits.maxFrames > MAX_UINT32
    || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < TRACE_HEADER_BYTES) {
    fail('invalid-limits', 'Trace limits are invalid');
  }
}

function validateFrameCount(frameCount: number, limits: TraceLimits): void {
  const minFrames = limits.minFrames ?? 0;
  if (frameCount < minFrames || frameCount > limits.maxFrames) {
    fail('frame-limit', `Trace frame count ${frameCount} is outside ${minFrames}..${limits.maxFrames}`);
  }
}

function fail(code: TraceCodecErrorCode, message: string): never {
  throw new TraceCodecError(code, message);
}
