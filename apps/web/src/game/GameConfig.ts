import * as Phaser from 'phaser';
import { gameCopy } from '@rpr/content';
import { BootScene } from './scenes/BootScene';

/** Base game resolution. Phaser Scale.FIT letterboxes to preserve this aspect ratio. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * Phaser 4 GameConfig.
 *
 * Fighter movement and combat advance on the sim's fixed step (SIM_FPS = 60),
 * NOT via Phaser physics. Phaser here owns rendering, scenes, input, and audio only.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0a0a0f',
  title: gameCopy.title,
  url: 'https://github.com/anomalyco/opencode',
  banner: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [BootScene],
};
