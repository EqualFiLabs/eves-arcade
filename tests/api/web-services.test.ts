import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSession, SessionRequestRejectedError } from '../../apps/web/src/arcade/services/sessions';

const originalFetch = globalThis.fetch;
const GAME = { id: 'rug-pull-rumble', version: '0.1.0' } as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('web session service', () => {
  it('requests an exact game/build ticket from the same-origin API', async () => {
    const ticket = {
      sessionId: 's1', game: GAME, buildVersion: 'test', seed: 42,
      issuedAt: 1, expiresAt: 2, sig: '0'.repeat(64),
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }));
    globalThis.fetch = fetch;

    const session = await fetchSession(GAME, 'test');
    expect(session).toMatchObject({ seed: 42, ranking: { kind: 'ticketed', ticket } });
    expect(fetch).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ game: GAME, buildVersion: 'test' }),
    }));
  });

  it('falls back to a discriminated unranked session only for network failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('network down'));
    const session = await fetchSession(GAME, 'test');
    expect(session.ranking).toEqual({ kind: 'unranked', reason: 'service-unavailable' });
    expect(session.seed).toBeGreaterThanOrEqual(0);
  });

  it('surfaces API rejection instead of disguising it as offline play', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Unsupported build: bad' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ));
    await expect(fetchSession(GAME, 'bad')).rejects.toBeInstanceOf(SessionRequestRejectedError);
  });

  it('propagates an explicit caller abort instead of starting offline play', async () => {
    globalThis.fetch = abortablePendingFetch();
    const controller = new AbortController();
    const request = fetchSession(GAME, 'test', { signal: controller.signal });
    controller.abort(new Error('player cancelled'));

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('falls back to unranked play when the session deadline expires', async () => {
    vi.useFakeTimers();
    globalThis.fetch = abortablePendingFetch();
    const request = fetchSession(GAME, 'test', { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);

    await expect(request).resolves.toMatchObject({
      ranking: { kind: 'unranked', reason: 'service-unavailable' },
    });
  });
});

function abortablePendingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
}
