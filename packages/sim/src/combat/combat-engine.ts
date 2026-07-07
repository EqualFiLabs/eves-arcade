/**
 * CombatEngine — the deterministic fixed-step combat simulation.
 *
 * Pure TypeScript. Advances `GameState` one fixed step at a time (SIM_FPS = 60)
 * by resolving move input, movement, physics, facing, pushbox separation, hit
 * detection, block/hit resolution, and KO. Meter gain/spend is wired in Task 7.
 *
 * The engine is generic over fighter/stage/move definitions (supplied via the
 * initial-state factory + definitions/moves maps). The V1 binding lives in @rpr/content.
 */
import type { CombatDebugSnapshot } from '../debug/debug-snapshot';
import type { CombatInput } from '../input/combat-input';
import type { CombatEvent } from './events';
import type { FighterDefinition } from '../data/fighter-definition';
import type { FighterDefinitionId } from '../primitives';
import type { GameState } from '../state/game';
import type { MoveDefinition } from '../data/move-definition';
import type { MoveId } from '../primitives';
import {
  applyMovementInput,
  clampToWorldBounds,
  integratePhysics,
  resolveFacing,
  tickStatusTimers,
} from './movement';
import { findHitContacts, resolvePushboxes } from './collision-system';
import { advanceMove, canStartMove, startMove } from './move-resolver';
import { resolveHitContact } from './hit-resolution';
import { applyRoundEnd, checkRoundEnd } from './round-resolver';
import { chargeMeter, grantMeter } from './meter-system';

export interface StepResult {
  state: GameState;
  events: CombatEvent[];
  debug: CombatDebugSnapshot;
}

export interface CombatEngineOptions {
  /** Rebuilds the initial GameState for a given seed (used by reset). */
  createInitialState: (seed: number) => GameState;
  /** All fighter definitions referenced by the initial state, for stat lookup. */
  definitions: ReadonlyArray<FighterDefinition>;
  /** All move definitions referenced by the fighters, for move resolution + hit detection. */
  moves: ReadonlyArray<MoveDefinition>;
  seed?: number;
}

export class CombatEngine {
  private readonly createInitialState: (seed: number) => GameState;
  private readonly definitions: ReadonlyMap<FighterDefinitionId, FighterDefinition>;
  private readonly moves: ReadonlyMap<MoveId, MoveDefinition>;
  private _state: GameState;

  constructor(opts: CombatEngineOptions) {
    this.createInitialState = opts.createInitialState;
    this.definitions = new Map(opts.definitions.map((d) => [d.id, d]));
    this.moves = new Map(opts.moves.map((m) => [m.id, m]));
    this._state = opts.createInitialState(opts.seed ?? 0);
  }

  get state(): GameState {
    return this._state;
  }

  /** Advances the simulation one fixed step. Returns the new state, events, and debug snapshot. */
  step(playerInput: CombatInput, cpuInput: CombatInput): StepResult {
    const events: CombatEvent[] = [];

    // Once the round is decided, no further combat input is accepted (Req 6.9).
    if (this._state.status !== 'active') {
      this._state.lastEvents = events;
      return { state: this._state, events, debug: this.getDebugSnapshot() };
    }

    const player = this._state.player;
    const cpu = this._state.cpu;
    const pDef = this.definitions.get(player.definitionId);
    const cDef = this.definitions.get(cpu.definitionId);
    if (!pDef || !cDef) {
      throw new Error('CombatEngine: missing definition for a fighter');
    }
    const stage = this._state.stage;

    // 1. Advance existing move timelines (frozen during hitstop).
    if (player.currentMove && player.hitstopFramesRemaining === 0) {
      advanceMove(player, this.moves);
    }
    if (cpu.currentMove && cpu.hitstopFramesRemaining === 0) {
      advanceMove(cpu, this.moves);
    }

    // 2. Resolve input: start a move, else apply movement.
    this.processInput(player, pDef, playerInput, events);
    this.processInput(cpu, cDef, cpuInput, events);

    // 3. Integrate physics (skipped during hitstop).
    integratePhysics(player, pDef, stage);
    integratePhysics(cpu, cDef, stage);

    // 4. Facing.
    resolveFacing(this._state);

    // 5. Pushbox separation + world-bounds clamp.
    resolvePushboxes(this._state, this.definitions);
    clampToWorldBounds(player, pDef.pushbox, stage.worldBounds);
    clampToWorldBounds(cpu, cDef.pushbox, stage.worldBounds);

    // 6. Hit detection → hit/block resolution → KO check.
    const contacts = findHitContacts(this._state, this.moves, this.definitions);
    for (const contact of contacts) {
      resolveHitContact(this._state, contact, this.moves, events);
      const end = checkRoundEnd(this._state);
      if (end) {
        applyRoundEnd(this._state, end, events);
        break;
      }
    }

    // 7. Tick stun/blockstun/hitstop timers (returns fighters to idle when expired).
    tickStatusTimers(player);
    tickStatusTimers(cpu);

    // 8. Advance frame.
    this._state.frame += 1;
    this._state.lastEvents = events;

    return { state: this._state, events, debug: this.getDebugSnapshot() };
  }

