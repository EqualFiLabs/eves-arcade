import * as Phaser from 'phaser';
import type { FighterDefinition, FighterState } from '@rpr/sim';

const SMINEM_COLOR = 0x7cf6a4;
const BOGDANOFF_COLOR = 0xff6b6b;

/**
 * FighterRenderer — renders a fighter from `FighterState` in sim world space
 * (Req 7.1, 8.2, 6.10). Presentation-only; never mutates combat state.
 *
 * The silhouette is derived from the fighter's pushbox/hurtboxes, flipped to
 * match `facing`, and recolored per `currentState` so each state reads
 * distinctly: idle/walk (fighter color), crouch (shorter), jump (airborne +
 * floor shadow), attack (fighter color + leading arm), block (blue), hitstun
 * (amber flash), blockstun (cyan flash), ko (fallen). Replaced by the textured,
 * animated renderer in Tasks 13.2/13.3 art work.
 */
export class FighterRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly color: number;
  private readonly bodyW: number;
  private readonly bodyH: number;
  private readonly crouchH: number;
  private readonly floorY: number;
  private readonly name: string;

  constructor(
    scene: Phaser.Scene,
    private readonly def: FighterDefinition,
    isPlayer: boolean,
    floorY: number,
    depth = 0,
  ) {
    this.color = isPlayer ? SMINEM_COLOR : BOGDANOFF_COLOR;
    this.name = isPlayer ? 'SMINEM' : 'BOGDANOFF';
    this.floorY = floorY;
    this.gfx = scene.add.graphics().setDepth(depth);
    this.shadow = scene.add.graphics().setDepth(depth - 1);
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: isPlayer ? '#7cf6a4' : '#ff6b6b',
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 1);

    const pb = def.pushbox;
    this.bodyW = pb.width;
    this.bodyH = pb.height;
    this.crouchH = def.defaultHurtboxes.crouch[0]?.height ?? pb.height * 0.55;
  }

  sync(f: FighterState): void {
    const x = f.position.x;
    const baseY = f.position.y;
    const isCrouch = f.currentState === 'crouch';
    const isLowBlock =
      (f.currentState === 'block' || f.currentState === 'blockstun') && f.runtimeFlags.blockHeight === 'low';
    const bodyH = isCrouch || isLowBlock ? this.crouchH : this.bodyH;
    const top = baseY - bodyH;
    const halfW = this.bodyW / 2;
    const facingSign = f.facing === 'right' ? 1 : -1;
    const ko = f.currentState === 'ko' || f.hasLost;

    this.gfx.clear();
    this.shadow.clear();

    // Floor shadow (stronger when grounded).
    const airborne = !f.grounded;
    const shadowAlpha = airborne ? 0.18 : 0.4;
    this.shadow.fillStyle(0x000000, shadowAlpha);
    this.shadow.fillEllipse(x, this.floorY + 4, this.bodyW * 1.1, 12);

    // Body color by state.
    let fill = this.color;
    if (f.currentState === 'block' || f.currentState === 'blockstun') {
      // High guard = blue, low guard = teal so the two stances read distinctly
      // and the player can read the CPU's commit (Req 11.4).
      fill = f.runtimeFlags.blockHeight === 'low' ? 0x49d6c4 : 0x6bb8ff;
    } else if (f.currentState === 'hitstun') fill = 0xffd866;

    if (ko) {
      // Fallen: flat slab on the floor.
      this.gfx.fillStyle(fill, 0.85);
      this.gfx.lineStyle(3, 0xff6b6b, 0.9);
      this.gfx.fillRoundedRect(x - this.bodyH / 2, this.floorY - 24, this.bodyH, 36, 8);
      this.gfx.strokeRoundedRect(x - this.bodyH / 2, this.floorY - 24, this.bodyH, 36, 8);
    } else {
      // Body box.
      this.gfx.lineStyle(3, fill, 1);
      this.gfx.fillStyle(fill, 0.82);
      this.gfx.fillRoundedRect(x - halfW, top, this.bodyW, bodyH, 6);
      this.gfx.strokeRoundedRect(x - halfW, top, this.bodyW, bodyH, 6);

      // Facing nub (eyes/nose indicator).
      this.gfx.fillStyle(0xffffff, 0.92);
      this.gfx.fillRect(x + facingSign * (halfW - 8) - 3, top + 18, 10, 8);

      // Attack: show a leading arm during strikes.
      if (f.currentState === 'attack') {
        this.gfx.fillStyle(fill, 0.9);
        this.gfx.fillRect(x + facingSign * halfW, top + bodyH * 0.35, facingSign * 34, 14);
      }

      // Walk motion ticks.
      if (f.currentState === 'walk_forward' || f.currentState === 'walk_backward') {
        this.gfx.lineStyle(2, 0xffffff, 0.4);
        const back = -facingSign * (halfW + 6);
        this.gfx.lineBetween(x + back, top + bodyH * 0.5, x + back - facingSign * 8, top + bodyH * 0.5);
      }
    }

    this.label.setPosition(x, top - 6);
    this.label.setText(`${this.name}  ${Math.round(f.health)}  m${Math.round(f.meter)}`);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.shadow, this.label];
  }

  destroy(): void {
    this.gfx.destroy();
    this.shadow.destroy();
    this.label.destroy();
  }
}
