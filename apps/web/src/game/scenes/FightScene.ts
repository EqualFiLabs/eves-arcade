import * as Phaser from 'phaser';
import {
  type CombatInput,
  BogdanoffBossBrain,
  CombatEngine,
  MAX_STEPS_PER_FRAME,
  NEUTRAL_INPUT,
  SIM_FPS,
  SIM_STEP_MS,
} from '@rpr/sim';
import {
  bogdanoffCpuProfile,
  bogdanoffDefinition,
  createV1FightState,
  sminemDefinition,
  v1Moves,
} from '@rpr/content';
import { InputMapper } from '../input/InputMapper';
import { FighterRenderer } from '../renderers/FighterRenderer';
import { HudView } from '../renderers/HudView';
import { StageRenderer } from '../renderers/StageRenderer';

/**
 * FightScene — owns the Phaser runtime for the fight (design: FightScene).
 *
 * Instantiates the deterministic {@link CombatEngine}, the {@link BogdanoffBossBrain}
 * CPU, the {@link InputMapper}, placeholder renderers, and the HUD, then advances
 * the simulation at a fixed 60 Hz step driven by a delta accumulator (Req 15.3).
 *
 * Presentation only ever READS sim state (Property 10); it never mutates combat
 * state. CPU legality is enforced by the engine on every step (Property 9).
 *
 * On KO the scene shows an in-scene result overlay and offers rematch/menu until
 * the dedicated ResultScene lands in Task 18.
 */
export class FightScene extends Phaser.Scene {
  private engine!: CombatEngine;
  private brain!: BogdanoffBossBrain;
  private inputMapper!: InputMapper;
  private stage!: StageRenderer;
  private playerRenderer!: FighterRenderer;
  private cpuRenderer!: FighterRenderer;
  private hud!: HudView;

  private accumulator = 0;
  private settled = false;
  private muted = false;

  constructor() {
    super({ key: 'FightScene' });
  }

  create(): void {
    this.engine = new CombatEngine({
      createInitialState: (seed) => createV1FightState(seed),
      definitions: [sminemDefinition, bogdanoffDefinition],
      moves: v1Moves,
      seed: 0,
    });
    this.brain = new BogdanoffBossBrain();
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('FightScene: keyboard input plugin unavailable');
    this.inputMapper = new InputMapper(keyboard);
    this.muted = !!this.game.registry.get('muted');

    this.stage = new StageRenderer(this, this.engine.state.stage);
    const t = this.stage.screenTransform;
    this.playerRenderer = new FighterRenderer(this, t, sminemDefinition.pushbox, true);
    this.cpuRenderer = new FighterRenderer(this, t, bogdanoffDefinition.pushbox, false);
    this.hud = new HudView(this);

    this.accumulator = 0;
    this.settled = false;

    // Rematch / menu / mute handling.
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.settled) this.scene.restart();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));
    this.input.keyboard?.on('keydown-M', () => {
      this.muted = !this.muted;
      this.game.registry.set('muted', this.muted);
    });

    // Expose for e2e/debug.
    (window as unknown as { __engine?: unknown }).__engine = this.engine;
  }

  override update(_time: number, delta: number): void {
    if (this.settled) {
      this.syncPresentation();
      return;
    }

    // Accumulate render delta and cap after tab stalls to avoid a spiral of
    // death (Req 15.4). The cap keeps at most MAX_STEPS_PER_FRAME fixed steps
    // per frame, so combat state is never corrupted by a huge catch-up burst.
    this.accumulator += delta;
    const cap = MAX_STEPS_PER_FRAME * SIM_STEP_MS;
    if (this.accumulator > cap) this.accumulator = cap;

    while (this.accumulator >= SIM_STEP_MS) {
      const playerInput: CombatInput = this.engine.state.status === 'active' ? this.inputMapper.poll() : NEUTRAL_INPUT;
      const cpuInput = this.brain.decide(this.engine.state, bogdanoffCpuProfile);
      this.engine.step(playerInput, cpuInput);
      this.accumulator -= SIM_STEP_MS;

      if (this.engine.state.status !== 'active') {
        this.settled = true;
        break;
      }
    }

    this.syncPresentation();
  }

  /** Mirrors current sim state into renderers + HUD (Property 10). */
  private syncPresentation(): void {
    const s = this.engine.state;
    this.stage.sync(s.stage);
    this.playerRenderer.sync(s.player);
    this.cpuRenderer.sync(s.cpu);
    this.hud.sync(s.player, s.cpu, s.status);
  }

  shutdown(): void {
    this.stage?.destroy();
    this.playerRenderer?.destroy();
    this.cpuRenderer?.destroy();
    this.hud?.destroy();
  }
}

export { SIM_FPS };
