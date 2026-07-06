import { type MoveDefinition, moveId } from '@rpr/sim';

// --- Move IDs ---

export const BOGDANOFF_BACKHAND_ID = moveId('bogdanoff_backhand');
export const PHONE_SLAM_ID = moveId('phone_slam');
export const RED_CANDLE_ID = moveId('red_candle');
export const ACTIVATE_GLOBAL_DUMP_ID = moveId('activate_global_dump');

// --- Definitions ---

/** Basic boss attack: a dismissive backhand. */
export const bogdanoffBackhand: MoveDefinition = {
  id: BOGDANOFF_BACKHAND_ID,
  displayName: 'Illuminati Backhand',
  inputCommand: { button: 'light' },
  category: 'light',
  startupFrames: 7,
  activeFrames: 4,
  recoveryFrames: 13,
  damage: 6,
  chipDamage: 1,
  hitstunFrames: 13,
  blockstunFrames: 9,
  hitstopFrames: 5,
  meterGainOnUse: 2,
  meterGainOnHit: 4,
  meterCost: 0,
  blockable: true,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 22, y: -108, width: 60, height: 36, frameStart: 7, frameEnd: 10 }],
  effects: { animationKey: 'bogdanoff_backhand', audioKey: 'sfx_punch_heavy' },
};

/** Dangerous heavy attack: the phone slam. */
export const phoneSlam: MoveDefinition = {
  id: PHONE_SLAM_ID,
  displayName: 'Phone Slam',
  inputCommand: { button: 'heavy' },
  category: 'heavy',
  startupFrames: 14,
  activeFrames: 5,
  recoveryFrames: 22,
  damage: 13,
  chipDamage: 2,
  hitstunFrames: 20,
  blockstunFrames: 14,
  hitstopFrames: 10,
  meterGainOnUse: 3,
  meterGainOnHit: 6,
  meterCost: 0,
  blockable: true,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 14, y: -150, width: 80, height: 150, frameStart: 14, frameEnd: 18 }],
  effects: {
    animationKey: 'phone_slam',
    audioKey: 'sfx_phone_slam',
    effectKey: 'vfx_phone_slam',
  },
};

/** Signature market-villain special: a sweeping red candle. */
export const redCandle: MoveDefinition = {
  id: RED_CANDLE_ID,
  displayName: 'Red Candle',
  inputCommand: { button: 'special' },
  category: 'special',
  startupFrames: 12,
  activeFrames: 10,
  recoveryFrames: 24,
  damage: 10,
  chipDamage: 3,
  hitstunFrames: 16,
  blockstunFrames: 12,
  hitstopFrames: 6,
  meterGainOnUse: 4,
  meterGainOnHit: 6,
  meterCost: 0,
  blockable: true,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 12, y: -120, width: 110, height: 120, frameStart: 12, frameEnd: 21 }],
  effects: {
    animationKey: 'red_candle',
    audioKey: 'sfx_red_candle',
    effectKey: 'vfx_red_candle',
  },
};

/**
 * Optional boss super. V1 does not gate the CPU on meter, so this has no meter
 * cost and instead fires periodically from the Bogdanoff brain.
 */
export const activateGlobalDump: MoveDefinition = {
  id: ACTIVATE_GLOBAL_DUMP_ID,
  displayName: 'Activate Global Dump',
  inputCommand: { button: 'super' },
  category: 'super',
  startupFrames: 16,
  activeFrames: 8,
  recoveryFrames: 30,
  damage: 18,
  chipDamage: 4,
  hitstunFrames: 22,
  blockstunFrames: 16,
  hitstopFrames: 12,
  meterGainOnUse: 0,
  meterGainOnHit: 0,
  meterCost: 0,
  blockable: false,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 0, y: -160, width: 160, height: 160, frameStart: 16, frameEnd: 23 }],
  effects: {
    animationKey: 'activate_global_dump',
    audioKey: 'sfx_global_dump',
    effectKey: 'vfx_global_dump',
  },
};

export const bogdanoffMoves: MoveDefinition[] = [
  bogdanoffBackhand,
  phoneSlam,
  redCandle,
  activateGlobalDump,
];
