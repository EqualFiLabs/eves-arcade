import { describe, expect, it } from 'vitest';
import {
  TRACE_ENCODING_VERSION,
  TraceCodecError,
  canonicalizeInputFrame,
  decodeTrace,
  defineInputSchema,
  encodeTrace,
  traceByteLength,
  type TraceFrame,
  type TraceLimits,
} from '@rpr/protocol';

const schema = defineInputSchema({
  identity: { id: 'test.flight', version: 3 },
  buttons: ['fire', 'jump', 'dash', 'shield', 'bomb', 'pause', 'menu', 'alt', 'ninth'] as const,
  axes: ['x', 'y'] as const,
});
type Button = typeof schema.buttons[number];
type Axis = typeof schema.axes[number];
const limits: TraceLimits = { minFrames: 1, maxFrames: 10, maxBytes: 1_000 };

function frame(overrides: Partial<TraceFrame<Button, Axis>> = {}): TraceFrame<Button, Axis> {
  return {
    buttons: {
      fire: true, jump: false, dash: false, shield: false, bomb: false,
      pause: false, menu: false, alt: false, ninth: true,
    },
    axes: { x: 1, y: -1 },
    ...overrides,
  };
}

describe('schema-keyed Trace V2', () => {
  it('pins the fixed-width golden vector', () => {
    const bytes = encodeTrace(schema, [frame()], limits);
    expect([...bytes]).toEqual([
      TRACE_ENCODING_VERSION, 0, 0, 0, 1,
      0b00000001, 0b00000001,
      0x7f, 0xff,
      0x80, 0x01,
    ]);
    expect(bytes.byteLength).toBe(traceByteLength(schema, 1));
  });

  it('round-trips semantic names and signed int16 canonical axes', () => {
    const input = frame({ axes: { x: 0.123456, y: -4 } });
    const canonical = canonicalizeInputFrame(schema, input);
    const decoded = decodeTrace(encodeTrace(schema, [input], limits), schema, limits);
    expect(decoded.schema).toBe(schema);
    expect(decoded.frames).toEqual([canonical]);
    expect(canonical.axes.x).toBe(Math.round(0.123456 * 32_767) / 32_767);
    expect(canonical.axes.y).toBe(-1);
  });

  it('is independent of object construction order and neutralizes missing actions', () => {
    const reordered = {
      buttons: { ninth: true, fire: true } as Record<Button, boolean>,
      axes: { y: -1, x: 1 },
    };
    expect(encodeTrace(schema, [reordered], limits)).toEqual(encodeTrace(schema, [frame()], limits));
    const neutral = canonicalizeInputFrame(schema, {
      buttons: {} as Record<Button, boolean>,
      axes: {} as Record<Axis, number>,
    });
    expect(Object.values(neutral.buttons).every((value) => value === false)).toBe(true);
    expect(neutral.axes).toEqual({ x: 0, y: 0 });
  });

  it.each([
    ['unknown action', { buttons: { ...frame().buttons, cheat: true }, axes: frame().axes }, 'invalid-frame'],
    ['non-finite axis', { buttons: frame().buttons, axes: { x: Number.NaN, y: 0 } }, 'invalid-frame'],
  ] as const)('rejects %s during canonicalization', (_name, input, code) => {
    expect(() => canonicalizeInputFrame(schema, input as TraceFrame<Button, Axis>))
      .toThrow(expect.objectContaining<Partial<TraceCodecError>>({ code }));
  });

  it.each([
    ['V1 encoding', (bytes: Uint8Array) => { bytes[0] = 1; }, 'unsupported-version'],
    ['truncated payload', (bytes: Uint8Array) => bytes.slice(0, -1), 'length-mismatch'],
    ['trailing payload', (bytes: Uint8Array) => Uint8Array.from([...bytes, 0]), 'length-mismatch'],
    ['unused button bit', (bytes: Uint8Array) => { bytes[6]! |= 0b00000010; }, 'noncanonical-padding'],
    ['-32768 axis', (bytes: Uint8Array) => { bytes[7] = 0x80; bytes[8] = 0; }, 'noncanonical-axis'],
  ] as const)('rejects %s', (_name, mutate, code) => {
    const result = mutate(encodeTrace(schema, [frame()], limits));
    const bytes = result instanceof Uint8Array ? result : encodeAndMutate(mutate);
    expect(() => decodeTrace(bytes, schema, limits))
      .toThrow(expect.objectContaining<Partial<TraceCodecError>>({ code }));
  });

  it('enforces frame and byte limits before decoding frames', () => {
    const twoFrames = encodeTrace(schema, [frame(), frame()], limits);
    expect(() => decodeTrace(twoFrames, schema, { ...limits, maxFrames: 1 }))
      .toThrow(expect.objectContaining<Partial<TraceCodecError>>({ code: 'frame-limit' }));
    expect(() => decodeTrace(twoFrames, schema, { ...limits, maxBytes: twoFrames.byteLength - 1 }))
      .toThrow(expect.objectContaining<Partial<TraceCodecError>>({ code: 'byte-limit' }));
  });

  it('rejects invalid and duplicate schema definitions', () => {
    expect(() => defineInputSchema({
      identity: { id: 'bad', version: 1 },
      buttons: ['fire', 'fire'],
      axes: [],
    })).toThrow(expect.objectContaining<Partial<TraceCodecError>>({ code: 'invalid-schema' }));
  });
});

function encodeAndMutate(mutate: (bytes: Uint8Array) => unknown): Uint8Array {
  const bytes = encodeTrace(schema, [frame()], limits);
  mutate(bytes);
  return bytes;
}
