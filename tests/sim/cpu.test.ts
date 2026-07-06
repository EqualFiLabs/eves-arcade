import { describe, expect, it } from 'vitest';
import {
  type CombatInput,
  type CpuProfile,
  type GameState,
  type MoveRuntimeState,
  BogdanoffBossBrain,
  CombatEngine,
  NEUTRAL_INPUT,
  SeededRandom,
  CPU_CLOSE_RANGE,
  CPU_PASSIVE_BLOCK_FRAMES,
} from '@rpr/sim';
import {
  bogdanoffCpuProfile,
  bogdanoffDefinition,
  createV1FightState,
  sminemDefinition,
  v1Moves,
} from '@rpr/content';

/**
 * Task 9: BogdanoffBossBrain unit + integration tests.
 *
 * Real flows are preferred (Test Fidelity Guardrails). The integration test
 * drives the actual CombatEngine with the brain; the unit tests construct
 * focused scenarios by mutating a real V1 GameState (narrow synthetic shortcut:
 * direct field mutation to stage a specific frame, since the brain only reads
 * state and never observes how it was produced).
 */

const PROFILE: CpuProfile = { ...bogdanoffCpuProfile };
const FRESH: CpuProfile = { ...PROFILE, reactionFrames: 0 };
const DETERMINISTIC: CpuProfile = { ...PROFILE, reactionFrames: 0 };

function makeState(seed = 0): GameState {
  // Structural clone so mutation never leaks across tests.
  return createV1FightState(seed);
}

/** Builds a player attack runtime state in the given phase. */
function playerMove(phase: MoveRuntimeState['phase']): MoveRuntimeState {
  return { moveId: 'sminem_heavy' as never, elapsedFrames: 5, phase, hitTargets: [], spentMeter: false };
}

describe('BogdanoffBossBrain — approach (Req 9.2)', () => {
  it('walks toward the player when far away', () => {
    const brain = new BogdanoffBossBrain();
    const state = makeState();
    brain.reset(0);
    // Player is on the left, CPU on the right → CPU must move left (horizontal -1).
    const input = brain.decide(state, FRESH);
    expect(input.horizontal).toBe(-1);
  });

  it('flips approach direction when the player is on the right', () => {
    const brain = new BogdanoffBossBrain();
    const state = makeState();
    state.player.position.x = 300;
    state.cpu.position.x = -300;
    brain.reset(0);
    const input = brain.decide(state, FRESH);
    expect(input.horizontal).toBe(1);
  });

  it('closes distance when driving the engine (integration)', () => {
    const engine = new CombatEngine({
      createInitialState: (s) => createV1FightState(s),
      definitions: [sminemDefinition, bogdanoffDefinition],
      moves: v1Moves,
      seed: 1,
    });
    const brain = new BogdanoffBossBrain();
    const startDist = Math.abs(engine.state.player.position.x - engine.state.cpu.position.x);
    for (let i = 0; i < 600 && engine.state.status === 'active'; i++) {
      const cpuInput = brain.decide(engine.state, PROFILE);
      engine.step(NEUTRAL_INPUT, cpuInput);
    }
    const endDist = Math.abs(engine.state.player.position.x - engine.state.cpu.position.x);
    expect(endDist).toBeLessThan(startDist);
  });
});

