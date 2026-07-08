import * as Phaser from 'phaser';
import type { FighterState, RoundStatus } from '@rpr/sim';
import { gameCopy } from '@rpr/content';

const BAR_W = 460;
const BAR_H = 22;
const METER_H = 8;

/**
 * HudView — top health bars, player meter bar, and themed round / KO / win /
 * loss / restart text (Req 10.1–10.9). Reads only sim state (Property 10) and
 * the data-driven copy (Req 16.4).
 *
 * Health drains inward (player right→left, CPU left→right). Round-end messages
 * are chosen from the themed copy arrays so the outcome is obvious without text
 * parsing alone (Req 10.7/10.9).
 */
export class HudView {
  private readonly scene: Phaser.Scene;
  private readonly hpBg: Phaser.GameObjects.Graphics;
  private readonly hpFill: Phaser.GameObjects.Graphics;
  private readonly meterFill: Phaser.GameObjects.Graphics;
  private readonly names: Phaser.GameObjects.Text;
  private readonly centerText: Phaser.GameObjects.Text;
  private readonly restartHint: Phaser.GameObjects.Text;
  private centerShown = false;
  private lastStatus: import('@rpr/sim').RoundStatus | null = null;
  private cachedLine = '';
  private cachedKo = '';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width, height } = scene.scale;
    const topY = 22;
    const margin = 40;

    this.hpBg = scene.add.graphics();
    this.hpFill = scene.add.graphics();
    this.meterFill = scene.add.graphics();

    this.names = scene.add
      .text(width / 2, topY + 6, 'SMINEM                      BOGDANOFF', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#cfd6dd',
      })
      .setOrigin(0.5, 0);

    this.centerText = scene.add
      .text(width / 2, height * 0.4, '', {
        fontFamily: 'monospace',
        fontSize: '44px',
        color: '#ffd866',
        stroke: '#0a0a0f',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.restartHint = scene.add
      .text(width / 2, height - 18, `${gameCopy.restartHint}   |   Esc: menu   |   ${gameCopy.muteHint}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#6a7385',
      })
      .setOrigin(0.5, 1);

    // Static bar frames drawn once.
    this.hpBg.lineStyle(2, 0x3a3a4a, 1);
    this.hpBg.fillStyle(0x101018, 0.85);
    this.hpBg.fillRect(margin, topY, BAR_W, BAR_H);
    this.hpBg.strokeRect(margin, topY, BAR_W, BAR_H);
    this.hpBg.fillRect(width - margin - BAR_W, topY, BAR_W, BAR_H);
    this.hpBg.strokeRect(width - margin - BAR_W, topY, BAR_W, BAR_H);
  }

  sync(player: FighterState, cpu: FighterState, status: RoundStatus): void {
    const { width } = this.scene.scale;
    const topY = 22;
    const margin = 40;
    const meterY = topY + BAR_H + 4;

    this.hpFill.clear();
    this.meterFill.clear();

    const pHp = Math.max(0, player.health) / player.maxHealth;
    this.hpFill.fillStyle(0x7cf6a4, 1);
    this.hpFill.fillRect(margin, topY, BAR_W * pHp, BAR_H);

    const cHp = Math.max(0, cpu.health) / cpu.maxHealth;
    this.hpFill.fillStyle(0xff6b6b, 1);
    this.hpFill.fillRect(width - margin - BAR_W * cHp, topY, BAR_W * cHp, BAR_H);

    const pMeter = Math.max(0, Math.min(1, player.meter / player.maxMeter));
    this.meterFill.fillStyle(0xffd866, 1);
    this.meterFill.fillRect(margin, meterY, BAR_W * pMeter, METER_H);

    const cMeter = Math.max(0, Math.min(1, cpu.meter / cpu.maxMeter));
    this.meterFill.fillStyle(0xffd866, 1);
    this.meterFill.fillRect(width - margin - BAR_W * cMeter, meterY, BAR_W * cMeter, METER_H);

    this.updateCenterText(status);
  }

  private updateCenterText(status: RoundStatus): void {
    if (status === 'active') {
      if (this.centerShown) {
        this.centerText.setVisible(false);
        this.centerShown = false;
      }
      this.lastStatus = status;
      return;
    }
    // Only (re)roll the random copy when the status actually changes, so the
    // KO / win-loss message stays stable instead of flickering every frame.
    if (status !== this.lastStatus) {
      this.cachedLine =
        status === 'player_win'
          ? pick(gameCopy.playerWin)
          : status === 'cpu_win'
            ? pick(gameCopy.playerLoss)
            : status === 'intro'
              ? pick(gameCopy.roundStart)
              : '';
      this.cachedKo = status === 'player_win' || status === 'cpu_win' ? pick(gameCopy.ko) : '';
      this.lastStatus = status;
    }
    this.centerText.setText(this.cachedKo ? `${this.cachedLine}\n${this.cachedKo}` : this.cachedLine);
    this.centerText.setVisible(true);
    this.centerShown = true;
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.hpBg, this.hpFill, this.meterFill, this.names, this.centerText, this.restartHint];
  }

  destroy(): void {
    this.hpBg.destroy();
    this.hpFill.destroy();
    this.meterFill.destroy();
    this.names.destroy();
    this.centerText.destroy();
    this.restartHint.destroy();
  }
}

const pick = (arr: readonly string[]): string => arr[Math.floor(Math.random() * arr.length)] ?? '';
