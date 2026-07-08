import * as Phaser from 'phaser';
import { gameCopy } from '@rpr/content';

/** Base game resolution. Phaser Scale.FIT letterboxes to preserve this aspect ratio. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * Per-game Phaser-config overrides. Games supply their scene list (and any
 * game-specific config) here; common options come from the factory.
 */
export interface GameConfigOverrides {
  /** Mount element the Phaser canvas is created inside. */
  parent: HTMLElement | string;
  /** The game's scene classes, in run order (the same shape Phaser's GameConfig expects). */
  scene: Phaser.Types.Core.GameConfig['scene'];
  /** Desired background color. */
  backgroundColor?: string;
  /** Base design width/height for Scale.FIT. */
  width?: number;
  height?: number;
}

/**
 * Builds a Phaser 4 GameConfig covering the shared options (renderer, scale,
 * banner, input) merged with per-game overrides (parent, scene list).
 *
 * Fighter movement and combat advance on the sim's fixed step (SIM_FPS = 60),
 * NOT via Phaser physics — no physics config is registered (Req 15.3). Each
 * launched game owns the instance this produces (Req 3.1).
 */
export function createGameConfig(overrides: GameConfigOverrides): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: overrides.parent,
    backgroundColor: overrides.backgroundColor ?? '#0a0a0f',
    title: gameCopy.title,
    url: 'https://github.com/anomalyco/opencode',
    banner: false,
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: overrides.width ?? GAME_WIDTH,
      height: overrides.height ?? GAME_HEIGHT,
    },
    input: {
      gamepad: true,
    },
    scene: overrides.scene,
  };
}
