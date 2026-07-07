import { type MoveDefinition, moveId } from '@rpr/sim';

// --- Move IDs ---

export const BOGDANOFF_LIGHT_HIGH_ID = moveId('bogdanoff_light_high');
export const BOGDANOFF_LIGHT_LOW_ID = moveId('bogdanoff_light_low');
export const BOGDANOFF_HEAVY_HIGH_ID = moveId('bogdanoff_heavy_high');
export const BOGDANOFF_HEAVY_LOW_ID = moveId('bogdanoff_heavy_low');
export const RED_CANDLE_ID = moveId('red_candle');
export const ACTIVATE_GLOBAL_DUMP_ID = moveId('activate_global_dump');

// --- Definitions ---
// High variants place the hitbox at head/upper-torso height (whiffs on a
// crouching hurtbox); low variants place it at leg height (connects on standing
// AND crouching). Numbers are first-pass; tuned in Task 22.

/** Basic boss attack: a dismissive high backhand. */
export const bogdanoffLightHigh: MoveDefinition = {
  id: BOGDANOFF_LIGHT_HIGH_ID,
  displayName: 'Illuminati Backhand',
  inputCommand: { button: 'lightHigh' },
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
  hitboxes: [{ x: 22, y: -128, width: 60, height: 28, frameStart: 7, frameEnd: 10 }],
  effects: { animationKey: 'bogdanoff_light_high', audioKey: 'sfx_punch_heavy' },
};

/** Basic boss attack: a low dismissive poke. */
export const bogdanoffLightLow: MoveDefinition = {
  id: BOGDANOFF_LIGHT_LOW_ID,
  displayName: 'Pump Dismissal',
  inputCommand: { button: 'lightLow' },
  category: 'light',
  startupFrames: 7,
  activeFrames: 4,
  recoveryFrames: 13,
  damage: 5,
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
  hitboxes: [{ x: 22, y: -48, width: 60, height: 32, frameStart: 7, frameEnd: 10 }],
  effects: { animationKey: 'bogdanoff_light_low', audioKey: 'sfx_punch_heavy' },
};

/** Dangerous heavy high attack: the phone slam. */
export const bogdanoffHeavyHigh: MoveDefinition = {
  id: BOGDANOFF_HEAVY_HIGH_ID,
  displayName: 'Phone Slam',
  inputCommand: { button: 'heavyHigh' },
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
  hitboxes: [{ x: 14, y: -130, width: 80, height: 40, frameStart: 14, frameEnd: 18 }],
  effects: {
    animationKey: 'bogdanoff_heavy_high',
    audioKey: 'sfx_phone_slam',
    effectKey: 'vfx_phone_slam',
  },
};

/** Dangerous heavy low attack: a phone slam to the legs. */
export const bogdanoffHeavyLow: MoveDefinition = {
  id: BOGDANOFF_HEAVY_LOW_ID,
  displayName: 'Dump Slam',
  inputCommand: { button: 'heavyLow' },
  category: 'heavy',
  startupFrames: 14,
  activeFrames: 5,
  recoveryFrames: 22,
  damage: 11,
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
  hitboxes: [{ x: 14, y: -40, width: 80, height: 36, frameStart: 14, frameEnd: 18 }],
  effects: {
    animationKey: 'bogdanoff_heavy_low',
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
  bogdanoffLightHigh,
  bogdanoffLightLow,
  bogdanoffHeavyHigh,
  bogdanoffHeavyLow,
  redCandle,
  activateGlobalDump,
];
