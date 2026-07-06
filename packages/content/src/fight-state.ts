/**
 * V1 fight binding: always Sminem (player) vs Bogdanoff (CPU) on the
 * marketControlRoom stage (Reqs 3.1, 3.2, 3.3). apps/web constructs the
 * CombatEngine with these.
 */
import {
  createInitialFightState,
  type FighterDefinition,
  type GameState,
  type MoveDefinition,
} from '@rpr/sim';
import { bogdanoffDefinition } from './fighters/bogdanoff';
import { sminemDefinition } from './fighters/sminem';
import { bogdanoffMoves } from './moves/bogdanoff-moves';
import { sminemMoves } from './moves/sminem-moves';
import { marketControlRoom } from './stages/market-control-room';

/** All V1 fighter definitions, for the CombatEngine stat lookup. */
export const v1FighterDefinitions: FighterDefinition[] = [sminemDefinition, bogdanoffDefinition];

/** All V1 move definitions, for the CombatEngine move resolution + hit detection. */
export const v1Moves: MoveDefinition[] = [...sminemMoves, ...bogdanoffMoves];

/** Creates the initial V1 GameState (Sminem vs Bogdanoff, marketControlRoom). */
export function createV1FightState(seed = 0): GameState {
  return createInitialFightState({
    playerDef: sminemDefinition,
    cpuDef: bogdanoffDefinition,
    stage: marketControlRoom,
    seed,
  });
}
