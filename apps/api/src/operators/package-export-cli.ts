/** Reproduce the bundled seed from the approved Statics app checkout; no RPC. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { OPERATOR_DIGEST, OPERATOR_PROVENANCE, defaultSeedPath, validateOperatorSeed } from '../operator-seed';

const root = process.argv[2];
if (!root) throw new Error('Provide the Statics app export root');
const catalog = JSON.parse(await readFile(resolve(root, 'lib/generated/operator-assets.json'), 'utf8'));
if (catalog.contentDigest !== OPERATOR_DIGEST || catalog.chainId !== OPERATOR_PROVENANCE.chainId
  || catalog.collection !== OPERATOR_PROVENANCE.collection || catalog.version !== '3ae699e07a0b5ba9') {
  throw new Error('Source export is not the approved Mainnet catalog');
}
const operators = [];
for (let tokenId = 1; tokenId <= OPERATOR_PROVENANCE.maximumSupply; tokenId += 1) {
  const svg = await readFile(resolve(root, `public/assets/operators/3ae699e07a0b5ba9/${tokenId}.svg`), 'utf8');
  operators.push({ tokenId, svg });
}
const seed = { provenance: OPERATOR_PROVENANCE, contentDigest: OPERATOR_DIGEST, operators };
validateOperatorSeed(seed);
await mkdir(new URL('.', defaultSeedPath), { recursive: true });
const compressed = gzipSync(JSON.stringify(seed) + '\n', { level: 9 });
await writeFile(defaultSeedPath, compressed);
console.log(`Packaged ${operators.length} Operators (${compressed.byteLength} bytes)`);
