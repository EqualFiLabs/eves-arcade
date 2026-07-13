import * as Phaser from 'phaser';
import {
  type CombatEvent,
  type CombatInput,
  type MoveCategory,
  type MoveId,
  MAX_STEPS_PER_FRAME,
  NEUTRAL_INPUT,
  SIM_FPS,
  SIM_STEP_MS,
} from '@rpr/sim';
import {
  bogdanoffDefinition,
  distributionHooks,
  marketControlRoom,
  shareCopy,
  sminemDefinition,
  v1Moves,
} from '@rpr/content';
import { GamepadSource, KeyboardSource, MergingSource, TraceRecorder, TouchOverlaySource } from '@rpr/controls';
import type { InputSource } from '@rpr/controls';
import type { ArcadeGameContext } from '../../../arcade/types';
import {
  RPR_INPUT_DEFINITION,
  RPR_INPUT_SCHEMA,
  RPR_TRACE_ENCODING_VERSION,
  RPR_TRACE_LIMITS,
  RprMatch,
  deriveRprCanonicalResult,
} from '@rpr/rug-pull-rumble-core';
import { InputMapper } from '../input/InputMapper';
import { RPR_KEYBOARD_BINDINGS, RPR_GAMEPAD_BINDINGS } from '../input/bindings';
import type { RprButton } from '../input/buttons';
import { TouchRprSource } from '../input/touch-adapter';
import type { TouchButton, TouchAxis } from '../input/touch-adapter';
import { RPR_TOUCH_LAYOUT } from '../touch-layout';
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
 * Instantiates the canonical deterministic {@link RprMatch}, the
 * {@link InputMapper}, stage/fighter renderers, the HUD, and a
 * dual-target {@link FightCamera}, then advances the simulation at a fixed 60 Hz
 * step driven by a delta accumulator (Req 15.3).
 *
 * Two cameras keep presentation correct: the main camera frames the world
 * (scrolls + zooms), while a fixed HUD camera renders the HUD without
 * distortion. Presentation only ever READS sim state (Property 10); it never
 * mutates combat state. CPU legality is enforced by the engine (Property 9).
 *
 * On KO the scene delays briefly (KO feedback), asks the core for the canonical
 * result, attaches session and trace identity, and calls
 * `ctx.complete` exactly once. The shell tears down the Phaser instance and
 * shows the DOM result screen (Req 4.1).
 */
export class FightScene extends Phaser.Scene {
  private match!: RprMatch;
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
  private resultTimer: Phaser.Time.TimerEvent | null = null;

  private accumulator = 0;
  private settled = false;
  private muted = false;
  private resultReported = false;
  private readonly toggleMute = (): void => {
    this.muted = !this.muted;
    this.game.registry.set('muted', this.muted);
    const ctx = this.game.registry.get('arcade') as ArcadeGameContext | undefined;
    ctx?.updateSettings?.({ muted: this.muted });
  };

  constructor() {
    super({ key: 'FightScene' });
  }

  create(): void {
    const ctx = this.game.registry.get('arcade') as ArcadeGameContext | undefined;
    const seed = ctx?.session.seed ?? 0;

    this.match = new RprMatch(seed);

    // Input: merge keyboard + gamepad (+ touch on touch devices) via
    // MergingSource, then wrap with TraceRecorder so every polled frame is
    // recorded for replay verification (Req 8.3). The recorder proxy delegates
    // to the merged source. Touch overlay is created only when the device
    // reports touch capability (Req 6.5).
    const keyboard = new KeyboardSource(RPR_KEYBOARD_BINDINGS);
    const gamepad = new GamepadSource(RPR_GAMEPAD_BINDINGS);
    const sources: InputSource<RprButton>[] = [keyboard, gamepad];

    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && ctx?.mount) {
      const overlay = new TouchOverlaySource<TouchButton, TouchAxis>(ctx.mount, RPR_TOUCH_LAYOUT);
      sources.push(new TouchRprSource(overlay));
    }

