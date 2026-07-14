// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  ArcadeContractError,
  defineArcadeRegistry,
  validateCompletion,
} from '../../apps/web/src/arcade/contracts';
import type { ArcadeGameManifest, GameCompletion } from '../../apps/web/src/arcade/types';

describe('arcade contract conformance', () => {
  it('accepts and freezes a complete ranked manifest', () => {
    const registry = defineArcadeRegistry([manifest()]);
    expect(registry).toHaveLength(1);
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('rejects duplicate games and category ids', () => {
    expect(() => defineArcadeRegistry([manifest(), manifest()])).toThrow(/duplicate game/i);
    expect(() => defineArcadeRegistry([
      manifest(),
      manifest({
        contract: {
          ...manifest().contract,
          game: { id: 'other', version: '1.0.0' },
        },
      }),
    ])).toThrow(/duplicate leaderboard/i);
  });

  it('rejects ranked manifests without suspension or replay support', () => {
    expect(() => defineArcadeRegistry([manifest({
      capabilities: {
        input: { keyboard: true, pointer: false, touch: false, gamepad: false },
        suspension: false,
      },
    })])).toThrow(/suspension/i);
    expect(() => {
      const value = manifest();
      delete (value as { replay?: unknown }).replay;
      defineArcadeRegistry([value]);
    }).toThrow(/replay/i);
  });

  it('rejects unranked leaderboards', () => {
    expect(() => defineArcadeRegistry([manifest({
      contract: { ...manifest().contract, verification: { kind: 'none' } },
    })])).toThrow(/unranked/i);
  });

  it('accepts exact ranked completion metadata', () => {
    expect(() => validateCompletion(manifest(), completion())).not.toThrow();
  });

  it.each([
    ['result schema', { result: { ...completion().result, schema: { id: 'wrong', version: 1 } } }],
    ['input schema', { evidence: { ...completion().evidence, schema: { id: 'wrong', version: 1 } } }],
    ['trace encoding', { evidence: { ...completion().evidence, encodingVersion: 99 } }],
    ['replay hash', { result: { ...completion().result, replayHash: undefined } }],
    ['finite metric', { result: { ...completion().result, metrics: { score: Number.NaN } } }],
    ['presentation metric', {
      presentation: {
        ...completion().presentation,
        primaryMetric: { metric: 'missing', label: 'Missing' },
      },
    }],
  ])('rejects invalid %s completion data', (_label, patch) => {
    const value = { ...completion(), ...patch } as GameCompletion;
    expect(() => validateCompletion(manifest(), value)).toThrow(ArcadeContractError);
  });
});

function manifest(overrides: Partial<ArcadeGameManifest> = {}): ArcadeGameManifest {
  return {
    contract: {
      game: { id: 'contract-fixture', version: '1.0.0' },
      resultSchema: { id: 'contract-fixture.result', version: 1 },
      verification: {
        kind: 'input-trace',
        schema: { id: 'contract-fixture.input', version: 1 },
        encodingVersion: 2,
      },
    },
    title: 'Contract Fixture',
    orientation: 'landscape',
    capabilities: {
      input: { keyboard: true, pointer: false, touch: false, gamepad: false },
      suspension: true,
    },
    leaderboards: [
      { id: 'contract.score', label: 'Score', metric: 'score', order: 'desc' },
    ],
    replay: { load: async () => ({ launch: () => replayHandle() }) },
    load: async () => ({ launch: () => ({ ready: Promise.resolve(), async destroy() {} }) }),
    ...overrides,
  };
}

function completion(): GameCompletion {
  return {
    result: {
      schema: { id: 'contract-fixture.result', version: 1 },
      outcome: 'complete',
      metrics: { score: 10 },
      durationMs: 100,
      replayHash: 'abc',
    },
    presentation: {
      headline: 'Complete',
      tone: 'positive',
      primaryMetric: { metric: 'score', label: 'Score' },
    },
    evidence: {
      kind: 'input-trace',
      schema: { id: 'contract-fixture.input', version: 1 },
      encodingVersion: 2,
      bytes: new Uint8Array([2, 0, 0, 0, 0]),
    },
  };
}

function replayHandle() {
  return {
    ready: Promise.resolve(),
    progress: { frame: 0, totalFrames: 0, playing: false, speed: 1 as const },
    play() {}, pause() {}, step() {}, setSpeed() {}, async destroy() {},
  };
}
