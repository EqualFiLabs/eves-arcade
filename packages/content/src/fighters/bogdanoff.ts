import { type FighterDefinition, fighterDefinitionId } from '@rpr/sim';
import {
  ACTIVATE_GLOBAL_DUMP_ID,
  BOGDANOFF_BACKHAND_ID,
  PHONE_SLAM_ID,
  RED_CANDLE_ID,
} from '../moves/bogdanoff-moves';

export const BOGDANOFF_DEFINITION_ID = fighterDefinitionId('bogdanoff');

/**
 * Bogdanoff — the CPU boss, a pump-and-dump market villain. Tankier than Sminem
 * so a first-time player must respect spacing and blocking (Req 8.9/8.10).
 */
export const bogdanoffDefinition: FighterDefinition = {
  id: BOGDANOFF_DEFINITION_ID,
  displayName: 'Bogdanoff',
  parodyArchetype: 'pump-and-dump market villain',
  maxHealth: 120,
  maxMeter: 100,
  walkSpeed: 2.4,
  backWalkSpeed: 2.2,
  jumpVelocity: -13,
  gravity: 0.8,
  maxAirJumps: 1,
  pushbox: { x: -34, y: -144, width: 68, height: 144 },
  defaultHurtboxes: {
    stand: [{ x: -28, y: -132, width: 56, height: 132 }],
    crouch: [{ x: -34, y: -76, width: 68, height: 76 }],
    airborne: [{ x: -28, y: -132, width: 56, height: 132 }],
  },
  moves: {
    light: BOGDANOFF_BACKHAND_ID,
    heavy: PHONE_SLAM_ID,
    special: RED_CANDLE_ID,
    super: ACTIVATE_GLOBAL_DUMP_ID,
  },
  animationKeys: {
    idle: 'bogdanoff_idle',
    walkForward: 'bogdanoff_walk_fwd',
    walkBackward: 'bogdanoff_walk_back',
    crouch: 'bogdanoff_crouch',
    jump: 'bogdanoff_jump',
    block: 'bogdanoff_block',
    hitstun: 'bogdanoff_hitstun',
    blockstun: 'bogdanoff_blockstun',
    ko: 'bogdanoff_ko',
  },
  audioKeys: {
    attack: 'sfx_bogdanoff_attack',
    hit: 'sfx_bogdanoff_hit',
    ko: 'sfx_bogdanoff_ko',
  },
  copyKeys: {
    win: 'bogdanoff_win',
    loss: 'bogdanoff_loss',
  },
};
