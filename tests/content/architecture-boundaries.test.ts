import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const coreSource = fileURLToPath(
  new URL('../../packages/rug-pull-rumble-core/src/index.ts', import.meta.url),
);

describe('pure package architecture boundaries', () => {
  it('keeps the RPR core independent of Phaser and application layers', () => {
    const source = readFileSync(coreSource, 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map((match) => match[1]);
    expect(imports).not.toContain('phaser');
    expect(imports.some((specifier) => specifier?.includes('/apps/'))).toBe(false);
    expect(imports.every((specifier) =>
      specifier?.startsWith('@rpr/') || specifier?.startsWith('.'))).toBe(true);
  });
});
