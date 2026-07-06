import * as Phaser from 'phaser';
import { gameConfig } from './game/GameConfig';
import { SIM_FPS } from '@rpr/sim';

const game = new Phaser.Game(gameConfig);

if (typeof window !== 'undefined') {
  const w = window as unknown as { __game?: Phaser.Game; __SIM_FPS?: number };
  w.__game = game;
  w.__SIM_FPS = SIM_FPS;
}

export { game };
