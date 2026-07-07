/**
 * Fighter movement, facing, and action-guard resolution.
 *
 * All functions are pure mutations on sim state — no allocation of shared
 * objects, no RNG, no DOM. They advance one fixed step at a time (SIM_FPS = 60),
 * so all speeds are expressed per simulation step.
 */
import type { FighterDefinition } from '../data/fighter-definition';
import type { CombatInput } from '../input/combat-input';
import type { Box } from '../primitives';
import type { FacingDirection } from '../state/fighter';
import type { FighterState } from '../state/fighter';
import type { StageRuntimeState } from '../state/game';
import type { GameState } from '../state/game';

const facingSign = (facing: FacingDirection): -1 | 1 => (facing === 'right' ? 1 : -1);

/**
 * Whether a fighter currently accepts movement/action input.
 * False during hitstun, blockstun, hitstop, attacks, and KO — enforcing
 * Property 4 (invalid input safety) and Req 5.9/6.5/9.6.
 */
export const canControl = (f: FighterState): boolean => {
  if (f.hasLost) return false;
  if (f.currentState === 'ko') return false;
  if (f.currentState === 'attack') return false;
  if (f.currentState === 'hitstun' || f.currentState === 'blockstun') return false;
  if (f.stunFramesRemaining > 0 || f.blockstunFramesRemaining > 0 || f.hitstopFramesRemaining > 0) {
    return false;
  }
  return true;
};

/**
 * Applies a single step of movement input to a fighter. No-ops if the fighter is
 * not controllable. Priority when grounded: jump > block > crouch > walk > idle.
 */
export function applyMovementInput(
  f: FighterState,
  def: FighterDefinition,
  input: CombatInput,
): void {
  // Block intent is tracked even if the final state is something else.
  f.runtimeFlags.blocking = input.block && f.grounded;

  // Track consecutive held frames for perfect-block timing. Read blockHeldFrames
  // before updating so a fresh press resets to 1 without a separate prev-field.
  const wasHeld = f.blockHeldFrames > 0;
  if (input.block) {
    f.blockHeldFrames = wasHeld ? f.blockHeldFrames + 1 : 1;
  } else {
    f.blockHeldFrames = 0;
  }

  // Edge-detect the jump input so an air jump requires a fresh re-press rather
  // than the up key being held since the ground jump. Tracked every step
  // (including during hitstun) so a held-down up never silently stocks a jump.
  if (input.vertical !== -1) f.airJumpReady = true;

  if (!canControl(f)) return;

  // Jump (up input while grounded launches).
  if (input.vertical === -1 && f.grounded) {
    f.velocity.y = def.jumpVelocity;
    f.grounded = false;
    f.currentState = 'jump';
    f.airJumpsUsed = 0;
    f.airJumpReady = false;
  }

  if (!f.grounded) {
    // Air jump: a fresh up press (edge) while still within the air-jump budget.
    if (input.vertical === -1 && f.airJumpReady && f.airJumpsUsed < def.maxAirJumps) {
      f.velocity.y = def.jumpVelocity;
      f.airJumpsUsed += 1;
      f.airJumpReady = false;
    }
    // Air control: adjust horizontal velocity but keep the jump state.
    if (input.horizontal !== 0) {
      const forward = input.horizontal === facingSign(f.facing);
      const speed = forward ? def.walkSpeed : def.backWalkSpeed;
      f.velocity.x = input.horizontal * speed;
    }
    return;
  }

  // Grounded:
  if (input.block) {
    f.velocity.x = 0;
    f.currentState = 'block';
    return;
  }
  if (input.vertical === 1) {
    f.velocity.x = 0;
    f.currentState = 'crouch';
    return;
  }
  if (input.horizontal !== 0) {
    const forward = input.horizontal === facingSign(f.facing);
    const speed = forward ? def.walkSpeed : def.backWalkSpeed;
    f.velocity.x = input.horizontal * speed;
    f.currentState = forward ? 'walk_forward' : 'walk_backward';
    return;
  }

  f.velocity.x = 0;
  f.currentState = 'idle';
}

/**
 * Integrates velocity into position and resolves floor collision. Hitstop freezes
 * the fighter's physics timeline (Property: hitstop pauses without corrupting state).
 */
export function integratePhysics(
  f: FighterState,
  def: FighterDefinition,
  stage: StageRuntimeState,
): void {
  if (f.hitstopFramesRemaining > 0) return;

  if (!f.grounded) {
    f.velocity.y += def.gravity;
    f.position.y += f.velocity.y;
    if (f.position.y >= stage.floorY) {
      f.position.y = stage.floorY;
      f.velocity.y = 0;
      f.grounded = true;
      f.airJumpsUsed = 0;
      if (canControl(f) && f.currentState === 'jump') {
        f.currentState = 'idle';
      }
    }
  }

  f.position.x += f.velocity.x;
}

/** Updates both fighters' facing so each faces the other, handling cross-ups (Req 6.8). */
export function resolveFacing(state: GameState): void {
  const playerLeftOfCpu = state.player.position.x < state.cpu.position.x;
  state.player.facing = playerLeftOfCpu ? 'right' : 'left';
  state.cpu.facing = playerLeftOfCpu ? 'left' : 'right';
}

/** Clamps a fighter's pushbox within the stage world bounds along the x axis. */
export function clampToWorldBounds(f: FighterState, pushbox: Box, worldBounds: Box): void {
  const minX = worldBounds.x - pushbox.x;
  const maxX = worldBounds.x + worldBounds.width - pushbox.x - pushbox.width;
  if (f.position.x < minX) f.position.x = minX;
  else if (f.position.x > maxX) f.position.x = maxX;
}

/**
 * Ticks down stun/blockstun/hitstop counters and returns the fighter to idle when
 * they expire. Called once per step after movement.
 */
export function tickStatusTimers(f: FighterState): void {
  if (f.hitstopFramesRemaining > 0) {
    f.hitstopFramesRemaining--;
    return;
  }
  if (f.stunFramesRemaining > 0) {
    f.stunFramesRemaining--;
    if (f.stunFramesRemaining === 0 && f.currentState === 'hitstun') {
      f.currentState = 'idle';
    }
  }
  if (f.blockstunFramesRemaining > 0) {
    f.blockstunFramesRemaining--;
    if (f.blockstunFramesRemaining === 0 && f.currentState === 'blockstun') {
      f.currentState = 'idle';
    }
  }
}
