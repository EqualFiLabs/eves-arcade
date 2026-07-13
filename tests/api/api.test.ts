import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/server';
import { loadConfig } from '../../apps/api/src/config';
import { Store } from '../../apps/api/src/store';
import { signTicket, verifyTicketSig } from '../../apps/api/src/crypto';
import { verifyRpr } from '../../apps/api/src/verify/rpr';
import { terminalRprFixture } from '../fixtures/rpr-terminal';
import { decodeRprTrace } from '@rpr/rug-pull-rumble-core';
import {
  TRACE_ENCODING_VERSION,
  sha256HexBytes,
  type GameResult,
  type ScoreSubmission,
  type SessionRequest,
  type SessionTicket,
} from '@rpr/protocol';

const TEST_SECRET = 'test-secret';
const TEST_BUILD = 'test';
const baseConfig = loadConfig();
let store: Store;

function app() {
  store = new Store();
  return createApp({ config: { ...baseConfig, ticketSecret: TEST_SECRET }, store });
}

function makeTicket(overrides: Partial<SessionTicket> = {}): SessionTicket {
  return signTicket({
    sessionId: crypto.randomUUID(),
    gameId: 'rug-pull-rumble',
    gameVersion: '0.1.0',
    buildVersion: TEST_BUILD,
    seed: 42,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 300_000,
    ...unsigned(overrides),
  }, TEST_SECRET);
}

function unsigned(overrides: Partial<SessionTicket>): Partial<Omit<SessionTicket, 'sig'>> {
  const { sig: _sig, ...fields } = overrides;
  void _sig;
  return fields;
}

function makeTrace(frameCount = 1): Uint8Array {
  const bytes = new Uint8Array(7 + frameCount * 2);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  bytes[offset++] = TRACE_ENCODING_VERSION;
  view.setUint32(offset, frameCount, false);
  offset += 4;
  bytes[offset++] = 13;
  bytes[offset++] = 0;
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function validSubmission(options: {
  ticket?: SessionTicket;
  trace?: Uint8Array;
  claim?: Partial<GameResult>;
  envelope?: Partial<ScoreSubmission>;
} = {}): Promise<ScoreSubmission> {
  const ticket = options.ticket ?? makeTicket();
  const fixture = await terminalRprFixture(ticket.seed);
  const trace = options.trace ?? fixture.trace;
  const canonical = options.trace
    ? await verifyRpr(ticket.seed, decodeRprTrace(trace, 18_000).inputs)
    : fixture.canonical;
  const claim: GameResult = {
    gameId: ticket.gameId,
    gameVersion: ticket.gameVersion,
    buildVersion: ticket.buildVersion,
    sessionId: ticket.sessionId,
    seed: ticket.seed,
    outcome: canonical.outcome,
    score: canonical.score,
    stats: canonical.stats,
    durationMs: canonical.durationMs,
    inputTraceHash: await sha256HexBytes(trace),
    replayHash: canonical.replayHash,
    ...options.claim,
  };
  return {
    ticket,
    inputTrace: bytesToBase64(trace),
    traceEncodingVersion: TRACE_ENCODING_VERSION,
    claimedResult: claim,
    clientTimestamp: Date.now(),
    ...options.envelope,
  };
}

async function postResult(api: ReturnType<typeof createApp>, submission: ScoreSubmission) {
  return api.request('/results', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
}

beforeEach(() => store?.reset());

describe('POST /sessions', () => {
  it('issues a build-bound signed ticket', async () => {
    const api = app();
    const request: SessionRequest = {
      gameId: 'rug-pull-rumble',
      gameVersion: '0.1.0',
      buildVersion: TEST_BUILD,
    };
    const response = await api.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(201);
    const { ticket } = await response.json();
    expect(ticket).toMatchObject(request);
    expect(ticket.seed).toBeTypeOf('number');
    expect(ticket.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyTicketSig(ticket, TEST_SECRET)).toBe(true);
  });

  it.each([
    [{ gameId: 'unknown', gameVersion: '0.1.0', buildVersion: TEST_BUILD }, /unsupported game/i],
    [{ gameId: 'rug-pull-rumble', gameVersion: '9.9.9', buildVersion: TEST_BUILD }, /unsupported game version/i],
    [{ gameId: 'rug-pull-rumble', gameVersion: '0.1.0', buildVersion: 'unknown' }, /unsupported build/i],
  ])('rejects unsupported request %#', async (request, message) => {
    const response = await app().request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(message);
  });

  it('rejects malformed request data at runtime', async () => {
    const response = await app().request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'rug-pull-rumble' }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/gameVersion/);
  });
});

