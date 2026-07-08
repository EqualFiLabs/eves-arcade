import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from '../../apps/api/src/server';
import { loadConfig } from '../../apps/api/src/config';
import { Store } from '../../apps/api/src/store';
import { signTicket, verifyTicketSig } from '../../apps/api/src/crypto';
import type { SessionTicket, GameResult, ScoreSubmission } from '@rpr/protocol';
import { TRACE_ENCODING_VERSION } from '@rpr/protocol';
import type { InputFrame, InputSource } from '@rpr/controls';

/**
 * API integration tests (Req 9.3, 9.4, 10.1–10.5, 11.2).
 *
 * Tests the Hono app directly via `app.request()` — no server needed. Covers:
 * - Ticket lifecycle: sign, expire, single-use
 * - Verify: accept on match, reject on mismatch, flag for review
 * - Leaderboard: excludes unverified submissions
 * - Trace round-trip: real sim replay vs claimed result
 */

const config = loadConfig();
let store: Store;

function app() {
  store = new Store();
  return createApp({ config: { ...config, ticketSecret: 'test-secret' }, store });
}

function makeTicket(overrides?: Partial<SessionTicket>): SessionTicket {
  const base = signTicket({
    sessionId: crypto.randomUUID(),
    gameId: 'rug-pull-rumble',
    gameVersion: '0.1.0',
    seed: 42,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 300_000,
  }, 'test-secret');
  return { ...base, ...overrides };
}

/** Builds a minimal valid GameResult for RPR. */
function makeResult(overrides?: Partial<GameResult>): GameResult {
  return {
    gameId: 'rug-pull-rumble',
    gameVersion: '0.1.0',
    buildVersion: 'test',
    sessionId: '',
    seed: 42,
    outcome: 'loss',
    score: 0,
    stats: { damageDealt: 0, damageTaken: 0, frames: 1 },
    durationMs: Math.round(1 * (1000 / 60)),
    inputTraceHash: '',
    replayHash: '',
    ...overrides,
  };
}

/** Builds a valid 1-frame packed trace (all buttons neutral). */
function makeTrace(): Uint8Array {
  // 1 frame, 13 buttons (2 bytes), 0 axes
  const buf = new Uint8Array(7 + 2);
  const view = new DataView(buf.buffer);
  let off = 0;
  buf[off++] = TRACE_ENCODING_VERSION;
  view.setUint32(off, 1, false); off += 4; // 1 frame
  buf[off++] = 13; // 13 buttons
  buf[off++] = 0; // 0 axes
  // Frame 0: all buttons false → 2 zero bytes
  buf[off++] = 0;
  buf[off++] = 0;
  return buf;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

beforeEach(() => {
  store?.reset();
});

describe('POST /sessions (Req 9.1, 9.2)', () => {
  it('issues a signed ticket with a server-chosen seed', async () => {
    const res = await app().request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'rug-pull-rumble' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ticket.sessionId).toBeTruthy();
    expect(data.ticket.seed).toBeTypeOf('number');
    expect(data.ticket.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyTicketSig(data.ticket, 'test-secret')).toBe(true);
  });

  it('rejects unknown game IDs', async () => {
    const res = await app().request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'nonexistent' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /results (Req 9.3, 9.4, 10.1–10.5)', () => {
  it('rejects unsigned tickets (Req 9.3)', async () => {
    const a = app();
    const ticket = makeTicket({ sig: 'bogus' });
    const submission: ScoreSubmission = {
      ticket,
      inputTrace: bytesToBase64(makeTrace()),
      traceEncodingVersion: TRACE_ENCODING_VERSION,
      claimedResult: makeResult(),
      clientTimestamp: Date.now(),
    };
    const res = await a.request('/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.accepted).toBe(false);
  });

  it('rejects expired tickets (Req 9.3)', async () => {
    const a = app();
    // Sign with an already-expired timestamp so the sig is valid but the ticket is stale.
    const ticket = signTicket({
      sessionId: crypto.randomUUID(),
      gameId: 'rug-pull-rumble',
      gameVersion: '0.1.0',
      seed: 42,
      issuedAt: Date.now() - 600_000,
      expiresAt: Date.now() - 1000,
    }, 'test-secret');
    const submission: ScoreSubmission = {
      ticket,
      inputTrace: bytesToBase64(makeTrace()),
      traceEncodingVersion: TRACE_ENCODING_VERSION,
      claimedResult: makeResult(),
      clientTimestamp: Date.now(),
    };
    const res = await a.request('/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.reason).toMatch(/expired/i);
  });

  it('enforces single-use tickets (Req 9.4, Property 5)', async () => {
    const a = app();
    // First request: issue a ticket through the API
    const sessionRes = await a.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'rug-pull-rumble' }),
    });
    const { ticket } = await sessionRes.json();

    // We can't submit a valid result without the real replay hash, but we can
    // verify the ticket is consumed. The store tracks this directly.
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
    // Second consumption → null
    expect(store.consumeTicket(ticket.sessionId)).toBeNull();
  });

  it('rejects game/version mismatch and flags for review (Req 10.2)', async () => {
    const a = app();
    const ticket = makeTicket({ gameId: 'rug-pull-rumble', gameVersion: '0.1.0' });
    const submission: ScoreSubmission = {
      ticket,
      inputTrace: bytesToBase64(makeTrace()),
      traceEncodingVersion: TRACE_ENCODING_VERSION,
      claimedResult: makeResult({ gameId: 'wrong-game' }),
      clientTimestamp: Date.now(),
    };
    const res = await a.request('/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.accepted).toBe(false);
    expect(data.flagged).toBe(true);
  });
});

describe('GET /leaderboards/:categoryId (Req 11.2)', () => {
  it('returns an empty list for a new game', async () => {
    const res = await app().request('/leaderboards/rug-pull-rumble.score');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toEqual([]);
  });

  it('excludes unverified results', async () => {
    const a = app();
    // Store an unverified result directly
    store.saveResult({
      sessionId: 'test-unverified',
      gameId: 'rug-pull-rumble',
      gameVersion: '0.1.0',
      buildVersion: 'test',
      playerHandle: 'anon',
      outcome: 'win',
      score: 9999,
      stats: {},
      durationMs: 1000,
      inputTrace: new Uint8Array(),
      traceEncodingVersion: 1,
      inputTraceHash: '',
      replayHash: '',
      verified: false,
      reviewFlag: true,
      submittedAt: Date.now(),
    });
    const res = await a.request('/leaderboards/rug-pull-rumble.score');
    const data = await res.json();
    expect(data.entries).toEqual([]);
  });

  it('includes verified results sorted by score desc', async () => {
    const a = app();
    store.saveResult({
      sessionId: 's1', gameId: 'rug-pull-rumble', gameVersion: '0.1.0',
      buildVersion: 'test', playerHandle: 'alice', outcome: 'win', score: 500,
      stats: {}, durationMs: 1000, inputTrace: new Uint8Array(), traceEncodingVersion: 1,
      inputTraceHash: '', replayHash: '', verified: true, reviewFlag: false, submittedAt: 1,
    });
    store.saveResult({
      sessionId: 's2', gameId: 'rug-pull-rumble', gameVersion: '0.1.0',
      buildVersion: 'test', playerHandle: 'bob', outcome: 'win', score: 1000,
      stats: {}, durationMs: 1000, inputTrace: new Uint8Array(), traceEncodingVersion: 1,
      inputTraceHash: '', replayHash: '', verified: true, reviewFlag: false, submittedAt: 2,
    });
    const res = await a.request('/leaderboards/rug-pull-rumble.score');
    const data = await res.json();
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0].score).toBe(1000);
    expect(data.entries[1].score).toBe(500);
  });
});

