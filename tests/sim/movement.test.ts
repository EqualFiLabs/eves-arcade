import { describe, expect, it } from 'vitest';
import {
  type CombatInput,
  CombatEngine,
  NEUTRAL_INPUT,
  createInitialFightState,
} from '@rpr/sim';
import {
  createV1FightState,
  sminemDefinition,
  bogdanoffDefinition,
  marketControlRoom,
  v1Moves,
} from '@rpr/content';

const RIGHT: CombatInput = { ...NEUTRAL_INPUT, horizontal: 1 };
const LEFT: CombatInput = { ...NEUTRAL_INPUT, horizontal: -1 };
const DOWN: CombatInput = { ...NEUTRAL_INPUT, vertical: 1 };
const UP: CombatInput = { ...NEUTRAL_INPUT, vertical: -1 };

function makeEngine(seed = 0): CombatEngine {
  return new CombatEngine({
    createInitialState: (s) => createV1FightState(s),
    definitions: [sminemDefinition, bogdanoffDefinition],
    moves: v1Moves,
    seed,
  });
}

/** Player pushbox x-extent (Sminem) for overlap checks. */
const pPush = sminemDefinition.pushbox;
const cPush = bogdanoffDefinition.pushbox;

describe('V1 fight initialization (5.2)', () => {
  it('spawns Sminem vs Bogdanoff on marketControlRoom, grounded and facing each other', () => {
    const e = makeEngine();
    const s = e.state;
    expect(String(s.player.definitionId)).toBe('sminem');
    expect(String(s.cpu.definitionId)).toBe('bogdanoff');
    expect(String(s.stage.stageId)).toBe('marketControlRoom');
    expect(s.player.position.x).toBeCloseTo(-217.6, 1);
    expect(s.cpu.position.x).toBeCloseTo(217.6, 1);
    expect(s.player.position.y).toBe(s.stage.floorY);
    expect(s.cpu.position.y).toBe(s.stage.floorY);
    expect(s.player.grounded && s.cpu.grounded).toBe(true);
    expect(s.player.facing).toBe('right');
    expect(s.cpu.facing).toBe('left');
    expect(s.player.health).toBe(s.player.maxHealth);
  });

  it('the generic factory also works with arbitrary definitions', () => {
    const s = createInitialFightState({
      playerDef: sminemDefinition,
      cpuDef: bogdanoffDefinition,
      stage: marketControlRoom,
      seed: 42,
    });
    expect(s.seed).toBe(42);
    expect(s.frame).toBe(0);
    expect(s.status).toBe('active');
  });
});

describe('fixed-step movement (5.3)', () => {
  it('walks forward at walkSpeed', () => {
    const e = makeEngine();
    const x0 = e.state.player.position.x;
    for (let i = 0; i < 5; i++) e.step(RIGHT, NEUTRAL_INPUT);
    expect(e.state.player.currentState).toBe('walk_forward');
    expect(e.state.player.position.x).toBeCloseTo(x0 + 5 * sminemDefinition.walkSpeed, 5);
  });

  it('walks backward at backWalkSpeed', () => {
    const e = makeEngine();
    const x0 = e.state.player.position.x;
    for (let i = 0; i < 5; i++) e.step(LEFT, NEUTRAL_INPUT);
    expect(e.state.player.currentState).toBe('walk_backward');
    expect(e.state.player.position.x).toBeCloseTo(x0 - 5 * sminemDefinition.backWalkSpeed, 5);
  });

  it('crouches and stops horizontal movement', () => {
    const e = makeEngine();
    const x0 = e.state.player.position.x;
    e.step(DOWN, NEUTRAL_INPUT);
    expect(e.state.player.currentState).toBe('crouch');
    expect(e.state.player.position.x).toBe(x0);
  });

  it('jumps: leaves the floor then lands back on it', () => {
    const e = makeEngine();
    const floor = e.state.stage.floorY;
    e.step(UP, NEUTRAL_INPUT); // launch
    expect(e.state.player.grounded).toBe(false);
    expect(e.state.player.currentState).toBe('jump');
    expect(e.state.player.position.y).toBeLessThan(floor); // ~585.8

    // Release jump and let gravity bring the fighter back down.
    for (let i = 0; i < 50; i++) e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    expect(e.state.player.grounded).toBe(true);
    expect(e.state.player.position.y).toBe(floor);
    expect(e.state.player.currentState).toBe('idle');
  });

  it('does not re-jump while already airborne', () => {
    const e = makeEngine();
    e.step(UP, NEUTRAL_INPUT);
    const yAfterLaunch = e.state.player.position.y;
    e.step(UP, NEUTRAL_INPUT); // still airborne, up input must not launch again
    expect(e.state.player.position.y).toBeLessThan(yAfterLaunch); // continues upward only via gravity
  });

  it('double-jumps on a fresh up press in the air, gaining extra height', () => {
    const e = makeEngine();
    // Ground jump.
    e.step(UP, NEUTRAL_INPUT);
    expect(e.state.player.airJumpsUsed).toBe(0);

    // Hold up through the rise: edge-detect must NOT burn the air jump.
    for (let i = 0; i < 4; i++) e.step(UP, NEUTRAL_INPUT);
    expect(e.state.player.airJumpsUsed).toBe(0);

    // Release up (arm the air jump), then re-press for the double jump.
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    const yBeforeAirJump = e.state.player.position.y;
    e.step(UP, NEUTRAL_INPUT);
    expect(e.state.player.airJumpsUsed).toBe(1);
    // An air jump sets a fresh upward velocity, so y decreases next step.
    expect(e.state.player.position.y).toBeLessThan(yBeforeAirJump);
    expect(e.state.player.currentState).toBe('jump');
  });

  it('does not allow a third jump when maxAirJumps is 1', () => {
    const e = makeEngine();
    e.step(UP, NEUTRAL_INPUT); // ground jump
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT); // release
    e.step(UP, NEUTRAL_INPUT); // air jump #1
    expect(e.state.player.airJumpsUsed).toBe(1);
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT); // release
    e.step(UP, NEUTRAL_INPUT); // no further air jump budget
    expect(e.state.player.airJumpsUsed).toBe(1);
    // A third jump would reset velocity.y to jumpVelocity (-15); gravity alone
    // leaves it strictly greater (less negative) than that.
    expect(e.state.player.velocity.y).toBeGreaterThan(sminemDefinition.jumpVelocity);
  });

  it('resets airJumpsUsed on landing', () => {
    const e = makeEngine();
    e.step(UP, NEUTRAL_INPUT);
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    e.step(UP, NEUTRAL_INPUT); // air jump
    expect(e.state.player.airJumpsUsed).toBe(1);
    // Fall back to the floor.
    for (let i = 0; i < 60; i++) e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    expect(e.state.player.grounded).toBe(true);
    expect(e.state.player.airJumpsUsed).toBe(0);
  });

  it('tracks block-held frames: increments while held, resets on release and re-press', () => {
    const e = makeEngine();
    const BLOCK: CombatInput = { ...NEUTRAL_INPUT, block: true };

    e.step(BLOCK, NEUTRAL_INPUT);
    expect(e.state.player.blockHeldFrames).toBe(1); // press frame
    e.step(BLOCK, NEUTRAL_INPUT);
    e.step(BLOCK, NEUTRAL_INPUT);
    expect(e.state.player.blockHeldFrames).toBe(3); // grows while held

    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT); // release
    expect(e.state.player.blockHeldFrames).toBe(0);

    e.step(BLOCK, NEUTRAL_INPUT); // fresh re-press
    expect(e.state.player.blockHeldFrames).toBe(1);
  });
});

