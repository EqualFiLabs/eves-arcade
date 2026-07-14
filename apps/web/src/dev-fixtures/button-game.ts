import * as Phaser from 'phaser';
import { KeyboardSource, TraceRecorder } from '@rpr/controls';
import type { ArcadeGameModule } from '../arcade/types';
import {
  BUTTON_CONTRACT,
  BUTTON_INPUT,
  BUTTON_LIMITS,
  deriveButtonResult,
  stepButton,
  type ButtonAction,
  type ButtonState,
} from './core';
import { fixtureContext, launchFixtureGame, markFixtureReady } from './lifecycle';

const STEP_MS = 1000 / 60;
const TEXTURE_KEY = 'fixture.button.texture';
const ANIMATION_KEY = 'fixture.button.animation';

class ButtonFixtureScene extends Phaser.Scene {
  private accumulator = 0;
  private state: ButtonState = { frame: 0, presses: 0 };
  private recorder!: TraceRecorder<ButtonAction>;
  private source!: ReturnType<TraceRecorder<ButtonAction>['wrap']>;
  private finishing = false;

  constructor() {
    super('ButtonFixtureScene');
  }

  create(): void {
    const graphic = this.add.graphics();
    graphic.fillStyle(0x22c55e, 1);
    graphic.fillRoundedRect(0, 0, 48, 48, 8);
    graphic.generateTexture(TEXTURE_KEY, 48, 48);
    graphic.destroy();
    this.add.image(320, 180, TEXTURE_KEY);
    this.add.text(320, 110, 'Hold Space — button trace', {
      fontFamily: 'Arial', fontSize: '24px', color: '#ffffff',
    }).setOrigin(0.5);
    this.anims.create({ key: ANIMATION_KEY, frames: [{ key: TEXTURE_KEY }] });

    this.recorder = new TraceRecorder(BUTTON_INPUT, BUTTON_LIMITS);
    this.source = this.recorder.wrap(new KeyboardSource({ press: 'Space' }));
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
      this.state = stepButton(this.state, input);
      if (this.state.frame >= BUTTON_LIMITS.maxFrames) void this.complete();
      steps += 1;
    }
  }

  private async complete(): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    const bytes = this.recorder.pack();
    const ctx = fixtureContext(this);
    const result = await deriveButtonResult(ctx.session.seed, bytes);
    if (ctx.signal.aborted) return;
    ctx.complete({
      result,
      presentation: {
        headline: 'Button barrage complete',
        tone: 'positive',
        primaryMetric: { metric: 'score', label: 'Button Score' },
        stats: [
          { metric: 'presses', label: 'Pressed Frames' },
          { metric: 'frames', label: 'Frames' },
        ],
      },
      evidence: {
        kind: 'input-trace',
        schema: BUTTON_CONTRACT.verification.schema,
        encodingVersion: BUTTON_CONTRACT.verification.encodingVersion,
        bytes,
      },
    });
  }
}

export const buttonFixtureModule: ArcadeGameModule = {
  launch: (ctx) => launchFixtureGame(ctx, {
    title: 'Button Fixture',
    version: BUTTON_CONTRACT.game.version,
    width: 640,
    height: 360,
    backgroundColor: '#052e16',
    scene: [ButtonFixtureScene],
  }),
};
