import * as Phaser from 'phaser';
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
    let resolveReady!: () => void;
    let rejectReady!: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const game = new Phaser.Game({
      ...createGameConfig({
        parent: ctx.mount,
        scene: [BootScene, UnsupportedBrowserScene, PreloadScene, MenuScene, FightScene],
      }),
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
    });

    // Bridge shell state into the game: settings seed the registry so existing
    // scene reads (`registry.get('muted')`) keep working; ctx is stashed so
    // in-game settings changes route back to shell storage.
    if (typeof window !== 'undefined') {
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    }

    let destroyed = false;
    const suspended = new Set<SuspensionReason>();
    return {
      ready,
      suspend(reason) {
        suspended.add(reason);
        if (!game.isPaused) game.pause();
      },
      resume(reason) {
        suspended.delete(reason);
        if (suspended.size === 0 && game.isPaused) game.resume();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        game.destroy(true);
        if (typeof window !== 'undefined') {
          (window as unknown as { __game?: Phaser.Game }).__game = undefined;
        }
        // Phaser removes its canvas on destroy(true), but defensively clear any
        // leftover canvas inside the mount element.
        while (ctx.mount.firstChild) ctx.mount.removeChild(ctx.mount.lastChild!);
      },
    };
  },
};
