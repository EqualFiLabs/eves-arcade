import { describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { loadConfig } from '../../apps/api/src/config';
import { createApp } from '../../apps/api/src/server';
import { Store } from '../../apps/api/src/store';
import { signTicket } from '../../apps/api/src/crypto';
import {
  RPR_VERIFIER,
  VerifierRegistry,
  verifierRegistry,
} from '../../apps/api/src/registry';
import {
  VerificationCapacityError,
  VerificationRejectedError,
  WorkerVerificationExecutor,
} from '../../apps/api/src/verify/executor';
import { terminalRprFixture } from '../fixtures/rpr-terminal';
import { serve } from '../../apps/api/src/node-serve';

describe('backend production configuration', () => {
  it.each([
    ['DATABASE_URL', { TICKET_SECRET: 'x'.repeat(32), KNOWN_BUILD_VERSIONS: 'sha', TRUSTED_PROXY_CIDRS: '10.0.0.0/8' }],
    ['TICKET_SECRET', { DATABASE_URL: 'postgres://db', KNOWN_BUILD_VERSIONS: 'sha', TRUSTED_PROXY_CIDRS: '10.0.0.0/8' }],
    ['KNOWN_BUILD_VERSIONS', { DATABASE_URL: 'postgres://db', TICKET_SECRET: 'x'.repeat(32), TRUSTED_PROXY_CIDRS: '10.0.0.0/8' }],
    ['TRUSTED_PROXY_CIDRS', { DATABASE_URL: 'postgres://db', TICKET_SECRET: 'x'.repeat(32), KNOWN_BUILD_VERSIONS: 'sha' }],
  ])('rejects production without %s', (name, environment) => {
    expect(() => loadConfig({ NODE_ENV: 'production', ...environment })).toThrow(name);
  });

  it('accepts explicit production secrets, builds, database, and proxy trust', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db',
      TICKET_SECRET: 'x'.repeat(32),
      KNOWN_BUILD_VERSIONS: 'sha',
      TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
    });
    expect(config).toMatchObject({ environment: 'production', databaseUrl: 'postgres://db' });
  });
});

describe('verifier registry and readiness', () => {
  it('dispatches only exact game and verifier revisions', () => {
    expect(verifierRegistry.exact(
      { id: 'rug-pull-rumble', version: '0.1.0' }, RPR_VERIFIER,
    )?.inputSchema).toEqual({ id: 'rpr.input', version: 2 });
    expect(verifierRegistry.exact(
      { id: 'rug-pull-rumble', version: '0.1.0' }, { ...RPR_VERIFIER, revision: 2 },
    )).toBeNull();
  });

  it('rejects duplicate game registrations at startup', () => {
    const descriptor = verifierRegistry.entries[0]!;
    expect(() => new VerifierRegistry([descriptor, descriptor])).toThrow(/duplicate/i);
  });

  it('refuses readiness when retained data references a missing verifier', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    const store = new Store();
    const now = Date.now();
    store.saveTicket(signTicket({
      sessionId: crypto.randomUUID(),
      game: { id: 'rug-pull-rumble', version: '0.1.0' },
      verifier: { id: 'rpr.verify', revision: 99 },
      buildVersion: 'test', seed: 1, issuedAt: now, expiresAt: now + 1_000,
    }, config.ticketSecret));
    const response = await createApp({ config, store }).request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, missingVerifiers: ['rpr.verify@99'] });
  });
});

describe('transport and proxy boundaries', () => {
  it('rejects a declared request body above the streaming ceiling', async () => {
    const app = createApp({ config: loadConfig({ NODE_ENV: 'test' }), store: new Store() });
    const server = serve(app, 0, { maxBodyBytes: 8 });
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server has no port');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
        method: 'POST', body: '123456789', headers: { 'content-type': 'text/plain' },
      });
      expect(response.status).toBe(413);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('ignores forged forwarding headers from an untrusted peer', async () => {
    const config = { ...loadConfig({ NODE_ENV: 'test' }), rateLimitPerMin: 1, trustedProxyCidrs: ['10.0.0.0/8'] };
    const api = createApp({ config, store: new Store() });
    const request = (forwarded: string) => api.request('/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rpr-peer-ip': '203.0.113.8',
        'x-forwarded-for': forwarded,
      },
      body: JSON.stringify({ game: { id: 'rug-pull-rumble', version: '0.1.0' }, buildVersion: 'test' }),
    });
    expect((await request('198.51.100.1')).status).toBe(201);
    expect((await request('198.51.100.2')).status).toBe(429);
  });

  it('uses the proxy-overwritten client address from a trusted peer', async () => {
    const config = { ...loadConfig({ NODE_ENV: 'test' }), rateLimitPerMin: 1, trustedProxyCidrs: ['10.0.0.0/8'] };
    const api = createApp({ config, store: new Store() });
    const request = (forwarded: string) => api.request('/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rpr-peer-ip': '10.0.0.2',
        'x-forwarded-for': forwarded,
      },
      body: JSON.stringify({ game: { id: 'rug-pull-rumble', version: '0.1.0' }, buildVersion: 'test' }),
    });
    expect((await request('198.51.100.1')).status).toBe(201);
    expect((await request('198.51.100.2')).status).toBe(201);
  });
});

describe('bounded verification workers', () => {
  it('replays a genuine RPR trace outside the API event loop', async () => {
    const fixture = await terminalRprFixture(123);
    const executor = new WorkerVerificationExecutor({ minThreads: 1, maxThreads: 1, maxQueue: 1, timeoutMs: 5_000 });
    try {
      await expect(executor.verify({ verifier: RPR_VERIFIER, seed: 123, traceBytes: fixture.trace }))
        .resolves.toEqual(fixture.canonical);
    } finally {
      await executor.close();
    }
  });

  it('terminates work that exceeds its configured deadline', async () => {
    const fixture = await terminalRprFixture(321);
    const executor = new WorkerVerificationExecutor({ minThreads: 1, maxThreads: 1, maxQueue: 1, timeoutMs: 1 });
    try {
      await expect(executor.verify({ verifier: RPR_VERIFIER, seed: 321, traceBytes: fixture.trace }))
        .rejects.toEqual(expect.objectContaining<Partial<VerificationCapacityError>>({ code: 'timeout' }));
    } finally {
      await executor.close();
    }
  });

  it('distinguishes deterministic replay rejection from worker failure', async () => {
    const executor = new WorkerVerificationExecutor({ minThreads: 1, maxThreads: 1, maxQueue: 1, timeoutMs: 5_000 });
    const incomplete = new Uint8Array([2, 0, 0, 0, 1, 0, 0]);
    try {
      await expect(executor.verify({ verifier: RPR_VERIFIER, seed: 1, traceBytes: incomplete }))
        .rejects.toBeInstanceOf(VerificationRejectedError);
    } finally {
      await executor.close();
    }
  });
});
