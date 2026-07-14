import type {
  AnalyticsHook,
  ArcadeGameManifest,
  ArcadeReplayHandle,
  DecodedReplayEnvelope,
  ReplaySpeed,
} from './types';
import { consoleAnalytics } from './analytics';

const PROGRESS_INTERVAL_MS = 100;
const SPEEDS: readonly ReplaySpeed[] = [0.5, 1, 2, 4];

export interface ReplayViewer {
  destroy(): Promise<void>;
}

export interface ReplayViewerOptions {
  registry: readonly ArcadeGameManifest[];
  analytics?: AnalyticsHook;
  onBack(): void;
}

/** Development-only, game-neutral replay shell. */
export function showReplayViewer(root: HTMLElement, options: ReplayViewerOptions): ReplayViewer {
  const viewer = new ReplayViewerImpl(root, options);
  viewer.start();
  return viewer;
}

class ReplayViewerImpl implements ReplayViewer {
  private readonly analytics: AnalyticsHook;
  private operationId = 0;
  private controller: AbortController | null = null;
  private handle: ArcadeReplayHandle | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private destroyPromise: Promise<void> | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: ReplayViewerOptions,
  ) {
    this.analytics = options.analytics ?? consoleAnalytics;
  }

  start(): void {
    this.renderForm();
  }

  destroy(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;
    this.destroyPromise = (async () => {
      this.operationId += 1;
      this.controller?.abort(new DOMException('Replay viewer destroyed', 'AbortError'));
      this.controller = null;
      this.stopProgressPolling();
      const handle = this.handle;
      this.handle = null;
      if (handle) await handle.destroy();
      this.root.replaceChildren();
    })();
    return this.destroyPromise;
  }

  private renderForm(error?: string): void {
    this.root.innerHTML = `
      <section class="arcade-replay-form arcade-scroll-surface" aria-labelledby="replay-title">
        <h1 id="replay-title" tabindex="-1">Replay Viewer <span class="arcade-dev-badge">DEV</span></h1>
        <p>Paste a replay envelope containing exact game, schema, seed, and trace metadata.</p>
        <label for="replay-envelope">Replay envelope (JSON)</label>
        <textarea id="replay-envelope" class="replay-envelope" rows="12" spellcheck="false"
          placeholder='Paste a replay envelope with game, seed, and input-trace evidence'></textarea>
        <div class="replay-form-actions">
          <button class="replay-load" type="button">Load Replay</button>
          <button class="replay-back-link" type="button">← Back to Arcade</button>
        </div>
        <p class="replay-error" role="alert" ${error ? '' : 'hidden'}>${escapeHtml(error ?? '')}</p>
      </section>`;

    this.root.querySelector<HTMLButtonElement>('.replay-load')!
      .addEventListener('click', () => void this.loadAndPlay());
    this.root.querySelector<HTMLButtonElement>('.replay-back-link')!
      .addEventListener('click', () => void this.back());
    if (error) this.root.querySelector<HTMLTextAreaElement>('.replay-envelope')?.focus();
    else focusHeading(this.root);
  }

  private async loadAndPlay(): Promise<void> {
    const input = this.root.querySelector<HTMLTextAreaElement>('.replay-envelope');
    const loadButton = this.root.querySelector<HTMLButtonElement>('.replay-load');
    if (!input || !loadButton) return;

    let replay: DecodedReplayEnvelope;
    let manifest: ArcadeGameManifest;
    try {
      replay = parseReplayEnvelope(input.value);
      manifest = resolveReplayManifest(this.options.registry, replay);
    } catch (error) {
      this.showFormError(error);
      return;
    }

    loadButton.disabled = true;
    loadButton.textContent = 'Loading…';
    this.root.querySelector<HTMLElement>('.arcade-replay-form')?.setAttribute('aria-busy', 'true');
    const id = ++this.operationId;
    const controller = new AbortController();
    this.controller = controller;

    try {
      const adapter = await manifest.replay!.load();
      if (!this.owns(id, controller)) return;
      const mount = this.renderPlayer(manifest.title);
      const handle = adapter.launch({
        mount,
        replay,
        signal: controller.signal,
        analytics: this.analytics,
      });
      this.handle = handle;
      this.wireControls(handle);
      await handle.ready;
      if (!this.owns(id, controller) || this.handle !== handle) return;
      this.startProgressPolling(handle);
      this.analytics.track('arcade_replay_started', {
        gameId: replay.game.id,
        gameVersion: replay.game.version,
      });
    } catch (error) {
      if (!this.owns(id, controller) || isAbortError(error)) return;
      const handle = this.handle;
      this.handle = null;
      if (handle) await handle.destroy();
      if (!this.owns(id, controller)) return;
      this.controller = null;
      this.renderForm(errorMessage(error));
    }
  }

  private renderPlayer(title: string): HTMLElement {
    this.root.innerHTML = `
      <section class="arcade-replay-shell" aria-label="${escapeHtml(title)} replay">
        <header class="arcade-replay-controls" aria-label="Replay controls">
          <button class="replay-toggle" type="button" aria-pressed="false">⏸ Pause</button>
          <button class="replay-step" type="button">⏭ Step</button>
          <div class="replay-speeds" role="group" aria-label="Playback speed">
            ${SPEEDS.map((speed) => `<button class="replay-speed${speed === 1 ? ' active' : ''}" data-speed="${speed}" type="button" aria-pressed="${speed === 1}">${speed}×</button>`).join('')}
          </div>
          <output class="replay-frame-counter" aria-label="Replay progress">Frame 0 / 0</output>
          <button class="replay-back-link" type="button">← Back</button>
        </header>
        <div class="arcade-mount" id="replay-mount"></div>
      </section>`;
    this.root.querySelector<HTMLButtonElement>('.replay-back-link')!
      .addEventListener('click', () => void this.back());
    return this.root.querySelector<HTMLElement>('#replay-mount')!;
  }

  private wireControls(handle: ArcadeReplayHandle): void {
    const toggle = this.root.querySelector<HTMLButtonElement>('.replay-toggle')!;
    toggle.addEventListener('click', () => {
      if (handle.progress.playing) {
        handle.pause();
        toggle.textContent = '▶ Play';
        toggle.setAttribute('aria-pressed', 'true');
      } else {
        handle.play();
        toggle.textContent = '⏸ Pause';
        toggle.setAttribute('aria-pressed', 'false');
      }
    });
    this.root.querySelector<HTMLButtonElement>('.replay-step')!.addEventListener('click', () => {
      handle.step();
      toggle.textContent = '▶ Play';
      toggle.setAttribute('aria-pressed', 'true');
    });
    const speedButtons = [...this.root.querySelectorAll<HTMLButtonElement>('.replay-speed')];
    for (const button of speedButtons) {
      button.addEventListener('click', () => {
        const speed = Number(button.dataset.speed) as ReplaySpeed;
        handle.setSpeed(speed);
        for (const candidate of speedButtons) {
          const active = candidate === button;
          candidate.classList.toggle('active', active);
          candidate.setAttribute('aria-pressed', String(active));
        }
      });
    }
  }

  private startProgressPolling(handle: ArcadeReplayHandle): void {
    this.stopProgressPolling();
    const counter = this.root.querySelector<HTMLOutputElement>('.replay-frame-counter');
    if (!counter) return;
    const update = (): void => {
      const progress = handle.progress;
      counter.value = `Frame ${progress.frame} / ${progress.totalFrames}`;
    };
    update();
    this.progressTimer = setInterval(update, PROGRESS_INTERVAL_MS);
  }

  private stopProgressPolling(): void {
    if (this.progressTimer !== null) clearInterval(this.progressTimer);
    this.progressTimer = null;
  }

  private async back(): Promise<void> {
    await this.destroy();
    this.options.onBack();
  }

  private showFormError(error: unknown): void {
    const element = this.root.querySelector<HTMLElement>('.replay-error');
    if (!element) return;
    element.textContent = errorMessage(error);
    element.hidden = false;
    this.root.querySelector<HTMLTextAreaElement>('.replay-envelope')?.focus();
  }

  private owns(id: number, controller: AbortController): boolean {
    return id === this.operationId && this.controller === controller && !controller.signal.aborted;
  }
}

