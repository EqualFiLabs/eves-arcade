import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../apps/api/src/migrate';
import { PostgresStore } from '../../apps/api/src/postgres-store';
import { RPR_VERIFIER, leaderboardRegistry } from '../../apps/api/src/registry';
import { signTicket } from '../../apps/api/src/crypto';
import type { CanonicalGameResult, SessionTicket } from '@rpr/protocol';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
let store: PostgresStore;

suite('PostgreSQL verification store', () => {
  beforeAll(async () => {
    await migrate(databaseUrl!);
    await migrate(databaseUrl!);
    store = new PostgresStore(databaseUrl!, 4);
  });

  beforeEach(async () => {
    await store.pool.query('TRUNCATE leaderboard_values,verification_results,tickets,rate_limit_windows CASCADE');
  });

  afterAll(async () => { await store?.close(); });

  it('persists a finalized trace and leaderboard across store restarts', async () => {
    const ticket = makeTicket();
    await store.saveTicket(ticket);
    const reservation = await store.reserveTicket(ticket, 'fingerprint', Date.now(), 15_000);
    if (reservation.kind !== 'reserved') throw new Error('ticket was not reserved');
    const canonical = canonicalResult(900);
    expect(await store.finalizeAccepted({
      ticket,
      leaseToken: reservation.leaseToken,
      submissionFingerprint: 'fingerprint',
      playerHandle: 'player',
      trace: new Uint8Array([2, 0, 0, 0, 0]),
      traceEncodingVersion: 2,
      traceHash: 'a'.repeat(64),
      canonical,
      categoryValues: { 'rpr.score': 900 },
      submittedAt: Date.now(),
    })).toBe(true);

    const restarted = new PostgresStore(databaseUrl!, 2);
    try {
      const category = leaderboardRegistry.get('rpr.score')!;
      const rows = await restarted.getLeaderboard(category);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ inputTraceHash: 'a'.repeat(64), verified: true });
      expect(rows[0]!.canonicalResult).toEqual(canonical);
    } finally {
      await restarted.close();
    }
  });

  it('allows only one concurrent reservation and returns in-progress to its duplicate', async () => {
    const ticket = makeTicket();
    await store.saveTicket(ticket);
    const [first, second] = await Promise.all([
      store.reserveTicket(ticket, 'same', Date.now(), 15_000),
      store.reserveTicket(ticket, 'same', Date.now(), 15_000),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(['in-progress', 'reserved']);
  });

  it('reclaims an expired lease but rejects a conflicting live lease', async () => {
    const ticket = makeTicket();
    await store.saveTicket(ticket);
    expect((await store.reserveTicket(ticket, 'first', 1_000, 100)).kind).toBe('reserved');
    expect((await store.reserveTicket(ticket, 'other', 1_050, 100)).kind).toBe('conflict');
    expect((await store.reserveTicket(ticket, 'retry', 1_101, 100)).kind).toBe('reserved');
  });

  it('retains verifier revisions and rejected review evidence', async () => {
    const ticket = makeTicket();
    await store.saveTicket(ticket);
    const reservation = await store.reserveTicket(ticket, 'bad', Date.now(), 15_000);
    if (reservation.kind !== 'reserved') throw new Error('ticket was not reserved');
    await store.finalizeRejected({
      ticket,
      leaseToken: reservation.leaseToken,
      submissionFingerprint: 'bad',
      playerHandle: 'anon',
      trace: new Uint8Array([2, 0, 0, 0, 0]),
      traceEncodingVersion: 2,
      traceHash: 'b'.repeat(64),
      claim: canonicalResult(1),
      code: 'canonical_mismatch',
      reason: 'mismatch',
      submittedAt: Date.now(),
    });
    expect(await store.referencedVerifierKeys()).toEqual(['rpr.verify@1']);
    expect(await store.getReviewResults()).toMatchObject([{ reviewFlag: true, rejectionCode: 'canonical_mismatch' }]);
  });

  it('shares atomic rate-limit windows across store instances', async () => {
    const other = new PostgresStore(databaseUrl!, 2);
    try {
      expect(await store.incrementRateLimit('client', 60_000)).toBe(1);
      expect(await other.incrementRateLimit('client', 60_000)).toBe(2);
      await other.cleanupRateLimits(60_001);
      expect(await store.incrementRateLimit('client', 60_000)).toBe(1);
    } finally {
      await other.close();
    }
  });
});

function makeTicket(): SessionTicket {
  const now = Date.now();
  return signTicket({
    sessionId: crypto.randomUUID(),
    game: { id: 'rug-pull-rumble', version: '0.1.0' },
    verifier: RPR_VERIFIER,
    buildVersion: 'test',
    seed: 42,
    issuedAt: now,
    expiresAt: now + 300_000,
  }, 'test-secret');
}

function canonicalResult(score: number): CanonicalGameResult {
  return {
    schema: { id: 'rpr.result', version: 1 },
    outcome: 'win',
    metrics: { score, frames: 60 },
    durationMs: 1_000,
    replayHash: 'c'.repeat(64),
  };
}
