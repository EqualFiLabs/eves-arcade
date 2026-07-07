import * as Phaser from 'phaser';
import type { StageRuntimeState } from '@rpr/sim';
import type { StageDefinition } from '@rpr/content';

const BG_KEY = 'stage_marketcontrol_bg';
const MID_KEY = 'stage_marketcontrol_mid';
const FG_KEY = 'stage_marketcontrol_fg';

/**
 * StageRenderer — renders the V1 crypto arena (Req 3.3, 11.1, 11.8).
 *
 * Draws a Graphics base (floor band, floor line, bounds) in sim world space,
 * then layers the loaded bg/mid/fg textures with parallax scroll factors so the
 * arena reads with depth as the camera pans. Textures are optional: if a layer
 * is unloaded it is skipped, so the placeholder Graphics base still carries the
 * look until real art lands. Presentation-only (Property 10).
 */
export class StageRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly layerImages: Phaser.GameObjects.Image[] = [];
  private readonly stage: StageDefinition;

  constructor(scene: Phaser.Scene, stageRuntime: StageRuntimeState, stageDef: StageDefinition, depth = -10) {
    this.stage = stageDef;
    const b = stageRuntime.worldBounds;
    this.gfx = scene.add.graphics().setDepth(depth);

    // Backdrop fill across the whole world.
    this.gfx.fillStyle(0x0d0d16, 1);
    this.gfx.fillRect(b.x, 0, b.width, scene.scale.height);

    // Parallax texture layers (skip if the art isn't loaded yet).
    this.addLayer(scene, BG_KEY, 0.45, depth + 1, b, 0x1a2b1a);
    this.addLayer(scene, MID_KEY, 0.7, depth + 2, b, 0x142014);
    this.addLayer(scene, FG_KEY, 1.0, depth + 3, b, 0x0a1a0a);

    // Floor band + floor line.
    const floorY = stageRuntime.floorY;
    this.gfx.fillStyle(0x16261a, 1);
    this.gfx.fillRect(b.x, floorY, b.width, scene.scale.height - floorY);
    this.gfx.lineStyle(2, 0x7cf6a4, 0.55);
    this.gfx.beginPath();
    this.gfx.moveTo(b.x, floorY);
    this.gfx.lineTo(b.x + b.width, floorY);
    this.gfx.strokePath();

    // Arena bounds.
    this.gfx.lineStyle(2, 0x3a3a4a, 0.4);
    this.gfx.strokeRect(b.x, 0, b.width, scene.scale.height);

    void this.stage;
  }

  /** Adds a parallax image layer, tiled to cover the world, or skips if missing. */
  private addLayer(
    scene: Phaser.Scene,
    key: string,
    scrollFactor: number,
    depth: number,
    bounds: { x: number; width: number },
    fallbackTint: number,
  ): void {
    if (!scene.textures.exists(key)) return;
    const cx = bounds.x + bounds.width / 2;
    const cy = scene.scale.height / 2;
    const img = scene.add.image(cx, cy, key).setDepth(depth).setScrollFactor(scrollFactor);
    img.setDisplaySize(bounds.width, scene.scale.height).setTint(fallbackTint);
    this.layerImages.push(img);
  }

  sync(_stage: StageRuntimeState): void {
    void _stage;
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, ...this.layerImages];
  }

  destroy(): void {
    this.gfx.destroy();
    this.layerImages.forEach((i) => i.destroy());
  }
}
