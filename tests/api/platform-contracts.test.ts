import { describe, expect, it } from 'vitest';
import { PLATFORM_CONTRACT_EXAMPLES } from '../../apps/web/src/arcade/contract-examples';

describe('platform contract formats', () => {
  it('represents fighter, launcher, score-only, and unranked games explicitly', () => {
    expect(PLATFORM_CONTRACT_EXAMPLES.map((manifest) => manifest.contract.game.id)).toEqual([
      'example-fighter',
      'example-launcher',
      'example-score-only',
      'example-unranked',
    ]);
    expect(PLATFORM_CONTRACT_EXAMPLES.map((manifest) => manifest.contract.verification.kind))
      .toEqual(['input-trace', 'input-trace', 'none', 'none']);
    expect(PLATFORM_CONTRACT_EXAMPLES.map((manifest) => manifest.orientation))
      .toEqual(['landscape', 'portrait', 'any', 'any']);
  });

  it('does not require leaderboards or local bests for an unranked game', () => {
    const unranked = PLATFORM_CONTRACT_EXAMPLES[3];
    expect(unranked.leaderboards).toEqual([]);
    expect('localBest' in unranked).toBe(false);
  });
});
