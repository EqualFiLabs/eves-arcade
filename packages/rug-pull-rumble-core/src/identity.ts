import {
  defineInputSchema,
  traceByteLength,
  type GameContractDescriptor,
  type TraceLimits,
} from '@rpr/protocol';

/** Compatibility identities for the canonical Rug Pull Rumble V1 rules and wire schemas. */
export const RPR_GAME_ID = 'rug-pull-rumble';
export const RPR_GAME_VERSION = '0.1.0';
export const RPR_RESULT_SCHEMA = { id: 'rpr.result', version: 1 } as const;
export const RPR_INPUT_SCHEMA = { id: 'rpr.input', version: 2 } as const;
export const RPR_TRACE_ENCODING_VERSION = 2;
export const RPR_MAX_TRACE_FRAMES = 180 * 60;

export const RPR_INPUT_BUTTONS = [
  'left',
  'right',
  'up',
  'down',
  'block',
  'lightHigh',
  'lightLow',
  'heavyHigh',
  'heavyLow',
  'special',
  'super',
] as const;

export type RprInputButton = typeof RPR_INPUT_BUTTONS[number];

export const RPR_INPUT_DEFINITION = defineInputSchema({
  identity: RPR_INPUT_SCHEMA,
  buttons: RPR_INPUT_BUTTONS,
  axes: [] as const,
});

export const RPR_TRACE_LIMITS: TraceLimits = Object.freeze({
  minFrames: 1,
  maxFrames: RPR_MAX_TRACE_FRAMES,
  maxBytes: traceByteLength(RPR_INPUT_DEFINITION, RPR_MAX_TRACE_FRAMES),
});

export const RPR_CONTRACT = {
  game: { id: RPR_GAME_ID, version: RPR_GAME_VERSION },
  resultSchema: RPR_RESULT_SCHEMA,
  verification: {
    kind: 'input-trace',
    schema: RPR_INPUT_SCHEMA,
    encodingVersion: RPR_TRACE_ENCODING_VERSION,
  },
} as const satisfies GameContractDescriptor;
