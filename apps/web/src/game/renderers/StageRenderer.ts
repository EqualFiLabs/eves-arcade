import * as Phaser from 'phaser';
import type { StageRuntimeState } from '@rpr/sim';
import { screenTransform, toScreenY, type ScreenTransform } from './screen-transform';

/**
 * StageRenderer (PLACEHOLDER) — draws a simple crypto-arena backdrop: gradient
 * floor band, a floor line, and stage bounds. Reads only sim stage state
 * (Property 10). Replaced by the textured StageRenderer in Task 13.1.
 */
export class StageRenderer {
  private readonly transform: ScreenTransform;
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, stage: StageRuntimeState, depth = -10) {
    this.transform = screenTransform(stage.worldBounds.x, stage.floorY);
    const { width, height } = scene.scale;
    this.gfx = scene.add.graphics().setDepth(depth);

    // Background fill.
    this.gfx.fillStyle(0x12121c, 1);
    this.gfx.fillRect(0, 0, width, height);

    // Crypto "candle" mood bands.
    this.gfx.fillStyle(0x1a2b1a, 1);
    this.gfx.fillRect(0, this.transform.floorY, width, height - this.transform.floorY);

    // Floor line.
    this.gfx.lineStyle(2, 0x7cf6a4, 0.6);
    this.gfx.beginPath();
    this.gfx.moveTo(0, this.transform.floorY);
    this.gfx.lineTo(width, this.transform.floorY);
    this.gfx.strokePath();

    // Stage bounds.
    const bx = stage.worldBounds.x + this.transform.offsetX;
    this.gfx.lineStyle(2, 0x3a3a4a, 0.5);
    this.gfx.strokeRect(bx, 0, stage.worldBounds.width, height);
  }

  get screenTransform(): ScreenTransform {
    return this.transform;
  }

  /** Placeholder has no per-frame state, but kept for the renderer contract. */
  sync(_stage: StageRuntimeState): void {
    void toScreenY; // reserved for parallax/scroll added in Task 13.
    void _stage;
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
