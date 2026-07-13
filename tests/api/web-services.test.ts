import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSession, SessionRequestRejectedError } from '../../apps/web/src/arcade/services/sessions';

const originalFetch = globalThis.fetch;
const GAME = { id: 'rug-pull-rumble', version: '0.1.0' } as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
});