describe('POST /results', () => {
  it('accepts a genuine replay and stores only canonical server data', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({ ticket });
    const response = await postResult(api, submission);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      accepted: true,
      canonicalScore: submission.claimedResult.score,
      placement: 1,
      totalEntries: 1,
    });

    const stored = store.getLeaderboard(ticket.gameId, 'desc')[0]!;
    const canonical = (await terminalRprFixture(ticket.seed)).canonical;
    expect(stored).toMatchObject({
      sessionId: ticket.sessionId,
      gameId: ticket.gameId,
      gameVersion: ticket.gameVersion,
      buildVersion: ticket.buildVersion,
      outcome: canonical.outcome,
      score: canonical.score,
      stats: canonical.stats,
      durationMs: canonical.durationMs,
      inputTraceHash: submission.claimedResult.inputTraceHash,
      replayHash: canonical.replayHash,
      verified: true,
      reviewFlag: false,
    });
  });

  it('rejects an invalid signature without consuming a stored ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({ ticket });
    submission.ticket = { ...ticket, sig: '0'.repeat(64) };
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/signature/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects expired tickets', async () => {
    const api = app();
    const ticket = makeTicket({ issuedAt: Date.now() - 600_000, expiresAt: Date.now() - 1 });
    store.saveTicket(ticket);
    const response = await postResult(api, await validSubmission({ ticket }));
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/expired/i);
  });

  it.each([
    ['sessionId', 'different-session'],
    ['gameId', 'different-game'],
    ['gameVersion', '9.9.9'],
    ['buildVersion', 'different-build'],
    ['seed', 999],
  ] as const)('rejects claimed %s mismatch without consuming the ticket', async (field, value) => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({ ticket, claim: { [field]: value } });
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/mismatch/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects envelope/header trace version mismatch without consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({ ticket, envelope: { traceEncodingVersion: 99 } });
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/version/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects a trace hash mismatch without consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({ ticket, claim: { inputTraceHash: '0'.repeat(64) } });
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/trace hash/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects malformed base64 without consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({ ticket, envelope: { inputTrace: '!!!!' } });
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects a non-RPR action shape without consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const trace = new Uint8Array([1, 0, 0, 0, 1, 12, 0, 0, 0]);
    const submission = await validSubmission({ ticket });
    submission.inputTrace = bytesToBase64(trace);
    submission.claimedResult.inputTraceHash = await sha256HexBytes(trace);

    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/schema mismatch/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
    expect(store.getReviewResults()).toEqual([]);
  });

  it.each([
    ['score', 99],
    ['outcome', 'win'],
    ['durationMs', 999],
    ['replayHash', '0'.repeat(64)],
  ] as const)('rejects canonical %s mismatch and consumes the ticket', async (field, value) => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({ ticket, claim: { [field]: value } });
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ accepted: false, flagged: true });
    expect(store.consumeTicket(ticket.sessionId)).toBeNull();
    expect(store.getLeaderboard(ticket.gameId, 'desc')).toEqual([]);
  });

  it('rejects forged canonical stats and excludes them from leaderboards', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({
      ticket,
      claim: { stats: { damageDealt: 0, damageTaken: 0, frames: 1, forgedMetric: 777 } },
    });
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect(store.getLeaderboard(ticket.gameId, 'desc')).toEqual([]);
  });

  it('enforces single-use after an accepted replay', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission({ ticket });
    expect((await postResult(api, submission)).status).toBe(200);
    const second = await postResult(api, submission);
    expect(second.status).toBe(422);
    expect((await second.json()).reason).toMatch(/used/i);
  });

  it('consumes and review-flags a structurally valid trace that ends before KO', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const trace = makeTrace(10);
    const submission = await validSubmission({ ticket });
    submission.inputTrace = bytesToBase64(trace);
    submission.claimedResult.inputTraceHash = await sha256HexBytes(trace);

    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ accepted: false, flagged: true });
    expect(store.consumeTicket(ticket.sessionId)).toBeNull();
    expect(store.getReviewResults()).toHaveLength(1);
  });

  it('consumes and review-flags input appended after the exact terminal frame', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const fixture = await terminalRprFixture(ticket.seed);
    const trace = appendNeutralFrame(fixture.trace);
    const submission = await validSubmission({ ticket });
    submission.inputTrace = bytesToBase64(trace);
    submission.claimedResult.inputTraceHash = await sha256HexBytes(trace);

    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/terminal frame/i);
    expect(store.consumeTicket(ticket.sessionId)).toBeNull();
    expect(store.getReviewResults()).toHaveLength(1);
  });
});

