import * as Phaser from 'phaser';
import { gameCopy } from '@rpr/content';
import { RPR_CONTRACT } from '@rpr/rug-pull-rumble-core/identity';
import type {
  ArcadeGameContext,
  ArcadeGameHandle,
  ArcadeGameModule,
  SuspensionReason,
} from '../../arcade/types';
import { createGameConfig } from '../../arcade/phaser/config-factory';
import { BootScene } from './scenes/BootScene';
import { UnsupportedBrowserScene } from './scenes/UnsupportedBrowserScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { FightScene } from './scenes/FightScene';

/**
 * Rug Pull Rumble game module — implements the arcade contract (Req 2, 3).
 *
 * `launch` creates a fresh `Phaser.Game` inside the shell-provided mount
 * element; `destroy` tears the instance down and clears its canvas so the next
 * launch starts clean (Req 3.2/3.4). The shell owns settings; launch seeds the
 * Phaser registry from `ctx.settings` and stashes `ctx` so in-game toggles (mute)
 * persist back through `ctx.updateSettings` (Req 2.2, 7.6).
 */
export const rugPullRumbleModule: ArcadeGameModule = {
  launch(ctx: ArcadeGameContext): ArcadeGameHandle {
    let settleReady = false;
    let resolveReadyPromise!: () => void;
    let rejectReadyPromise!: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReadyPromise = resolve;
      rejectReadyPromise = reject;
    });
    const resolveReady = () => {
      if (settleReady) return;
      settleReady = true;
      resolveReadyPromise();
    };
    const rejectReady = (reason: Error) => {
      if (settleReady) return;
      settleReady = true;
      rejectReadyPromise(reason);
    };

    const game = new Phaser.Game({
      ...createGameConfig({
        parent: ctx.mount,
        title: gameCopy.title,
        version: RPR_CONTRACT.game.version,
        width: 1280,
        height: 720,
        backgroundColor: '#0a0a0f',
        input: { gamepad: true },
        scene: [BootScene, UnsupportedBrowserScene, PreloadScene, MenuScene, FightScene],
        callbacks: {
          // preBoot runs before the first scene, closing the registry race that
          // exists when values are assigned after new Phaser.Game().
          preBoot(bootingGame) {
            bootingGame.registry.set('muted', ctx.settings.muted);
            bootingGame.registry.set('arcade', ctx);
            bootingGame.registry.set('arcadeReady', resolveReady);
            bootingGame.registry.set('arcadeReadyError', rejectReady);
          },
        },
      }),
    });

    // Bridge shell state into the game: settings seed the registry so existing
    // scene reads (`registry.get('muted')`) keep working; ctx is stashed so
    // in-game settings changes route back to shell storage.
    if (typeof window !== 'undefined') {
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    }

    let destroyed = false;
    let destroyPromise: Promise<void> | null = null;
    const suspended = new Set<SuspensionReason>();
    const handle: ArcadeGameHandle = {
      ready,
      suspend(reason) {
        if (destroyed) return;
        suspended.add(reason);
        if (!game.isPaused) game.pause();
      },
      resume(reason) {
        if (destroyed) return;
        suspended.delete(reason);
        if (suspended.size === 0 && game.isPaused) game.resume();
      },
      destroy() {
        if (destroyPromise) return destroyPromise;
        destroyed = true;
        rejectReady(new DOMException('Game destroyed before ready', 'AbortError'));
        ctx.signal.removeEventListener('abort', onAbort);
        destroyPromise = new Promise<void>((resolve) => {
          game.events.once(Phaser.Core.Events.DESTROY, () => {
            if (typeof window !== 'undefined') {
              const debug = window as unknown as {
                __game?: Phaser.Game;
                __engine?: unknown;
                __effects?: unknown;
              };
              if (debug.__game === game) debug.__game = undefined;
              debug.__engine = undefined;
              debug.__effects = undefined;
            }
            ctx.mount.replaceChildren();
            resolve();
          });
          game.destroy(true, false);
        });
        return destroyPromise;
      },
    };
    const onAbort = () => { void handle.destroy(); };
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    if (ctx.signal.aborted) void handle.destroy();
    return handle;
  },
};