describe('facing resolution (5.4)', () => {
  it('flips facing when fighters cross sides', () => {
    const e = makeEngine();
    // Place player to the RIGHT of cpu and step — facing should swap.
    e.state.player.position.x = 100;
    e.state.cpu.position.x = -100;
    e.step(NEUTRAL_INPUT, NEUTRAL_INPUT);
    expect(e.state.player.facing).toBe('left');
    expect(e.state.cpu.facing).toBe('right');
  });
});

describe('pushbox collision (5.5)', () => {
  it('prevents fighters from overlapping when one walks into the other', () => {
    const e = makeEngine();
    // Walk the player into the CPU for many steps.
    for (let i = 0; i < 500; i++) e.step(RIGHT, NEUTRAL_INPUT);

    const p = e.state.player.position.x;
    const c = e.state.cpu.position.x;
    const pMax = p + pPush.x + pPush.width;
    const cMin = c + cPush.x;
    // Pushboxes may touch but must not overlap.
    expect(pMax).toBeLessThanOrEqual(cMin + 0.5);

    // CPU is also clamped within the stage bounds.
    const cMaxX = e.state.stage.worldBounds.x + e.state.stage.worldBounds.width - cPush.x - cPush.width;
    expect(c).toBeLessThanOrEqual(cMaxX + 0.5);
  });

  it('does not push-separate when pushboxes are vertically disjoint (airborne pass-over)', () => {
    const e = makeEngine();
    const floor = e.state.stage.floorY;
    // Close enough that pushboxes overlap on x (distance 60 < 30+34), but lift
    // the player well above so the pushboxes are disjoint on y. Give upward
    // velocity to stay airborne for the whole assertion window.
    e.state.player.position.x = -30;
    e.state.cpu.position.x = 30;
    e.state.player.position.y = floor - 300;
    e.state.player.velocity.y = -15;
    e.state.player.grounded = false;
    e.state.player.currentState = 'jump';
    const cpuX0 = e.state.cpu.position.x;

    // A handful of steps clearly within the air time: no pushback occurs, so the
    // player advances the full walkSpeed distance and the CPU is undisturbed.
    for (let i = 0; i < 8; i++) e.step(RIGHT, NEUTRAL_INPUT);
    expect(e.state.player.position.x).toBeCloseTo(-30 + 8 * sminemDefinition.walkSpeed, 5);
    expect(e.state.cpu.position.x).toBe(cpuX0);
  });
});

describe('invalid action guards (5.6)', () => {
  it('ignores movement input during hitstun, then resumes when stun expires', () => {
    const e = makeEngine();
    e.state.player.stunFramesRemaining = 3;
    e.state.player.currentState = 'hitstun';
    const x0 = e.state.player.position.x;

    for (let i = 0; i < 3; i++) {
      e.step(RIGHT, NEUTRAL_INPUT);
      expect(e.state.player.position.x).toBe(x0); // frozen during stun
    }
    // Stun has now expired and state returned to idle.
    expect(e.state.player.stunFramesRemaining).toBe(0);
    expect(e.state.player.currentState).toBe('idle');

    e.step(RIGHT, NEUTRAL_INPUT); // now controllable again
    expect(e.state.player.position.x).toBeGreaterThan(x0);
  });

  it('applies the same control rules to CPU input (Property 9)', () => {
    const e = makeEngine();
    e.state.cpu.stunFramesRemaining = 2;
    e.state.cpu.currentState = 'hitstun';
    const x0 = e.state.cpu.position.x;
    e.step(NEUTRAL_INPUT, RIGHT); // CPU tries to move while stunned
    expect(e.state.cpu.position.x).toBe(x0); // ignored
  });
});
