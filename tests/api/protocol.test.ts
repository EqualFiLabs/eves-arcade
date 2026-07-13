import { describe, expect, it } from 'vitest';
import { TRACE_ENCODING_VERSION, unpackTrace } from '@rpr/protocol';

function trace(options: {
  version?: number;
  frames?: number;
  buttons?: number;
  axes?: number;
  payloadBytes?: number;
} = {}): Uint8Array {
  const frames = options.frames ?? 1;
  const buttons = options.buttons ?? 13;
  const axes = options.axes ?? 0;
  const frameSize = Math.ceil(buttons / 8) + axes * 2;
  const bytes = new Uint8Array(7 + (options.payloadBytes ?? frames * frameSize));
  const view = new DataView(bytes.buffer);
  bytes[0] = options.version ?? TRACE_ENCODING_VERSION;
  view.setUint32(1, frames, false);
  bytes[5] = buttons;
  bytes[6] = axes;
  return bytes;
}

describe('strict trace V1 decoding', () => {
  it('decodes an exact valid payload', () => {
    const decoded = unpackTrace(trace(), { maxFrames: 10, maxButtons: 13, maxAxes: 0 });
    expect(decoded.frames).toHaveLength(1);
    expect(decoded.buttonKeys).toHaveLength(13);
  });

  it.each([
    ['short header', new Uint8Array(6), /too short/],
    ['unsupported version', trace({ version: 99 }), /unsupported/],
    ['too many frames', trace({ frames: 2 }), /frame count/],
    ['too many buttons', trace({ buttons: 14 }), /button count/],
    ['too many axes', trace({ axes: 1 }), /axis count/],
    ['truncated payload', trace({ payloadBytes: 1 }), /payload length/],
    ['trailing payload', trace({ payloadBytes: 3 }), /payload length/],
  ])('rejects %s', (_name, bytes, error) => {
    expect(() => unpackTrace(bytes, { maxFrames: 1, maxButtons: 13, maxAxes: 0 })).toThrow(error);
  });
});
