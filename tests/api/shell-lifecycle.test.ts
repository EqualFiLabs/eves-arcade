// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArcadeShell,
  type ArcadeShellSnapshot,
} from '../../apps/web/src/arcade/shell';
import type {
  AnalyticsHook,
  ArcadeGameContext,
  ArcadeGameHandle,
  ArcadeGameManifest,
  ArcadeGameModule,
  GameCompletion,
  GameSession,
} from '../../apps/web/src/arcade/types';

const GAME = { id: 'lifecycle-fixture', version: '1.0.0' } as const;
const createdShells: ArcadeShell[] = [];

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
  (globalThis as typeof globalThis & { __BUILD_VERSION__: string }).__BUILD_VERSION__ = 'test';
  localStorage.clear();
});

afterEach(async () => {
  await Promise.all(createdShells.map((shell) => shell.destroy()));
  createdShells.length = 0;
  vi.useRealTimers();
});

describe('ArcadeShell lifecycle', () => {
  it('publishes the ordered launch, completion, teardown, and result states', async () => {
    const fixture = gameFixture();
    const states: string[] = [];
    const shell = createShell(fixture.manifest);
    shell.subscribe((state) => states.push(state.kind));
    shell.start();

    click('.arcade-game');
    await waitForState(shell, 'LAUNCHING');
    fixture.ready.resolve();
    await waitForState(shell, 'PLAYING');
    fixture.context!.complete(completion());
    await waitForState(shell, 'RESULTS');

    expect(states).toEqual([
      'SELECTING',
      'LOADING_MODULE',
      'ACQUIRING_SESSION',
      'LAUNCHING',
      'PLAYING',
      'COMPLETING',
      'TEARING_DOWN',
      'RESULTS',
    ]);
    expect(fixture.destroy).toHaveBeenCalledTimes(1);
  });

  it('allows only one launch from rapid repeated selection', async () => {
    const fixture = gameFixture();
    const shell = createShell(fixture.manifest);
    shell.start();
    const button = document.querySelector<HTMLButtonElement>('.arcade-game')!;
    button.click();
    button.click();
    await waitForState(shell, 'LAUNCHING');
    expect(fixture.load).toHaveBeenCalledTimes(1);
    expect(fixture.launch).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending module load and ignores its late resolution', async () => {
    const module = deferred<ArcadeGameModule>();
    const launch = vi.fn();
    const manifest = manifestFor({ load: vi.fn(() => module.promise) });
    const shell = createShell(manifest);
    shell.start();
    click('.arcade-game');
    expect(shell.snapshot.kind).toBe('LOADING_MODULE');
    click('.arcade-cancel');
    await waitForState(shell, 'SELECTING');

    module.resolve({ launch });
    await nextTurn();
    expect(launch).not.toHaveBeenCalled();
    expect(document.querySelector('.arcade-game')).not.toBeNull();
  });

  it('aborts session acquisition and prevents a late game launch', async () => {
    const session = deferred<GameSession>();
    const fixture = gameFixture({ ranked: true });
    const acquireSession = vi.fn(() => session.promise);
    const shell = createShell(fixture.manifest, { acquireSession });
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'ACQUIRING_SESSION');
    click('.arcade-cancel');
    await waitForState(shell, 'SELECTING');

    session.resolve(ticketedSession());
    await nextTurn();
    expect(fixture.launch).not.toHaveBeenCalled();
  });

  it('destroys a booting game and ignores readiness after cancellation', async () => {
    const fixture = gameFixture();
    const shell = createShell(fixture.manifest);
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'LAUNCHING');
    click('.arcade-back');
    await waitForState(shell, 'SELECTING');
    fixture.ready.resolve();
    await nextTurn();

    expect(fixture.destroy).toHaveBeenCalledTimes(1);
    expect(shell.snapshot.kind).toBe('SELECTING');
  });

  it('turns completion before readiness into a recoverable contract error', async () => {
    const fixture = gameFixture({ completeDuringLaunch: true });
    const shell = createShell(fixture.manifest);
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'ERROR');

    expect(shell.snapshot.error?.stage).toBe('contract');
    expect(fixture.destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.arcade-retry')).not.toBeNull();
  });

  it('surfaces module failures and retries with a fresh operation', async () => {
    const fixture = gameFixture();
    fixture.load.mockRejectedValueOnce(new Error('chunk unavailable'));
    const shell = createShell(fixture.manifest);
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'ERROR');
    expect(shell.snapshot.error?.stage).toBe('module-load');

    click('.arcade-retry');
    await waitForState(shell, 'LAUNCHING');
    expect(fixture.load).toHaveBeenCalledTimes(2);
    fixture.ready.resolve();
    await waitForState(shell, 'PLAYING');
  });

  it('classifies synchronous launch failures', async () => {
    const launch = vi.fn(() => { throw new Error('renderer boot failed'); });
    const manifest = manifestFor({ load: vi.fn(async () => ({ launch })) });
    const shell = createShell(manifest);
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'ERROR');

    expect(shell.snapshot.error).toMatchObject({ stage: 'launch', message: 'renderer boot failed' });
  });

  it('classifies rejected readiness and enforces the bounded ready deadline', async () => {
    const rejected = gameFixture();
    const rejectedShell = createShell(rejected.manifest);
    rejectedShell.start();
    click('.arcade-game');
    await waitForState(rejectedShell, 'LAUNCHING');
    rejected.ready.reject(new Error('preload failed'));
    await waitForState(rejectedShell, 'ERROR');
    expect(rejectedShell.snapshot.error?.stage).toBe('ready');

    await rejectedShell.destroy();
    document.body.innerHTML = '<div id="root"></div>';
    vi.useFakeTimers();
    const timedOut = gameFixture();
    timedOut.manifest.lifecycle = { readyTimeoutMs: 1 };
    const timedOutShell = createShell(timedOut.manifest);
    timedOutShell.start();
    click('.arcade-game');
    await vi.advanceTimersByTimeAsync(0);
    expect(timedOutShell.snapshot.kind).toBe('LAUNCHING');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(timedOutShell.snapshot.error).toMatchObject({
      stage: 'ready',
      message: 'Game did not become ready within 1000ms',
    });
    vi.useRealTimers();
  });

  it('rejects a ranked manifest that cannot suspend its simulation', async () => {
    const fixture = gameFixture({ ranked: true });
    fixture.manifest.capabilities.suspension = false;
    const shell = createShell(fixture.manifest);
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'ERROR');

    expect(shell.snapshot.error).toMatchObject({
      stage: 'contract',
      message: 'Ranked games must declare suspension support',
    });
    expect(fixture.load).not.toHaveBeenCalled();
  });

  it('accepts completion once and diagnoses duplicate callbacks', async () => {
    const fixture = gameFixture();
    const analytics = analyticsFixture();
    const shell = createShell(fixture.manifest, { analytics: analytics.hook });
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'LAUNCHING');
    fixture.ready.resolve();
    await waitForState(shell, 'PLAYING');

    fixture.context!.complete(completion());
    fixture.context!.complete(completion());
    await waitForState(shell, 'RESULTS');
    expect(fixture.destroy).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith(
      'arcade_completion_ignored',
      expect.objectContaining({ reason: 'duplicate' }),
    );
  });

  it('composes visibility and orientation suspension reasons', async () => {
    const fixture = gameFixture();
    const shell = createShell(fixture.manifest);
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'LAUNCHING');
    fixture.ready.resolve();
    await waitForState(shell, 'PLAYING');

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    window.dispatchEvent(new Event('resize'));
    expect(fixture.suspend).toHaveBeenCalledWith('visibility');
    expect(fixture.suspend).toHaveBeenCalledWith('orientation');

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fixture.resume).toHaveBeenCalledWith('visibility');
    expect(fixture.resume).not.toHaveBeenCalledWith('orientation');
  });

  it('lets boot finish before applying a gate that became active during launch', async () => {
    const fixture = gameFixture();
    const shell = createShell(fixture.manifest);
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'LAUNCHING');

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fixture.suspend).not.toHaveBeenCalled();

    fixture.ready.resolve();
    await waitForState(shell, 'PLAYING');
    expect(fixture.suspend).toHaveBeenCalledWith('visibility');
  });

  it('discards late submission responses after leaving results', async () => {
    const fixture = gameFixture({ ranked: true });
    const submitted = deferred<Awaited<ReturnType<typeof import('../../apps/web/src/arcade/services/results').submitResult>>>();
    const submitResult = vi.fn(() => submitted.promise);
    const shell = createShell(fixture.manifest, {
      acquireSession: vi.fn(async () => ticketedSession()),
      submitResult,
    });
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'LAUNCHING');
    fixture.ready.resolve();
    await waitForState(shell, 'PLAYING');
    fixture.context!.complete(completion());
    await waitForState(shell, 'RESULTS');
    await shell.exit();

    submitted.resolve({
      accepted: true,
      canonicalResult: completion().result,
      placements: [],
    });
    await nextTurn();
    expect(shell.snapshot.kind).toBe('SELECTING');
    expect(document.querySelector('.arcade-result')).toBeNull();
  });

  it('escapes a hung teardown after the defensive deadline', async () => {
    vi.useFakeTimers();
    const fixture = gameFixture({ destroyPromise: new Promise<void>(() => {}) });
    const analytics = analyticsFixture();
    const shell = createShell(fixture.manifest, {
      analytics: analytics.hook,
      teardownTimeoutMs: 10,
    });
    shell.start();
    click('.arcade-game');
    await vi.advanceTimersByTimeAsync(0);
    fixture.ready.resolve();
    await vi.advanceTimersByTimeAsync(0);
    const exit = shell.exit();
    await vi.advanceTimersByTimeAsync(10);
    await exit;

    expect(shell.snapshot.kind).toBe('SELECTING');
    expect(analytics.track).toHaveBeenCalledWith(
      'arcade_teardown_failed',
      expect.objectContaining({ message: 'Game teardown timed out' }),
    );
    vi.useRealTimers();
  });

  it('destroys the shell idempotently and removes its subscriptions', async () => {
    const fixture = gameFixture();
    const shell = createShell(fixture.manifest);
    shell.start();
    click('.arcade-game');
    await waitForState(shell, 'LAUNCHING');
    await shell.destroy();
    await shell.destroy();
    expect(shell.snapshot.kind).toBe('DESTROYED');
    expect(fixture.destroy).toHaveBeenCalledTimes(1);
    expect(document.getElementById('root')?.childElementCount).toBe(0);
  });
});

