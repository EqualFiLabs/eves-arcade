/**
 * Data-driven game content package.
 *
 * Pure TypeScript — no Phaser, no DOM. Fighter/move/stage definitions, copy,
 * distribution hooks, and the asset manifest live here so the game is tuned via
 * data, not by editing systems code (Req 16.4).
 */

// Schemas are authored in @rpr/sim and re-exported here for content consumers.
export type {
  FighterDefinition,
  FighterMoveMap,
  FighterAnimationKeys,
  FighterAudioKeys,
  FighterCopyKeys,
  FrameBoxSet,
} from '@rpr/sim';
export type {
  MoveDefinition,
  MoveCategory,
  MoveInputButton,
  MoveInputCommand,
  CancelWindow,
  MovePresentation,
} from '@rpr/sim';
export type { StageDefinition, StageCameraConfig, StageCopyKeys } from '@rpr/sim';

// Fighters
export { sminemDefinition, SMINEM_DEFINITION_ID } from './fighters/sminem';
export { bogdanoffDefinition, BOGDANOFF_DEFINITION_ID } from './fighters/bogdanoff';

// Moves
export {
  sminemMoves,
  sminemLightHigh,
  sminemLightLow,
  sminemHeavyHigh,
  sminemHeavyLow,
  greenCandle,
  bullRunBarrage,
  SMINEM_LIGHT_HIGH_ID,
  SMINEM_LIGHT_LOW_ID,
  SMINEM_HEAVY_HIGH_ID,
  SMINEM_HEAVY_LOW_ID,
  GREEN_CANDLE_ID,
  BULL_RUN_BARRAGE_ID,
} from './moves/sminem-moves';
export {
  bogdanoffMoves,
  bogdanoffLightHigh,
  bogdanoffLightLow,
  bogdanoffHeavyHigh,
  bogdanoffHeavyLow,
  redCandle,
  activateGlobalDump,
  BOGDANOFF_LIGHT_HIGH_ID,
  BOGDANOFF_LIGHT_LOW_ID,
  BOGDANOFF_HEAVY_HIGH_ID,
  BOGDANOFF_HEAVY_LOW_ID,
  RED_CANDLE_ID,
  ACTIVATE_GLOBAL_DUMP_ID,
} from './moves/bogdanoff-moves';

// Stage
export { marketControlRoom, MARKET_CONTROL_ROOM_ID } from './stages/market-control-room';

// Copy
export { gameCopy, sminemCopy, bogdanoffCopy } from './copy/game-copy';
export type { GameCopy, FighterCopyLines } from './copy/game-copy';

// Distribution
export { distributionHooks } from './distribution/distribution-hooks';
export type { DistributionHook, DistributionHookPlacement } from './distribution/distribution-hooks';

// Assets
export { assetManifest } from './assets/asset-manifest';
export type { AssetEntry, AssetKind, AssetLicense } from './assets/asset-manifest';

// Bundle + validation
export {
  getV1Content,
  validateContent,
  REQUIRED_V1_FIGHTER_IDS,
  REQUIRED_V1_MOVE_IDS,
  REQUIRED_V1_STAGE_ID,
} from './validation';
export type { V1Content, ContentValidationResult } from './validation';

// V1 fight binding
export { createV1FightState, v1FighterDefinitions, v1Moves } from './fight-state';

// CPU
export type { CpuProfile } from '@rpr/sim';
export { bogdanoffCpuProfile } from './cpu/bogdanoff-profile';
