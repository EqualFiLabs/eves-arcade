import type {
  AnalyticsHook,
  ArcadeGameHandle,
  ArcadeGameManifest,
  ArcadeSettings,
  GameCompletion,
  GameSession,
} from './types';
import { REGISTRY } from './registry';
import { consoleAnalytics } from './analytics';
import { loadSettings, saveSettings } from './settings';
import { orientationSatisfied, onOrientationChange } from './orientation';
import { renderResultScreen } from './result-screen';
import { fetchSession } from './services/sessions';
import { getLocalBest, storeLocalBest, submitResult } from './services/results';

export class ArcadeShell {
  private settings: ArcadeSettings;
  private handle: ArcadeGameHandle | null = null;
  private active: ArcadeGameManifest | null = null;
  private removeOrientationListener: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private epoch = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly analytics: AnalyticsHook = consoleAnalytics,
  ) {
    this.settings = loadSettings();
  }

  start(): void {
    this.showSelection();
  }

  exit(): void {
    this.teardown();
    this.active = null;
    this.showSelection();
  }

  private showSelection(): void {
    this.clear();
    this.root.innerHTML = `
      <section class="arcade-select">
        <h1 class="arcade-title">Meme Arcade</h1>
        <p class="arcade-sub">Pick a fight. Or a flight.</p>
        <ul class="arcade-list"></ul>
      </section>`;
    const list = this.root.querySelector('ul')!;
    for (const manifest of REGISTRY) {
      const button = document.createElement('button');
      button.className = 'arcade-game';
      button.innerHTML = `
        <span class="arcade-game-title">${escapeHtml(manifest.title)}</span>
        <span class="arcade-game-tag">${escapeHtml(manifest.tagline ?? '')}</span>`;
      button.addEventListener('click', () => void this.launch(manifest));
      const item = document.createElement('li');
      item.append(button);
      list.append(item);
    }
  }

  private async launch(manifest: ArcadeGameManifest): Promise<void> {
    this.active = manifest;
    this.root.innerHTML = `<section class="arcade-loading">Loading ${escapeHtml(manifest.title)}…</section>`;

    let module;
    try {
      module = await manifest.load();
    } catch (error) {
      this.showError(manifest, error);
      return;
    }

    this.root.innerHTML = `
      <div class="arcade-game-shell">
        <header class="arcade-chrome">
          <button class="arcade-back">← Arcade</button>
          <span>${escapeHtml(manifest.title)}</span>
        </header>
        <div class="arcade-rotate" hidden>↻ Rotate your device to play</div>
        <div id="arcade-mount" class="arcade-mount"></div>
      </div>`;
    this.root.querySelector<HTMLButtonElement>('.arcade-back')!
      .addEventListener('click', () => this.exit());

    let session: GameSession;
    if (manifest.contract.verification.kind === 'none') {
      session = {
        seed: randomSeed(),
        startedAt: Date.now(),
        ranking: { kind: 'unranked', reason: 'unsupported' },
      };
    } else {
      try {
        session = await fetchSession(manifest.contract.game, __BUILD_VERSION__);
      } catch (error) {
        this.showError(manifest, error);
        return;
      }
    }

    this.abortController = new AbortController();
    try {
      this.handle = module.launch({
        mount: this.root.querySelector('#arcade-mount')!,
        session,
        settings: this.settings,
        signal: this.abortController.signal,
        complete: (completion) => this.complete(manifest, completion, session),
        updateSettings: (patch) => {
          this.settings = saveSettings(patch);
        },
        analytics: this.analytics,
      });
      await this.handle.ready;
    } catch (error) {
      this.showError(manifest, error);
      return;
    }

    this.removeOrientationListener = onOrientationChange(() => this.applyOrientation());
    this.applyOrientation();
  }

  private complete(
    manifest: ArcadeGameManifest,
    completion: GameCompletion,
    session: GameSession,
  ): void {
    if (this.active !== manifest) return;
    this.teardown();
    this.active = null;

    const localBest = manifest.localBest;
    const metricValue = localBest ? completion.result.metrics[localBest.metric] : undefined;
    if (localBest && metricValue !== undefined) {
      storeLocalBest(manifest.contract.game.id, localBest.metric, metricValue, localBest.order);
    }

    const token = ++this.epoch;
    const view = renderResultScreen(this.root, {
      result: completion.result,
      presentation: completion.presentation,
      submissionStatus: session.ranking.kind === 'ticketed'
        ? { kind: 'submitting' }
        : { kind: 'unranked' },
      localBest: localBest
        ? getLocalBest(manifest.contract.game.id, localBest.metric)
        : 0,
      onPlayAgain: () => void this.launch(manifest),
      onBack: () => this.showSelection(),
    });

    if (session.ranking.kind !== 'ticketed') return;
    void submitResult(
      completion,
      manifest.contract.game,
      __BUILD_VERSION__,
      session.ranking.ticket,
    ).then((response) => {
      if (token !== this.epoch) return;
      if (response?.accepted) {
        view.updateSubmissionStatus({
          kind: 'verified',
          result: response.canonicalResult,
          placement: response.placements[0],
        });
      } else if (response) {
        view.updateSubmissionStatus({ kind: 'rejected', reason: response.reason });
      } else {
        view.updateSubmissionStatus({ kind: 'submission-failed', message: 'Network unavailable' });
      }
    });
  }

  private applyOrientation(): void {
    if (!this.active || !this.handle) return;
    const satisfied = orientationSatisfied(this.active);
    const prompt = this.root.querySelector<HTMLElement>('.arcade-rotate');
    if (prompt) prompt.hidden = satisfied;
    if (satisfied) this.handle.resume?.('orientation');
    else this.handle.suspend?.('orientation');
  }

  private teardown(): void {
    this.removeOrientationListener?.();
    this.removeOrientationListener = null;
    this.abortController?.abort();
    this.abortController = null;
    this.handle?.destroy();
    this.handle = null;
  }

  private showError(manifest: ArcadeGameManifest, error: unknown): void {
    this.teardown();
    this.active = null;
    const message = error instanceof Error ? error.message : String(error);
    this.root.innerHTML = `
      <section class="arcade-error">
        <h2>Couldn’t load ${escapeHtml(manifest.title)}</h2>
        <pre>${escapeHtml(message)}</pre>
        <button>← Back</button>
      </section>`;
    this.root.querySelector('button')!.addEventListener('click', () => this.showSelection());
  }

  private clear(): void {
    this.epoch += 1;
    this.teardown();
    this.root.replaceChildren();
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}
