import * as Phaser from 'phaser';
import {
  type CombatEvent,
  type CombatInput,
  type InputDirection,
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
import { unpackTrace, type DecodedTraceFrame } from '@rpr/protocol';
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
  private engine!: CombatEngine;
  private brain!: BogdanoffBossBrain;
  private traceFrames: readonly DecodedTraceFrame[] = [];
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
    const data = this.game.registry.get('replay') as { seed: number; trace: Uint8Array } | undefined;
    if (!data) throw new Error('ReplayScene: missing replay data in registry');

    const decoded = unpackTrace(data.trace);
    this.traceFrames = decoded.frames;
    this.frameIndex = 0;
    this.accumulator = 0;

    this.engine = new CombatEngine({
      createInitialState: (s) => createV1FightState(s),
      definitions: [sminemDefinition, bogdanoffDefinition],
      moves: v1Moves,
      seed: data.seed,
    });
    this.brain = new BogdanoffBossBrain();

    // Same renderer + camera setup as FightScene (no new rendering code).
    this.stage = new StageRenderer(this, this.engine.state.stage, marketControlRoom);
    this.playerRenderer = new FighterRenderer(this, sminemDefinition, true, marketControlRoom.floorY);
    this.cpuRenderer = new FighterRenderer(this, bogdanoffDefinition, false, marketControlRoom.floorY);
    this.hud = new HudView(this);

    const moveCategoryOf = (id: MoveId): MoveCategory | undefined => v1Moves.find((m) => m.id === id)?.category;
    this.effects = new EffectsRenderer(this, this.cameras.main, moveCategoryOf);

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

    (window as unknown as { __engine?: unknown }).__engine = this.engine;
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

    this.effects.consumeEvents(frameEvents, this.engine.state.player, this.engine.state.cpu);

    // Publish playback progress for the DOM overlay.
    this.game.registry.set('replayFrame', this.frameIndex);
    this.game.registry.set('replayTotal', this.traceFrames.length);

    // Sync renderers (identical to FightScene).
    const s = this.engine.state;
    this.stage.sync(s.stage);
    this.playerRenderer.sync(s.player);
    this.cpuRenderer.sync(s.cpu);
    this.hud.sync(s.player, s.cpu, s.status);
    this.fightCam.update(s.player.position.x, s.cpu.position.x, delta);
  }

  /** Advances one sim step from the trace (or neutral if trace exhausted). */
  private advance(events: CombatEvent[]): void {
    if (this.engine.state.status !== 'active') return;
    const playerInput = this.frameIndex < this.traceFrames.length
      ? decodeTraceFrame(this.traceFrames[this.frameIndex]!)
      : NEUTRAL_INPUT;
    const cpuInput = this.brain.decide(this.engine.state, bogdanoffCpuProfile);
    const step = this.engine.step(playerInput, cpuInput);
    events.push(...step.events);
    this.frameIndex++;
  }

  shutdown(): void {
    this.stage?.destroy();
    this.playerRenderer?.destroy();
    this.cpuRenderer?.destroy();
    this.hud?.destroy();
    this.effects?.destroy();
  }
}

/**
 * Maps a decoded trace frame (positional buttons b0..b12) back to CombatInput.
 * Button order matches the RPR keyboard bindings (left, right, up, down, block,
 * lightHigh, lightLow, heavyHigh, heavyLow, special, super, start, mute) — the
 * same order the TraceRecorder captures at recording time.
 */
function decodeTraceFrame(frame: DecodedTraceFrame): CombatInput {
  const b = (i: number): boolean => frame.buttons[`b${i}`] ?? false;
  const h = (b(1) ? 1 : 0) - (b(0) ? 1 : 0) as InputDirection;
  const v = (b(3) ? 1 : 0) - (b(2) ? 1 : 0) as InputDirection;
  return {
    horizontal: h,
    vertical: v,
    block: b(4),
    lightHigh: b(5),
    lightLow: b(6),
    heavyHigh: b(7),
    heavyLow: b(8),
    special: b(9),
    super: b(10),
  };
}

export { SIM_FPS };
