/** Thin API adapter over the canonical Rug Pull Rumble replay core. */
import type { CombatInput } from '@rpr/sim';
import {
  RPR_GAME_ID,
  RPR_GAME_VERSION,
  RPR_INPUT_SCHEMA,
  RPR_MAX_TRACE_FRAMES,
  RPR_RESULT_SCHEMA,
  RPR_TRACE_ENCODING_VERSION,
  RPR_TRACE_LIMITS,
  decodeRprTrace,
  replayRprInputs,
  type RprCanonicalResult,
} from '@rpr/rug-pull-rumble-core';
import type { VerifierDescriptor } from '../registry';

export const RPR_VERIFIER = { id: 'rpr.verify', revision: 1 } as const;

export const rprVerifierDescriptor: VerifierDescriptor = {
  game: { id: RPR_GAME_ID, version: RPR_GAME_VERSION },
  verifier: RPR_VERIFIER,
  inputSchema: RPR_INPUT_SCHEMA,
  resultSchema: RPR_RESULT_SCHEMA,
  encodingVersion: RPR_TRACE_ENCODING_VERSION,
  maxFrames: RPR_MAX_TRACE_FRAMES,
  maxEvidenceBytes: RPR_TRACE_LIMITS.maxBytes,
  validateEvidence(bytes) { decodeRprTrace(bytes, RPR_MAX_TRACE_FRAMES); },
  async verify(seed, bytes) {
    const decoded = decodeRprTrace(bytes, RPR_MAX_TRACE_FRAMES);
    return replayRprInputs(seed, decoded.inputs);
  },
};

export type VerifyResult = RprCanonicalResult;

export function verifyRpr(
  seed: number,
  inputs: readonly CombatInput[],
): Promise<RprCanonicalResult> {
  return replayRprInputs(seed, inputs);
}
