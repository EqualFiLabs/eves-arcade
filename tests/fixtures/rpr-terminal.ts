import { TraceRecorder, type InputFrame, type InputSource } from '@rpr/controls';
import { NEUTRAL_INPUT, type CombatInput } from '@rpr/sim';
import {
  RPR_INPUT_DEFINITION,
  RPR_TRACE_LIMITS,
  RprMatch,
  deriveRprCanonicalResult,
  type RprInputButton,
  type RprCanonicalResult,
} from '@rpr/rug-pull-rumble-core';

type RprButton = RprInputButton;

export interface TerminalRprFixture {
  trace: Uint8Array;
  canonical: RprCanonicalResult;
}

const fixtures = new Map<number, Promise<TerminalRprFixture>>();

/** Produces a real trace by driving the same core match used by web and API. */
export function terminalRprFixture(seed: number): Promise<TerminalRprFixture> {
  let fixture = fixtures.get(seed);
  if (!fixture) {
    fixture = buildFixture(seed);
    fixtures.set(seed, fixture);
  }
  return fixture;
}

async function buildFixture(seed: number): Promise<TerminalRprFixture> {
  const match = new RprMatch(seed);
  const recorder = new TraceRecorder<RprButton>(RPR_INPUT_DEFINITION, RPR_TRACE_LIMITS);
  let frame = 0;
  const source: InputSource<RprButton> = {
    available: true,
    read: () => inputFrame(scriptedInput(frame++)),
  };
  const recorded = recorder.wrap(source);

  while (match.state.status === 'active' && frame < 6_000) {
    const input = scriptedInput(frame);
    recorded.read();
    match.step(input);
  }
  if (match.state.status === 'active') throw new Error('Terminal RPR fixture exceeded frame budget');

  return {
    trace: recorder.pack(),
    canonical: await deriveRprCanonicalResult(match.state),
  };
}

function scriptedInput(frame: number): CombatInput {
  if (frame < 30) return { ...NEUTRAL_INPUT, horizontal: 1 };
  const phase = (frame - 30) % 15;
  if (phase < 5) return { ...NEUTRAL_INPUT, lightHigh: true };
  if (phase < 10) return { ...NEUTRAL_INPUT, heavyHigh: true };
  return { ...NEUTRAL_INPUT, block: true };
}

function inputFrame(input: CombatInput): InputFrame<RprButton> {
  return {
    buttons: {
      left: input.horizontal === -1,
      right: input.horizontal === 1,
      up: input.vertical === -1,
      down: input.vertical === 1,
      block: input.block,
      lightHigh: input.lightHigh,
      lightLow: input.lightLow,
      heavyHigh: input.heavyHigh,
      heavyLow: input.heavyLow,
      special: input.special,
      super: input.super,
    },
    axes: {},
  };
}
