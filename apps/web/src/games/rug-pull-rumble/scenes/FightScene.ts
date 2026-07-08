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
  serializeGameState,
} from '@rpr/sim';
import {
  bogdanoffCpuProfile,
  bogdanoffDefinition,
  createV1FightState,
  marketControlRoom,
  sminemDefinition,
  v1Moves,
} from '@rpr/content';
import { GamepadSource, KeyboardSource, MergingSource, TraceRecorder, TouchOverlaySource } from '@rpr/controls';
import type { InputSource } from '@rpr/controls';
import type { ArcadeGameContext, GameResult } from '../../../arcade/types';
import { InputMapper } from '../input/InputMapper';
import { RPR_KEYBOARD_BINDINGS, RPR_GAMEPAD_BINDINGS } from '../input/bindings';
import type { RprButton } from '../input/buttons';
import { TouchRprSource } from '../input/touch-adapter';
import type { TouchButton, TouchAxis } from '../input/touch-adapter';
import { RPR_TOUCH_LAYOUT } from '../touch-layout';
import { rugPullRumbleManifest } from '../manifest';
import { FighterRenderer } from '../renderers/FighterRenderer';
import { HudView } from '../renderers/HudView';
import { StageRenderer } from '../renderers/StageRenderer';
import { FightCamera } from '../renderers/FightCamera';
import { EffectsRenderer } from '../renderers/EffectsRenderer';

/** Delay after KO before handing control to the shell result screen (ms). */
const KO_RESULT_DELAY_MS = 2000;

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
 * On KO the scene delays briefly (KO feedback) then builds a {@link GameResult}
 * with the input trace hash and terminal state hash, and calls
 * `ctx.onResult` exactly once. The shell tears down the Phaser instance and
 * shows the DOM result screen (Req 4.1).
 */
export class FightScene extends Phaser.Scene {
  private engine!: CombatEngine;
  private brain!: BogdanoffBossBrain;
  private inputMapper!: InputMapper;
  private recorder!: TraceRecorder<RprButton>;
  private sources: InputSource<RprButton>[] = [];
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
  private resultReported = false;

  constructor() {
    super({ key: 'FightScene' });
  }

  create(): void {
    const ctx = this.game.registry.get('arcade') as ArcadeGameContext | undefined;
    const seed = ctx?.session.seed ?? 0;

    this.engine = new CombatEngine({
      createInitialState: (s) => createV1FightState(s),
      definitions: [sminemDefinition, bogdanoffDefinition],
      moves: v1Moves,
      seed,
    });
    this.brain = new BogdanoffBossBrain();

    // Input: merge keyboard + gamepad (+ touch on touch devices) via
    // MergingSource, then wrap with TraceRecorder so every polled frame is
    // recorded for replay verification (Req 8.3). The recorder proxy delegates
    // to the merged source. Touch overlay is created only when the device
    // reports touch capability (Req 6.5).
    const keyboard = new KeyboardSource(RPR_KEYBOARD_BINDINGS);
    const gamepad = new GamepadSource(RPR_GAMEPAD_BINDINGS);
    const sources: InputSource<RprButton>[] = [keyboard, gamepad];

    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && ctx?.parent) {
      const overlay = new TouchOverlaySource<TouchButton, TouchAxis>(ctx.parent, RPR_TOUCH_LAYOUT);
      sources.push(new TouchRprSource(overlay));
    }

    const merged = new MergingSource<RprButton>(sources);
    this.recorder = new TraceRecorder<RprButton>();
    const recorded = this.recorder.wrap(merged);
    this.sources = sources;
    this.inputMapper = new InputMapper([recorded]);

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
    this.resultReported = false;

    // M toggles mute (persisted via shell context). Enter/ESC no longer restart
    // or exit — the shell result screen and chrome bar own those flows now.
    this.input.keyboard?.on('keydown-M', () => {
      this.muted = !this.muted;
      this.game.registry.set('muted', this.muted);
      ctx?.updateSettings?.({ muted: this.muted });
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
          // Let the player see the KO feedback before the shell result screen.
          this.time.delayedCall(KO_RESULT_DELAY_MS, () => {
            void this.reportResult();
          });
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

  /**
   * Builds the {@link GameResult} from the terminal sim state and calls
   * `ctx.onResult` exactly once (Req 4.1). The trace hash and replay hash make
   * the result structurally verifiable (Req 8.3/8.5).
   */
  private async reportResult(): Promise<void> {
    if (this.resultReported) return;
    this.resultReported = true;

    const ctx = this.game.registry.get('arcade') as ArcadeGameContext | undefined;
    if (!ctx) return;

    const inputTraceHash = await this.recorder.hash();
    const replayHash = await sha256Hex(serializeGameState(this.engine.state));

    const s = this.engine.state;
    const won = s.status === 'player_win';
    const damageDealt = Math.max(0, s.cpu.maxHealth - s.cpu.health);
    const damageTaken = Math.max(0, s.player.maxHealth - s.player.health);
    const score = won
      ? 1000 + Math.floor((s.player.health / s.player.maxHealth) * 500)
      : damageDealt * 5;

    const result: GameResult = {
      gameId: rugPullRumbleManifest.id,
      gameVersion: rugPullRumbleManifest.version,
      buildVersion: __BUILD_VERSION__,
      seed: ctx.session.seed,
      outcome: won ? 'win' : 'loss',
      score,
      stats: { damageDealt, damageTaken, frames: s.frame },
      durationMs: Math.round(s.frame * SIM_STEP_MS),
      inputTraceHash,
      replayHash,
    };

    ctx.onResult(result);
  }

  shutdown(): void {
    for (const s of this.sources) s.destroy?.();
    this.sources = [];
    this.stage?.destroy();
    this.playerRenderer?.destroy();
    this.cpuRenderer?.destroy();
    this.hud?.destroy();
    this.effects?.destroy();
  }
}

/** SHA-256 hex digest of a UTF-8 string via Web Crypto (Req 8.5). */
async function sha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', ab);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export { SIM_FPS };
