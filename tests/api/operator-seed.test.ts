import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { defaultSeedPath, readOperatorSeed, validateOperatorSeed } from '../../apps/api/src/operator-seed';

describe('approved Mainnet Operator seed', () => {
  it('validates every original SVG and all eight embedded traits', async () => {
    const seed = await readOperatorSeed();
    expect(seed.operators).toHaveLength(5555);
    expect(seed.provenance).toMatchObject({ chainId: 4663, verifiedAtBlock: 89828051 });
    for (const row of seed.operators) {
      expect(Object.keys(row.traits)).toHaveLength(8);
      expect(row.artworkHash).toBe(createHash('sha256').update(row.svg).digest('hex'));
      expect(row.svg).not.toContain('id="activation-tier"');
    }
    expect(seed.operators[41]!.traits).toMatchObject({ Shell: 'Round Shell', Signal: 'Neon Green' });
  });

  it('rejects incomplete, corrupted, reordered and non-Mainnet exports', async () => {
    const original = JSON.parse(gunzipSync(await readFile(defaultSeedPath)).toString());
    for (const mutate of [
      (seed: typeof original) => { seed.operators.pop(); },
      (seed: typeof original) => { seed.operators[0].svg += ' '; },
      (seed: typeof original) => { seed.operators[0].tokenId = 42; },
      (seed: typeof original) => { seed.provenance.chainId = 46630; },
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      expect(() => validateOperatorSeed(changed)).toThrow();
    }
  });
});
