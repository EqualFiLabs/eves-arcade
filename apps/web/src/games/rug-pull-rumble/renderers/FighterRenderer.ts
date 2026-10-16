import * as Phaser from 'phaser';
import type { FighterDefinition, FighterState } from '@rpr/sim';
import type { OperatorAppearance } from '@rpr/protocol';
import { bakeOperatorAtlas, type ArmorPart } from './operator-art';
import { sampleOperatorPose, type Joint, type OperatorPose } from './operator-pose';

let rendererId = 0;

/** Articulated vector armor. Reads combat snapshots, owns only presentation. */
export class FighterRenderer {
  private readonly rig: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly seal: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly parts: Record<string, Phaser.GameObjects.Image> = {};
  private readonly textureKeys: string[] = [];
  private readonly scale: number;
  private lastPose?: OperatorPose;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    def: FighterDefinition,
    isPlayer: boolean,
    private readonly floorY: number,
    depth = 0,
    appearance?: OperatorAppearance,
  ) {
    const owner = `operator-rig-${++rendererId}`;
    const role = isPlayer ? 'PLAYER' : 'CPU';
    this.scale = def.pushbox.height / 130;
    this.rig = scene.add.container(0, 0).setDepth(depth).setName(owner);
    const atlas = bakeOperatorAtlas(scene, owner, appearance);
    this.textureKeys.push(owner);
    const image = (part: ArmorPart, name: string): Phaser.GameObjects.Image => {
      const art = atlas[part];
      return scene.add.image(0, 0, art.key, art.frame).setDisplaySize(art.width, art.height)
        .setOrigin(art.originX, art.originY).setName(name);
    };
    this.shadow = scene.add.ellipse(0, floorY + 4, 72, 12, 0x000000, 0.5).setDepth(depth - 2);
    this.seal = image('seal', `${role}-seal`).setDepth(depth - 1).setAlpha(0.35);
    const add = (name: string, part: ArmorPart): void => {
      const obj = image(part, name); this.parts[name] = obj; this.rig.add(obj);
    };
    add('mantle', 'mantle');
    for (const side of ['rear', 'front']) { add(`${side}Thigh`, 'thigh'); add(`${side}Shin`, 'shin'); add(`${side}Boot`, 'boot'); }
    add('rearUpperArm', 'upperArm'); add('rearForearm', 'forearm'); add('rearFist', 'fist'); add('rearShoulder', 'shoulder');
    add('hip', 'hip'); add('torso', 'torso'); add('abdomen', 'abdomen'); add('head', 'head');
    add('frontUpperArm', 'upperArm'); add('frontForearm', 'forearm'); add('frontShoulder', 'shoulder'); add('frontFist', 'fist');
    this.label = scene.add.text(0, 0, appearance ? `${role} · #${appearance.tokenId}` : role, {
      fontFamily: 'monospace', fontSize: '10px', color: isPlayer ? '#7cf6a4' : '#ff6b6b',
      stroke: '#080d10', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(depth + 1);
  }

  sync(f: FighterState, frame = 0): void {
    if (this.destroyed) return;
    const p = sampleOperatorPose(f, frame, this.lastPose);
    this.lastPose = p;
    const sign = f.facing === 'right' ? 1 : -1;
    const baseY = f.hasLost || f.currentState === 'ko' ? this.floorY : f.position.y;
    this.rig.setPosition(f.position.x + p.rootX * sign * this.scale, baseY + p.rootY * this.scale)
      .setScale(sign * this.scale, this.scale).setRotation(p.rotation * sign);
    const at = (name: string, j: Joint, rotation = 0, sx = 1, sy = 1): void => {
      this.parts[name]!.setPosition(j.x, j.y).setRotation(rotation).setScale(sx / 3, sy / 3);
    };
    const bone = (name: string, a: Joint, b: Joint, length = 26): void => {
      at(name, a, Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2, 1, Math.hypot(b.x - a.x, b.y - a.y) / length);
    };
    at('mantle', p.neck); at('hip', p.hip);
    bone('torso', p.neck, p.hip, 39);
    at('abdomen', { x: p.hip.x, y: p.hip.y - 29 });
    at('head', p.head, (p.head.x - p.neck.x) * 0.012);
    for (const side of ['rear', 'front'] as const) {
      bone(`${side}Thigh`, p[`${side}Hip`], p[`${side}Knee`]);
      bone(`${side}Shin`, p[`${side}Knee`], p[`${side}Ankle`]);
      at(`${side}Boot`, p[`${side}Ankle`]);
      bone(`${side}UpperArm`, p[`${side}Shoulder`], p[`${side}Elbow`]);
      bone(`${side}Forearm`, p[`${side}Elbow`], p[`${side}Hand`]);
      at(`${side}Shoulder`, p[`${side}Shoulder`]);
      at(`${side}Fist`, p[`${side}Hand`], -0.25);
    }
    const flash = f.currentState === 'hitstun' && frame % 6 < 2;
    for (const [name, obj] of Object.entries(this.parts)) {
      if (flash) obj.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else obj.setTint(name.startsWith('rear') ? 0xb8c9c2 : 0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
    }
    this.shadow.setPosition(f.position.x, this.floorY + 4).setAlpha(f.grounded ? 0.5 : 0.22);
    this.seal.setPosition(f.position.x, this.floorY + 3).setScale(1.4 / 3, 0.32 / 3).setAlpha(f.grounded ? 0.35 : 0.15);
    this.label.setPosition(f.position.x, f.hasLost ? this.floorY - 30 : f.position.y + p.head.y * this.scale - 24);
  }

  get objects(): Phaser.GameObjects.GameObject[] { return [this.rig, this.shadow, this.seal, this.label]; }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rig.destroy(); this.shadow.destroy(); this.seal.destroy(); this.label.destroy();
    for (const key of this.textureKeys) this.scene.textures.remove(key);
  }
}
