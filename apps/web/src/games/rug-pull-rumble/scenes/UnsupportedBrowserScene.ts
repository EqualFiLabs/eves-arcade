import * as Phaser from 'phaser';
import { gameCopy } from '@rpr/content';
import type { BrowserSupportReport } from '../../../arcade/phaser/browser-support';

/**
 * UnsupportedBrowserScene — shows a readable failure message instead of failing
 * silently (Req 1.4). Pure static text; no assets required.
 */
export class UnsupportedBrowserScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UnsupportedBrowserScene' });
  }

  create(data: BrowserSupportReport): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a0f');

    const reasons = (data?.reasons?.length ?? 0) > 0 ? data.reasons : ['This browser is not supported.'];
    const rejectReady = this.game.registry.get('arcadeReadyError') as ((reason: Error) => void) | undefined;
    rejectReady?.(new Error(reasons.join('; ')));

    const lines = [
      gameCopy.unsupportedBrowser || 'Unsupported browser',
      '',
      'Proof of Fight needs a modern desktop browser with WebGL/Web Audio.',
      '',
      ...reasons.map((r) => `• ${r}`),
      '',
      'Reload in a supported browser to play.',
    ];

    this.add
      .text(width / 2, height / 2, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ff6b6b',
        align: 'center',
        wordWrap: { width: width * 0.8 },
      })
      .setOrigin(0.5);
  }
}
