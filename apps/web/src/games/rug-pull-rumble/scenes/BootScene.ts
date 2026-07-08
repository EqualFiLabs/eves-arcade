import * as Phaser from 'phaser';
import { checkBrowserSupport, type BrowserSupportReport } from '../../../arcade/phaser/browser-support';

/**
 * BootScene — first scene. Checks browser runtime support and routes to the
 * unsupported view or PreloadScene (Req 1.4, design: Boot).
 *
 * Runs no asset loading itself (the progress bar lives in PreloadScene).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const report = checkBrowserSupport();
    if (!report.supported) {
      this.scene.start('UnsupportedBrowserScene', report);
      return;
    }
    // Stash the report for diagnostics/debug; PreloadScene takes over.
    this.game.registry.set('browserSupport', report);
    this.scene.start('PreloadScene');
  }
}

export type { BrowserSupportReport };
