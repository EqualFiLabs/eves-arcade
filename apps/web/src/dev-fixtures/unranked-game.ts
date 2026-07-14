import * as Phaser from 'phaser';
import { KeyboardSource } from '@rpr/controls';
import type { ArcadeGameModule } from '../arcade/types';
import { UNRANKED_CONTRACT } from './core';
import { fixtureContext, launchFixtureGame, markFixtureReady } from './lifecycle';

class UnrankedFixtureScene extends Phaser.Scene {
  private source!: KeyboardSource<'finish'>;
  private frames = 0;
  private finishing = false;

  constructor() {
    super('UnrankedFixtureScene');
  }

  create(): void {
    this.add.rectangle(240, 160, 180, 100, 0xf97316).setStrokeStyle(4, 0xffffff);
    this.add.text(240, 160, 'Press Space\nNo ticket required', {
      fontFamily: 'Arial', fontSize: '22px', color: '#ffffff', align: 'center',
    }).setOrigin(0.5);
    this.source = new KeyboardSource({ finish: 'Space' });
    const cleanup = (): void => this.source.destroy();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    markFixtureReady(this);
  }

  override update(): void {
    if (this.finishing) return;
    this.frames += 1;
    if (this.source.read().buttons.finish || this.frames >= 120) {
      this.finishing = true;
      fixtureContext(this).complete({
        result: {
          schema: UNRANKED_CONTRACT.resultSchema,
          outcome: 'explored',
          metrics: { rounds: 1 },
          durationMs: Math.round(this.frames * 1000 / 60),
        },
        presentation: {
          headline: 'Sandbox survived',
          summary: 'No score. No ranking. Still a result.',
          tone: 'neutral',
          stats: [{ metric: 'rounds', label: 'Rounds' }],
        },
        evidence: { kind: 'none' },
      });
    }
  }
}

export const unrankedFixtureModule: ArcadeGameModule = {
  launch: (ctx) => launchFixtureGame(ctx, {
    title: 'Unranked Fixture',
    version: UNRANKED_CONTRACT.game.version,
    width: 480,
    height: 320,
    backgroundColor: '#431407',
    scene: [UnrankedFixtureScene],
  }),
};
