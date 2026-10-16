import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readOperatorSeed, OPERATOR_DIGEST } from '../../apps/api/src/operator-seed';
import { operatorFeatures, operatorFeatureSourceDigest, operatorSignals, operatorFields, operatorMantles, operatorTelemetry, v1Moves } from '@rpr/content';
import { RprMatch } from '@rpr/rug-pull-rumble-core';
import { sampleOperatorPose } from '../../apps/web/src/games/rug-pull-rumble/renderers/operator-pose';
import { NEUTRAL_INPUT, type FighterState } from '@rpr/sim';

describe('Operator fighter artwork coverage', () => {
  it('reproduces exact vector features against every pinned portrait', () => {
    expect(execFileSync(process.execPath, ['scripts/operator-vector-features.mjs', '--check'], { encoding: 'utf8' })).toContain('5555 portraits');
    expect(operatorFeatureSourceDigest).toBe(OPERATOR_DIGEST);
  }, 20_000);

  it('maps all eight traits for every catalog identity', async () => {
    const seed = await readOperatorSeed();
    for (const { traits } of seed.operators) {
      for (const group of ['Shell', 'Interface', 'Sigil', 'Boundary'] as const) expect(operatorFeatures[group][traits[group]]).toBeDefined();
      expect(operatorSignals[traits.Signal]).toMatch(/^#[0-9A-F]{6}$/);
      expect([...operatorFields]).toContain(traits.Field);
      expect([...operatorMantles]).toContain(traits.Mantle);
      expect([...operatorTelemetry]).toContain(traits.Telemetry);
    }
  });
});

describe('presentation-only pose sampler', () => {
  it('reads real match snapshots without changing deterministic state', () => {
    const a = new RprMatch(42), b = new RprMatch(42);
    for (let frame = 0; frame < 180; frame++) {
      a.step(NEUTRAL_INPUT); b.step(NEUTRAL_INPUT);
      const before = JSON.stringify(a.state);
      sampleOperatorPose(a.state.player, a.state.frame);
      sampleOperatorPose(a.state.cpu, a.state.frame);
      expect(JSON.stringify(a.state)).toBe(before);
    }
    expect(a.state).toEqual(b.state);
  });

  // Narrow synthetic snapshots isolate each pose and move phase. Actual input,
  // damage, KO and playback remain covered through real browser fights.
  it('distinguishes crouch, walk, guard, air, recoil and KO', () => {
    const base = new RprMatch(42).state.player;
    const pose = (state: FighterState['currentState'], extras = {}) => sampleOperatorPose({ ...base, currentState: state, ...extras }, 14);
    expect(pose('crouch').head.y).toBeGreaterThan(pose('idle').head.y + 40);
    expect(pose('walk_forward').frontAnkle).not.toEqual(pose('idle').frontAnkle);
    expect(pose('block').frontHand.y).toBeLessThan(pose('idle').frontHand.y);
    expect(pose('jump', { grounded: false }).frontAnkle.y).toBeLessThan(-10);
    expect(pose('hitstun').head.x).toBeLessThan(0);
    expect(pose('ko').rotation).toBeCloseTo(Math.PI / 2);
  });

  it('extends strikes during existing active windows and retracts through recovery', () => {
    const base = new RprMatch(42).state.player;
    for (const move of v1Moves) {
      const at = (elapsedFrames: number) => sampleOperatorPose({ ...base, currentState: 'attack', currentMove: {
        moveId: move.id, elapsedFrames, phase: 'active', hitTargets: [], spentMeter: false,
      } }, 0);
      const active = at(move.startupFrames), ready = at(0), recovered = at(move.startupFrames + move.activeFrames + move.recoveryFrames);
      if (move.inputCommand.button === 'lightLow' || move.inputCommand.button === 'heavyLow') expect(active.frontAnkle.x).toBeGreaterThan(ready.frontAnkle.x + 35);
      else expect(active.frontHand.x).toBeGreaterThan(ready.frontHand.x + 30);
      expect(recovered).toEqual(ready);
    }
  });
});
