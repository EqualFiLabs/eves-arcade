/**
 * Dev-only replay viewer (Req 10.5, 14.2).
 *
 * Accessible via `#replay` hash in development mode. Shows a paste form where
 * a developer pastes a seed + base64-encoded input trace (from a stored
 * submission or a local recording). The viewer launches a Phaser instance with
 * {@link ReplayScene}, which reuses the exact same RPR renderers as a live fight.
 *
 * Playback controls (play/pause, speed, frame-step) live in a DOM bar above the
 * canvas and communicate with the scene via the Phaser registry.
 *
 * No new rendering code — every visual is identical to a live fight (Req 14.2).
 */

export interface ReplayViewer {
  destroy(): void;
}

/** Shows the replay viewer paste form. Call when `#replay` is detected (dev only). */
export function showReplayViewer(root: HTMLElement): ReplayViewer {
  const viewer = new ReplayViewerImpl(root);
  viewer.renderForm();
  return viewer;
}

class ReplayViewerImpl {
  private game: { destroy(destroyCanvas?: boolean): void } | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly root: HTMLElement) {}

  // ── Paste form ────────────────────────────────────────────────────────────

  renderForm(): void {
    this.root.innerHTML = `
      <section class="arcade-replay-form">
        <h1>Replay Viewer <span class="arcade-dev-badge">DEV</span></h1>
        <p>Paste a seed and base64-encoded trace to replay a recorded session.</p>
        <label>Seed <input class="replay-seed" type="number" placeholder="e.g. 12345" /></label>
        <label>Trace (base64) <textarea class="replay-trace" rows="8" placeholder="Paste base64 trace here…"></textarea></label>
        <div class="replay-form-actions">
          <button class="replay-load" type="button">Load Replay</button>
          <a class="replay-back-link" href="#/">← Back to Arcade</a>
        </div>
        <p class="replay-error" hidden></p>
      </section>
    `;

    this.root.querySelector<HTMLButtonElement>('.replay-load')!.addEventListener('click', () => {
      void this.loadAndPlay();
    });
  }

  private async loadAndPlay(): Promise<void> {
    const seedInput = this.root.querySelector<HTMLInputElement>('.replay-seed')!;
    const traceInput = this.root.querySelector<HTMLTextAreaElement>('.replay-trace')!;
    const errorEl = this.root.querySelector<HTMLElement>('.replay-error')!;
    errorEl.hidden = true;

    const seed = Number(seedInput.value);
    if (Number.isNaN(seed)) {
      this.showError('Invalid seed — must be a number.');
      return;
    }

    let trace: Uint8Array;
    try {
      trace = base64ToBytes(traceInput.value.trim());
    } catch {
      this.showError('Invalid base64 trace.');
      return;
    }

    if (trace.length < 7) {
      this.showError('Trace too short — expected at least 7 bytes (header).');
      return;
    }

    await this.launch(seed, trace);
  }

  private showError(msg: string): void {
    const el = this.root.querySelector<HTMLElement>('.replay-error')!;
    el.textContent = msg;
    el.hidden = false;
  }

  // ── Phaser launch + playback controls ─────────────────────────────────────

  private async launch(seed: number, trace: Uint8Array): Promise<void> {
    // Dynamic imports so the replay viewer (and Phaser) are code-split out of
    // the shell payload in production — even though the viewer is dev-only.
    const Phaser = await import('phaser');
    const { createGameConfig } = await import('./phaser/config-factory');
    const { ReplayScene } = await import('../games/rug-pull-rumble/scenes/ReplayScene');

    this.root.innerHTML = `
      <div class="arcade-replay-shell">
        <header class="arcade-replay-controls">
          <button class="replay-toggle" type="button">⏸ Pause</button>
          <button class="replay-step" type="button">⏭ Step</button>
          <div class="replay-speeds">
            <button class="replay-speed" data-speed="0.5" type="button">0.5×</button>
            <button class="replay-speed active" data-speed="1" type="button">1×</button>
            <button class="replay-speed" data-speed="2" type="button">2×</button>
            <button class="replay-speed" data-speed="4" type="button">4×</button>
          </div>
          <span class="replay-frame-counter">Frame 0 / 0</span>
          <a class="replay-back-link" href="#/">← Back</a>
        </header>
        <div class="arcade-mount" id="replay-mount"></div>
      </div>
    `;

    const mount = this.root.querySelector<HTMLElement>('#replay-mount')!;
    const game = new Phaser.Game(
      createGameConfig({
        parent: mount,
        scene: [ReplayScene],
      }),
    );
    game.registry.set('replay', { seed, trace });
    this.game = game;

    this.wirePlaybackControls(game);

    // Poll the registry for frame counter updates.
    const counter = this.root.querySelector<HTMLElement>('.replay-frame-counter')!;
    this.pollTimer = setInterval(() => {
      const frame = (game.registry.get('replayFrame') as number) ?? 0;
      const total = (game.registry.get('replayTotal') as number) ?? 0;
      counter.textContent = `Frame ${frame} / ${total}`;
    }, 100);
  }

  private wirePlaybackControls(game: { registry: { get(key: string): unknown; set(key: string, val: unknown): void } }): void {
    const toggleBtn = this.root.querySelector<HTMLButtonElement>('.replay-toggle')!;
    toggleBtn.addEventListener('click', () => {
      const playing = game.registry.get('replayPlaying') !== false;
      game.registry.set('replayPlaying', !playing);
      toggleBtn.textContent = playing ? '▶ Play' : '⏸ Pause';
    });

    this.root.querySelector<HTMLButtonElement>('.replay-step')!.addEventListener('click', () => {
      game.registry.set('replayStep', true);
      // Ensure we're paused so the step is single-frame.
      if (game.registry.get('replayPlaying') !== false) {
        game.registry.set('replayPlaying', false);
        toggleBtn.textContent = '▶ Play';
      }
    });

    const speedBtns = this.root.querySelectorAll<HTMLButtonElement>('.replay-speed');
    speedBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        speedBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        game.registry.set('replaySpeed', Number(btn.dataset.speed));
      });
    });
  }

  // ── Teardown ──────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.game) {
      try { this.game.destroy(true); } catch { /* ignore */ }
      this.game = null;
    }
    this.root.innerHTML = '';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
