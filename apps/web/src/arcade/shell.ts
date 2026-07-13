import type {
  ArcadeGameContext,
  ArcadeGameHandle,
  ArcadeGameManifest,
  GameResult,
  GameSession,
  AnalyticsHook,
  ArcadeSettings,
} from './types';
import { REGISTRY } from './registry';
import { consoleAnalytics } from './analytics';
import { loadSettings, saveSettings } from './settings';
import { orientationSatisfied, onOrientationChange } from './orientation';
import { renderResultScreen } from './result-screen';
import { fetchSession } from './services/sessions';
import { submitResult, storeLocalBest, getLocalBest } from './services/results';

/**
 * ArcadeShell — the DOM application chrome (Req 1, 4, 7).
 *
 * Owns the selection surface, launches games into a mount element via the
 * `ArcadeGameModule` contract, tears them down on exit or KO, shows the DOM
 * result screen, and survives game teardown (it is the only thing that does).
 * Pure DOM/TypeScript — no Phaser.
 *
 * Flow: select → (dynamic import) → `module.launch(ctx)` → play → KO →
 * `ctx.onResult` → `teardownGame()` → result screen → Play Again / Back.
 * A module load failure shows a readable error and returns to selection (Req 1.6).
 */
export class ArcadeShell {
  private settings: ArcadeSettings;
  private handle: ArcadeGameHandle | null = null;
  private activeManifest: ArcadeGameManifest | null = null;
  private unsubscribeOrientation: (() => void) | null = null;
  private orientationTimer: ReturnType<typeof setInterval> | null = null;
  private resultViewEpoch = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly analytics: AnalyticsHook = consoleAnalytics,
  ) {
    this.settings = loadSettings();
  }

  /** Renders the selection surface. Call once on boot. */
  start(): void {
    this.renderSelection();
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  private renderSelection(): void {
    this.clear();
    this.root.innerHTML = `
      <section class="arcade-select" aria-label="arcade game selection">
        <h1 class="arcade-title">Meme Arcade</h1>
        <p class="arcade-sub">Pick a fight. Or a flight.</p>
        <ul class="arcade-list" role="list"></ul>
        <p class="arcade-muted-hint"></p>
      </section>
    `;

    const list = this.root.querySelector<HTMLElement>('.arcade-list')!;
    for (const manifest of REGISTRY) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'arcade-game';
      btn.type = 'button';
      btn.innerHTML = `<span class="arcade-game-title">${escapeHtml(manifest.title)}</span>
        <span class="arcade-game-tag">${escapeHtml(manifest.tagline ?? '')}</span>`;
      btn.addEventListener('click', () => void this.launch(manifest));
      li.appendChild(btn);
      list.appendChild(li);
    }

    this.root.querySelector<HTMLElement>('.arcade-muted-hint')!.textContent = this.settings.muted
      ? 'audio: muted — press M in-game to unmute'
      : '';
  }

  // ── Launch / play / exit / result ──────────────────────────────────────────

  private async launch(manifest: ArcadeGameManifest): Promise<void> {
    this.analytics.track('game_launch_start', { gameId: manifest.id });
    this.renderLaunching(manifest);
    let module;
    try {
      module = await manifest.load();
    } catch (err) {
      this.renderError(manifest, err);
      return;
    }
    if (!this.activeManifest) return; // user hit "back" during load

    // Mount element the game creates its canvas inside; a small chrome bar holds
    // the exit action so the player can always return to the arcade.
    this.clear();
    this.root.innerHTML = `
      <div class="arcade-game-shell">
        <header class="arcade-chrome">
          <button class="arcade-back" type="button">← Arcade</button>
          <span class="arcade-now-playing"></span>
        </header>
        <div class="arcade-rotate" hidden>↻ Rotate your device to play</div>
        <div class="arcade-mount" id="arcade-mount"></div>
      </div>
    `;

    this.root.querySelector<HTMLButtonElement>('.arcade-back')!.addEventListener('click', () => this.exit());
    this.root.querySelector<HTMLElement>('.arcade-now-playing')!.textContent = manifest.title;

    const mount = this.root.querySelector<HTMLElement>('#arcade-mount')!;
    let session: GameSession;
    try {
      session = await fetchSession(manifest.id, manifest.version, __BUILD_VERSION__);
    } catch (err) {
      this.renderError(manifest, err);
      return;
    }
    if (!this.activeManifest || this.activeManifest.id !== manifest.id) return;
    const ctx: ArcadeGameContext = {
      parent: mount,
      session,
      settings: this.settings,
      onScore: (score) => this.analytics.track('game_score_tick', { gameId: manifest.id, score }),
      onResult: (result, packedTrace) => this.onGameResult(manifest, result, packedTrace, session),
      updateSettings: (patch) => {
        this.settings = saveSettings(patch);
      },
      analytics: this.analytics,
    };

    this.handle = module.launch(ctx);
    this.updateRotatePrompt();
    // Instant response in real browsers, plus a short polling fallback that
    // catches headless/mobile environments where the orientation/resize events
    // don't dispatch reliably.
    this.unsubscribeOrientation = onOrientationChange(() => this.updateRotatePrompt());
    this.orientationTimer = setInterval(() => this.updateRotatePrompt(), 250);
    this.analytics.track('game_launch_ok', { gameId: manifest.id, seed: session.seed, ranked: session.ranked });
  }

  /** Tears down the launched game and returns to selection. */
  exit(): void {
    if (!this.activeManifest) return;
    this.teardownGame();
    this.activeManifest = null;
    this.renderSelection();
  }

  /** Called when a game reports its terminal result via `ctx.onResult`. */
  private onGameResult(
    manifest: ArcadeGameManifest,
    result: GameResult,
    packedTrace: Uint8Array,
    session: GameSession,
  ): void {
    // Ignore if the player already exited or a different game is now active.
    if (!this.activeManifest || this.activeManifest.id !== manifest.id) return;
    this.teardownGame();
    this.activeManifest = null;
    this.analytics.track('game_result', {
      gameId: manifest.id,
      outcome: result.outcome,
      score: result.score,
      durationMs: result.durationMs,
      ranked: session.ranked,
    });

    const epoch = ++this.resultViewEpoch;
    if (!session.ranked || !session.ticket) {
      storeLocalBest(manifest.id, result.score);
    }

    const view = renderResultScreen(this.root, {
      result,
      manifest,
      submissionStatus: session.ranked && session.ticket
        ? { kind: 'submitting' }
        : { kind: 'unranked' },
      localBest: getLocalBest(manifest.id),
      onPlayAgain: () => {
        this.resultViewEpoch++;
        void this.launch(manifest);
      },
      onBack: () => {
        this.resultViewEpoch++;
        this.renderSelection();
      },
    });

    if (session.ranked && session.ticket) {
      void submitResult(result, packedTrace, session.ticket).then((res) => {
        if (epoch !== this.resultViewEpoch) return;
        if (res?.accepted) {
          this.analytics.track('result_accepted', {
            gameId: manifest.id,
            score: res.canonicalScore,
            placement: res.placement,
          });
          view.updateSubmissionStatus({
            kind: 'verified',
            canonicalScore: res.canonicalScore,
            placement: res.placement,
            totalEntries: res.totalEntries,
          });
        } else if (res && !res.accepted) {
          this.analytics.track('result_rejected', { gameId: manifest.id, reason: res.reason });
          view.updateSubmissionStatus({ kind: 'rejected', reason: res.reason });
        } else {
          storeLocalBest(manifest.id, result.score);
          view.updateSubmissionStatus({
            kind: 'submission-failed',
            message: 'The verification service could not be reached.',
          });
        }
      });
    }
  }

  /** Tears down the Phaser instance + orientation watchers. Does NOT clear activeManifest. */
  private teardownGame(): void {
    this.unsubscribeOrientation?.();
    this.unsubscribeOrientation = null;
    if (this.orientationTimer) {
      clearInterval(this.orientationTimer);
      this.orientationTimer = null;
    }
    try {
      this.handle?.destroy();
    } catch (err) {
      console.error('arcade: game destroy threw', err);
    }
    this.handle = null;
  }

  // ── Orientation prompt ────────────────────────────────────────────────────

  private updateRotatePrompt(): void {
    const prompt = this.root.querySelector<HTMLElement>('.arcade-rotate');
    if (!prompt || !this.activeManifest || !this.handle) return;
    const ok = orientationSatisfied(this.activeManifest);
    prompt.hidden = ok;
    // Pause/resume only when the game advertises support (Req 7.3).
    if (ok) this.handle.resume?.();
    else this.handle.pause?.();
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  private renderLaunching(manifest: ArcadeGameManifest): void {
    this.activeManifest = manifest;
    this.clear();
    this.root.innerHTML = `<section class="arcade-loading">Loading ${escapeHtml(manifest.title)}…</section>`;
  }

  private renderError(manifest: ArcadeGameManifest, err: unknown): void {
    this.activeManifest = null;
    const msg = err instanceof Error ? err.message : String(err);
    this.analytics.track('game_launch_error', { gameId: manifest.id, error: msg });
    this.clear();
    this.root.innerHTML = `
      <section class="arcade-error">
        <h2>Couldn’t load ${escapeHtml(manifest.title)}</h2>
        <pre>${escapeHtml(msg)}</pre>
        <button class="arcade-back" type="button">← Back to arcade</button>
      </section>`;
    this.root.querySelector<HTMLButtonElement>('.arcade-back')!.addEventListener('click', () => this.renderSelection());
  }

  private clear(): void {
    // If a game is mid-launch but never produced a handle (load error during
    // launch), there is nothing to destroy; just clear the DOM.
    this.root.innerHTML = '';
  }
}

/** Suitable 31-bit positive integer seed for a deterministic sim. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
