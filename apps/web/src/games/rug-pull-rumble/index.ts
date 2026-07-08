import * as Phaser from 'phaser';
import type { ArcadeGameContext, ArcadeGameHandle, ArcadeGameModule } from '../../arcade/types';
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
    const game = new Phaser.Game(
      createGameConfig({
        parent: ctx.parent,
        scene: [BootScene, UnsupportedBrowserScene, PreloadScene, MenuScene, FightScene],
      }),
    );

    // Bridge shell state into the game: settings seed the registry so existing
    // scene reads (`registry.get('muted')`) keep working; ctx is stashed so
    // in-game settings changes route back to shell storage.
    game.registry.set('muted', ctx.settings.muted);
    game.registry.set('arcade', ctx);

    if (typeof window !== 'undefined') {
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    }

    let destroyed = false;
    return {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        game.destroy(true);
        if (typeof window !== 'undefined') {
          (window as unknown as { __game?: Phaser.Game }).__game = undefined;
        }
        // Phaser removes its canvas on destroy(true), but defensively clear any
        // leftover canvas inside the mount element.
        while (ctx.parent.firstChild) ctx.parent.removeChild(ctx.parent.lastChild!);
      },
    };
  },
};
