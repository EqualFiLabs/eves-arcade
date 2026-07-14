import * as Phaser from 'phaser';
import {
  KeyboardSource,
  MergingSource,
  PointerSource,
  TraceRecorder,
  type InputSource,
} from '@rpr/controls';
import type { ArcadeGameModule } from '../arcade/types';
import {
  ANALOG_CONTRACT,
  ANALOG_INPUT,
  ANALOG_LIMITS,
  deriveAnalogResult,
  stepAnalog,
  type AnalogAxis,
  type AnalogButton,
  type AnalogState,
} from './core';
import { fixtureContext, launchFixtureGame, markFixtureReady } from './lifecycle';

const STEP_MS = 1000 / 60;
const TEXTURE_KEY = 'fixture.analog.texture';

class AnalogFixtureScene extends Phaser.Scene {
  private accumulator = 0;
  private state: AnalogState = { frame: 0, distance: 0, finished: false };
  private recorder!: TraceRecorder<AnalogButton, AnalogAxis>;
  private source!: InputSource<AnalogButton, AnalogAxis>;
  private ship!: Phaser.Physics.Arcade.Image;
  private finishing = false;

  constructor() {
    super('AnalogFixtureScene');
  }

  create(): void {
    const graphic = this.add.graphics();
    graphic.fillStyle(0x38bdf8, 1);
    graphic.fillTriangle(24, 0, 48, 48, 0, 48);
    graphic.generateTexture(TEXTURE_KEY, 48, 48);
    graphic.destroy();
    this.ship = this.physics.add.image(this.scale.width / 2, this.scale.height / 2, TEXTURE_KEY)
      .setCollideWorldBounds(true)
      .setBounce(1);
    this.add.text(this.scale.width / 2, 64, 'Move pointer, then press Enter', {
      fontFamily: 'Arial', fontSize: '24px', color: '#ffffff', align: 'center',
    }).setOrigin(0.5);

    const ctx = fixtureContext(this);
    const pointer = new PointerSource<AnalogButton, AnalogAxis>({
      target: ctx.mount,
      axes: ['steer', 'throttle'],
    });
    const keyboard = new KeyboardSource<AnalogButton, AnalogAxis>({ finish: 'Enter' });
    this.recorder = new TraceRecorder(ANALOG_INPUT, ANALOG_LIMITS);
    this.source = this.recorder.wrap(new MergingSource([pointer, keyboard]));
    const cleanup = (): void => this.source.destroy?.();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    markFixtureReady(this);
  }

  override update(_time: number, delta: number): void {
    if (this.finishing) return;
    this.accumulator += Math.min(delta, 100);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < 5 && !this.finishing) {
      this.accumulator -= STEP_MS;
      const input = this.source.read();
      this.state = stepAnalog(this.state, input);
      // Arcade Physics is deliberately cosmetic. Canonical distance comes only
      // from stepAnalog and the recorded quantized trace.
      this.ship.setVelocity(input.axes.steer * 180, input.axes.throttle * 180);
      if ((this.state.finished && this.state.frame >= 5)
        || this.state.frame >= ANALOG_LIMITS.maxFrames) void this.complete();
      steps += 1;
    }
  }

  private async complete(): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    this.ship.setVelocity(0, 0);
    const bytes = this.recorder.pack();
    const ctx = fixtureContext(this);
    const result = await deriveAnalogResult(ctx.session.seed, bytes);
    if (ctx.signal.aborted) return;
    ctx.complete({
      result,
      presentation: {
        headline: result.outcome === 'landed' ? 'Analog landing locked' : 'Analog run timed out',
        tone: result.outcome === 'landed' ? 'positive' : 'neutral',
        primaryMetric: { metric: 'distance', label: 'Analog Distance', fractionDigits: 3 },
        stats: [{ metric: 'frames', label: 'Frames' }],
      },
      evidence: {
        kind: 'input-trace',
        schema: ANALOG_CONTRACT.verification.schema,
        encodingVersion: ANALOG_CONTRACT.verification.encodingVersion,
        bytes,
      },
    });
  }
}

export const analogFixtureModule: ArcadeGameModule = {
  launch: (ctx) => launchFixtureGame(ctx, {
    title: 'Analog Fixture',
    version: ANALOG_CONTRACT.game.version,
    width: 540,
    height: 960,
    backgroundColor: '#082f49',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false, fixedStep: true },
    },
    scene: [AnalogFixtureScene],
  }),
};
