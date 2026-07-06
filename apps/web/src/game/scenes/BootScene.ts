import * as Phaser from 'phaser';
import { gameCopy } from '@rpr/content';

/**
 * Minimal boot scene for the Task 1–4 foundation.
 *
 * Later tasks (Task 10.2) replace this with the real browser-support check and
 * routing to PreloadScene. For now it confirms the Phaser instance boots and that
 * presentation reads copy + content correctly.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, `${gameCopy.title}\n// ${gameCopy.subtitle}`, {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#7cf6a4',
        align: 'center',
      })
      .setOrigin(0.5);
  }
}
