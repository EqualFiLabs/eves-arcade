import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { inspectSource, scanArchitecture } from './dependency-rules';

describe('executable architecture boundaries', () => {
  it('keeps the live source graph inside the approved layers', () => {
    expect(scanArchitecture()).toEqual([]);
  });

  it.each([
    ['packages/sim/src/bad.ts', "import Phaser from 'phaser';"],
    ['packages/protocol/src/bad.ts', 'export const root = document.body;'],
    ['packages/controls/src/bad.ts', "export * from '@rpr/sim';"],
    ['apps/api/src/bad.ts', "await import('../../web/src/main');"],
    ['apps/web/src/arcade/bad.ts', "import '../games/rug-pull-rumble/index';"],
    ['apps/web/src/games/one/bad.ts', "import '../two/index';"],
    ['apps/web/src/arcade/conditional.ts', "if (gameId === 'rug-pull-rumble') throw Error();"],
  ])('detects a forbidden edge in %s', (relativeFile, source) => {
    const root = mkdtempSync(join(tmpdir(), 'rpr-architecture-'));
    try {
      const file = join(root, relativeFile);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, source);
      expect(inspectSource(file, root)).not.toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses modern TypeScript imports rather than matching comments', () => {
    const source = ts.createSourceFile('fixture.ts', "// import Phaser from 'phaser'", ts.ScriptTarget.Latest);
    expect(source.statements).toHaveLength(0);
  });
});
