/** Thin API adapter over the canonical Rug Pull Rumble replay core. */
import type { CombatInput } from '@rpr/sim';
import {
  replayRprInputs,
  type RprCanonicalResult,
} from '@rpr/rug-pull-rumble-core';

export type VerifyResult = RprCanonicalResult;

export function verifyRpr(
  seed: number,
  inputs: readonly CombatInput[],
): Promise<RprCanonicalResult> {
  return replayRprInputs(seed, inputs);
}
