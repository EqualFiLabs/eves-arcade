/**
 * CombatEngine — the deterministic fixed-step combat simulation.
 *
 * Pure TypeScript. Advances `GameState` one fixed step at a time (SIM_FPS = 60)
 * by applying movement input, physics, facing, pushbox separation, and status
 * timers. Moves, hit detection, meter, and KO arrive in Tasks 6–7.
 *
 * The engine is generic over fighter/stage definitions (supplied via the initial
 * state factory + definitions map). The V1 binding lives in @rpr/content.
 */
import type { CombatDebugSnapshot } from '../debug/debug-snapshot';
import type { CombatInput } from '../input/combat-input';
import type { CombatEvent } from './events';
import type { FighterDefinition } from '../data/fighter-definition';
import type { FighterDefinitionId } from '../primitives';
import type { GameState } from '../state/game';
import {
  applyMovementInput,
  clampToWorldBounds,
  integratePhysics,
  resolveFacing,
  tickStatusTimers,
} from './movement';
import { resolvePushboxes } from './collision-system';

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
  seed?: number;
}

export class CombatEngine {
  private readonly createInitialState: (seed: number) => GameState;
  private readonly definitions: ReadonlyMap<FighterDefinitionId, FighterDefinition>;
  private _state: GameState;

  constructor(opts: CombatEngineOptions) {
    this.createInitialState = opts.createInitialState;
    this.definitions = new Map(opts.definitions.map((d) => [d.id, d]));
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
      throw new Error(`CombatEngine: missing definition for a fighter`);
    }
    const stage = this._state.stage;

    applyMovementInput(player, pDef, playerInput);
    applyMovementInput(cpu, cDef, cpuInput);

    integratePhysics(player, pDef, stage);
    integratePhysics(cpu, cDef, stage);

    resolveFacing(this._state);

    resolvePushboxes(this._state, this.definitions);
    clampToWorldBounds(player, pDef.pushbox, stage.worldBounds);
    clampToWorldBounds(cpu, cDef.pushbox, stage.worldBounds);

    tickStatusTimers(player);
    tickStatusTimers(cpu);

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
