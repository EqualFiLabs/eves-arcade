import { type MoveDefinition, moveId } from '@rpr/sim';

// --- Move IDs ---

export const SMINEM_LIGHT_ID = moveId('sminem_light');
export const SMINEM_HEAVY_ID = moveId('sminem_heavy');
export const GREEN_CANDLE_ID = moveId('green_candle');
export const BULL_RUN_BARRAGE_ID = moveId('bull_run_barrage');

// --- Definitions ---
// Active frames are [startupFrames, startupFrames + activeFrames - 1]; hitbox
// frameStart/frameEnd stay inside that window. Numbers are first-pass; tuned in Task 22.

/** Fast low-damage poke. */
export const sminemLight: MoveDefinition = {
  id: SMINEM_LIGHT_ID,
  displayName: 'Jab of Last $200',
  inputCommand: { button: 'light' },
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
  hitboxes: [{ x: 24, y: -96, width: 54, height: 28, frameStart: 5, frameEnd: 7 }],
  effects: { animationKey: 'sminem_light', audioKey: 'sfx_punch_light' },
};

/** Slower, higher-damage strike. */
export const sminemHeavy: MoveDefinition = {
  id: SMINEM_HEAVY_ID,
  displayName: 'Bagholder Haymaker',
  inputCommand: { button: 'heavy' },
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
  hitboxes: [{ x: 20, y: -110, width: 64, height: 40, frameStart: 11, frameEnd: 14 }],
  effects: { animationKey: 'sminem_heavy', audioKey: 'sfx_punch_heavy' },
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
  sminemLight,
  sminemHeavy,
  greenCandle,
  bullRunBarrage,
];
