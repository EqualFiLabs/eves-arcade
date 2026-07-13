/**
 * Rug Pull Rumble replay verification (Req 10.1–10.5).
 *
 * Imports `@rpr/sim` + `@rpr/content` to re-run the fight headlessly from
 * `(seed, trace)`. The server calls this after receiving a ranked submission;
 * the recomputed terminal state must match the client's claimed `replayHash`.
 *
 * This is the load-bearing wall of the trust model: the client is never the
 * authority on a ranked score (Property 4, Req 9.7).
 */
import {
  type CombatInput,
  type InputDirection,
  BogdanoffBossBrain,
  CombatEngine,
  SIM_STEP_MS,
  serializeGameState,
} from '@rpr/sim';
import {
  bogdanoffCpuProfile,
  bogdanoffDefinition,
  createV1FightState,
  sminemDefinition,
  v1Moves,
} from '@rpr/content';
import { unpackTrace, type DecodedTraceFrame } from '@rpr/protocol';
import { sha256HexBytes } from '@rpr/protocol';

export interface VerifyResult {
  /** SHA-256 of the recomputed terminal-state serialization. */
  replayHash: string;
  outcome: 'win' | 'loss';
  score: number;
  stats: {
    damageDealt: number;
    damageTaken: number;
    frames: number;
  };
  durationMs: number;
}

/**
 * Button key order in the packed trace, determined by the RPR bindings
 * (RPR_KEYBOARD_BINDINGS key order, which all sources share):
 *   0:left  1:right  2:up  3:down  4:block  5:lightHigh  6:lightLow
 *   7:heavyHigh  8:heavyLow  9:special  10:super  11:start  12:mute
 */
function decodeFrame(frame: DecodedTraceFrame): CombatInput {
  const b = (i: number): boolean => frame.buttons[`b${i}`] ?? false;
  const h: InputDirection = (b(1) ? 1 : 0) - (b(0) ? 1 : 0) as InputDirection;
  const v: InputDirection = (b(3) ? 1 : 0) - (b(2) ? 1 : 0) as InputDirection;
  return {
    horizontal: h,
    vertical: v,
    block: b(4),
    lightHigh: b(5),
    lightLow: b(6),
    heavyHigh: b(7),
    heavyLow: b(8),
    special: b(9),
    super: b(10),
  };
}

/**
 * Replays `(seed, trace)` through the RPR sim and returns the recomputed result.
 *
 * @param seed The session seed from the ticket.
 * @param packedTrace The raw packed trace bytes from the submission.
 * @returns The recomputed terminal state hash, status, frames, and score.
 */
export async function verifyRpr(
  seed: number,
  packedTrace: Uint8Array,
  maxFrames = 18_000,
): Promise<VerifyResult> {
  const decoded = unpackTrace(packedTrace, {
    maxFrames,
    maxButtons: 13,
    maxAxes: 0,
  });

  const engine = new CombatEngine({
    createInitialState: (s) => createV1FightState(s),
    definitions: [sminemDefinition, bogdanoffDefinition],
    moves: v1Moves,
    seed,
  });
  const brain = new BogdanoffBossBrain();

  for (const frame of decoded.frames) {
    if (engine.state.status !== 'active') break;
    const playerInput = decodeFrame(frame);
    const cpuInput = brain.decide(engine.state, bogdanoffCpuProfile);
    engine.step(playerInput, cpuInput);
  }

  const s = engine.state;
  const won = s.status === 'player_win';
  const damageDealt = Math.max(0, s.cpu.maxHealth - s.cpu.health);
  const damageTaken = Math.max(0, s.player.maxHealth - s.player.health);
  const score = won
    ? 1000 + Math.floor((s.player.health / s.player.maxHealth) * 500)
    : damageDealt * 5;

  const serialized = serializeGameState(s);
  return {
    replayHash: await sha256HexBytes(new TextEncoder().encode(serialized)),
    outcome: won ? 'win' : 'loss',
    score,
    stats: { damageDealt, damageTaken, frames: s.frame },
    durationMs: Math.round(s.frame * SIM_STEP_MS),
  };
}
