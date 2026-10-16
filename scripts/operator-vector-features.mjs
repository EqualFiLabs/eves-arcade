// Reproduce the reusable portrait geometry from the pinned catalog, offline.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const root = new URL('../', import.meta.url);
const bytes = gunzipSync(readFileSync(new URL('apps/api/data/operators-base-v1.json.gz', root)));
const dataset = JSON.parse(bytes);
const digest = createHash('sha256');
for (const row of dataset.operators) digest.update(`${row.tokenId}.svg\0`).update(row.svg).update('\0');
const sourceDigest = `sha256:${digest.digest('hex')}`;
if (sourceDigest !== 'sha256:b9639daf8d898b663dc7b040f1698d89336af6bf89e9c0739b979b9a2524f0f5') throw new Error('Unapproved portrait source');
const colors = ['#8CFF00', '#00E5FF', '#FFB000', '#FF3344', '#B55CFF', '#FFFFFF'];
const interfaceCounts = [1, 2, 2, 5, 1, 3, 1, 2];
const interfaces = ['Equal Sign', 'Narrow Visor', 'Dual Blocks', 'Glider', 'Double Pipe', 'Peg Bar', 'Dollar Glyph', 'Basket Grid'];
const sigils = ['Equal Seal', 'Dollar Core', 'Basket Core', 'Risk Share', 'Staking Sigil', 'Liquidity Mark', 'Position Key', 'Empty'];
const sigilCounts = [2, 2, 2, 2, 1, 2, 2, 0];
const features = { Shell: {}, Interface: {}, Sigil: {}, Boundary: {} };
const dom = new JSDOM();
const parser = new dom.window.DOMParser();
for (const record of dataset.operators) {
  const svg = parser.parseFromString(record.svg, 'image/svg+xml');
  const traits = Object.fromEntries(JSON.parse(Buffer.from(svg.querySelector('metadata').textContent, 'base64').toString()).map(t => [t.label, t.value]));
  const nodes = [...svg.documentElement.children];
  const start = nodes.findIndex(n => n.getAttribute('fill') === '#080B09');
  if (start < 0) throw new Error(`Missing shell: ${record.tokenId}`);
  const iCount = interfaceCounts[interfaces.indexOf(traits.Interface)];
  const sCount = sigilCounts[sigils.indexOf(traits.Sigil)];
  if (iCount === undefined || sCount === undefined) throw new Error('Unknown trait');
  const ranges = { Shell: nodes.slice(start, start + 2), Interface: nodes.slice(start + 2, start + 2 + iCount), Sigil: nodes.slice(start + 2 + iCount, start + 2 + iCount + sCount), Boundary: nodes.slice(start + 2 + iCount + sCount).filter(n => n.tagName !== 'metadata') };
  for (const [group, elements] of Object.entries(ranges)) {
    const geometry = elements.map(n => ({ tag: n.tagName, ...Object.fromEntries([...n.attributes].map(a => [a.name, colors.includes(a.value) ? '$signal' : a.value])) }));
    const previous = features[group][traits[group]];
    if (previous && JSON.stringify(previous) !== JSON.stringify(geometry)) throw new Error(`Inconsistent ${group}: ${traits[group]}`);
    features[group][traits[group]] = geometry;
  }
}
for (const [group, count] of [['Shell', 8], ['Interface', 8], ['Sigil', 8], ['Boundary', 6]]) {
  if (Object.keys(features[group]).length !== count) throw new Error(`Incomplete ${group}`);
  features[group] = Object.fromEntries(Object.entries(features[group]).sort(([a], [b]) => a.localeCompare(b)));
}
const output = JSON.stringify({ sourceDigest, features }, null, 2) + '\n';
const target = new URL('packages/content/src/visuals/operator-features.json', root);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Operator geometry is stale');
} else writeFileSync(target, output);
console.log(`Verified ${dataset.operators.length} portraits and 30 reusable vector features.`);
