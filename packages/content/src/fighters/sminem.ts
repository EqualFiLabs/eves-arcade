import { type FighterDefinition, fighterDefinitionId } from '@rpr/sim';
import { BULL_RUN_BARRAGE_ID, GREEN_CANDLE_ID, SMINEM_HEAVY_ID, SMINEM_LIGHT_ID } from '../moves/sminem-moves';

export const SMINEM_DEFINITION_ID = fighterDefinitionId('sminem');

/**
 * Sminem — the playable retail-hero archetype.
 * Stats are first-pass defaults; movement/timing is tuned in Task 22.
 */
export const sminemDefinition: FighterDefinition = {
  id: SMINEM_DEFINITION_ID,
  displayName: 'Sminem',
  parodyArchetype: 'diamond-handed retail hero',
  maxHealth: 100,
  maxMeter: 100,
  walkSpeed: 3,
  backWalkSpeed: 2.6,
  jumpVelocity: -15,
  gravity: 0.8,
  pushbox: { x: -30, y: -130, width: 60, height: 130 },
  defaultHurtboxes: {
    stand: [{ x: -24, y: -120, width: 48, height: 120 }],
    crouch: [{ x: -30, y: -68, width: 60, height: 68 }],
    airborne: [{ x: -24, y: -120, width: 48, height: 120 }],
  },
  moves: {
    light: SMINEM_LIGHT_ID,
    heavy: SMINEM_HEAVY_ID,
    special: GREEN_CANDLE_ID,
    super: BULL_RUN_BARRAGE_ID,
  },
  animationKeys: {
    idle: 'sminem_idle',
    walkForward: 'sminem_walk_fwd',
    walkBackward: 'sminem_walk_back',
    crouch: 'sminem_crouch',
    jump: 'sminem_jump',
    block: 'sminem_block',
    hitstun: 'sminem_hitstun',
    blockstun: 'sminem_blockstun',
    ko: 'sminem_ko',
  },
  audioKeys: {
    attack: 'sfx_sminem_attack',
    hit: 'sfx_sminem_hit',
    ko: 'sfx_sminem_ko',
  },
  copyKeys: {
    win: 'sminem_win',
    loss: 'sminem_loss',
  },
};
