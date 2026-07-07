/**
 * Generic fight-state factory.
 *
 * Builds an initial {@link GameState} from definitions + stage. The V1-specific
 * binding (Sminem vs Bogdanoff on marketControlRoom) lives in @rpr/content.
 */
import type { FighterDefinition } from '../data/fighter-definition';
import type { StageDefinition } from '../data/stage-definition';
import type { FacingDirection } from './fighter';
import type { FighterSide } from './fighter';
import type { FighterState } from './fighter';
import type { GameState } from './game';
import type { Vec2 } from '../primitives';
import { fighterId } from '../primitives';

/** Builds a fresh {@link FighterState} from a definition at a spawn point. */
export function createFighterState(
  definition: FighterDefinition,
  side: FighterSide,
  spawn: Vec2,
  facing: FacingDirection,
): FighterState {
  return {
    id: fighterId(side),
    definitionId: definition.id,
    side,
    health: definition.maxHealth,
    maxHealth: definition.maxHealth,
    meter: 0,
    maxMeter: definition.maxMeter,
    position: { x: spawn.x, y: spawn.y },
    velocity: { x: 0, y: 0 },
    facing,
    grounded: true,
    airJumpsUsed: 0,
    airJumpReady: false,
    currentState: 'idle',
    currentMove: null,
    inputBuffer: [],
    stunFramesRemaining: 0,
    blockstunFramesRemaining: 0,
    hitstopFramesRemaining: 0,
    hasLost: false,
    runtimeFlags: { blocking: false, blockHeight: 'high' },
  };
}

export interface InitialFightStateOptions {
  playerDef: FighterDefinition;
  cpuDef: FighterDefinition;
  stage: StageDefinition;
  seed?: number;
}

/**
 * Creates the initial game state. Spawns the player in the left third and the
 * CPU in the right third of the stage, both grounded on the floor, facing each
 * other. Round starts `'active'` so movement resolves immediately.
 */
export function createInitialFightState(opts: InitialFightStateOptions): GameState {
  const { playerDef, cpuDef, stage, seed = 0 } = opts;
  const bounds = stage.worldBounds;

  const playerSpawn: Vec2 = {
    x: bounds.x + bounds.width * 0.33,
    y: stage.floorY,
  };
  const cpuSpawn: Vec2 = {
    x: bounds.x + bounds.width * 0.67,
    y: stage.floorY,
  };

  return {
    frame: 0,
    seed,
    status: 'active',
    player: createFighterState(playerDef, 'player', playerSpawn, 'right'),
    cpu: createFighterState(cpuDef, 'cpu', cpuSpawn, 'left'),
    stage: {
      stageId: stage.id,
      worldBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      floorY: stage.floorY,
    },
    lastEvents: [],
  };
}