function createShell(
  manifest: ArcadeGameManifest,
  options: ConstructorParameters<typeof ArcadeShell>[1] = {},
): ArcadeShell {
  const shell = new ArcadeShell(document.getElementById('root')!, {
    registry: [manifest],
    ...options,
  });
  createdShells.push(shell);
  return shell;
}

function gameFixture(options: {
  ranked?: boolean;
  completeDuringLaunch?: boolean;
  destroyPromise?: Promise<void>;
} = {}) {
  const ready = deferred<void>();
  const destroy = vi.fn(() => options.destroyPromise ?? Promise.resolve());
  const suspend = vi.fn();
  const resume = vi.fn();
  let context: ArcadeGameContext | null = null;
  const handle: ArcadeGameHandle = { ready: ready.promise, destroy, suspend, resume };
  const launch = vi.fn((ctx: ArcadeGameContext) => {
    context = ctx;
    if (options.completeDuringLaunch) ctx.complete(completion());
    return handle;
  });
  const module: ArcadeGameModule = { launch };
  const load = vi.fn(async () => module);
  const manifest = manifestFor({ load }, options.ranked);
  return {
    ready,
    destroy,
    suspend,
    resume,
    launch,
    load,
    manifest,
    get context() { return context; },
  };
}

function manifestFor(
  module: Pick<ArcadeGameManifest, 'load'>,
  ranked = false,
): ArcadeGameManifest {
  return {
    contract: {
      game: GAME,
      resultSchema: { id: 'fixture.result', version: 1 },
      verification: ranked
        ? { kind: 'input-trace', schema: { id: 'fixture.input', version: 1 }, encodingVersion: 2 }
        : { kind: 'none' },
    },
    title: 'Lifecycle Fixture',
    orientation: 'landscape',
    capabilities: {
      input: { keyboard: true, pointer: false, touch: false, gamepad: false },
      suspension: true,
    },
    leaderboards: [],
    load: module.load,
  };
}

