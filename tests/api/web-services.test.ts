import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSession, SessionRequestRejectedError } from '../../apps/web/src/arcade/services/sessions';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('web session service', () => {
  it('uses same-origin /api and requests an exact game/build ticket', async () => {
    const ticket = {
      sessionId: 's1',
      gameId: 'rug-pull-rumble',
      gameVersion: '0.1.0',
      buildVersion: 'test',
      seed: 42,
      issuedAt: 1,
      expiresAt: 2,
      sig: '0'.repeat(64),
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }));
    globalThis.fetch = fetch;

    const session = await fetchSession('rug-pull-rumble', '0.1.0', 'test');
    expect(session).toMatchObject({ ticket, seed: 42, ranked: true });
    expect(fetch).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        gameId: 'rug-pull-rumble',
        gameVersion: '0.1.0',
        buildVersion: 'test',
      }),
    }));
  });

  it('falls back to unranked only for network failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('network down'));
    const session = await fetchSession('rug-pull-rumble', '0.1.0', 'test');
    expect(session.ranked).toBe(false);
    expect(session.ticket).toBeUndefined();
    expect(session.seed).toBeGreaterThanOrEqual(0);
  });

  it('surfaces API validation rejection instead of disguising it as offline play', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Unsupported build: bad' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ));
    await expect(fetchSession('rug-pull-rumble', '0.1.0', 'bad'))
      .rejects.toBeInstanceOf(SessionRequestRejectedError);
  });
});
