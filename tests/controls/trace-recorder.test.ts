import { describe, expect, it } from 'vitest';
import {
  TraceCodecError,
  decodeTrace,
  defineInputSchema,
  traceByteLength,
} from '@rpr/protocol';
import { TraceRecorder, type InputFrame, type InputSource } from '@rpr/controls';

const schema = defineInputSchema({
  identity: { id: 'controls.test', version: 1 },
  buttons: ['left', 'fire'] as const,
  axes: ['aim'] as const,
});
type Button = typeof schema.buttons[number];
type Axis = typeof schema.axes[number];
const limits = { minFrames: 1, maxFrames: 2, maxBytes: traceByteLength(schema, 2) };

describe('TraceRecorder canonical choke point', () => {
  it('returns and records the same schema-ordered, int16-canonical frame', () => {
    const input = {
      buttons: { fire: true, left: false },
      axes: { aim: 0.123456 },
    } satisfies InputFrame<Button, Axis>;
    const recorder = new TraceRecorder(schema, limits);
    const recorded = recorder.wrap(source([input]));
    const live = recorded.read();
    const replay = decodeTrace(recorder.pack(), schema, limits).frames[0];

    expect(live).toEqual(replay);
    expect(Object.keys(live.buttons)).toEqual(['left', 'fire']);
    expect(live.axes.aim).toBe(Math.round(input.axes.aim * 32_767) / 32_767);
  });

  it('neutralizes missing declared actions', () => {
    const recorder = new TraceRecorder(schema, limits);
    const recorded = recorder.wrap(source([{
      buttons: {} as Record<Button, boolean>,
      axes: {} as Record<Axis, number>,
    }]));
    expect(recorded.read()).toEqual({
      buttons: { left: false, fire: false },
      axes: { aim: 0 },
    });
  });

  it('rejects undeclared actions before the simulation receives them', () => {
    const recorder = new TraceRecorder(schema, limits);
    const recorded = recorder.wrap(source([{
      buttons: { left: false, fire: false, cheat: true },
      axes: { aim: 0 },
    } as InputFrame<Button, Axis>]));
    expect(() => recorded.read())
      .toThrow(expect.objectContaining<Partial<TraceCodecError>>({ code: 'invalid-frame' }));
    expect(recorder.frameCount).toBe(0);
  });

  it('enforces the recording frame ceiling during read', () => {
    const neutral: InputFrame<Button, Axis> = {
      buttons: { left: false, fire: false },
      axes: { aim: 0 },
    };
    const recorder = new TraceRecorder(schema, limits);
    const recorded = recorder.wrap(source([neutral, neutral, neutral]));
    recorded.read();
    recorded.read();
    expect(() => recorded.read())
      .toThrow(expect.objectContaining<Partial<TraceCodecError>>({ code: 'frame-limit' }));
  });
});

function source(frames: readonly InputFrame<Button, Axis>[]): InputSource<Button, Axis> {
  let index = 0;
  return {
    available: true,
    read: () => frames[Math.min(index++, frames.length - 1)]!,
  };
}
