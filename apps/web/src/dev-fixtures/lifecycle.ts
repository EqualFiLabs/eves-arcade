import * as Phaser from 'phaser';
import type {
  ArcadeGameContext,
  ArcadeGameHandle,
  SuspensionReason,
} from '../arcade/types';
import {
  createGameConfig,
  type PhaserGameConfigOptions,
} from '../arcade/phaser/config-factory';

const CONTEXT_KEY = 'fixture.arcadeContext';
const READY_KEY = 'fixture.resolveReady';

interface FixtureDebugWindow extends Window {
  __game?: Phaser.Game;
  __fixtureProbeCount?: number;
  __fixturePreviousManagers?: {
    textures: Phaser.Textures.TextureManager;
    animations: Phaser.Animations.AnimationManager;
    registry: Phaser.Data.DataManager;
    sound: Phaser.Sound.BaseSoundManager;
  };
}

export function launchFixtureGame(
  ctx: ArcadeGameContext,
  options: Omit<PhaserGameConfigOptions, 'parent' | 'callbacks'>,
): ArcadeGameHandle {
  let settled = false;
  let resolveReadyPromise!: () => void;
  let rejectReadyPromise!: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReadyPromise = resolve;
    rejectReadyPromise = reject;
  });
  const resolveReady = (): void => {
    if (settled) return;
    settled = true;
    resolveReadyPromise();
  };
  const rejectReady = (reason: Error): void => {
    if (settled) return;
    settled = true;
    rejectReadyPromise(reason);
  };

  const overlay = document.createElement('div');
  overlay.className = 'fixture-owned-overlay';
  overlay.dataset.game = options.title;
  ctx.mount.append(overlay);
  const debug = window as FixtureDebugWindow;
  const onProbe = (): void => { debug.__fixtureProbeCount = (debug.__fixtureProbeCount ?? 0) + 1; };
  window.addEventListener('fixture-global-probe', onProbe);

  const game = new Phaser.Game(createGameConfig({
    ...options,
    parent: ctx.mount,
    callbacks: {
      preBoot(bootingGame) {
        bootingGame.registry.set(CONTEXT_KEY, ctx);
        bootingGame.registry.set(READY_KEY, resolveReady);
        bootingGame.registry.set('fixture.owner', options.title);
      },
    },
  }));
  debug.__game = game;

  let destroyed = false;
  let destroyPromise: Promise<void> | null = null;
  const suspended = new Set<SuspensionReason>();
  const cleanupOwnedDom = (): void => {
    window.removeEventListener('fixture-global-probe', onProbe);
    overlay.remove();
  };
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
      rejectReady(new DOMException('Fixture destroyed before ready', 'AbortError'));
      ctx.signal.removeEventListener('abort', onAbort);
      cleanupOwnedDom();
      debug.__fixturePreviousManagers = {
        textures: game.textures,
        animations: game.anims,
        registry: game.registry,
        sound: game.sound,
      };
      if (game.isPaused) game.resume();
      destroyPromise = new Promise<void>((resolve) => {
        game.events.once(Phaser.Core.Events.DESTROY, () => {
          if (debug.__game === game) debug.__game = undefined;
          ctx.mount.replaceChildren();
          resolve();
        });
        // noReturn must remain false: the fixture suite launches another Phaser
        // instance on the same page immediately after this one.
        game.destroy(true, false);
      });
      return destroyPromise;
    },
  };
  const onAbort = (): void => { void handle.destroy(); };
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  if (ctx.signal.aborted) void handle.destroy();
  return handle;
}

export function fixtureContext(scene: Phaser.Scene): ArcadeGameContext {
  return scene.registry.get(CONTEXT_KEY) as ArcadeGameContext;
}

export function markFixtureReady(scene: Phaser.Scene): void {
  const ready = scene.registry.get(READY_KEY) as (() => void) | undefined;
  ready?.();
}
