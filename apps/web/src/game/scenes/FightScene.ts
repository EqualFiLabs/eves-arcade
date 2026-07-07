import * as Phaser from 'phaser';
import {
  type CombatEvent,
  type CombatInput,
  type MoveCategory,
  type MoveId,
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
  marketControlRoom,
  sminemDefinition,
  v1Moves,
} from '@rpr/content';
import { InputMapper } from '../input/InputMapper';
import { KeyboardInputSource } from '../input/KeyboardInputSource';
import { GamepadInputSource } from '../input/GamepadInputSource';
import type { InputSource } from '../input/InputSource';
import { FighterRenderer } from '../renderers/FighterRenderer';
import { HudView } from '../renderers/HudView';
import { StageRenderer } from '../renderers/StageRenderer';
import { FightCamera } from '../renderers/FightCamera';
import { EffectsRenderer } from '../renderers/EffectsRenderer';

/**
 * FightScene — owns the Phaser runtime for the fight (design: FightScene).
 *
 * Instantiates the deterministic {@link CombatEngine}, the {@link BogdanoffBossBrain}
 * CPU, the {@link InputMapper}, the stage/fighter renderers, the HUD, and a
 * dual-target {@link FightCamera}, then advances the simulation at a fixed 60 Hz
 * step driven by a delta accumulator (Req 15.3).
 *
 * Two cameras keep presentation correct: the main camera frames the world
 * (scrolls + zooms), while a fixed HUD camera renders the HUD without
 * distortion. Presentation only ever READS sim state (Property 10); it never
 * mutates combat state. CPU legality is enforced by the engine (Property 9).
 *
 * On KO the scene shows an in-scene result overlay and offers rematch/menu
 * until the dedicated ResultScene lands in Task 18.
 */
export class FightScene extends Phaser.Scene {
  private engine!: CombatEngine;
  private brain!: BogdanoffBossBrain;
  private inputMapper!: InputMapper;
  private keyboardSource: KeyboardInputSource | null = null;
  private stage!: StageRenderer;
  private playerRenderer!: FighterRenderer;
  private cpuRenderer!: FighterRenderer;
  private hud!: HudView;
  private effects!: EffectsRenderer;
  private fightCam!: FightCamera;
  private hudCam!: Phaser.Cameras.Scene2D.Camera;

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
    const sources: InputSource[] = [];
    this.keyboardSource = new KeyboardInputSource(keyboard);
    sources.push(this.keyboardSource);
    if (this.input.gamepad) sources.push(new GamepadInputSource(this.input.gamepad));
    this.inputMapper = new InputMapper(sources);
    this.muted = !!this.game.registry.get('muted');

    // --- Renderers (world space) + HUD (fixed). ---
    this.stage = new StageRenderer(this, this.engine.state.stage, marketControlRoom);
    this.playerRenderer = new FighterRenderer(this, sminemDefinition, true, marketControlRoom.floorY);
    this.cpuRenderer = new FighterRenderer(this, bogdanoffDefinition, false, marketControlRoom.floorY);
    this.hud = new HudView(this);

    // --- Combat feedback (particles + screen flash) driven by CombatEvents. ---
    const moveCategoryOf = (id: MoveId): MoveCategory | undefined => v1Moves.find((m) => m.id === id)?.category;
    this.effects = new EffectsRenderer(this, this.cameras.main, moveCategoryOf);

    // --- Dual-target framing camera + a separate fixed HUD camera. ---
    const main = this.cameras.main;
    const cam = marketControlRoom.camera;
    this.fightCam = new FightCamera(
      main,
      this.engine.state.stage.worldBounds,
      this.scale.height,
      this.scale.width,
      cam.minZoom,
      cam.maxZoom,
      marketControlRoom.floorY,
    );
    this.fightCam.snap(this.engine.state.player.position.x, this.engine.state.cpu.position.x);

    this.hudCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'hud');
    this.hudCam.setScroll(0, 0).setZoom(1);
    // Each camera renders only its own layer. The HUD camera also renders the
    // effects flash overlay (screen-space); world-space sparks stay on main.
    main.ignore(this.hud.objects);
    this.hudCam.ignore([
      ...this.stage.objects,
      ...this.playerRenderer.objects,
      ...this.cpuRenderer.objects,
      ...this.effects.worldObjects,
    ]);
    main.ignore(this.effects.screenObjects);

    this.accumulator = 0;
    this.settled = false;

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.settled) this.scene.restart();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));
    this.input.keyboard?.on('keydown-M', () => {
      this.muted = !this.muted;
      this.game.registry.set('muted', this.muted);
    });

    (window as unknown as { __engine?: unknown }).__engine = this.engine;
    (window as unknown as { __effects?: unknown }).__effects = this.effects;
  }

  override update(_time: number, delta: number): void {
    if (!this.settled) {
      // Accumulate render delta and cap after tab stalls to avoid a spiral of
      // death (Req 15.4); at most MAX_STEPS_PER_FRAME fixed steps per frame.
      this.accumulator += delta;
      const cap = MAX_STEPS_PER_FRAME * SIM_STEP_MS;
      if (this.accumulator > cap) this.accumulator = cap;

      // Collect events from every fixed step this frame so presentation
      // feedback never drops a hit/block/special/KO (Property 10).
      const frameEvents: CombatEvent[] = [];
      while (this.accumulator >= SIM_STEP_MS) {
        const playerInput: CombatInput =
          this.engine.state.status === 'active' ? this.inputMapper.poll() : NEUTRAL_INPUT;
        const cpuInput = this.brain.decide(this.engine.state, bogdanoffCpuProfile);
        const step = this.engine.step(playerInput, cpuInput);
        frameEvents.push(...step.events);
        this.accumulator -= SIM_STEP_MS;
        if (this.engine.state.status !== 'active') {
          this.settled = true;
          break;
        }
      }
      this.effects.consumeEvents(frameEvents, this.engine.state.player, this.engine.state.cpu);
    }

    // Presentation follows simulation (Property 10).
    const s = this.engine.state;
    this.stage.sync(s.stage);
    this.playerRenderer.sync(s.player);
    this.cpuRenderer.sync(s.cpu);
    this.hud.sync(s.player, s.cpu, s.status);
    this.fightCam.update(s.player.position.x, s.cpu.position.x, delta);
  }

  shutdown(): void {
    this.keyboardSource?.destroy();
    this.keyboardSource = null;
    this.stage?.destroy();
    this.playerRenderer?.destroy();
    this.cpuRenderer?.destroy();
    this.hud?.destroy();
    this.effects?.destroy();
  }
}

export { SIM_FPS };
