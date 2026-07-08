import { ArcadeShell } from './arcade/shell';

/**
 * App entry — boots the DOM arcade shell (not Phaser). The shell loads games by
 * dynamic import and launches each into its own Phaser instance (Req 1, 3.5).
 * The shell's start interaction doubles as the audio unlock (Req 7.6, wired with
 * the audio task).
 */
function boot(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('arcade: missing #app root element');
  const shell = new ArcadeShell(root);
  shell.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
