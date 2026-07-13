import * as Phaser from 'phaser';
import { assetManifest, type AssetEntry } from '@rpr/content';

/**
 * PreloadScene — loads every asset manifest entry and shows visible progress
 * (Req 1.5, 11.1, 12.1, 15.5), then routes to the menu.
 *
 * Placeholder art/audio files may not exist yet (they arrive in later art
 * tasks); a load error for a placeholder is logged but never blocks the menu,
 * so the game always becomes playable. Real renderers do not depend on these
 * keys until the art tasks land.
 */
export class PreloadScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private box!: Phaser.GameObjects.Graphics;
  private percentText!: Phaser.GameObjects.Text;
  private failed = 0;
  private readonly onProgress = (value: number): void => {
    const { width, height } = this.scale;
    this.bar.clear();
    this.bar.fillStyle(0x7cf6a4, 1);
    this.bar.fillRoundedRect(width / 2 - 214, height / 2 - 19, 428 * value, 38, 6);
    this.percentText.setText(`${Math.round(value * 100)}%`);
  };
  private readonly onLoadError = (file: { key?: string }): void => {
    // Placeholder assets may be absent; record but keep going.
    this.failed += 1;
    if (file?.key) console.warn(`[preload] missing asset: ${file.key}`);
  };
  private readonly onLoadComplete = (): void => {
    this.removeLoaderListeners();
    this.bar.destroy();
    this.box.destroy();
    this.percentText.destroy();
  };

  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a0f');

    this.box = this.add.graphics();
    this.box.fillStyle(0x1a1a24, 0.9);
    this.box.fillRoundedRect(width / 2 - 220, height / 2 - 25, 440, 50, 8);

    this.bar = this.add.graphics();

    this.percentText = this.add
      .text(width / 2, height / 2 + 60, '0%', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#7cf6a4',
      })
      .setOrigin(0.5);

    this.load.on('progress', this.onProgress);
    this.load.on('loaderror', this.onLoadError);
    this.load.once('complete', this.onLoadComplete);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeLoaderListeners, this);

    for (const entry of assetManifest) {
      this.loadEntry(entry);
    }
  }

  /** Dispatches a manifest entry to the right Phaser loader method by kind. */
  private loadEntry(entry: AssetEntry): void {
    switch (entry.kind) {
      case 'image':
        this.load.image(entry.key, entry.path);
        break;
      case 'audio':
        this.load.audio(entry.key, entry.path);
        break;
      case 'atlas':
        // Atlases are not in the V1 placeholder manifest; handled here when added.
        this.load.atlas(entry.key, entry.path, entry.path.replace(/\.(png|webp)$/i, '.json'));
        break;
      case 'font':
        this.load.bitmapFont(entry.key, entry.path, entry.path.replace(/\.(png|webp)$/i, '.xml'));
        break;
      default:
        break;
    }
  }

  create(): void {
    this.scene.start('MenuScene');
  }

  private removeLoaderListeners(): void {
    this.load.off('progress', this.onProgress);
    this.load.off('loaderror', this.onLoadError);
    this.load.off('complete', this.onLoadComplete);
  }
}