describe('BogdanoffBossBrain — close-range attack (Req 9.3)', () => {
  it('attacks at close range under aggression', () => {
    const brain = new BogdanoffBossBrain();
    brain.reset(7);
    const state = makeState();
    // Place player just within close range of the CPU.
    state.cpu.position.x = 0;
    state.player.position.x = CPU_CLOSE_RANGE - 10;

    let attacked = false;
    for (let i = 0; i < 200; i++) {
      const input = brain.decide(state, FRESH);
      if (input.light || input.heavy || input.special) {
        attacked = true;
        break;
      }
    }
    expect(attacked).toBe(true);
  });

  it('blocks when the player is threatening and blockChance rolls hit', () => {
    const brain = new BogdanoffBossBrain();
    brain.reset(3);
    const state = makeState();
    state.cpu.position.x = 0;
    state.player.position.x = CPU_CLOSE_RANGE - 10;
    state.player.currentState = 'attack';
    state.player.currentMove = playerMove('startup');

    const alwaysBlock: CpuProfile = { ...FRESH, blockChance: 1, aggression: 0, specialChance: 0 };
    let blocked = false;
    for (let i = 0; i < 20; i++) {
      const input = brain.decide(state, alwaysBlock);
      if (input.block) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});

describe('BogdanoffBossBrain — whiff punish (Req 9.5)', () => {
  it('punishes a whiffed player attack in recovery with a heavy', () => {
    const brain = new BogdanoffBossBrain();
    brain.reset(11);
    const state = makeState();
    state.cpu.position.x = 0;
    state.player.position.x = CPU_CLOSE_RANGE - 10;
    state.player.currentState = 'attack';
    state.player.currentMove = playerMove('recovery');
    // CPU took no hitstun/blockstun → the player whiffed.

    const punisher: CpuProfile = { ...FRESH, punishChance: 1 };
    const input = brain.decide(state, punisher);
    expect(input.heavy).toBe(true);
  });

  it('does not punish when the CPU is still in hitstun (the move connected)', () => {
    const brain = new BogdanoffBossBrain();
    brain.reset(11);
    const state = makeState();
    state.cpu.position.x = 0;
    state.player.position.x = CPU_CLOSE_RANGE - 10;
    state.player.currentState = 'attack';
    state.player.currentMove = playerMove('recovery');
    state.cpu.currentState = 'hitstun';
    state.cpu.stunFramesRemaining = 10;

    const punisher: CpuProfile = { ...FRESH, punishChance: 1 };
    // CPU can't act at all while in hitstun → neutral (Property 9).
    const input = brain.decide(state, punisher);
    expect(input).toEqual(NEUTRAL_INPUT);
  });
});

describe('BogdanoffBossBrain — anti-passive-block (Req 9.4)', () => {
  it('pressures prolonged blocking with the unblockable super', () => {
    const brain = new BogdanoffBossBrain();
    brain.reset(5);
    const state = makeState();
    state.cpu.position.x = 0;
    state.player.position.x = CPU_CLOSE_RANGE - 10;
    state.player.currentState = 'block';
    state.player.runtimeFlags.blocking = true;

    const pressurer: CpuProfile = { ...FRESH, throwPressureChance: 1, aggression: 0, specialChance: 0 };

    let pressured = false;
    // Keep the player blocking long enough to cross the passive threshold.
    for (let i = 0; i < CPU_PASSIVE_BLOCK_FRAMES + 20; i++) {
      const input = brain.decide(state, pressurer);
      if (input.super) {
        pressured = true;
        break;
      }
    }
    expect(pressured).toBe(true);
  });
});

describe('BogdanoffBossBrain — variation (Req 9.7)', () => {
  it('produces different decision sequences for different match seeds', () => {
    const state = makeState();
    state.cpu.position.x = 0;
    state.player.position.x = CPU_CLOSE_RANGE - 10;

    // Variation is seeded by the match seed (state.seed); two different match
    // seeds yield different CPU behavior (Req 9.7), while the same seed is
    // reproducible (see determinism test below).
    const sample = (matchSeed: number): string => {
      const scenario = makeState(matchSeed);
      scenario.cpu.position.x = 0;
      scenario.player.position.x = CPU_CLOSE_RANGE - 10;
      const brain = new BogdanoffBossBrain();
      brain.reset(matchSeed);
      const labels: string[] = [];
      for (let i = 0; i < 40; i++) {
        const input = brain.decide(scenario, DETERMINISTIC);
        labels.push(
          input.super ? 'S' : input.special ? 'P' : input.heavy ? 'H' : input.light ? 'L' : input.block ? 'B' : input.horizontal !== 0 ? 'M' : '_',
        );
      }
      return labels.join('');
    };

    const a = sample(1);
    const b = sample(2);
    expect(a).not.toBe(b);
    void state;
  });

  it('is deterministic for the same seed (reproducible replays)', () => {
    const seedLabels = (matchSeed: number): string => {
      const state = makeState(matchSeed);
      state.cpu.position.x = 0;
      state.player.position.x = CPU_CLOSE_RANGE - 10;
      const brain = new BogdanoffBossBrain();
      brain.reset(matchSeed);
      let s = '';
      for (let i = 0; i < 30; i++) {
        const input = brain.decide(state, DETERMINISTIC);
        s += input.heavy ? 'H' : input.light ? 'L' : input.block ? 'B' : input.horizontal !== 0 ? 'M' : '_';
      }
      return s;
    };
    expect(seedLabels(42)).toBe(seedLabels(42));
  });
});

describe('BogdanoffBossBrain — legality (Req 9.6, Property 9)', () => {
  it('emits neutral while in hitstun, blockstun, attack, or KO', () => {
    const brain = new BogdanoffBossBrain();
    brain.reset(0);

    const cases: Array<{ state: Partial<GameState['cpu']>; name: string }> = [
      { state: { currentState: 'hitstun', stunFramesRemaining: 5 }, name: 'hitstun' },
      { state: { currentState: 'blockstun', blockstunFramesRemaining: 5 }, name: 'blockstun' },
      { state: { currentState: 'attack', currentMove: playerMove('active') }, name: 'attack' },
      { state: { currentState: 'ko', hasLost: true }, name: 'ko' },
      { state: { hitstopFramesRemaining: 3 }, name: 'hitstop' },
    ];

    for (const c of cases) {
      const state = makeState();
      Object.assign(state.cpu, c.state);
      const input = brain.decide(state, FRESH);
      expect(input).toEqual(NEUTRAL_INPUT);
    }
  });

  it('never bypasses engine legality across a full brain-driven fight', () => {
    const engine = new CombatEngine({
      createInitialState: (s) => createV1FightState(s),
      definitions: [sminemDefinition, bogdanoffDefinition],
      moves: v1Moves,
      seed: 9,
    });
    const brain = new BogdanoffBossBrain();
    const RIGHT: CombatInput = { ...NEUTRAL_INPUT, horizontal: 1 };
    const HEAVY: CombatInput = { ...NEUTRAL_INPUT, heavy: true };

    // Player actively engages: close distance, then trade blows. The brain
    // drives the CPU; the engine enforces legality on both sides (Property 9).
    let settled = false;
    for (let i = 0; i < 4000; i++) {
      const cpu = engine.state.cpu;
      if (engine.state.status !== 'active') {
        settled = true;
        break;
      }
      // Before stepping: if the CPU is non-controllable, the brain must emit
      // neutral — the legality contract (Req 9.6, Property 9).
      const dist = Math.abs(engine.state.player.position.x - engine.state.cpu.position.x);
      const cpuInput = brain.decide(engine.state, PROFILE);
      const controllable =
        !cpu.hasLost &&
        cpu.currentState !== 'ko' &&
        cpu.currentState !== 'attack' &&
        cpu.currentState !== 'hitstun' &&
        cpu.currentState !== 'blockstun' &&
        cpu.stunFramesRemaining <= 0 &&
        cpu.blockstunFramesRemaining <= 0 &&
        cpu.hitstopFramesRemaining <= 0;
      if (!controllable) {
        expect(cpuInput).toEqual(NEUTRAL_INPUT);
      }
      engine.step(dist > 70 ? RIGHT : HEAVY, cpuInput);

      // Health/meter bounds always hold (Property 8).
      expect(cpu.health).toBeGreaterThanOrEqual(0);
      expect(cpu.health).toBeLessThanOrEqual(cpu.maxHealth);
      expect(cpu.meter).toBeGreaterThanOrEqual(0);
      expect(cpu.meter).toBeLessThanOrEqual(cpu.maxMeter);
    }
    // The fight resolved without the CPU ever issuing an illegal input.
    expect(settled).toBe(true);
    expect(['player_win', 'cpu_win']).toContain(engine.state.status);
  });
});

describe('SeededRandom (CPU RNG primitive)', () => {
  it('is deterministic for a given seed and varies across seeds', () => {
    const a = new SeededRandom(123);
    const a2 = new SeededRandom(123);
    const b = new SeededRandom(124);
    const seq = (r: SeededRandom) => [r.next(), r.next(), r.int(0, 9)];
    expect(seq(a)).toEqual(seq(a2));
    expect(seq(a)).not.toEqual(seq(b));
  });

  it('keeps next() within [0, 1) and int() within range', () => {
    const r = new SeededRandom(999);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});
