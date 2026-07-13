import type { GameContractDescriptor } from '@rpr/protocol';

/** Compatibility identities for the canonical Rug Pull Rumble V1 rules and wire schemas. */
export const RPR_GAME_ID = 'rug-pull-rumble';
export const RPR_GAME_VERSION = '0.1.0';
export const RPR_RESULT_SCHEMA = { id: 'rpr.result', version: 1 } as const;
export const RPR_INPUT_SCHEMA = { id: 'rpr.input', version: 1 } as const;
export const RPR_TRACE_ENCODING_VERSION = 1;

export const RPR_CONTRACT = {
  game: { id: RPR_GAME_ID, version: RPR_GAME_VERSION },
  resultSchema: RPR_RESULT_SCHEMA,
  verification: {
    kind: 'input-trace',
    schema: RPR_INPUT_SCHEMA,
    encodingVersion: RPR_TRACE_ENCODING_VERSION,
  },
} as const satisfies GameContractDescriptor;