    const merged = new MergingSource<RprButton>(sources);
    this.recorder = new TraceRecorder<RprButton>(RPR_INPUT_DEFINITION, RPR_TRACE_LIMITS);
    const recorded = this.recorder.wrap(merged);
    this.sources = sources;
    this.inputMapper = new InputMapper([recorded]);

    this.muted = !!this.game.registry.get('muted');

    // --- Renderers (world space) + HUD (fixed). ---
    this.stage = new StageRenderer(this, this.match.state.stage, marketControlRoom);
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
    this.input.keyboard?.on('keydown-M', this.toggleMute);

    (window as unknown as { __engine?: unknown }).__engine = this.match;
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
          this.match.state.status === 'active' ? this.inputMapper.poll() : NEUTRAL_INPUT;
        const step = this.match.step(playerInput);
        frameEvents.push(...step.events);
        this.accumulator -= SIM_STEP_MS;
        if (this.match.state.status !== 'active') {
          this.settled = true;
          // Let the player see the KO feedback before the shell result screen.
          this.resultTimer = this.time.delayedCall(KO_RESULT_DELAY_MS, () => {
            this.resultTimer = null;
            void this.reportResult();
          });
          break;
        }
      }
      this.effects.consumeEvents(frameEvents, this.match.state.player, this.match.state.cpu);
    }

    // Presentation follows simulation (Property 10).
    const s = this.match.state;
    this.stage.sync(s.stage);
    this.playerRenderer.sync(s.player);
    this.cpuRenderer.sync(s.cpu);
    this.hud.sync(s.player, s.cpu, s.status);
    this.fightCam.update(s.player.position.x, s.cpu.position.x, delta);
  }

  /**
   * Attaches platform identity to the core-owned canonical result and calls
   * `ctx.complete` exactly once (Req 4.1).
   */
  private async reportResult(): Promise<void> {
    if (this.resultReported) return;
    this.resultReported = true;

    const ctx = this.game.registry.get('arcade') as ArcadeGameContext | undefined;
    if (!ctx || ctx.signal.aborted) return;

    const canonical = await deriveRprCanonicalResult(this.match.state);
    if (ctx.signal.aborted) return;
    const won = canonical.outcome === 'win';
    const shareLines = won ? shareCopy.win : shareCopy.loss;
    const links = distributionHooks
      .filter((hook) => hook.enabled && hook.placement.startsWith('result-'))
      .map((hook) => ({ label: hook.label, url: hook.url }));
    ctx.complete({
      result: canonical,
      presentation: {
        headline: won ? 'VICTORY' : 'DEFEAT',
        tone: won ? 'positive' : 'negative',
        primaryMetric: { metric: 'score', label: 'Score' },
        stats: [
          { metric: 'damageDealt', label: 'Damage Dealt' },
          { metric: 'damageTaken', label: 'Damage Taken' },
          { metric: 'frames', label: 'Sim Frames' },
        ],
        showDuration: true,
        share: { text: shareLines[0]!, url: shareCopy.url },
        links,
      },
      evidence: {
        kind: 'input-trace',
        schema: RPR_INPUT_SCHEMA,
        encodingVersion: RPR_TRACE_ENCODING_VERSION,
        bytes: this.recorder.pack(),
      },
    });
  }

  shutdown(): void {
    this.input.keyboard?.off('keydown-M', this.toggleMute);
    this.resultTimer?.remove(false);
    this.resultTimer = null;
    for (const s of this.sources) s.destroy?.();
    this.sources = [];
    this.stage?.destroy();
    this.playerRenderer?.destroy();
    this.cpuRenderer?.destroy();
    this.hud?.destroy();
    this.effects?.destroy();
    if (typeof window !== 'undefined') {
      (window as unknown as { __engine?: unknown; __effects?: unknown }).__engine = undefined;
      (window as unknown as { __engine?: unknown; __effects?: unknown }).__effects = undefined;
    }
  }
}

export { SIM_FPS };
