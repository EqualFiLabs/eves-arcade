import * as Phaser from 'phaser';
import { gameCopy } from '@rpr/content';
import { RPR_CONTRACT } from '@rpr/rug-pull-rumble-core/identity';
import type {
  ArcadeReplayAdapter,
  ArcadeReplayHandle,
  ReplayProgress,
  ReplaySpeed,
} from '../../arcade/types';
import { createGameConfig } from '../../arcade/phaser/config-factory';
import { ReplayScene } from './scenes/ReplayScene';

export const rprReplayAdapter: ArcadeReplayAdapter = {
  launch(ctx): ArcadeReplayHandle {
    let readySettled = false;
    let resolveReadyPromise!: () => void;
    let rejectReadyPromise!: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReadyPromise = resolve;
      rejectReadyPromise = reject;
    });
    const resolveReady = (): void => {
      if (readySettled) return;
      readySettled = true;
      resolveReadyPromise();
    };
    const rejectReady = (reason: Error): void => {
      if (readySettled) return;
      readySettled = true;
      rejectReadyPromise(reason);
    };

    const game = new Phaser.Game(createGameConfig({
      parent: ctx.mount,
      title: `${gameCopy.title} Replay`,
      version: RPR_CONTRACT.game.version,
      width: 1280,
      height: 720,
      backgroundColor: '#0a0a0f',
      input: false,
      scene: [ReplayScene],
      callbacks: {
        preBoot(bootingGame) {
          bootingGame.registry.set('replay', {
            seed: ctx.replay.seed,
            trace: ctx.replay.evidence.bytes,
          });
          bootingGame.registry.set('arcadeReplayReady', resolveReady);
        },
      },
    }));

    if (typeof window !== 'undefined') {
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    }

    let destroyed = false;
    let destroyPromise: Promise<void> | null = null;
    const handle: ArcadeReplayHandle = {
      ready,
      get progress(): Readonly<ReplayProgress> {
        return Object.freeze({
          frame: (game.registry.get('replayFrame') as number | undefined) ?? 0,
          totalFrames: (game.registry.get('replayTotal') as number | undefined) ?? 0,
          playing: game.registry.get('replayPlaying') !== false,
          speed: ((game.registry.get('replaySpeed') as ReplaySpeed | undefined) ?? 1),
        });
      },
      play() {
        if (!destroyed) game.registry.set('replayPlaying', true);
      },
      pause() {
        if (!destroyed) game.registry.set('replayPlaying', false);
      },
      step() {
        if (destroyed) return;
        game.registry.set('replayPlaying', false);
        game.registry.set('replayStep', true);
      },
      setSpeed(speed: ReplaySpeed) {
        if (!destroyed) game.registry.set('replaySpeed', speed);
      },
      destroy() {
        if (destroyPromise) return destroyPromise;
        destroyed = true;
        rejectReady(new DOMException('Replay destroyed before ready', 'AbortError'));
        ctx.signal.removeEventListener('abort', onAbort);
        destroyPromise = new Promise<void>((resolve) => {
          game.events.once(Phaser.Core.Events.DESTROY, () => {
            if (typeof window !== 'undefined') {
              const debug = window as unknown as { __game?: Phaser.Game; __engine?: unknown };
              if (debug.__game === game) debug.__game = undefined;
              debug.__engine = undefined;
            }
            ctx.mount.replaceChildren();
            resolve();
          });
          game.destroy(true, false);
        });
        return destroyPromise;
      },
    };
    const onAbort = (): void => { void handle.destroy(); };
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    if (ctx.signal.aborted) void handle.destroy();
    return handle;
  },
};
