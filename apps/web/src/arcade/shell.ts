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
import { renderResultScreen, type ResultScreenHandle } from './result-screen';
import { fetchSession } from './services/sessions';
import { getLocalBest, storeLocalBest, submitResult } from './services/results';

const SESSION_TIMEOUT_MS = 8_000;
const READY_TIMEOUT_MS = 30_000;
const TEARDOWN_TIMEOUT_MS = 5_000;

export type ArcadeShellStateKind =
  | 'SELECTING'
  | 'LOADING_MODULE'
  | 'ACQUIRING_SESSION'
  | 'LAUNCHING'
  | 'PLAYING'
  | 'COMPLETING'
  | 'TEARING_DOWN'
  | 'RESULTS'
  | 'ERROR'
  | 'DESTROYED';

export type ArcadeErrorStage =
  | 'module-load'
  | 'session'
  | 'launch'
  | 'ready'
  | 'contract'
  | 'teardown';

export interface ArcadeShellSnapshot {
  readonly kind: ArcadeShellStateKind;
  readonly operationId: number | null;
  readonly gameId?: string;
  readonly error?: { stage: ArcadeErrorStage; message: string };
}

export interface ArcadeShellOptions {
  registry?: readonly ArcadeGameManifest[];
  analytics?: AnalyticsHook;
  acquireSession?: typeof fetchSession;
  submitResult?: typeof submitResult;
  renderResult?: typeof renderResultScreen;
  sessionTimeoutMs?: number;
  teardownTimeoutMs?: number;
}

interface LaunchOperation {
  readonly kind: 'launch';
  readonly id: number;
  readonly manifest: ArcadeGameManifest;
  readonly controller: AbortController;
  handle: ArcadeGameHandle | null;
  mount: HTMLElement | null;
  session: GameSession | null;
  ending: boolean;
  completionAccepted: boolean;
  earlyCompletion: boolean;
  readonly suspendedReasons: Set<'orientation' | 'visibility'>;
  teardownPromise: Promise<void> | null;
}

interface ResultOperation {
  readonly kind: 'result';
  readonly id: number;
  readonly manifest: ArcadeGameManifest;
  readonly controller: AbortController;
  readonly view: ResultScreenHandle;
}

type ShellOperation = LaunchOperation | ResultOperation;
type StateListener = (snapshot: Readonly<ArcadeShellSnapshot>) => void;

const ALLOWED_TRANSITIONS: Readonly<Record<ArcadeShellStateKind, readonly ArcadeShellStateKind[]>> = {
  SELECTING: ['LOADING_MODULE', 'DESTROYED'],
  LOADING_MODULE: ['ACQUIRING_SESSION', 'TEARING_DOWN'],
  ACQUIRING_SESSION: ['LAUNCHING', 'TEARING_DOWN'],
  LAUNCHING: ['PLAYING', 'TEARING_DOWN'],
  PLAYING: ['COMPLETING', 'TEARING_DOWN'],
  COMPLETING: ['TEARING_DOWN'],
  TEARING_DOWN: ['SELECTING', 'RESULTS', 'ERROR', 'LOADING_MODULE', 'DESTROYED'],
  RESULTS: ['TEARING_DOWN', 'DESTROYED'],
  ERROR: ['SELECTING', 'LOADING_MODULE', 'DESTROYED'],
  DESTROYED: [],
};

export class ArcadeShell {
  private readonly registry: readonly ArcadeGameManifest[];
  private readonly analytics: AnalyticsHook;
  private readonly acquireSession: typeof fetchSession;
  private readonly submit: typeof submitResult;
  private readonly resultRenderer: typeof renderResultScreen;
  private readonly sessionTimeoutMs: number;
  private readonly teardownTimeoutMs: number;
  private readonly listeners = new Set<StateListener>();
  private settings: ArcadeSettings;
  private current: ShellOperation | null = null;
  private nextOperationId = 1;
  private removeOrientationListener: (() => void) | null = null;
  private started = false;
  private snapshotValue: Readonly<ArcadeShellSnapshot> = Object.freeze({
    kind: 'SELECTING',
    operationId: null,
  });

  constructor(private readonly root: HTMLElement, options: ArcadeShellOptions = {}) {
    this.registry = options.registry ?? REGISTRY;
    this.analytics = options.analytics ?? consoleAnalytics;
    this.acquireSession = options.acquireSession ?? fetchSession;
    this.submit = options.submitResult ?? submitResult;
    this.resultRenderer = options.renderResult ?? renderResultScreen;
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? SESSION_TIMEOUT_MS;
    this.teardownTimeoutMs = options.teardownTimeoutMs ?? TEARDOWN_TIMEOUT_MS;
    this.settings = loadSettings();
  }

