import { describe, expect, it } from 'vitest';
import { CombatEngine, NEUTRAL_INPUT, type CombatEvent, type CombatInput } from '@rpr/sim';
import {
  createV1FightState,
  sminemDefinition,
  bogdanoffDefinition,
  v1Moves,
} from '@rpr/content';

const LIGHT: CombatInput = { ...NEUTRAL_INPUT, light: true };
const HEAVY: CombatInput = { ...NEUTRAL_INPUT, heavy: true };
const SPECIAL: CombatInput = { ...NEUTRAL_INPUT, special: true };
const BLOCK: CombatInput = { ...NEUTRAL_INPUT, block: true };
const NEUTRAL: CombatInput = NEUTRAL_INPUT;

function makeEngine(): CombatEngine {
  return new CombatEngine({
    createInitialState: (s) => createV1FightState(s),
    definitions: [sminemDefinition, bogdanoffDefinition],
    moves: v1Moves,
    seed: 0,
  });
}

/**
 * Places the fighters at pushbox-touching distance so Sminem's hitboxes reach
 * Bogdanoff's hurtbox (player.x = 153.6, cpu.x = 217.6, both grounded).
 */
function placeAdjacent(engine: CombatEngine): void {
  engine.state.player.position.x = 153.6;
  engine.state.cpu.position.x = 217.6;
  engine.state.player.position.y = engine.state.stage.floorY;
  engine.state.cpu.position.y = engine.state.stage.floorY;
  engine.state.player.velocity.x = 0;
  engine.state.cpu.velocity.x = 0;
}

function runSteps(
  engine: CombatEngine,
  playerInput: CombatInput,
  cpuInput: CombatInput,
  steps: number,
): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < steps; i++) {
    events.push(...engine.step(playerInput, cpuInput).events);
  }
  return events;
}

const findHit = (events: CombatEvent[]) => events.find((e): e is Extract<CombatEvent, { type: 'hit' }> => e.type === 'hit');
const findBlock = (events: CombatEvent[]) => events.find((e): e is Extract<CombatEvent, { type: 'block' }> => e.type === 'block');
const findMoveStarted = (events: CombatEvent[]) => events.find((e): e is Extract<CombatEvent, { type: 'move_started' }> => e.type === 'move_started');
const findRoundEnded = (events: CombatEvent[]) => events.find((e): e is Extract<CombatEvent, { type: 'round_ended' }> => e.type === 'round_ended');

describe('move resolution (6.1)', () => {
  it('emits a MoveStartedEvent when a move begins', () => {
    const e = makeEngine();
    placeAdjacent(e);
    const events = runSteps(e, LIGHT, NEUTRAL, 1);
    const started = findMoveStarted(events);
    expect(started).toBeTruthy();
    expect(String(started!.moveId)).toBe('sminem_light');
  });

  it('a whiffed move completes and returns the fighter to idle with no hit', () => {
    const e = makeEngine(); // default positions: fighters far apart
    const maxHealth = e.state.cpu.health;
    e.step(LIGHT, NEUTRAL); // start the move
    const events = runSteps(e, NEUTRAL, NEUTRAL, 20); // let it finish, no re-trigger
    expect(findHit(events)).toBeUndefined();
    expect(e.state.cpu.health).toBe(maxHealth);
    expect(e.state.player.currentState).toBe('idle');
  });
});

describe('hit detection and damage (6.2, 6.3, 6.5)', () => {
  it('applies damage and hitstun when an active hitbox overlaps a hurtbox', () => {
    const e = makeEngine();
    placeAdjacent(e);
    const maxHealth = e.state.cpu.health;
    const events = runSteps(e, LIGHT, NEUTRAL, 12);
    const hit = findHit(events);
    expect(hit).toBeTruthy();
    expect(hit!.damage).toBe(4); // sminem_light
    expect(e.state.cpu.health).toBe(maxHealth - 4);
    expect(e.state.cpu.currentState).toBe('hitstun');
    expect(e.state.cpu.stunFramesRemaining).toBeGreaterThan(0);
  });

  it('applies hitstop to both attacker and defender on hit', () => {
    const e = makeEngine();
    placeAdjacent(e);
    runSteps(e, LIGHT, NEUTRAL, 6); // light startup=5, connects on frame 5
    expect(e.state.player.hitstopFramesRemaining).toBeGreaterThan(0);
    expect(e.state.cpu.hitstopFramesRemaining).toBeGreaterThan(0);
  });

  it('a special move connects with its own damage value', () => {
    const e = makeEngine();
    placeAdjacent(e);
    const maxHealth = e.state.cpu.health;
    const events = runSteps(e, SPECIAL, NEUTRAL, 16); // green_candle startup=13
    const hit = findHit(events);
    expect(hit).toBeTruthy();
    expect(hit!.damage).toBe(9);
    expect(e.state.cpu.health).toBe(maxHealth - 9);
  });
});

