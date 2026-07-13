import * as Phaser from 'phaser';
import {
  type CombatEvent,
  type CombatInput,
  type MoveCategory,
  type MoveId,
  MAX_STEPS_PER_FRAME,
  SIM_FPS,
  SIM_STEP_MS,
} from '@rpr/sim';
import {
  bogdanoffDefinition,
  marketControlRoom,
  sminemDefinition,
  v1Moves,
} from '@rpr/content';
import { RprMatch, decodeRprTrace } from '@rpr/rug-pull-rumble-core';
import { FighterRenderer } from '../renderers/FighterRenderer';
import { HudView } from '../renderers/HudView';
import { StageRenderer } from '../renderers/StageRenderer';
import { FightCamera } from '../renderers/FightCamera';
import { EffectsRenderer } from '../renderers/EffectsRenderer';

/**
 * ReplayScene — dev-only replay viewer (Req 10.5, 14.2).
 *
 * Reuses the exact same renderers, camera setup, and effects pipeline as
 * {@link FightScene}, but reads player input from a recorded trace instead of
 * live device sources. No new rendering code — every visual is identical to a
 * live fight.
 *
 * Playback is controlled via the Phaser registry:
 * - `replayPlaying` (boolean, default true) — play / pause
 * - `replaySpeed` (number, default 1) — accumulator multiplier (0.5 = half, 2 = double)
 * - `replayStep` (boolean, transient) — single-frame step while paused
 * - `replayFrame` (number, read-only) — current trace index
 * - `replayTotal` (number, read-only) — total trace frames
 *
 * The DOM overlay in `arcade/replay.ts` sets/reads these to drive the UI.
 */
export class ReplayScene extends Phaser.Scene {
  private match!: RprMatch;
  private traceInputs: readonly CombatInput[] = [];
  private frameIndex = 0;
  private accumulator = 0;

  private stage!: StageRenderer;
  private playerRenderer!: FighterRenderer;
  private cpuRenderer!: FighterRenderer;
  private hud!: HudView;
  private effects!: EffectsRenderer;
  private fightCam!: FightCamera;
  private hudCam!: Phaser.Cameras.Scene2D.Camera;

  constructor() {
    super({ key: 'ReplayScene' });
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.CREATE, () => {
      (this.game.registry.get('arcadeReplayReady') as (() => void) | undefined)?.();
    });
    const data = this.game.registry.get('replay') as { seed: number; trace: Uint8Array } | undefined;
    if (!data) throw new Error('ReplayScene: missing replay data in registry');

    const decoded = decodeRprTrace(data.trace, 1_000_000);
    this.traceInputs = decoded.inputs;
    this.frameIndex = 0;
    this.accumulator = 0;

    this.match = new RprMatch(data.seed);

    // Same renderer + camera setup as FightScene (no new rendering code).
    this.stage = new StageRenderer(this, this.match.state.stage, marketControlRoom);
    this.playerRenderer = new FighterRenderer(this, sminemDefinition, true, marketControlRoom.floorY);
    this.cpuRenderer = new FighterRenderer(this, bogdanoffDefinition, false, marketControlRoom.floorY);
    this.hud = new HudView(this);

    const moveCategoryOf = (id: MoveId): MoveCategory | undefined => v1Moves.find((m) => m.id === id)?.category;
    this.effects = new EffectsRenderer(this, this.cameras.main, moveCategoryOf);

    const main = this.cameras.main;
    const cam = marketControlRoom.camera;
    this.fightCam = new FightCamera(
      main,
      this.match.state.stage.worldBounds,
      this.scale.height,
      this.scale.width,
      cam.minZoom,
      cam.maxZoom,
      marketControlRoom.floorY,
    );
    this.fightCam.snap(this.match.state.player.position.x, this.match.state.cpu.position.x);

    this.hudCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'hud');
    this.hudCam.setScroll(0, 0).setZoom(1);
    main.ignore(this.hud.objects);
    this.hudCam.ignore([
      ...this.stage.objects,
      ...this.playerRenderer.objects,
      ...this.cpuRenderer.objects,
      ...this.effects.worldObjects,
    ]);
    main.ignore(this.effects.screenObjects);

    // Default playback state.
    this.game.registry.set('replayPlaying', true);
    this.game.registry.set('replaySpeed', 1);

    (window as unknown as { __engine?: unknown }).__engine = this.match;
  }

  override update(_time: number, delta: number): void {
    const playing = this.game.registry.get('replayPlaying') !== false;
    const speed = (this.game.registry.get('replaySpeed') as number) ?? 1;
    const stepOnce = this.game.registry.get('replayStep') === true;
    if (stepOnce) this.game.registry.set('replayStep', false);

    const frameEvents: CombatEvent[] = [];

    if (stepOnce) {
      this.advance(frameEvents);
    } else if (playing) {
      this.accumulator += delta * speed;
      const cap = MAX_STEPS_PER_FRAME * SIM_STEP_MS;
      if (this.accumulator > cap) this.accumulator = cap;
      while (this.accumulator >= SIM_STEP_MS) {
        this.advance(frameEvents);
        this.accumulator -= SIM_STEP_MS;
      }
    }

    this.effects.consumeEvents(frameEvents, this.match.state.player, this.match.state.cpu);

    // Publish playback progress for the DOM overlay.
    this.game.registry.set('replayFrame', this.frameIndex);
    this.game.registry.set('replayTotal', this.traceInputs.length);

    // Sync renderers (identical to FightScene).
    const s = this.match.state;
    this.stage.sync(s.stage);
    this.playerRenderer.sync(s.player);
    this.cpuRenderer.sync(s.cpu);
    this.hud.sync(s.player, s.cpu, s.status);
    this.fightCam.update(s.player.position.x, s.cpu.position.x, delta);
  }

  /** Advances exactly one recorded sim step and stops at trace exhaustion. */
  private advance(events: CombatEvent[]): void {
    if (this.match.state.status !== 'active' || this.frameIndex >= this.traceInputs.length) return;
    const step = this.match.step(this.traceInputs[this.frameIndex]!);
    events.push(...step.events);
    this.frameIndex++;
  }

  shutdown(): void {
    this.stage?.destroy();
    this.playerRenderer?.destroy();
    this.cpuRenderer?.destroy();
    this.hud?.destroy();
    this.effects?.destroy();
    if (typeof window !== 'undefined') {
      (window as unknown as { __engine?: unknown }).__engine = undefined;
    }
  }
}

export { SIM_FPS };