  get snapshot(): Readonly<ArcadeShellSnapshot> {
    return this.snapshotValue;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshotValue);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started || this.snapshotValue.kind === 'DESTROYED') return;
    this.started = true;
    this.removeOrientationListener = onOrientationChange(() => this.applySuspension('orientation'));
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.renderSelection();
  }

  async exit(): Promise<void> {
    const operation = this.current;
    if (operation?.kind === 'launch') {
      await this.cancelLaunch(operation);
      return;
    }
    if (operation?.kind === 'result') {
      operation.controller.abort(abortError('Results closed'));
      this.current = null;
      this.transition({ kind: 'TEARING_DOWN', operationId: operation.id, gameId: operation.manifest.contract.game.id });
      this.transition({ kind: 'SELECTING', operationId: null });
      this.renderSelection();
      return;
    }
    if (this.snapshotValue.kind === 'ERROR') {
      this.transition({ kind: 'SELECTING', operationId: null });
      this.renderSelection();
    }
  }

  async destroy(): Promise<void> {
    if (this.snapshotValue.kind === 'DESTROYED') return;
    const operation = this.current;
    if (operation?.kind === 'launch') {
      operation.ending = true;
      this.transition({ kind: 'TEARING_DOWN', operationId: operation.id, gameId: operation.manifest.contract.game.id });
      await this.teardownLaunch(operation, 'Shell destroyed');
    } else if (operation?.kind === 'result') {
      operation.controller.abort(abortError('Shell destroyed'));
    }
    this.current = null;
    this.removeOrientationListener?.();
    this.removeOrientationListener = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.root.replaceChildren();
    this.transition({ kind: 'DESTROYED', operationId: null });
    this.listeners.clear();
  }

  private readonly onVisibilityChange = (): void => {
    this.applySuspension('visibility');
  };

  private renderSelection(): void {
    this.root.innerHTML = `
      <section class="arcade-select">
        <h1 class="arcade-title">Meme Arcade</h1>
        <p class="arcade-sub">Pick a fight. Or a flight.</p>
        <ul class="arcade-list"></ul>
      </section>`;
    const list = this.root.querySelector('ul')!;
    for (const manifest of this.registry) {
      const button = document.createElement('button');
      button.className = 'arcade-game';
      button.innerHTML = `
        <span class="arcade-game-title">${escapeHtml(manifest.title)}</span>
        <span class="arcade-game-tag">${escapeHtml(manifest.tagline ?? '')}</span>`;
      button.addEventListener('click', () => this.beginLaunch(manifest));
      const item = document.createElement('li');
      item.append(button);
      list.append(item);
    }
  }

  private beginLaunch(manifest: ArcadeGameManifest): void {
    if (this.snapshotValue.kind === 'DESTROYED') return;
    if (this.snapshotValue.kind === 'RESULTS') {
      const results = this.current;
      if (results?.kind !== 'result') return;
      results.controller.abort(abortError('Starting another game'));
      this.current = null;
      this.transition({ kind: 'TEARING_DOWN', operationId: results.id, gameId: manifest.contract.game.id });
    } else if (this.snapshotValue.kind !== 'SELECTING' && this.snapshotValue.kind !== 'ERROR') {
      return;
    }

    const operation: LaunchOperation = {
      kind: 'launch',
      id: this.nextOperationId++,
      manifest,
      controller: new AbortController(),
      handle: null,
      mount: null,
      session: null,
      ending: false,
      completionAccepted: false,
      earlyCompletion: false,
      suspendedReasons: new Set(),
      teardownPromise: null,
    };
    this.current = operation;
    this.transition(this.operationSnapshot('LOADING_MODULE', operation));
    this.renderPending(operation, 'Loading game module…');
    void this.runLaunch(operation);
  }

  private async runLaunch(operation: LaunchOperation): Promise<void> {
    let stage: ArcadeErrorStage = 'module-load';
    try {
      this.assertManifestContract(operation.manifest);
      const module = await operation.manifest.load();
      if (!this.owns(operation)) return;

      stage = 'session';
      this.transition(this.operationSnapshot('ACQUIRING_SESSION', operation));
      this.renderPending(operation, 'Preparing session…');
      operation.session = operation.manifest.contract.verification.kind === 'none'
        ? unrankedSession()
        : await this.acquireSession(
            operation.manifest.contract.game,
            __BUILD_VERSION__,
            { signal: operation.controller.signal, timeoutMs: this.sessionTimeoutMs },
          );
      if (!this.owns(operation)) return;

      stage = 'launch';
      this.transition(this.operationSnapshot('LAUNCHING', operation));
      operation.mount = this.renderGameSurface(operation);
      operation.handle = module.launch({
        mount: operation.mount,
        session: operation.session,
        settings: this.settings,
        signal: operation.controller.signal,
        complete: (completion) => this.acceptCompletion(operation, completion),
        updateSettings: (patch) => {
          if (this.owns(operation)) this.settings = saveSettings(patch);
        },
        analytics: this.analytics,
      });
      this.assertHandleContract(operation);

      stage = 'ready';
      await waitForReady(
        operation.handle.ready,
        readyTimeout(operation.manifest),
        operation.controller.signal,
      );
      if (!this.owns(operation)) return;
      this.transition(this.operationSnapshot('PLAYING', operation));
      this.applyAllSuspensionReasons(operation);
    } catch (error) {
      if (!this.owns(operation) || isAbortError(error)) return;
      if (error instanceof ContractError) stage = 'contract';
      await this.failLaunch(operation, stage, error);
    }
  }

  private renderPending(operation: LaunchOperation, label: string): void {
    this.root.innerHTML = `
      <section class="arcade-loading">
        <p>${escapeHtml(label)}</p>
        <button class="arcade-cancel" type="button">← Cancel</button>
      </section>`;
    this.root.querySelector<HTMLButtonElement>('.arcade-cancel')!
      .addEventListener('click', () => void this.cancelLaunch(operation));
  }

  private renderGameSurface(operation: LaunchOperation): HTMLElement {
    this.root.innerHTML = `
      <div class="arcade-game-shell">
        <header class="arcade-chrome">
          <button class="arcade-back" type="button">← Arcade</button>
          <span>${escapeHtml(operation.manifest.title)}</span>
        </header>
        <div class="arcade-rotate" hidden>↻ Rotate your device to play</div>
        <div id="arcade-mount" class="arcade-mount"></div>
      </div>`;
    this.root.querySelector<HTMLButtonElement>('.arcade-back')!
      .addEventListener('click', () => void this.cancelLaunch(operation));
    this.updateOrientationPrompt(operation.manifest);
    return this.root.querySelector<HTMLElement>('#arcade-mount')!;
  }

  private acceptCompletion(operation: LaunchOperation, completion: GameCompletion): void {
    if (operation.completionAccepted) {
      this.diagnose('arcade_completion_ignored', operation, { reason: 'duplicate' });
      return;
    }
    if (!this.owns(operation)) {
      this.diagnose('arcade_completion_ignored', operation, { reason: 'stale-operation' });
      return;
    }
    if (this.snapshotValue.kind !== 'PLAYING') {
      this.diagnose('arcade_completion_ignored', operation, { reason: 'before-ready' });
      operation.earlyCompletion = true;
      queueMicrotask(() => {
        if (this.owns(operation) && operation.earlyCompletion && !operation.ending) {
          void this.failLaunch(operation, 'contract', new ContractError('Game completed before ready'));
        }
      });
      return;
    }
    operation.completionAccepted = true;
    operation.ending = true;
    this.transition(this.operationSnapshot('COMPLETING', operation));
    void this.finishCompletion(operation, completion);
  }

  private async finishCompletion(operation: LaunchOperation, completion: GameCompletion): Promise<void> {
    this.transition(this.operationSnapshot('TEARING_DOWN', operation));
    await this.teardownLaunch(operation, 'Game completed');
    if (this.current !== operation || this.snapshotValue.kind === 'DESTROYED') return;

    const localBest = operation.manifest.localBest;
    const metricValue = localBest ? completion.result.metrics[localBest.metric] : undefined;
    if (localBest && metricValue !== undefined) {
      storeLocalBest(operation.manifest.contract.game.id, localBest.metric, metricValue, localBest.order);
    }

    const view = this.resultRenderer(this.root, {
      result: completion.result,
      presentation: completion.presentation,
      submissionStatus: operation.session?.ranking.kind === 'ticketed'
        ? { kind: 'submitting' }
        : { kind: 'unranked' },
      localBest: localBest
        ? getLocalBest(operation.manifest.contract.game.id, localBest.metric)
        : 0,
      onPlayAgain: () => this.beginLaunch(operation.manifest),
      onBack: () => void this.exit(),
    });
    const resultOperation: ResultOperation = {
      kind: 'result',
      id: this.nextOperationId++,
      manifest: operation.manifest,
      controller: new AbortController(),
      view,
    };
    this.current = resultOperation;
    this.transition(this.operationSnapshot('RESULTS', resultOperation));

    const ranking = operation.session?.ranking;
    if (ranking?.kind !== 'ticketed') return;
    void this.submit(
      completion,
      operation.manifest.contract.game,
      __BUILD_VERSION__,
      ranking.ticket,
      { signal: resultOperation.controller.signal },
    ).then((response) => {
      if (this.current !== resultOperation || resultOperation.controller.signal.aborted) return;
      if (response?.accepted) {
        resultOperation.view.updateSubmissionStatus({
          kind: 'verified',
          result: response.canonicalResult,
          placement: response.placements[0],
        });
      } else if (response) {
        resultOperation.view.updateSubmissionStatus({ kind: 'rejected', reason: response.reason });
      } else {
        resultOperation.view.updateSubmissionStatus({
          kind: 'submission-failed',
          message: 'Network unavailable',
        });
      }
    }).catch((error: unknown) => {
      if (!isAbortError(error) && this.current === resultOperation) {
        resultOperation.view.updateSubmissionStatus({
          kind: 'submission-failed',
          message: error instanceof Error ? error.message : 'Submission failed',
        });
      }
    });
  }

  private async cancelLaunch(operation: LaunchOperation): Promise<void> {
    if (!this.owns(operation) || operation.ending) return;
    operation.ending = true;
    this.transition(this.operationSnapshot('TEARING_DOWN', operation));
    await this.teardownLaunch(operation, 'Launch cancelled');
    if (this.current !== operation || this.snapshotValue.kind === 'DESTROYED') return;
    this.current = null;
    this.transition({ kind: 'SELECTING', operationId: null });
    this.renderSelection();
  }

  private async failLaunch(
    operation: LaunchOperation,
    stage: ArcadeErrorStage,
    error: unknown,
  ): Promise<void> {
    if (!this.owns(operation) || operation.ending) return;
    operation.ending = true;
    this.transition(this.operationSnapshot('TEARING_DOWN', operation));
    await this.teardownLaunch(operation, `Failure during ${stage}`);
    if (this.current !== operation || this.snapshotValue.kind === 'DESTROYED') return;
    this.current = null;
    const message = error instanceof Error ? error.message : String(error);
    this.transition({
      kind: 'ERROR',
      operationId: operation.id,
      gameId: operation.manifest.contract.game.id,
      error: { stage, message },
    });
    this.renderError(operation.manifest, stage, message);
  }

  private renderError(manifest: ArcadeGameManifest, stage: ArcadeErrorStage, message: string): void {
    this.root.innerHTML = `
      <section class="arcade-error">
        <h2>Couldn’t load ${escapeHtml(manifest.title)}</h2>
        <p>${escapeHtml(stage)}</p>
        <pre>${escapeHtml(message)}</pre>
        <div>
          <button class="arcade-retry" type="button">Retry</button>
          <button class="arcade-error-back" type="button">← Back</button>
        </div>
      </section>`;
    this.root.querySelector<HTMLButtonElement>('.arcade-retry')!
      .addEventListener('click', () => this.beginLaunch(manifest));
    this.root.querySelector<HTMLButtonElement>('.arcade-error-back')!
      .addEventListener('click', () => void this.exit());
  }

  private async teardownLaunch(operation: LaunchOperation, reason: string): Promise<void> {
    if (operation.teardownPromise) return operation.teardownPromise;
    operation.teardownPromise = (async () => {
      operation.controller.abort(abortError(reason));
      if (operation.handle) {
        try {
          await withDeadline(operation.handle.destroy(), this.teardownTimeoutMs, 'Game teardown timed out');
        } catch (error) {
          this.diagnose('arcade_teardown_failed', operation, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      operation.mount?.replaceChildren();
      operation.handle = null;
      operation.mount = null;
    })();
    return operation.teardownPromise;
  }

  private applyAllSuspensionReasons(operation: LaunchOperation): void {
    if (!operation.handle || !operation.manifest.capabilities.suspension) return;
    this.setSuspensionReason(operation, 'visibility', document.hidden);
    this.setSuspensionReason(
      operation,
      'orientation',
      !orientationSatisfied(operation.manifest),
    );
    this.updateOrientationPrompt(operation.manifest);
  }

  private applySuspension(reason: 'orientation' | 'visibility'): void {
    const operation = this.current;
    if (operation?.kind !== 'launch' || !operation.handle) return;
    if (reason === 'orientation') this.updateOrientationPrompt(operation.manifest);
    // A compliant game cannot consume playable simulation frames before its
    // ready promise resolves. Let boot/preload finish, then apply every active
    // gate synchronously as the shell enters PLAYING.
    if (this.snapshotValue.kind !== 'PLAYING') return;
    if (reason === 'visibility') {
      this.setSuspensionReason(operation, 'visibility', document.hidden);
      return;
    }
    this.setSuspensionReason(
      operation,
      'orientation',
      !orientationSatisfied(operation.manifest),
    );
  }

  private setSuspensionReason(
    operation: LaunchOperation,
    reason: 'orientation' | 'visibility',
    active: boolean,
  ): void {
    if (!operation.manifest.capabilities.suspension || !operation.handle) return;
    if (active) {
      if (operation.suspendedReasons.has(reason)) return;
      operation.suspendedReasons.add(reason);
      operation.handle.suspend?.(reason);
      return;
    }
    if (!operation.suspendedReasons.delete(reason)) return;
    operation.handle.resume?.(reason);
  }

  private updateOrientationPrompt(manifest: ArcadeGameManifest): void {
    const prompt = this.root.querySelector<HTMLElement>('.arcade-rotate');
    if (prompt) prompt.hidden = orientationSatisfied(manifest);
  }

  private assertManifestContract(manifest: ArcadeGameManifest): void {
    if (manifest.contract.verification.kind !== 'none' && !manifest.capabilities.suspension) {
      throw new ContractError('Ranked games must declare suspension support');
    }
  }

  private assertHandleContract(operation: LaunchOperation): void {
    const handle = operation.handle;
    if (!handle || typeof handle.destroy !== 'function' || !(handle.ready instanceof Promise)) {
      throw new ContractError('Game launch returned an invalid handle');
    }
    if (operation.manifest.capabilities.suspension
      && (typeof handle.suspend !== 'function' || typeof handle.resume !== 'function')) {
      throw new ContractError('Game declares suspension but its handle cannot suspend and resume');
    }
  }

  private owns(operation: LaunchOperation): boolean {
    return this.current === operation && !operation.controller.signal.aborted;
  }

  private operationSnapshot(
    kind: ArcadeShellStateKind,
    operation: Pick<ShellOperation, 'id' | 'manifest'>,
  ): ArcadeShellSnapshot {
    return { kind, operationId: operation.id, gameId: operation.manifest.contract.game.id };
  }

  private transition(next: ArcadeShellSnapshot): void {
    const previous = this.snapshotValue;
    if (previous.kind !== next.kind && !ALLOWED_TRANSITIONS[previous.kind].includes(next.kind)) {
      throw new Error(`Invalid arcade shell transition: ${previous.kind} → ${next.kind}`);
    }
    this.snapshotValue = Object.freeze({
      ...next,
      ...(next.error ? { error: Object.freeze({ ...next.error }) } : {}),
    });
    this.analytics.track('arcade_state_transition', {
      from: previous.kind,
      to: next.kind,
      operationId: next.operationId,
      gameId: next.gameId,
      errorStage: next.error?.stage,
    });
    for (const listener of this.listeners) listener(this.snapshotValue);
  }

  private diagnose(
    event: string,
    operation: Pick<LaunchOperation, 'id' | 'manifest'>,
    details: Record<string, unknown>,
  ): void {
    this.analytics.track(event, {
      operationId: operation.id,
      gameId: operation.manifest.contract.game.id,
      ...details,
    });
  }
}

class ContractError extends Error {}

function unrankedSession(): GameSession {
  return {
    seed: Math.floor(Math.random() * 0x7fffffff),
    startedAt: Date.now(),
    ranking: { kind: 'unranked', reason: 'unsupported' },
  };
}

function readyTimeout(manifest: ArcadeGameManifest): number {
  const configured = manifest.lifecycle?.readyTimeoutMs ?? READY_TIMEOUT_MS;
  return Math.min(120_000, Math.max(1_000, configured));
}

function waitForReady(ready: Promise<void>, timeoutMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error(`Game did not become ready within ${timeoutMs}ms`));
    }, timeoutMs);
    const onAbort = () => {
      cleanup();
      reject(abortError(signal.reason));
    };
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    ready.then(
      () => { cleanup(); resolve(); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { globalThis.clearTimeout(timer); resolve(value); },
      (error) => { globalThis.clearTimeout(timer); reject(error); },
    );
  });
}

function abortError(reason?: unknown): DOMException {
  return new DOMException(reason instanceof Error ? reason.message : String(reason ?? 'Operation aborted'), 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
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