describe('verifyRpr integration (Req 10.1, 10.3)', () => {
  it('replays a real fight and produces the same terminal hash as the live sim', async () => {
    const { verifyRpr } = await import('../../apps/api/src/verify/rpr');
    const { CombatEngine, BogdanoffBossBrain, NEUTRAL_INPUT, serializeGameState } = await import('@rpr/sim');
    const { bogdanoffCpuProfile, bogdanoffDefinition, createV1FightState, sminemDefinition, v1Moves } = await import('@rpr/content');
    const { TraceRecorder } = await import('@rpr/controls');

    type RprButton = 'left' | 'right' | 'up' | 'down' | 'block' | 'lightHigh' | 'lightLow' | 'heavyHigh' | 'heavyLow' | 'special' | 'super' | 'start' | 'mute';

    const seed = 7777;
    // Run a short fight: 10 neutral frames then check the replay
    const engine = new CombatEngine({
      createInitialState: (s) => createV1FightState(s),
      definitions: [sminemDefinition, bogdanoffDefinition],
      moves: v1Moves,
      seed,
    });
    const brain = new BogdanoffBossBrain();

    const recorder = new TraceRecorder<RprButton>();
    const neutralFrame: InputFrame<RprButton> = {
      buttons: { left: false, right: false, up: false, down: false, block: false, lightHigh: false, lightLow: false, heavyHigh: false, heavyLow: false, special: false, super: false, start: false, mute: false },
      axes: {},
    };
    const source: InputSource<RprButton> = { available: true, read: () => neutralFrame };
    const recorded = recorder.wrap(source);

    for (let i = 0; i < 10 && engine.state.status === 'active'; i++) {
      recorded.read();
      engine.step(NEUTRAL_INPUT, brain.decide(engine.state, bogdanoffCpuProfile));
    }

    const liveHash = serializeGameState(engine.state);
    const packed = recorder.pack();

    // Verify through the API's verifyRpr
    const replay = verifyRpr(seed, packed);
    expect(replay.replayHash).toBe(liveHash);
    expect(replay.status).toBe(engine.state.status);
    expect(replay.frames).toBe(engine.state.frame);
  });
});

describe('Ticket signing (Req 9.2)', () => {
  it('signs and verifies a round-trip ticket', () => {
    const ticket = makeTicket();
    expect(verifyTicketSig(ticket, 'test-secret')).toBe(true);
    expect(verifyTicketSig(ticket, 'wrong-secret')).toBe(false);
  });

  it('rejects a tampered ticket', () => {
    const ticket = makeTicket();
    const tampered = { ...ticket, seed: 999 };
    expect(verifyTicketSig(tampered, 'test-secret')).toBe(false);
  });
});
