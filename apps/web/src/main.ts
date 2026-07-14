import { ArcadeShell } from './arcade/shell';
import { REGISTRY } from './arcade/registry';
import './styles/arcade.css';

/**
 * App entry — boots the DOM arcade shell (not Phaser). The shell loads games by
 * dynamic import and launches each into its own Phaser instance (Req 1, 3.5).
 * The shell's start interaction doubles as the audio unlock (Req 7.6, wired with
 * the audio task).
 *
 * Dev-only replay viewer: navigating to `#replay` shows the paste-form replay
 * tool (Req 14.2). Only accessible when `import.meta.env.DEV` is true (Vite
 * strips this in production builds).
 */
interface ActiveSurface {
  destroy(): void | Promise<void>;
}

function boot(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('arcade: missing #app root element');

  const isDev = import.meta.env.DEV;

  let active: ActiveSurface | null = null;
  let routeId = 0;
  const renderRoute = async (): Promise<void> => {
    const id = ++routeId;
    const previous = active;
    active = null;
    if (previous) await previous.destroy();
    if (id !== routeId) return;

    const fixtureMode = isDev
      && new URLSearchParams(location.search).get('arcadeFixtures') === '1';

    if (isDev && location.hash === '#replay') {
      const { showReplayViewer } = await import('./arcade/replay');
      if (id !== routeId) return;
      const registry = fixtureMode
        ? (await import('./dev-fixtures/registry')).FIXTURE_REGISTRY
        : REGISTRY;
      if (id !== routeId) return;
      active = showReplayViewer(root, {
        registry,
        onBack: () => { location.hash = ''; },
      });
      return;
    }

    if (fixtureMode) {
      const { createFixtureArcade } = await import('./dev-fixtures/shell');
      if (id !== routeId) return;
      active = createFixtureArcade(root);
      return;
    }

    const shell = new ArcadeShell(root);
    active = shell;
    shell.start();
  };

  window.addEventListener('hashchange', () => { void renderRoute(); });
  window.addEventListener('pagehide', () => { void active?.destroy(); }, { once: true });
  void renderRoute();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