describe('GET /leaderboards/:categoryId', () => {
  it('resolves the exact manifest category and sorts verified scores descending', async () => {
    const api = app();
    for (const [sessionId, score] of [['s1', 500], ['s2', 1000]] as const) {
      store.saveResult({
        sessionId,
        gameId: 'rug-pull-rumble',
        gameVersion: '0.1.0',
        buildVersion: TEST_BUILD,
        playerHandle: sessionId,
        outcome: 'win',
        score,
        stats: {},
        durationMs: 1,
        inputTrace: new Uint8Array(),
        traceEncodingVersion: 1,
        inputTraceHash: '',
        replayHash: '',
        verified: true,
        reviewFlag: false,
        submittedAt: score,
      });
    }
    const response = await api.request('/leaderboards/rpr.score');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entries.map((entry: { score: number }) => entry.score)).toEqual([1000, 500]);
  });

  it('excludes unverified results', async () => {
    const api = app();
    store.saveResult({
      sessionId: 'bad', gameId: 'rug-pull-rumble', gameVersion: '0.1.0',
      buildVersion: TEST_BUILD, playerHandle: 'bad', outcome: 'win', score: 9999,
      stats: {}, durationMs: 1, inputTrace: new Uint8Array(), traceEncodingVersion: 1,
      inputTraceHash: '', replayHash: '', verified: false, reviewFlag: true, submittedAt: 1,
    });
    expect((await (await api.request('/leaderboards/rpr.score')).json()).entries).toEqual([]);
  });

  it('rejects unknown categories instead of parsing their names', async () => {
    const response = await app().request('/leaderboards/rug-pull-rumble.score');
    expect(response.status).toBe(404);
  });
});

describe('ticket signing and RPR verification', () => {
  it('binds build version into the ticket signature', () => {
    const ticket = makeTicket();
    expect(verifyTicketSig(ticket, TEST_SECRET)).toBe(true);
    expect(verifyTicketSig({ ...ticket, buildVersion: 'tampered' }, TEST_SECRET)).toBe(false);
  });

  it('returns SHA-256 terminal hash and complete canonical result', async () => {
    const fixture = await terminalRprFixture(7777);
    const replay = await verifyRpr(7777, decodeRprTrace(fixture.trace, 18_000).inputs);
    expect(replay.replayHash).toMatch(/^[0-9a-f]{64}$/);
    expect(replay).toEqual(fixture.canonical);
  });
});

function appendNeutralFrame(trace: Uint8Array): Uint8Array {
  const result = new Uint8Array(trace.length + 2);
  result.set(trace);
  const view = new DataView(result.buffer);
  view.setUint32(1, view.getUint32(1, false) + 1, false);
  return result;
}
