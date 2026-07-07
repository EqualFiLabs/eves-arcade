import * as Phaser from 'phaser';
import type { CombatEvent, FighterState, MoveCategory, MoveId } from '@rpr/sim';

const SPARK_KEY = 'vfx_spark';

const HIT_TINT = 0xffe27a;
const BLOCK_TINT = 0x6bb8ff;
const SUPER_TINT = 0xffd866;

const SPECIAL_TINTS: Record<string, number> = {
  green_candle: 0x7cf6a4,
  red_candle: 0xff6b6b,
};

/**
 * EffectsRenderer — presentation-only combat feedback driven by `CombatEvent`s
 * emitted from the simulation (Req 11.3–11.7). Presentation only ever READS
 * events + fighter positions; it never mutates combat state (Property 10).
 *
 * Feedback map:
 * - HitEvent → amber hit sparks at the defender + a short camera shake.
 * - BlockEvent → distinct blue block sparks (fewer than a clean hit) at the defender.
 * - MoveStarted (special/super) → a themed screen tint flash + a ring bloom on
 *   the attacker. Stronger than normal attacks (Req 11.5).
 * - RoundEnded → a dramatic white flash + heavy shake + a slow particle bloom,
 *   composing with the HUD's KO/win-loss text for a distinct KO (Req 11.6).
 *
 * Readability (Req 11.7): every effect is ≤500 ms and uses modest particle
 * counts so health, fighter state, and action timing are never hidden for an
 * unreasonable duration. Health bars live on the fixed HUD camera, so they are
 * never obscured by world-space sparks at all.
 */
export class EffectsRenderer {
  private readonly scene: Phaser.Scene;
  private readonly mainCam: Phaser.Cameras.Scene2D.Camera;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly ring: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly moveCategoryOf: (id: MoveId) => MoveCategory | undefined;
  private koPresented = false;
  /** Telemetry: counts of each feedback kind played (debug + e2e visibility). */
  readonly counts = { hit: 0, block: 0, special: 0, super: 0, ko: 0 };

  constructor(
    scene: Phaser.Scene,
    mainCam: Phaser.Cameras.Scene2D.Camera,
    moveCategoryOf: (id: MoveId) => MoveCategory | undefined,
  ) {
    this.scene = scene;
    this.mainCam = mainCam;
    this.moveCategoryOf = moveCategoryOf;
    EffectsRenderer.ensureSparkTexture(scene);

    this.sparks = scene.add.particles(0, 0, SPARK_KEY, this.sparkConfig()).setDepth(100);
    this.ring = scene.add.particles(0, 0, SPARK_KEY, this.ringConfig()).setDepth(101);

    // Screen-space flash overlay (rendered by the fixed HUD camera so it never
    // scrolls/zooms with the world). Starts invisible; tweened per event.
    this.flash = scene.add
      .rectangle(scene.scale.width / 2, scene.scale.height / 2, scene.scale.width, scene.scale.height, 0xffffff, 0)
      .setScrollFactor(0)
      .setDepth(200);
  }

  /**
   * Plays the appropriate feedback for each event emitted this frame. Multiple
   * sim steps may have run since the last render frame; pass the concatenated
   * event stream so no feedback is dropped.
   */
  consumeEvents(events: readonly CombatEvent[], player: FighterState, cpu: FighterState): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.onHit(this.fighterPos(e.defenderId, player, cpu));
          break;
        case 'block':
          this.onBlock(this.fighterPos(e.defenderId, player, cpu));
          break;
        case 'move_started': {
          const cat = this.moveCategoryOf(e.moveId);
          if (cat === 'special' || cat === 'super') {
            this.onSpecialOrSuper(e.moveId, cat, this.fighterPos(e.fighterId, player, cpu));
          }
          break;
        }
        case 'round_ended':
          this.onKO(this.fighterPos(e.loser, player, cpu));
          break;
        default:
          break;
      }
    }
  }

  private onHit(pos: { x: number; y: number }): void {
    this.counts.hit += 1;
    this.sparks.setParticleTint(HIT_TINT);
    this.sparks.explode(14, pos.x, pos.y - 50);
    this.mainCam.shake(80, 0.004);
  }

  private onBlock(pos: { x: number; y: number }): void {
    this.counts.block += 1;
    this.sparks.setParticleTint(BLOCK_TINT);
    this.sparks.explode(8, pos.x, pos.y - 50);
    this.mainCam.shake(60, 0.002);
  }

  private onSpecialOrSuper(moveId: MoveId, cat: MoveCategory, pos: { x: number; y: number }): void {
    if (cat === 'super') this.counts.super += 1;
    else this.counts.special += 1;
    const tint = SPECIAL_TINTS[moveId as unknown as string] ?? SUPER_TINT;
    const isSuper = cat === 'super';
    // Themed screen flash.
    this.flash.setFillStyle(tint, 0);
    this.scene.tweens.add({
      targets: this.flash,
      alpha: { start: 0, from: 0, to: isSuper ? 0.5 : 0.32 },
      duration: isSuper ? 420 : 320,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    // Ring bloom on the attacker; bigger and longer for supers.
    this.ring.setParticleTint(tint);
    this.ring.setParticleLifespan(isSuper ? 700 : 500);
    this.ring.explode(isSuper ? 22 : 16, pos.x, pos.y - 50);
    if (isSuper) this.mainCam.shake(220, 0.006);
  }

  private onKO(pos: { x: number; y: number }): void {
    if (this.koPresented) return;
    this.koPresented = true;
    this.counts.ko += 1;
    // Big white flash.
    this.flash.setFillStyle(0xffffff, 0);
    this.scene.tweens.add({
      targets: this.flash,
      alpha: { start: 0, from: 0, to: 0.7 },
      duration: 500,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    // Heavy shake + slow bloom.
    this.mainCam.shake(450, 0.012);
    this.ring.setParticleTint(0xffffff);
    this.ring.setParticleLifespan(900);
    this.ring.explode(30, pos.x, pos.y - 50);
  }

  /** Reset KO latch (called on scene restart). */
  reset(): void {
    this.koPresented = false;
  }

  private fighterPos(id: FighterState['id'], player: FighterState, cpu: FighterState): { x: number; y: number } {
    return id === player.id ? { x: player.position.x, y: player.position.y } : { x: cpu.position.x, y: cpu.position.y };
  }

  private sparkConfig(): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig {
    return {
      emitting: false,
      lifespan: 280,
      speed: { min: 60, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 120,
      blendMode: 'add',
    };
  }

  private ringConfig(): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig {
    return {
      emitting: false,
      lifespan: 500,
      speed: { min: 140, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'add',
    };
  }

  /** World-space objects (sparks/ring) rendered by the main camera. */
  get worldObjects(): Phaser.GameObjects.GameObject[] {
    return [this.sparks, this.ring];
  }

  /** Screen-space overlay rendered by the fixed HUD camera. */
  get screenObjects(): Phaser.GameObjects.GameObject[] {
    return [this.flash];
  }

  destroy(): void {
    this.sparks.destroy();
    this.ring.destroy();
    this.flash.destroy();
  }

  private static ensureSparkTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(SPARK_KEY)) return;
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture(SPARK_KEY, 16, 16);
    g.destroy();
  }
}
