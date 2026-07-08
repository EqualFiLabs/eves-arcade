import * as Phaser from 'phaser';
import { gameCopy } from '@rpr/content';

/**
 * MenuScene — title, start action, controls hint, mute hint (Req 1.6, 3.7, 3.8,
 * 5.10, 12.7). No character selection is required for V1.
 *
 * Press ENTER to start the fight. M toggles mute (shared via the game registry).
 */
export class MenuScene extends Phaser.Scene {
  private startHint!: Phaser.GameObjects.Text;
  private muted = false;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a0f');
    this.muted = !!this.game.registry.get('muted');

    this.add
      .text(width / 2, height * 0.26, gameCopy.title, {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#7cf6a4',
        stroke: '#0a0a0f',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.36, gameCopy.subtitle, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#9fb0c0',
      })
      .setOrigin(0.5);

    // Controls hint (Req 5.10: keyboard is fully playable).
    const controls = [
      'Controls',
      'Move: ← →    Jump: ↑    Crouch: ↓    Block: Left Shift',
      'Lt High: A   Lt Low: Z   Hy High: S   Hy Low: X',
      'Special: C   Super: V',
      '',
      'M: mute    Enter: start',
    ];
    this.add
      .text(width / 2, height * 0.56, controls.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#cfd6dd',
        align: 'center',
      })
      .setOrigin(0.5);

    this.startHint = this.add
      .text(width / 2, height * 0.78, this.startLabel(), {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffd866',
      })
      .setOrigin(0.5);

    // Pulsing call-to-action.
    this.tweens.add({
      targets: this.startHint,
      alpha: { from: 1, to: 0.45 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    const enter = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    enter?.on('down', () => this.scene.start('FightScene'));

    const mute = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    mute?.on('down', () => this.toggleMute());
  }

  private startLabel(): string {
    return `Press ENTER to fight   |   M: ${this.muted ? 'unmute' : 'mute'}`;
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.game.registry.set('muted', this.muted);
    // Persist via the shell context stashed at launch (muted now lives in shell settings, Req 1.6).
    const ctx = this.game.registry.get('arcade') as { updateSettings?: (p: { muted?: boolean }) => void } | undefined;
    ctx?.updateSettings?.({ muted: this.muted });
    this.startHint.setText(this.startLabel());
  }
}
