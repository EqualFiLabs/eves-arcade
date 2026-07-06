import * as Phaser from 'phaser';

/**
 * Minimal boot scene for the Task 1 foundation.
 *
 * Later tasks (Task 10.2) replace this with the real browser-support check and
 * routing to PreloadScene. For now it confirms the Phaser instance boots and the
 * canvas is attached for e2e smoke tests.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, 'RUG PULL RUMBLE\n// booting…', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#7cf6a4',
        align: 'center',
      })
      .setOrigin(0.5);
  }
}
