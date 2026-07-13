import { describe, expect, it } from 'vitest';
import { createV1FightState } from '@rpr/content';
import { encodeTrace } from '@rpr/protocol';
import {
  RPR_INPUT_DEFINITION,
  RPR_TRACE_LIMITS,
  RprMatch,
  RprReplayError,
  decodeRprTrace,
  deriveRprCanonicalResult,
  replayRprInputs,
  serializeRprTerminalState,
} from '@rpr/rug-pull-rumble-core';
import { terminalRprFixture } from '../fixtures/rpr-terminal';

const FIXTURE_SEED = 12345;

describe('canonical RPR core', () => {
  it('produces one canonical result for live stepping, packed replay, and API replay', async () => {
    const fixture = await terminalRprFixture(FIXTURE_SEED);
    const decoded = decodeRprTrace(fixture.trace, 6_000);
    const match = new RprMatch(FIXTURE_SEED);
    for (const input of decoded.inputs) match.step(input);

    const liveResult = await deriveRprCanonicalResult(match.state);
    const replayResult = await replayRprInputs(FIXTURE_SEED, decoded.inputs);
    expect(liveResult).toEqual(fixture.canonical);
    expect(replayResult).toEqual(fixture.canonical);
  });

  it('pins the canonical terminal representation and complete result fixture', async () => {
    const fixture = await terminalRprFixture(FIXTURE_SEED);
    expect(fixture.canonical).toMatchInlineSnapshot(`
      {
        "durationMs": 11283,
        "metrics": {
          "damageDealt": 111,
          "damageTaken": 100,
          "frames": 677,
          "score": 555,
        },
        "outcome": "loss",
        "replayHash": "254078a57fb035a7bfefeff53e62ec9723115f311a033ef99b6e92025d03d7b4",
        "schema": {
          "id": "rpr.result",
          "version": 1,
        },
      }
    `);
  });

  it('maps the named RPR input schema into canonical combat input', () => {
    const trace = encodeTrace(RPR_INPUT_DEFINITION, [{
      buttons: {
        left: true,
        right: false,
        up: false,
        down: true,
        block: true,
        lightHigh: false,
        lightLow: true,
        heavyHigh: false,
        heavyLow: true,
        special: false,
        super: true,
      },
      axes: {},
    }], RPR_TRACE_LIMITS);
    const input = decodeRprTrace(trace, 1).inputs[0]!;
    expect(input).toEqual({
      horizontal: -1,
      vertical: 1,
      block: true,
      lightHigh: false,
      lightLow: true,
      heavyHigh: false,
      heavyLow: true,
      special: false,
      super: true,
    });
  });

  it('rejects legacy Trace V1 bytes', () => {
    const legacy = new Uint8Array(7);
    legacy[0] = 1;
    new DataView(legacy.buffer).setUint32(1, 1, false);
    expect(() => decodeRprTrace(legacy, 1)).toThrow(/unsupported trace encoding version/i);
  });

  it('rejects canonical result derivation from an active state', async () => {
    await expect(deriveRprCanonicalResult(createV1FightState(FIXTURE_SEED)))
      .rejects.toMatchObject({ code: 'incomplete-trace' });
  });

  it('derives win and loss rules from terminal state through one function', async () => {
    const win = createV1FightState(1);
    win.status = 'player_win';
    win.frame = 120;
    win.player.health = Math.floor(win.player.maxHealth / 2);
    win.cpu.health = 0;
    const winResult = await deriveRprCanonicalResult(win);
    expect(winResult).toMatchObject({
      outcome: 'win',
      metrics: {
        score: 1000 + Math.floor((win.player.health / win.player.maxHealth) * 500),
        damageDealt: win.cpu.maxHealth,
        damageTaken: win.player.maxHealth - win.player.health,
        frames: 120,
      },
      durationMs: 2000,
    });

    const loss = createV1FightState(1);
    loss.status = 'cpu_win';
    loss.frame = 60;
    loss.player.health = 0;
    loss.cpu.health = loss.cpu.maxHealth - 25;
    const lossResult = await deriveRprCanonicalResult(loss);
    expect(lossResult).toMatchObject({
      outcome: 'loss',
      metrics: {
        score: 125,
        damageDealt: 25,
        damageTaken: loss.player.maxHealth,
        frames: 60,
      },
      durationMs: 1000,
    });
  });

  it('rejects inputs that end before or continue after the terminal frame', async () => {
    const fixture = await terminalRprFixture(FIXTURE_SEED);
    const inputs = decodeRprTrace(fixture.trace, 6_000).inputs;
    await expect(replayRprInputs(FIXTURE_SEED, inputs.slice(0, -1)))
      .rejects.toEqual(expect.objectContaining<RprReplayError>({ code: 'incomplete-trace' }));
    await expect(replayRprInputs(FIXTURE_SEED, [...inputs, inputs[inputs.length - 1]!]))
      .rejects.toEqual(expect.objectContaining<RprReplayError>({ code: 'trailing-input' }));
  });

  it('keeps terminal serialization stable and seed-sensitive', async () => {
    const first = await terminalRprFixture(FIXTURE_SEED);
    const repeated = await terminalRprFixture(FIXTURE_SEED);
    const otherSeed = await terminalRprFixture(FIXTURE_SEED + 1);
    expect(first.canonical.replayHash).toBe(repeated.canonical.replayHash);
    expect(first.canonical.replayHash).not.toBe(otherSeed.canonical.replayHash);

    const state = createV1FightState(3);
    state.status = 'cpu_win';
    expect(serializeRprTerminalState(state)).toBe(serializeRprTerminalState(state));
  });
});