function completion(): GameCompletion {
  return {
    result: {
      schema: { id: 'fixture.result', version: 1 },
      outcome: 'complete',
      metrics: { score: 10 },
      durationMs: 100,
    },
    presentation: { headline: 'Complete', tone: 'neutral' },
    evidence: { kind: 'none' },
  };
}

function ticketedSession(): GameSession {
  return {
    seed: 42,
    startedAt: Date.now(),
    ranking: {
      kind: 'ticketed',
      ticket: {
        sessionId: 's1',
        game: GAME,
        verifier: { id: 'fixture.verify', revision: 1 },
        buildVersion: 'test',
        seed: 42,
        issuedAt: 1,
        expiresAt: Date.now() + 60_000,
        sig: '0'.repeat(64),
      },
    },
  };
}

function analyticsFixture(): { hook: AnalyticsHook; track: ReturnType<typeof vi.fn> } {
  const track = vi.fn();
  return { hook: { track }, track };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function click(selector: string): void {
  document.querySelector<HTMLButtonElement>(selector)!.click();
}

async function waitForState(shell: ArcadeShell, kind: ArcadeShellSnapshot['kind']): Promise<void> {
  await vi.waitFor(() => expect(shell.snapshot.kind).toBe(kind));
}

async function nextTurn(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
