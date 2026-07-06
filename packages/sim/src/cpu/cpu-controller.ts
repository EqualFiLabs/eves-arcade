/**
 * CPU controller contract and profile schema.
 *
 * The CPU is a local decision maker (no backend, Req 9.1). It observes the
 * current {@link GameState} and produces a {@link CombatInput} that is fed into
 * the same `CombatEngine.step()` as player input — so legality is enforced by
 * the engine, not the brain (Property 9, Req 9.6).
 */
import type { CombatInput } from '../input/combat-input';
import type { GameState } from '../state/game';

/**
 * Tunable parameters shaping CPU behavior. All `*Chance`/`aggression` fields are
 * probabilities in [0, 1]. Tunable via content; difficulty changes these rather
 * than damage numbers (Req 9.8).
 */
export interface CpuProfile {
  id: string;
  /** Minimum frames between fresh CPU decisions; models reaction lag (Req 9.7). */
  reactionFrames: number;
  /** Probability of attacking when in range (Req 9.3). */
  aggression: number;
  /** Probability of blocking when pressured (Req 9.3). */
  blockChance: number;
  /** Probability of punishing an observed whiff (Req 9.5). */
  punishChance: number;
  /** Probability of pressuring repeated blocking (Req 9.4). */
  throwPressureChance: number;
  /** Probability of using a special/ranged action (Req 9.2). */
  specialChance: number;
  /** Offset mixed into the RNG seed so profiles vary independently. */
  randomSeedOffset: number;
}

/**
 * Produces a single step's CPU input from the current state. Implementations
 * are expected to be deterministic for a given seed (Property: deterministic sim).
 */
export interface CpuController {
  decide(state: GameState, profile: CpuProfile): CombatInput;

  /** Re-initializes internal randomness/tracking for a new round (seed-based). */
  reset(seed: number): void;
}
