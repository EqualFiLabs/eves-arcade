/**
 * Canonical Rug Pull Rumble game core.
 *
 * Pure TypeScript: no Phaser, DOM, wall-clock, or application-layer imports.
 * A game-version bump is required whenever these rules, trace semantics,
 * terminal serialization, or canonical result derivation change.
 */
import {
  BogdanoffBossBrain,
  CombatEngine,
  SIM_STEP_MS,
  serializeGameState,
  type CombatInput,
  type GameState,
  type StepResult,
} from '@rpr/sim';
import {
  bogdanoffCpuProfile,
  createV1FightState,
  v1FighterDefinitions,
  v1Moves,
} from '@rpr/content';
import {
  sha256HexBytes,
  decodeTrace,
  type CanonicalGameResult,
  type TraceFrame,
} from '@rpr/protocol';
import {
  RPR_INPUT_DEFINITION,
  RPR_RESULT_SCHEMA,
  RPR_TRACE_LIMITS,
  type RprInputButton,
} from './identity';
export {
  RPR_CONTRACT,
  RPR_GAME_ID,
  RPR_GAME_VERSION,
  RPR_INPUT_BUTTONS,
  RPR_INPUT_DEFINITION,
  RPR_INPUT_SCHEMA,
  RPR_MAX_TRACE_FRAMES,
  RPR_RESULT_SCHEMA,
  RPR_TRACE_ENCODING_VERSION,
  RPR_TRACE_LIMITS,
} from './identity';
export type { RprInputButton } from './identity';

export const RPR_TRACE_BUTTON_COUNT = 11;
export const RPR_TRACE_AXIS_COUNT = 0;

export interface RprMetrics {
  [key: string]: number;
  score: number;
  damageDealt: number;
  damageTaken: number;
  frames: number;
}

export interface RprCanonicalResult extends CanonicalGameResult {
  schema: typeof RPR_RESULT_SCHEMA;
  outcome: 'win' | 'loss';
  metrics: RprMetrics;
  durationMs: number;
  replayHash: string;
}

export interface DecodedRprTrace {
  version: number;
  inputs: readonly CombatInput[];
}

export type RprReplayErrorCode = 'incomplete-trace' | 'trailing-input';

export class RprReplayError extends Error {
  constructor(readonly code: RprReplayErrorCode, message: string) {
    super(message);
    this.name = 'RprReplayError';
  }
}

/** Owns the exact engine, content, and deterministic CPU wiring for RPR V1. */
export class RprMatch {
  private readonly engine: CombatEngine;
  private readonly brain = new BogdanoffBossBrain();

  constructor(seed: number) {
    this.engine = new CombatEngine({
      createInitialState: createV1FightState,
      definitions: v1FighterDefinitions,
      moves: v1Moves,
      seed,
    });
  }

  get state(): GameState {
    return this.engine.state;
  }

  step(playerInput: CombatInput): StepResult {
    const cpuInput = this.brain.decide(this.engine.state, bogdanoffCpuProfile);
    return this.engine.step(playerInput, cpuInput);
  }
}

/** Decodes the schema-locked Trace V2 payload into canonical RPR inputs. */
export function decodeRprTrace(bytes: Uint8Array, maxFrames: number): DecodedRprTrace {
  const decoded = decodeTrace(bytes, RPR_INPUT_DEFINITION, {
    minFrames: 1,
    maxFrames,
    maxBytes: Math.min(
      RPR_TRACE_LIMITS.maxBytes,
      5 + maxFrames * Math.ceil(RPR_INPUT_DEFINITION.buttons.length / 8),
    ),
  });
  return {
    version: decoded.version,
    inputs: decoded.frames.map(decodeRprTraceFrame),
  };
}

/** Serializes only a completed RPR state using the game-version compatibility format. */
export function serializeRprTerminalState(state: GameState): string {
  assertTerminal(state);
  return serializeGameState(state);
}

/** Derives every canonical ranked result field owned by the game rules. */
export async function deriveRprCanonicalResult(state: GameState): Promise<RprCanonicalResult> {
  const serialized = serializeRprTerminalState(state);
  const won = state.status === 'player_win';
  const damageDealt = Math.max(0, state.cpu.maxHealth - state.cpu.health);
  const damageTaken = Math.max(0, state.player.maxHealth - state.player.health);
  return {
    schema: RPR_RESULT_SCHEMA,
    outcome: won ? 'win' : 'loss',
    metrics: {
      score: won
        ? 1000 + Math.floor((state.player.health / state.player.maxHealth) * 500)
        : damageDealt * 5,
      damageDealt,
      damageTaken,
      frames: state.frame,
    },
    durationMs: Math.round(state.frame * SIM_STEP_MS),
    replayHash: await sha256HexBytes(new TextEncoder().encode(serialized)),
  };
}

/** Replays exactly one canonical input per frame and requires exact terminal exhaustion. */
export async function replayRprInputs(
  seed: number,
  inputs: readonly CombatInput[],
): Promise<RprCanonicalResult> {
  const match = new RprMatch(seed);
  for (const input of inputs) {
    if (match.state.status !== 'active') {
      throw new RprReplayError('trailing-input', 'RPR trace contains input after the terminal frame');
    }
    match.step(input);
  }
  if (match.state.status === 'active') {
    throw new RprReplayError('incomplete-trace', 'RPR trace ended before the match was terminal');
  }
  return deriveRprCanonicalResult(match.state);
}

function assertTerminal(state: GameState): void {
  if (state.status !== 'player_win' && state.status !== 'cpu_win') {
    throw new RprReplayError('incomplete-trace', 'RPR canonical results require a terminal state');
  }
}

function decodeRprTraceFrame(frame: TraceFrame<RprInputButton, never>): CombatInput {
  const button = (name: RprInputButton): boolean => frame.buttons[name] ?? false;
  return {
    horizontal: ((button('right') ? 1 : 0) - (button('left') ? 1 : 0)) as CombatInput['horizontal'],
    vertical: ((button('down') ? 1 : 0) - (button('up') ? 1 : 0)) as CombatInput['vertical'],
    block: button('block'),
    lightHigh: button('lightHigh'),
    lightLow: button('lightLow'),
    heavyHigh: button('heavyHigh'),
    heavyLow: button('heavyLow'),
    special: button('special'),
    super: button('super'),
  };
}
