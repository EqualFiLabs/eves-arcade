import { type MoveDefinition, moveId } from '@rpr/sim';

// --- Move IDs ---

export const SMINEM_LIGHT_HIGH_ID = moveId('sminem_light_high');
export const SMINEM_LIGHT_LOW_ID = moveId('sminem_light_low');
export const SMINEM_HEAVY_HIGH_ID = moveId('sminem_heavy_high');
export const SMINEM_HEAVY_LOW_ID = moveId('sminem_heavy_low');
export const GREEN_CANDLE_ID = moveId('green_candle');
export const BULL_RUN_BARRAGE_ID = moveId('bull_run_barrage');

// --- Definitions ---
// Active frames are [startupFrames, startupFrames + activeFrames - 1]; hitbox
// frameStart/frameEnd stay inside that window. High variants place the hitbox
// at head/upper-torso height (whiffs on a crouching hurtbox); low variants
// place it at leg height (connects on standing AND crouching). Numbers are
// first-pass; tuned in Task 22.

/** Fast high poke to the head. */
export const sminemLightHigh: MoveDefinition = {
  id: SMINEM_LIGHT_HIGH_ID,
  displayName: 'Jab of Last $200',
  inputCommand: { button: 'lightHigh' },
  category: 'light',
  startupFrames: 5,
  activeFrames: 3,
  recoveryFrames: 9,
  damage: 4,
  chipDamage: 0,
  hitstunFrames: 12,
  blockstunFrames: 8,
  hitstopFrames: 4,
  meterGainOnUse: 2,
  meterGainOnHit: 5,
  meterCost: 0,
  blockable: true,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 24, y: -118, width: 54, height: 24, frameStart: 5, frameEnd: 7 }],
  effects: { animationKey: 'sminem_light_high', audioKey: 'sfx_punch_light' },
};

/** Fast low poke to the legs. */
export const sminemLightLow: MoveDefinition = {
  id: SMINEM_LIGHT_LOW_ID,
  displayName: 'Ankle Checker',
  inputCommand: { button: 'lightLow' },
  category: 'light',
  startupFrames: 5,
  activeFrames: 3,
  recoveryFrames: 9,
  damage: 3,
  chipDamage: 0,
  hitstunFrames: 12,
  blockstunFrames: 8,
  hitstopFrames: 4,
  meterGainOnUse: 2,
  meterGainOnHit: 5,
  meterCost: 0,
  blockable: true,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 24, y: -44, width: 54, height: 28, frameStart: 5, frameEnd: 7 }],
  effects: { animationKey: 'sminem_light_low', audioKey: 'sfx_punch_light' },
};

/** Slow, high-damage strike to the upper body. */
export const sminemHeavyHigh: MoveDefinition = {
  id: SMINEM_HEAVY_HIGH_ID,
  displayName: 'Bagholder Haymaker',
  inputCommand: { button: 'heavyHigh' },
  category: 'heavy',
  startupFrames: 11,
  activeFrames: 4,
  recoveryFrames: 18,
  damage: 11,
  chipDamage: 1,
  hitstunFrames: 18,
  blockstunFrames: 12,
  hitstopFrames: 8,
  meterGainOnUse: 3,
  meterGainOnHit: 8,
  meterCost: 0,
  blockable: true,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 20, y: -120, width: 64, height: 36, frameStart: 11, frameEnd: 14 }],
  effects: { animationKey: 'sminem_heavy_high', audioKey: 'sfx_punch_heavy' },
};

/** Slow, high-damage low sweep. */
export const sminemHeavyLow: MoveDefinition = {
  id: SMINEM_HEAVY_LOW_ID,
  displayName: 'Liquidation Sweep',
  inputCommand: { button: 'heavyLow' },
  category: 'heavy',
  startupFrames: 11,
  activeFrames: 4,
  recoveryFrames: 18,
  damage: 9,
  chipDamage: 1,
  hitstunFrames: 18,
  blockstunFrames: 12,
  hitstopFrames: 8,
  meterGainOnUse: 3,
  meterGainOnHit: 8,
  meterCost: 0,
  blockable: true,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 20, y: -36, width: 64, height: 32, frameStart: 11, frameEnd: 14 }],
  effects: { animationKey: 'sminem_heavy_low', audioKey: 'sfx_punch_heavy' },
};

/** Crypto-meme special: a bullish green candle thrust. */
export const greenCandle: MoveDefinition = {
  id: GREEN_CANDLE_ID,
  displayName: 'Green Candle',
  inputCommand: { button: 'special' },
  category: 'special',
  startupFrames: 13,
  activeFrames: 8,
  recoveryFrames: 22,
  damage: 9,
  chipDamage: 2,
  hitstunFrames: 16,
  blockstunFrames: 12,
  hitstopFrames: 6,
  meterGainOnUse: 4,
  meterGainOnHit: 6,
  meterCost: 0,
  blockable: true,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 16, y: -104, width: 92, height: 64, frameStart: 13, frameEnd: 20 }],
  effects: {
    animationKey: 'green_candle',
    audioKey: 'sfx_green_candle',
    effectKey: 'vfx_green_candle',
  },
};

/** Meter-spending super: a relentless bull-run barrage. */
export const bullRunBarrage: MoveDefinition = {
  id: BULL_RUN_BARRAGE_ID,
  displayName: 'Bull Run Barrage',
  inputCommand: { button: 'super' },
  category: 'super',
  startupFrames: 9,
  activeFrames: 6,
  recoveryFrames: 24,
  damage: 24,
  chipDamage: 4,
  hitstunFrames: 24,
  blockstunFrames: 16,
  hitstopFrames: 14,
  meterGainOnUse: 0,
  meterGainOnHit: 0,
  meterCost: 50,
  blockable: false,
  airborne: false,
  cancelWindows: [],
  hitboxes: [{ x: 10, y: -130, width: 120, height: 130, frameStart: 9, frameEnd: 14 }],
  effects: {
    animationKey: 'bull_run_barrage',
    audioKey: 'sfx_bull_run',
    effectKey: 'vfx_bull_run',
  },
};

export const sminemMoves: MoveDefinition[] = [
  sminemLightHigh,
  sminemLightLow,
  sminemHeavyHigh,
  sminemHeavyLow,
  greenCandle,
  bullRunBarrage,
];
