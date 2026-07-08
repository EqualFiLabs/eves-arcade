import type Phaser from 'phaser';
import type { Box } from '@rpr/sim';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * FightCamera — dual-target framing for a 1v1 fight (Req 11.2).
 *
 * Each frame the camera centers on the midpoint between the two fighters and
 * zooms so both stay on screen with horizontal margin. Zoom is clamped to the
 * stage camera config (`minZoom`..`maxZoom`), and scroll is bounded to the
 * stage world bounds so the camera never shows outside the arena. Smoothing is
 * framerate-independent so a tab stall doesn't snap the camera.
 *
 * Presentation-only: this never reads or mutates combat state beyond positions.
 */
export class FightCamera {
  private centerX: number;
  private zoom: number;
  private readonly worldCenterY: number;

  constructor(
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    bounds: Box,
    viewportHeight: number,
    private readonly viewportWidth: number,
    private readonly minZoom: number,
    private readonly maxZoom: number,
    floorY: number,
    private readonly marginX = 300,
  ) {
    cam.setBounds(bounds.x, 0, bounds.width, viewportHeight);
    this.worldCenterY = floorY - viewportHeight * 0.08;
    this.centerX = 0;
    this.zoom = minZoom;
  }

  /** Recomputes framing targets and applies smoothed scroll/zoom. */
  update(playerX: number, cpuX: number, delta: number): void {
    const midX = (playerX + cpuX) / 2;
    const dist = Math.abs(cpuX - playerX);
    const fitZoom = this.viewportWidth / (dist + this.marginX * 2);

    const targetZoom = clamp(fitZoom, this.minZoom, this.maxZoom);

    // Framerate-independent exponential smoothing.
    const k = 1 - Math.pow(0.0025, delta / 1000);
    this.zoom += (targetZoom - this.zoom) * k;
    this.centerX += (midX - this.centerX) * k;

    this.cam.setZoom(this.zoom);
    this.cam.centerOn(this.centerX, this.worldCenterY);
  }

  /** Snaps framing instantly (used on scene start / restart). */
  snap(playerX: number, cpuX: number): void {
    this.centerX = (playerX + cpuX) / 2;
    const dist = Math.abs(cpuX - playerX);
    this.zoom = clamp(this.viewportWidth / (dist + this.marginX * 2), this.minZoom, this.maxZoom);
    this.cam.setZoom(this.zoom);
    this.cam.centerOn(this.centerX, this.worldCenterY);
  }
}