export function parseReplayEnvelope(value: string): DecodedReplayEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Replay envelope must be valid JSON.');
  }
  if (!isRecord(parsed) || !isRecord(parsed.game) || !isRecord(parsed.evidence)) {
    throw new Error('Replay envelope is missing game or evidence metadata.');
  }
  const evidence = parsed.evidence;
  if (typeof parsed.game.id !== 'string' || !parsed.game.id
    || typeof parsed.game.version !== 'string' || !parsed.game.version) {
    throw new Error('Replay game identity is invalid.');
  }
  if (!Number.isSafeInteger(parsed.seed) || (parsed.seed as number) < 0) {
    throw new Error('Replay seed must be a non-negative safe integer.');
  }
  if (evidence.kind !== 'input-trace' || !isRecord(evidence.schema)
    || typeof evidence.schema.id !== 'string' || !evidence.schema.id
    || !Number.isSafeInteger(evidence.schema.version) || (evidence.schema.version as number) < 0
    || !Number.isSafeInteger(evidence.encodingVersion) || (evidence.encodingVersion as number) < 0
    || typeof evidence.data !== 'string') {
    throw new Error('Replay input-trace metadata is invalid.');
  }
  return {
    game: { id: parsed.game.id, version: parsed.game.version },
    seed: parsed.seed as number,
    evidence: {
      kind: 'input-trace',
      schema: { id: evidence.schema.id, version: evidence.schema.version as number },
      encodingVersion: evidence.encodingVersion as number,
      bytes: decodeBase64(evidence.data),
    },
  };
}

function resolveReplayManifest(
  registry: readonly ArcadeGameManifest[],
  replay: DecodedReplayEnvelope,
): ArcadeGameManifest {
  const manifest = registry.find((candidate) =>
    candidate.contract.game.id === replay.game.id
    && candidate.contract.game.version === replay.game.version);
  if (!manifest) throw new Error(`Unknown game/version: ${replay.game.id}@${replay.game.version}`);
  if (!manifest.replay) throw new Error(`${manifest.title} does not provide replay playback.`);
  const verification = manifest.contract.verification;
  if (verification.kind !== 'input-trace') {
    throw new Error(`${manifest.title} does not use input-trace replay evidence.`);
  }
  if (verification.schema.id !== replay.evidence.schema.id
    || verification.schema.version !== replay.evidence.schema.version
    || verification.encodingVersion !== replay.evidence.encodingVersion) {
    throw new Error('Replay schema or encoding version does not match the registered game.');
  }
  return manifest;
}

function decodeBase64(value: string): Uint8Array {
  if (!value || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Replay trace must be valid base64.');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function focusHeading(root: HTMLElement): void {
  root.querySelector<HTMLElement>('h1, h2')?.focus();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}