describe('one-hit-per-move (6.6)', () => {
  it('a single move execution damages the defender exactly once across active frames', () => {
    const e = makeEngine();
    placeAdjacent(e);
    const maxHealth = e.state.cpu.health;
    e.step(LIGHT, NEUTRAL); // start
    const events = runSteps(e, NEUTRAL, NEUTRAL, 8); // covers active frames 5,6,7
    const hits = events.filter((ev) => ev.type === 'hit');
    expect(hits.length).toBe(1);
    expect(e.state.cpu.health).toBe(maxHealth - 4);
  });
});

describe('block detection (6.4)', () => {
  it('a blockable attack into a block stance deals chip damage and blockstun, not a clean hit', () => {
    const e = makeEngine();
    placeAdjacent(e);
    const maxHealth = e.state.cpu.health;
    const events = runSteps(e, HEAVY, BLOCK, 16); // sminem_heavy startup=11, chip=1
    const block = findBlock(events);
    const hit = findHit(events);
    expect(block).toBeTruthy();
    expect(hit).toBeUndefined();
    expect(block!.chipDamage).toBe(1);
    expect(e.state.cpu.health).toBe(maxHealth - 1); // chip only
    expect(e.state.cpu.currentState).toBe('blockstun');
    expect(e.state.cpu.blockstunFramesRemaining).toBeGreaterThan(0);
  });
});

describe('health clamping (6.7)', () => {
  it('clamps health at zero instead of going negative', () => {
    const e = makeEngine();
    placeAdjacent(e);
    e.state.cpu.health = 3; // heavy damage 11 would otherwise drive it to -8
    runSteps(e, HEAVY, NEUTRAL, 14);
    expect(e.state.cpu.health).toBe(0);
  });
});

describe('KO / round finality (6.8)', () => {
  it('ends the round, flags the loser, and freezes further input', () => {
    const e = makeEngine();
    placeAdjacent(e);
    e.state.cpu.health = 4; // one light hit (damage 4) is lethal
    const events = runSteps(e, LIGHT, NEUTRAL, 10);
    const end = findRoundEnded(events);
    expect(end).toBeTruthy();
    expect(String(end!.winner)).toBe('player');
    expect(String(end!.loser)).toBe('cpu');
    expect(e.state.status).toBe('player_win');
    expect(e.state.cpu.hasLost).toBe(true);
    expect(e.state.cpu.currentState).toBe('ko');

    // After KO, combat input is refused and the frame counter is frozen.
    const frameAfterKo = e.state.frame;
    e.step(LIGHT, NEUTRAL);
    expect(e.state.frame).toBe(frameAfterKo);
  });

  it('declares a CPU win when the player is KO’d', () => {
    const e = makeEngine();
    placeAdjacent(e);
    e.state.player.health = 1;
    // CPU strikes with its backhand (light slot, damage 6) — lethal at 1 hp.
    const events = runSteps(e, NEUTRAL, LIGHT, 12); // bogdanoff_backhand startup=7
    const end = findRoundEnded(events);
    expect(end).toBeTruthy();
    expect(e.state.status).toBe('cpu_win');
    expect(e.state.player.hasLost).toBe(true);
  });
});

describe('invalid-action guards during combat (6.6/Property 4)', () => {
  it('does not allow a fighter in hitstun to start a move', () => {
    const e = makeEngine();
    placeAdjacent(e);
    // Land a hit on the CPU, then try to attack while it is stunned.
    runSteps(e, LIGHT, NEUTRAL, 8);
    expect(e.state.cpu.currentState).toBe('hitstun');
    const healthBefore = e.state.cpu.health;
    runSteps(e, NEUTRAL, HEAVY, 6); // CPU tries to heavy through hitstun
    // CPU could not start its move, so its health is unchanged and no cpu move_started.
    expect(e.state.cpu.health).toBe(healthBefore);
    expect(e.state.cpu.currentMove).toBeNull();
  });
});
