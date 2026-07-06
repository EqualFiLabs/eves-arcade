import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  fighterDefinitionId,
  fighterId,
  moveId,
  stageId,
  type Box,
  type FighterDefinitionId,
  type FighterId,
  type MoveId,
  type StageId,
  type TimedBox,
  type Vec2,
} from '@rpr/sim';

describe('primitive geometry types', () => {
  it('Vec2 and Box are plain serializable objects', () => {
    const v: Vec2 = { x: -200, y: 0 };
    const b: Box = { x: 0, y: 0, width: 60, height: 120 };
    const t: TimedBox = { ...b, frameStart: 4, frameEnd: 7 };

    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    expect(t.frameStart).toBe(4);
    expect(t.frameEnd).toBe(7);
    expectTypeOf(t).toMatchTypeOf<Box>();
  });
});

describe('branded IDs', () => {
  it('factories preserve the underlying string value', () => {
    expect(String(fighterId('sminem'))).toBe('sminem');
    expect(String(moveId('green_candle'))).toBe('green_candle');
    expect(String(stageId('marketControlRoom'))).toBe('marketControlRoom');
    expect(String(fighterDefinitionId('sminem'))).toBe('sminem');
  });

  it('factories return exactly their branded type', () => {
    expectTypeOf(fighterId('x')).toEqualTypeOf<FighterId>();
    expectTypeOf(moveId('x')).toEqualTypeOf<MoveId>();
    expectTypeOf(stageId('x')).toEqualTypeOf<StageId>();
    expectTypeOf(fighterDefinitionId('x')).toEqualTypeOf<FighterDefinitionId>();
  });

  it('brands are mutually exclusive (a MoveId is not a FighterId)', () => {
    expectTypeOf<MoveId>().not.toMatchTypeOf<FighterId>();
    expectTypeOf<FighterId>().not.toMatchTypeOf<MoveId>();
  });
});
