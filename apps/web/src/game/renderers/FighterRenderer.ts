import * as Phaser from 'phaser';
import type { Box, FighterState } from '@rpr/sim';
import type { ScreenTransform } from './screen-transform';
import { toScreenX, toScreenY } from './screen-transform';

const SMINEM_COLOR = 0x7cf6a4;
const BOGDANOFF_COLOR = 0xff6b6b;

/**
 * FighterRenderer (PLACEHOLDER) — draws a fighter as a colored box derived from
 * its pushbox, with a facing nub and a state label. Reads only sim state and
 * mirrors it (never mutates combat state — Property 10). Replaced by the
 * textured FighterRenderer + animations in Tasks 13.2/13.3.
 */
export class FighterRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly transform: ScreenTransform;
  private readonly color: number;

  constructor(scene: Phaser.Scene, transform: ScreenTransform, pushbox: Box, isPlayer: boolean, depth = 0) {
    this.transform = transform;
    this.color = isPlayer ? SMINEM_COLOR : BOGDANOFF_COLOR;
    this.gfx = scene.add.graphics().setDepth(depth);
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: isPlayer ? '#7cf6a4' : '#ff6b6b',
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 1);
    void pushbox;
  }

  sync(f: FighterState): void {
    const cx = toScreenX(this.transform, f.position.x);
    const baseY = toScreenY(this.transform, f.position.y);
    // Approximate body box from the stand hurtbox height for a readable silhouette.
    const halfW = 26;
    const bodyH = 132;
    const top = baseY - bodyH;

    this.gfx.clear();

    // Body.
    const strokeColor = f.currentState === 'hitstun' ? 0xffd866 : f.currentState === 'block' ? 0x6bb8ff : this.color;
    this.gfx.lineStyle(3, strokeColor, 1);
    this.gfx.fillStyle(this.color, 0.85);
    this.gfx.fillRect(cx - halfW, top, halfW * 2, bodyH);
    this.gfx.strokeRect(cx - halfW, top, halfW * 2, bodyH);

    // Facing nub.
    const facingSign = f.facing === 'right' ? 1 : -1;
    this.gfx.fillStyle(0xffffff, 0.9);
    this.gfx.fillRect(cx + facingSign * (halfW - 4) - 3, top + 18, 10, 10);

    // KO overlay.
    if (f.currentState === 'ko' || f.hasLost) {
      this.gfx.lineStyle(2, 0xff6b6b, 0.8);
      this.gfx.strokeRect(cx - halfW - 4, top - 4, halfW * 2 + 8, bodyH + 8);
    }

    this.label.setPosition(cx, top - 6);
    this.label.setText(`${f.currentState} | hp ${Math.round(f.health)} | meter ${Math.round(f.meter)}`);
  }

  destroy(): void {
    this.gfx.destroy();
    this.label.destroy();
  }
}
