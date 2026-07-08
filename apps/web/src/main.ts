import { ArcadeShell } from './arcade/shell';

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
function boot(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('arcade: missing #app root element');

  const isDev =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

  if (isDev && location.hash === '#replay') {
    void import('./arcade/replay').then(({ showReplayViewer }) => {
      showReplayViewer(root);
    });
    return;
  }

  const shell = new ArcadeShell(root);
  shell.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