  /** Re-initializes the fight from the given seed. */
  reset(seed = 0): void {
    this._state = this.createInitialState(seed);
  }

  getDebugSnapshot(): CombatDebugSnapshot {
    return snapshotFromState(this._state);
  }

  /** Starts a move from input when legal; otherwise applies normal movement. */
  private processInput(
    f: GameState['player'],
    def: FighterDefinition,
    input: CombatInput,
    events: CombatEvent[],
  ): void {
    if (f.currentMove) return; // mid-attack: input locked
    const moveId = pickMoveId(def, input);
    if (moveId && canStartMove(f, moveId, this.moves)) {
      const runtime = startMove(f, moveId, this.moves);
      const moveDef = this.moves.get(moveId);
      events.push({
        type: 'move_started',
        frame: this._state.frame,
        fighterId: f.id,
        moveId,
      });
      // Meter gain on use (applies to whiffed and connected moves alike).
      if (moveDef && runtime) {
        grantMeter(f, moveDef.meterGainOnUse, 'attack_used', this._state.frame, events);
        // Deduct meter cost exactly once for meter-gated supers (Req 7.4/7.6).
        if (moveDef.meterCost > 0) {
          chargeMeter(f, moveDef.meterCost, 'super_spent', this._state.frame, events);
          runtime.spentMeter = true;
        }
      }
      return;
    }
    applyMovementInput(f, def, input);
  }
}

/** Picks the highest-priority move id from input (super > special > heavies > lights). */
function pickMoveId(def: FighterDefinition, input: CombatInput): MoveId | undefined {
  if (input.super) return def.moves.super;
  if (input.special) return def.moves.special;
  if (input.heavyHigh) return def.moves.heavyHigh;
  if (input.heavyLow) return def.moves.heavyLow;
  if (input.lightHigh) return def.moves.lightHigh;
  if (input.lightLow) return def.moves.lightLow;
  return undefined;
}

function snapshotFromState(state: GameState): CombatDebugSnapshot {
  return {
    frame: state.frame,
    status: state.status,
    player: snapshotFighter(state.player),
    cpu: snapshotFighter(state.cpu),
  };
}

function snapshotFighter(f: GameState['player']): CombatDebugSnapshot['player'] {
  return {
    id: f.id,
    definitionId: f.definitionId,
    side: f.side,
    state: f.currentState,
    facing: f.facing,
    grounded: f.grounded,
    airJumpsUsed: f.airJumpsUsed,
    position: { x: f.position.x, y: f.position.y },
    velocity: { x: f.velocity.x, y: f.velocity.y },
    health: f.health,
    meter: f.meter,
    stunFramesRemaining: f.stunFramesRemaining,
    blockstunFramesRemaining: f.blockstunFramesRemaining,
    hitstopFramesRemaining: f.hitstopFramesRemaining,
    currentMove: f.currentMove,
    runtimeFlags: { ...f.runtimeFlags },
  };
}
