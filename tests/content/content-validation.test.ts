import { describe, expect, it } from 'vitest';
import {
  type V1Content,
  getV1Content,
  validateContent,
  REQUIRED_V1_FIGHTER_IDS,
  REQUIRED_V1_MOVE_IDS,
  REQUIRED_V1_STAGE_ID,
  sminemDefinition,
} from '@rpr/content';

describe('V1 content contract', () => {
  it('marks the required fighters, stage, and (non-optional) moves', () => {
    expect(REQUIRED_V1_FIGHTER_IDS.map(String)).toEqual(['sminem', 'bogdanoff']);
    expect(String(REQUIRED_V1_STAGE_ID)).toBe('marketControlRoom');
    const moveIds = REQUIRED_V1_MOVE_IDS.map(String);
    expect(moveIds).toContain('sminem_light');
    expect(moveIds).toContain('sminem_heavy');
    expect(moveIds).toContain('green_candle');
    expect(moveIds).toContain('bull_run_barrage');
    expect(moveIds).toContain('bogdanoff_backhand');
    expect(moveIds).toContain('phone_slam');
    expect(moveIds).toContain('red_candle');
    // activate_global_dump is an OPTIONAL boss super — must not be required.
    expect(moveIds).not.toContain('activate_global_dump');
  });
});

describe('validateContent on the real V1 bundle', () => {
  it('passes with no errors (Task 4 checkpoint)', () => {
    const result = validateContent();
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('Sminem references moves that all exist and hits harder than light when heavy', () => {
    const content = getV1Content();
    const sminem = content.fighters.find((f) => f.id === sminemDefinition.id)!;
    const light = content.moves.find((m) => String(m.id) === 'sminem_light')!;
    const heavy = content.moves.find((m) => String(m.id) === 'sminem_heavy')!;
    expect(heavy.damage).toBeGreaterThan(light.damage);
    expect(light.startupFrames).toBeLessThan(heavy.startupFrames);
    expect(String(sminem.moves.super)).toBe('bull_run_barrage');
  });
});

describe('validateContent catches contract violations', () => {
  /** Clone the real bundle so each test mutates an independent copy. */
  const clone = (): V1Content => structuredClone(getV1Content());

  it('flags a missing required fighter', () => {
    const content = clone();
    content.fighters = content.fighters.filter((f) => String(f.id) !== 'sminem');
    const result = validateContent(content);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/Missing required fighter definition: sminem/);
  });

  it('flags a hitbox outside the active window', () => {
    const content = clone();
    const light = content.moves.find((m) => String(m.id) === 'sminem_light')!;
    light.hitboxes[0]!.frameEnd = 999; // well past the active window
    const result = validateContent(content);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/outside active/);
  });

  it('flags an enabled distribution hook with a non-http url', () => {
    const content = clone();
    content.distributionHooks[0]!.enabled = true;
    content.distributionHooks[0]!.url = 'not-a-url';
    const result = validateContent(content);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/enabled hook needs http\(s\) url/);
  });

  it('flags a stage background asset key absent from the manifest', () => {
    const content = clone();
    content.stages[0]!.backgroundAssetKeys.push('stage_does_not_exist');
    const result = validateContent(content);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/asset key 'stage_does_not_exist' missing from manifest/);
  });

  it('flags a licensed asset missing attribution', () => {
    const content = clone();
    content.assets.push({
      key: 'music_license',
      path: 'assets/audio/music.ogg',
      kind: 'audio',
      license: { type: 'CC-BY-4.0' }, // no attribution
    });
    const result = validateContent(content);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/requires attribution/);
  });

  it('flags a fighter move slot that references an unknown move', () => {
    const content = clone();
    // Corrupt: point the light slot at an id that doesn't exist in the moves list.
    content.fighters[0]!.moves.light = 'no_such_move' as never;
    const result = validateContent(content);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/references unknown move/);
  });
});
