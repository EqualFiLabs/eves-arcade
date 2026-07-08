import { describe, expect, it } from 'vitest';
import { mergeFrames, type InputFrame } from '@rpr/controls';

type TestButton = 'a' | 'b' | 'c';
type TestAxis = 'x' | 'y';

const frame = (buttons: Partial<Record<TestButton, boolean>>, axes?: Partial<Record<TestAxis, number>>): InputFrame<TestButton, TestAxis> => ({
  buttons: { a: false, b: false, c: false, ...buttons },
  axes: { x: 0, y: 0, ...axes },
});

describe('mergeFrames (Req 5.5 — source merging)', () => {
  it('returns an empty frame for no sources', () => {
    const merged = mergeFrames<TestButton, TestAxis>([]);
    expect(merged.buttons).toEqual({});
    expect(merged.axes).toEqual({});
  });

  it('returns a single frame unchanged (structurally)', () => {
    const f = frame({ a: true, b: false }, { x: 0.5 });
    const merged = mergeFrames<TestButton, TestAxis>([f]);
    expect(merged.buttons.a).toBe(true);
    expect(merged.buttons.b).toBe(false);
    expect(merged.axes.x).toBe(0.5);
  });

  it('OR-merges buttons so any source asserting a button wins', () => {
    const f1 = frame({ a: true, b: false });
    const f2 = frame({ a: false, b: true });
    const merged = mergeFrames<TestButton, TestAxis>([f1, f2]);
    expect(merged.buttons.a).toBe(true);
    expect(merged.buttons.b).toBe(true);
    expect(merged.buttons.c).toBe(false);
  });

  it('takes the largest-magnitude axis value (strongest direction wins)', () => {
    const f1 = frame({}, { x: 0.3 });
    const f2 = frame({}, { x: -0.8 });
    const f3 = frame({}, { x: 0.6 });
    const merged = mergeFrames<TestButton, TestAxis>([f1, f2, f3]);
    expect(merged.axes.x).toBe(-0.8);
  });

  it('resolves magnitude ties by keeping the first encountered value', () => {
    const f1 = frame({}, { x: 0.5 });
    const f2 = frame({}, { x: -0.5 });
    const merged = mergeFrames<TestButton, TestAxis>([f1, f2]);
    // Equal magnitude → first wins (0.5 not -0.5)
    expect(Math.abs(merged.axes.x)).toBe(0.5);
  });

  it('merges three frames combining buttons and axes', () => {
    const merged = mergeFrames<TestButton, TestAxis>([
      frame({ a: true }, { x: 1 }),
      frame({ b: true }, { y: -0.5 }),
      frame({ c: true }),
    ]);
    expect(merged.buttons).toEqual({ a: true, b: true, c: true });
    expect(merged.axes).toEqual({ x: 1, y: -0.5 });
  });
});
