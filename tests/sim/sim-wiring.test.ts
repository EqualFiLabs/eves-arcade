import { describe, expect, it } from 'vitest';
import { MAX_STEPS_PER_FRAME, SIM_FPS, SIM_STEP_MS, SIM_VERSION } from '@rpr/sim';

/**
 * Workspace wiring + fixed-step constants.
 *
 * Not a synthetic stub: it imports the real @rpr/sim package to prove the pnpm
 * workspace resolves and the deterministic-step constants are correct (Req 15.3).
 */
describe('sim package wiring', () => {
  it('runs the simulation at a fixed 60 Hz', () => {
    expect(SIM_FPS).toBe(60);
    expect(SIM_STEP_MS).toBeCloseTo(1000 / 60, 10);
  });

  it('caps fixed steps per render frame to avoid spiral-of-death after a stall', () => {
    expect(MAX_STEPS_PER_FRAME).toBeGreaterThan(0);
    expect(MAX_STEPS_PER_FRAME).toBeLessThanOrEqual(10);
  });

  it('exports a version string', () => {
    expect(typeof SIM_VERSION).toBe('string');
    expect(SIM_VERSION.length).toBeGreaterThan(0);
  });
});
