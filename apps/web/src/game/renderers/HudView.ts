import * as Phaser from 'phaser';
import type { FighterState, RoundStatus } from '@rpr/sim';

const BAR_W = 460;
const BAR_H = 22;
const METER_H = 8;

/**
 * HudView (PLACEHOLDER) — top health and meter bars plus round status. Reads
 * only sim state (Property 10). Replaced by the textured HudView in Task 13.5.
 *
 * Health drains inward (player from right, CPU from left) the way fighting-game
 * bars conventionally behave.
 */
export class HudView {
  private readonly scene: Phaser.Scene;
  private readonly hpBg: Phaser.GameObjects.Graphics;
  private readonly hpFill: Phaser.GameObjects.Graphics;
  private readonly meterFill: Phaser.GameObjects.Graphics;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width } = scene.scale;
    const topY = 24;
    const margin = 40;

    this.hpBg = scene.add.graphics().setDepth(100);
    this.hpFill = scene.add.graphics().setDepth(101);
    this.meterFill = scene.add.graphics().setDepth(101);

    this.statusText = scene.add
      .text(width / 2, topY + 8, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffd866',
      })
      .setOrigin(0.5, 0)
      .setDepth(102);

    this.hint = scene.add
      .text(width / 2, scene.scale.height - 16, 'Enter: start/restart   |   Esc: menu   |   M: mute', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#6a7385',
      })
      .setOrigin(0.5, 1)
      .setDepth(102);

    // Static frames drawn once.
    this.hpBg.lineStyle(2, 0x3a3a4a, 1);
    this.hpBg.fillStyle(0x101018, 0.8);
    this.hpBg.fillRect(margin, topY, BAR_W, BAR_H);
    this.hpBg.strokeRect(margin, topY, BAR_W, BAR_H);
    this.hpBg.fillRect(width - margin - BAR_W, topY, BAR_W, BAR_H);
    this.hpBg.strokeRect(width - margin - BAR_W, topY, BAR_W, BAR_H);

    void this.hint;
  }

  sync(player: FighterState, cpu: FighterState, status: RoundStatus): void {
    const { width } = this.scene.scale;
    const topY = 24;
    const margin = 40;
    const meterY = topY + BAR_H + 4;

    this.hpFill.clear();
    this.meterFill.clear();

    // Player health (drains right→left).
    const pHpFrac = Math.max(0, player.health) / player.maxHealth;
    this.hpFill.fillStyle(0x7cf6a4, 1);
    this.hpFill.fillRect(margin, topY, BAR_W * pHpFrac, BAR_H);

    // CPU health (drains left→right).
    const cHpFrac = Math.max(0, cpu.health) / cpu.maxHealth;
    this.hpFill.fillStyle(0xff6b6b, 1);
    this.hpFill.fillRect(width - margin - BAR_W * cHpFrac, topY, BAR_W * cHpFrac, BAR_H);

    // Meter bars.
    const pMeterFrac = Math.max(0, Math.min(1, player.meter / player.maxMeter));
    this.meterFill.fillStyle(0xffd866, 1);
    this.meterFill.fillRect(margin, meterY, BAR_W * pMeterFrac, METER_H);

    const cMeterFrac = Math.max(0, Math.min(1, cpu.meter / cpu.maxMeter));
    this.meterFill.fillStyle(0xffd866, 1);
    this.meterFill.fillRect(width - margin - BAR_W * cMeterFrac, meterY, BAR_W * cMeterFrac, METER_H);

    this.statusText.setText(this.statusTextFor(status));
  }

  private statusTextFor(status: RoundStatus): string {
    switch (status) {
      case 'player_win':
        return 'KO — YOU WIN!   (Enter: rematch   Esc: menu)';
      case 'cpu_win':
        return 'KO — REKT   (Enter: rematch   Esc: menu)';
      case 'paused':
        return 'PAUSED';
      case 'intro':
        return 'GET READY';
      default:
        return '';
    }
  }

  destroy(): void {
    this.hpBg.destroy();
    this.hpFill.destroy();
    this.meterFill.destroy();
    this.statusText.destroy();
    this.hint.destroy();
  }
}
