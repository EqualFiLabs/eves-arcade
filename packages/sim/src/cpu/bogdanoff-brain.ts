/**
 * BogdanoffBossBrain — the local CPU decision maker for the V1 boss.
 *
 * Pure TypeScript, deterministic for a given seed. Decides a {@link CombatInput}
 * each step from: distance to Sminem, current fighter states, health, meter,
 * block frequency, recent whiffs, and seeded variation (Req 8.1, 9.1–9.7).
 *
 * Legality (Property 9): the brain self-checks {@link canControl} and only ever
 * emits inputs that the engine will accept; the engine re-checks every rule
 * (stun, blockstun, KO, recovery, move restrictions) regardless, so a CPU input
 * can never bypass combat legality (Req 9.6).
 *
 * Reaction lag: the brain commits to a decision and holds it for
 * `profile.reactionFrames` ticks before re-evaluating. This deliberately makes
 * Bogdanoff beatable by a first-time player (Req 8.9) while still dangerous
 * (Req 8.10).
 */
import type { CombatInput } from '../input/combat-input';
import type { InputDirection } from '../input/combat-input';
import type { FighterState } from '../state/fighter';
import type { GameState } from '../state/game';
import { NEUTRAL_INPUT } from '../input/combat-input';
import { canControl } from '../combat/movement';
import {
  CPU_CLOSE_RANGE,
  CPU_PASSIVE_BLOCK_FRAMES,
  CPU_SPECIAL_RANGE,
} from '../constants';
import { SeededRandom } from './seeded-random';
import type { CpuController, CpuProfile } from './cpu-controller';

/** Which attack button the brain wants to press. */
type AttackButton = 'lightHigh' | 'lightLow' | 'heavyHigh' | 'heavyLow' | 'special' | 'super';

export class BogdanoffBossBrain implements CpuController {
  private readonly rng = new SeededRandom(0);
  private lastSeedKey = Number.NaN;
  private cooldown = 0;
  private heldInput: CombatInput = NEUTRAL_INPUT;
  private prevControllable = true;
  /** Consecutive frames the player has spent blocking (anti-passive-block, Req 9.4). */
  private playerBlockStreak = 0;

  decide(state: GameState, profile: CpuProfile): CombatInput {
    const cpu = state.cpu;

    // Legality self-check: a fighter that cannot act emits neutral. The engine
    // would discard our input anyway, but this keeps intent bookkeeping honest.
    if (!canControl(cpu)) {
      this.prevControllable = false;
      return NEUTRAL_INPUT;
    }

    this.maybeReseed(state, profile);

    // Force a fresh decision immediately after recovering from a locked state
    // (attack/stun/KO) so a stale held input never leaks through.
    if (!this.prevControllable) {
      this.cooldown = 0;
    }
    this.prevControllable = true;

    // Reaction lag: hold the committed input until the cooldown expires.
    if (this.cooldown > 0) {
      this.cooldown--;
      return this.heldInput;
    }

    this.updateTracking(state.player);
    this.heldInput = this.chooseDecision(state, profile);
    this.cooldown = Math.max(0, Math.floor(profile.reactionFrames));
    return this.heldInput;
  }

  reset(seed: number): void {
    this.rng.reseed(seed);
    this.lastSeedKey = seed;
    this.cooldown = 0;
    this.heldInput = NEUTRAL_INPUT;
    this.prevControllable = true;
    this.playerBlockStreak = 0;
  }

  /** Reseeds deterministically when the match seed or profile offset changes. */
  private maybeReseed(state: GameState, profile: CpuProfile): void {
    const seedKey = state.seed + profile.randomSeedOffset;
    if (seedKey !== this.lastSeedKey) {
      this.rng.reseed(seedKey);
      this.lastSeedKey = seedKey;
      this.cooldown = 0;
      this.playerBlockStreak = 0;
    }
  }

