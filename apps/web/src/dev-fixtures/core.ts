import {
  TRACE_ENCODING_VERSION,
  decodeTrace,
  defineInputSchema,
  sha256HexBytes,
  traceByteLength,
  type CanonicalGameResult,
  type GameContractDescriptor,
  type TraceFrame,
  type TraceLimits,
} from '@rpr/protocol';

export const BUTTON_CONTRACT = {
  game: { id: 'fixture-button', version: '1.0.0' },
  resultSchema: { id: 'fixture-button.result', version: 1 },
  verification: {
    kind: 'input-trace',
    schema: { id: 'fixture-button.input', version: 1 },
    encodingVersion: TRACE_ENCODING_VERSION,
  },
} as const satisfies GameContractDescriptor;

export const ANALOG_CONTRACT = {
  game: { id: 'fixture-analog', version: '1.0.0' },
  resultSchema: { id: 'fixture-analog.result', version: 1 },
  verification: {
    kind: 'input-trace',
    schema: { id: 'fixture-analog.input', version: 1 },
    encodingVersion: TRACE_ENCODING_VERSION,
  },
} as const satisfies GameContractDescriptor;

export const UNRANKED_CONTRACT = {
  game: { id: 'fixture-unranked', version: '1.0.0' },
  resultSchema: { id: 'fixture-unranked.result', version: 1 },
  verification: { kind: 'none' },
} as const satisfies GameContractDescriptor;

export type ButtonAction = 'press';
export type AnalogButton = 'finish';
export type AnalogAxis = 'steer' | 'throttle';

export const BUTTON_INPUT = defineInputSchema({
  identity: BUTTON_CONTRACT.verification.schema,
  buttons: ['press'] as const,
  axes: [] as const,
});
export const ANALOG_INPUT = defineInputSchema({
  identity: ANALOG_CONTRACT.verification.schema,
  buttons: ['finish'] as const,
  axes: ['steer', 'throttle'] as const,
});

export const BUTTON_LIMITS: TraceLimits = Object.freeze({
  minFrames: 1,
  maxFrames: 90,
  maxBytes: traceByteLength(BUTTON_INPUT, 90),
});
export const ANALOG_LIMITS: TraceLimits = Object.freeze({
  minFrames: 1,
  maxFrames: 180,
  maxBytes: traceByteLength(ANALOG_INPUT, 180),
});

export interface ButtonState {
  readonly frame: number;
  readonly presses: number;
}

export interface AnalogState {
  readonly frame: number;
  readonly distance: number;
  readonly finished: boolean;
}

export function stepButton(
  state: ButtonState,
  input: TraceFrame<ButtonAction, never>,
): ButtonState {
  return {
    frame: state.frame + 1,
    presses: state.presses + (input.buttons.press ? 1 : 0),
  };
}

export function stepAnalog(
  state: AnalogState,
  input: TraceFrame<AnalogButton, AnalogAxis>,
): AnalogState {
  return {
    frame: state.frame + 1,
    distance: state.distance + Math.abs(input.axes.steer) + Math.abs(input.axes.throttle),
    finished: input.buttons.finish,
  };
}

export async function deriveButtonResult(
  seed: number,
  bytes: Uint8Array,
): Promise<CanonicalGameResult> {
  const decoded = decodeTrace(bytes, BUTTON_INPUT, BUTTON_LIMITS);
  const state = decoded.frames.reduce<ButtonState>(stepButton, { frame: 0, presses: 0 });
  return {
    schema: BUTTON_CONTRACT.resultSchema,
    outcome: 'complete',
    metrics: { score: state.presses * 10 + seed % 7, presses: state.presses, frames: state.frame },
    durationMs: Math.round(state.frame * 1000 / 60),
    replayHash: await terminalHash(seed, state),
  };
}

export async function deriveAnalogResult(
  seed: number,
  bytes: Uint8Array,
): Promise<CanonicalGameResult> {
  const decoded = decodeTrace(bytes, ANALOG_INPUT, ANALOG_LIMITS);
  const state = decoded.frames.reduce<AnalogState>(stepAnalog, {
    frame: 0,
    distance: 0,
    finished: false,
  });
  const distance = Math.round(state.distance * 1000) / 1000;
  return {
    schema: ANALOG_CONTRACT.resultSchema,
    outcome: state.finished ? 'landed' : 'timeout',
    metrics: { distance, frames: state.frame },
    durationMs: Math.round(state.frame * 1000 / 60),
    replayHash: await terminalHash(seed, { ...state, distance }),
  };
}

function terminalHash(seed: number, state: object): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(JSON.stringify({ seed, state })));
}
