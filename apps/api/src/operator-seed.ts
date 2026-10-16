import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { OPERATOR_TRAIT_NAMES, type OperatorTraits } from '@rpr/protocol';

export const OPERATOR_SUPPLY = 5555;
export const OPERATOR_DIGEST = 'sha256:b9639daf8d898b663dc7b040f1698d89336af6bf89e9c0739b979b9a2524f0f5';
export const OPERATOR_PROVENANCE = Object.freeze({
  schemaVersion: 1,
  sourceRepository: 'EqualFiLabs/statics-app',
  sourceCommit: '36c2dc192c320b510d7a63071dbad71868bcf546',
  protocolCommit: '43018f109006aa2c2eef2808adc2aa74dfc9a6d4',
  chainId: 4663,
  collection: '0xad5E9F96A91D1A6F550580b157af2068A0e8F0BE',
  collectionRuntimeCodeHash: '0x4999fbcee14596c8105be151c80a8f7f2ae2c75e48d869cd8f4003a59f7f8085',
  renderer: '0xBbF960f837166ab687FA5d69b605c2E70a83a017',
  rendererRuntimeCodeHash: '0x3ae699e07a0b5ba972410b2198c2a30f1cb551b2a834a55f64c17d4997573987',
  avatarSvg: '0x39601dFDDad3aa66303E231b0445Cd4Cb2D60204',
  avatarSvgRuntimeCodeHash: '0x0f68dd8d29303123225778ef519ff922048828d7051fbe7fb2e23e225cc986bd',
  verifiedAtBlock: 89828051,
  maximumSupply: OPERATOR_SUPPLY,
  artwork: 'base-without-activation',
});

export interface OperatorRecord {
  tokenId: number;
  svg: string;
  traits: OperatorTraits;
  artworkHash: string;
}
export interface OperatorSeed {
  provenance: typeof OPERATOR_PROVENANCE;
  contentDigest: string;
  operators: OperatorRecord[];
}

export const defaultSeedPath = new URL('../data/operators-base-v1.json.gz', import.meta.url);

/** Validate the pinned source bytes before deriving traits or touching storage. */
export async function readOperatorSeed(path: string | URL = defaultSeedPath): Promise<OperatorSeed> {
  return validateOperatorSeed(JSON.parse(gunzipSync(await readFile(path), {
    maxOutputLength: 32 * 1024 * 1024,
  }).toString('utf8')));
}

export function validateOperatorSeed(input: unknown): OperatorSeed {
  const seed = z.object({
    provenance: z.unknown(),
    contentDigest: z.literal(OPERATOR_DIGEST),
    operators: z.array(z.object({ tokenId: z.number().int(), svg: z.string().max(32768) }).strict())
      .length(OPERATOR_SUPPLY),
  }).strict().parse(input);
  const provenance = seed.provenance as Record<string, unknown> | null;
  if (!provenance || Object.keys(provenance).length !== Object.keys(OPERATOR_PROVENANCE).length
    || Object.entries(OPERATOR_PROVENANCE).some(([key, value]) => provenance[key] !== value)) {
    throw new Error('Operator seed provenance does not match the approved Mainnet export');
  }
  const digest = createHash('sha256');
  for (const [index, operator] of seed.operators.entries()) {
    if (operator.tokenId !== index + 1) throw new Error('Operator IDs must cover 1 through 5555 in order');
    digest.update(`${operator.tokenId}.svg\0`);
    digest.update(operator.svg);
    digest.update('\0');
  }
  if (`sha256:${digest.digest('hex')}` !== OPERATOR_DIGEST) throw new Error('Operator SVG digest mismatch');
  const operators = seed.operators.map(({ tokenId, svg }): OperatorRecord => {
    const embedded = svg.match(/<metadata id="statics-operator-traits">([^<]+)<\/metadata>/);
    if (!embedded) throw new Error(`Missing traits for Operator #${tokenId}`);
    const attributes = z.array(z.object({ label: z.enum(OPERATOR_TRAIT_NAMES), value: z.string(), max: z.null() }))
      .length(8).parse(JSON.parse(Buffer.from(embedded[1]!, 'base64').toString('utf8')));
    const traits = Object.fromEntries(attributes.map(({ label, value }) => [label, value]));
    if (OPERATOR_TRAIT_NAMES.some((name) => !traits[name])) throw new Error(`Incomplete traits for #${tokenId}`);
    return { tokenId, svg, traits: traits as OperatorTraits, artworkHash: createHash('sha256').update(svg).digest('hex') };
  });
  return { provenance: OPERATOR_PROVENANCE, contentDigest: OPERATOR_DIGEST, operators };
}