  /** Tracks passive-blocking duration for the anti-block pressure rule. */
  private updateTracking(player: FighterState): void {
    const blocking = player.currentState === 'block' || player.runtimeFlags.blocking;
    this.playerBlockStreak = blocking ? this.playerBlockStreak + 1 : 0;
  }

  private chooseDecision(state: GameState, profile: CpuProfile): CombatInput {
    const player = state.player;
    const cpu = state.cpu;
    const dist = Math.abs(player.position.x - cpu.position.x);
    const rng = this.rng;

    // 1. Whiff punish — the player is in attack recovery and missed (Req 9.5).
    if (this.playerWhiffing(player, cpu) && rng.chance(profile.punishChance)) {
      if (dist <= CPU_CLOSE_RANGE + 24) {
        return this.attack('heavyHigh');
      }
      return this.move(this.towardPlayer(state));
    }

    // 2. Anti-passive-block — pressure repeated blocking (Req 9.4). The boss
    //    super is unblockable (blockable: false), making it the natural counter.
    if (this.playerBlockStreak >= CPU_PASSIVE_BLOCK_FRAMES && rng.chance(profile.throwPressureChance)) {
      return this.attack('super');
    }

    // 3. Close range — attack, block, special, or retreat (Req 9.3).
    if (dist <= CPU_CLOSE_RANGE) {
      if (this.playerThreatening(player) && rng.chance(profile.blockChance)) {
        return this.blockInput();
      }
      if (rng.chance(profile.aggression)) {
        // Favor the faster lights; heavies are riskier (longer recovery). Mix
        // high/low so the player can't hold one defensive answer.
        const heavy = rng.chance(0.4);
        const high = rng.chance(0.5);
        return this.attack(heavy ? (high ? 'heavyHigh' : 'heavyLow') : high ? 'lightHigh' : 'lightLow');
      }
      if (rng.chance(profile.specialChance)) {
        return this.attack('special');
      }
      if (rng.chance(0.15)) {
        return this.move(-this.towardPlayer(state) as InputDirection);
      }
      return rng.chance(0.3) ? this.blockInput() : NEUTRAL_INPUT;
    }

    // 4. Special band — use a ranged action when reachable (Req 9.2).
    if (dist <= CPU_SPECIAL_RANGE && rng.chance(profile.specialChance)) {
      return this.attack('special');
    }

    // 5. Far range — close the distance (Req 9.2, default approach).
    return this.move(this.towardPlayer(state));
  }

  /** True while the player is in an attack's startup/active window. */
  private playerThreatening(player: FighterState): boolean {
    return (
      player.currentState === 'attack' &&
      player.currentMove !== null &&
      (player.currentMove.phase === 'startup' || player.currentMove.phase === 'active')
    );
  }

  /**
   * True when the player whiffed an attack near the CPU: the player is in
   * recovery of a strike and the CPU took neither damage nor blockstun from it.
   */
  private playerWhiffing(player: FighterState, cpu: FighterState): boolean {
    if (player.currentMove === null) return false;
    if (player.currentMove.phase !== 'recovery') return false;
    if (player.currentState !== 'attack') return false;
    // If the CPU is in hitstun or blockstun, the player's move connected.
    if (cpu.stunFramesRemaining > 0 || cpu.blockstunFramesRemaining > 0) return false;
    if (cpu.currentState === 'hitstun' || cpu.currentState === 'blockstun') return false;
    return true;
  }

  /** World-space direction toward the player (the CPU approaches along this). */
  private towardPlayer(state: GameState): InputDirection {
    return state.player.position.x < state.cpu.position.x ? -1 : 1;
  }

  private move(dir: InputDirection): CombatInput {
    return { ...NEUTRAL_INPUT, horizontal: dir };
  }

  private blockInput(): CombatInput {
    return { ...NEUTRAL_INPUT, block: true };
  }

  private attack(button: AttackButton): CombatInput {
    return { ...NEUTRAL_INPUT, [button]: true } as CombatInput;
  }
}
