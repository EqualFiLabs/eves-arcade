import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/server';
import { loadConfig } from '../../apps/api/src/config';
import { Store } from '../../apps/api/src/store';
import { signTicket, verifyTicketSig } from '../../apps/api/src/crypto';
import { verifyRpr } from '../../apps/api/src/verify/rpr';
import { terminalRprFixture } from '../fixtures/rpr-terminal';
import {
  RPR_INPUT_SCHEMA,
  RPR_TRACE_LIMITS,
  decodeRprTrace,
} from '@rpr/rug-pull-rumble-core';
import {
  TRACE_ENCODING_VERSION,
  sha256HexBytes,
  type GameResultClaim,
  type ScoreSubmission,
  type SessionRequest,
  type SessionTicket,
} from '@rpr/protocol';

const TEST_SECRET = 'test-secret';
const TEST_BUILD = 'test';
const GAME = { id: 'rug-pull-rumble', version: '0.1.0' } as const;
const INPUT_SCHEMA = RPR_INPUT_SCHEMA;
const baseConfig = loadConfig();
let store: Store;

function app() {
  store = new Store();
  return createApp({ config: { ...baseConfig, ticketSecret: TEST_SECRET }, store });
}

function makeTicket(overrides: Partial<Omit<SessionTicket, 'sig'>> = {}): SessionTicket {
  return signTicket({
    sessionId: crypto.randomUUID(),
    game: GAME,
    buildVersion: TEST_BUILD,
    seed: 42,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 300_000,
    ...overrides,
  }, TEST_SECRET);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function validSubmission(ticket = makeTicket()): Promise<ScoreSubmission> {
  const fixture = await terminalRprFixture(ticket.seed);
  const hash = await sha256HexBytes(fixture.trace);
  return {
    ticket,
    evidence: {
      kind: 'input-trace',
      schema: INPUT_SCHEMA,
      encodingVersion: TRACE_ENCODING_VERSION,
      data: bytesToBase64(fixture.trace),
      hash,
    },
    claimedResult: {
      game: ticket.game,
      buildVersion: ticket.buildVersion,
      sessionId: ticket.sessionId,
      seed: ticket.seed,
      result: fixture.canonical,
    },
    clientTimestamp: Date.now(),
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
  it('issues a game and build-bound signed ticket', async () => {
    const api = app();
    const request: SessionRequest = { game: GAME, buildVersion: TEST_BUILD };
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
    [{ game: { id: 'unknown', version: '0.1.0' }, buildVersion: TEST_BUILD }, /unsupported game/i],
    [{ game: { id: GAME.id, version: '9.9.9' }, buildVersion: TEST_BUILD }, /unsupported game version/i],
    [{ game: GAME, buildVersion: 'unknown' }, /unsupported build/i],
  ])('rejects unsupported request %#', async (request, message) => {
    const response = await app().request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(message);
  });

  it('rejects the removed flat identity shape', async () => {
    const response = await app().request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: GAME.id, gameVersion: GAME.version, buildVersion: TEST_BUILD }),
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /results', () => {
  it('accepts a genuine replay and returns the canonical result with placement', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    const response = await postResult(api, submission);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accepted: true,
      canonicalResult: submission.claimedResult.result,
      placements: [{ categoryId: 'rpr.score', placement: 1, totalEntries: 1 }],
    });

    const stored = store.getLeaderboard(ticket.game.id, 'desc')[0]!;
    expect(stored).toMatchObject({
      sessionId: ticket.sessionId,
      gameId: ticket.game.id,
      gameVersion: ticket.game.version,
      score: submission.claimedResult.result.metrics.score,
      inputTraceHash: submission.evidence.kind === 'input-trace' ? submission.evidence.hash : '',
      verified: true,
      reviewFlag: false,
    });
  });

  it('rejects invalid signatures without consuming the stored ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    submission.ticket = { ...ticket, sig: '0'.repeat(64) };
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/signature/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it.each([
    ['sessionId', 'different-session'],
    ['buildVersion', 'different-build'],
    ['seed', 999],
  ] as const)('rejects claimed %s mismatches before consuming the ticket', async (field, value) => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    submission.claimedResult = { ...submission.claimedResult, [field]: value } as GameResultClaim;
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/mismatch/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects nested game identity mismatches before consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    submission.claimedResult.game = { ...GAME, version: '9.9.9' };
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/version mismatch/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects malformed evidence without consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    if (submission.evidence.kind !== 'input-trace') throw new Error('fixture must use a trace');
    submission.evidence.data = '!!!!';
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects legacy V1 evidence without consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    if (submission.evidence.kind !== 'input-trace') throw new Error('fixture must use a trace');
    const legacy = new Uint8Array(7);
    legacy[0] = 1;
    new DataView(legacy.buffer).setUint32(1, 1, false);
    submission.evidence.data = bytesToBase64(legacy);
    submission.evidence.hash = await sha256HexBytes(legacy);
    const response = await postResult(api, submission);
    expect((await response.json()).reason).toMatch(/unsupported trace encoding version/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('preflights decoded evidence size before allocating trace bytes', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    if (submission.evidence.kind !== 'input-trace') throw new Error('fixture must use a trace');
    submission.evidence.data = bytesToBase64(new Uint8Array(RPR_TRACE_LIMITS.maxBytes + 1));
    const response = await postResult(api, submission);
    expect((await response.json()).reason).toMatch(/exceeds .* bytes/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects noncanonical unused button bits without consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    if (submission.evidence.kind !== 'input-trace') throw new Error('fixture must use a trace');
    const trace = decodeBase64(submission.evidence.data);
    trace[6]! |= 0b00001000;
    submission.evidence.data = bytesToBase64(trace);
    submission.evidence.hash = await sha256HexBytes(trace);
    const response = await postResult(api, submission);
    expect((await response.json()).reason).toMatch(/unused button bits/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it('rejects evidence hash mismatches without consuming the ticket', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    if (submission.evidence.kind !== 'input-trace') throw new Error('fixture must use a trace');
    submission.evidence.hash = '0'.repeat(64);
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toMatch(/trace hash/i);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it.each([
    ['evidence', 'Input schema mismatch'],
    ['result', 'Result schema mismatch'],
  ] as const)('rejects unsupported %s schemas without consuming the ticket', async (target, reason) => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    if (target === 'evidence') {
      if (submission.evidence.kind !== 'input-trace') throw new Error('fixture must use a trace');
      submission.evidence.schema = { id: 'rpr.input', version: 99 };
    } else {
      submission.claimedResult.result = {
        ...submission.claimedResult.result,
        schema: { id: 'rpr.result', version: 99 },
      };
    }
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toBe(reason);
    expect(store.consumeTicket(ticket.sessionId)).not.toBeNull();
  });

  it.each([
    ['outcome', 'win'],
    ['durationMs', 999],
    ['replayHash', '0'.repeat(64)],
  ] as const)('consumes and review-flags canonical %s mismatches', async (field, value) => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    submission.claimedResult.result = { ...submission.claimedResult.result, [field]: value };
    const response = await postResult(api, submission);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ accepted: false, flagged: true });
    expect(store.consumeTicket(ticket.sessionId)).toBeNull();
    expect(store.getReviewResults()).toHaveLength(1);
  });

  it('rejects extra forged metrics and excludes them from leaderboards', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    submission.claimedResult.result = {
      ...submission.claimedResult.result,
      metrics: { ...submission.claimedResult.result.metrics, forgedMetric: 777 },
    };
    expect((await postResult(api, submission)).status).toBe(422);
    expect(store.getLeaderboard(ticket.game.id, 'desc')).toEqual([]);
  });

  it('enforces ticket single-use after accepting a replay', async () => {
    const api = app();
    const ticket = makeTicket();
    store.saveTicket(ticket);
    const submission = await validSubmission(ticket);
    expect((await postResult(api, submission)).status).toBe(200);
    const second = await postResult(api, submission);
    expect(second.status).toBe(422);
    expect((await second.json()).reason).toMatch(/used|unknown/i);
  });
});

describe('GET /leaderboards/:categoryId', () => {
  it('returns canonical results sorted by the registered metric', async () => {
    const api = app();
    for (const [sessionId, score] of [['s1', 500], ['s2', 1000]] as const) {
      store.saveResult({
        sessionId, gameId: GAME.id, gameVersion: GAME.version, buildVersion: TEST_BUILD,
        playerHandle: sessionId, outcome: 'win', score, stats: { frames: 60 }, durationMs: 1,
        inputTrace: new Uint8Array(), traceEncodingVersion: 1, inputTraceHash: '', replayHash: '',
        verified: true, reviewFlag: false, submittedAt: score,
      });
    }
    const response = await api.request('/leaderboards/rpr.score');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entries.map((entry: { result: { metrics: { score: number } } }) => entry.result.metrics.score))
      .toEqual([1000, 500]);
  });

  it('rejects unknown categories instead of parsing their names', async () => {
    expect((await app().request('/leaderboards/rug-pull-rumble.score')).status).toBe(404);
  });
});

describe('ticket signing and RPR verification', () => {
  it('binds nested game and build identities into the signature', () => {
    const ticket = makeTicket();
    expect(verifyTicketSig(ticket, TEST_SECRET)).toBe(true);
    expect(verifyTicketSig({ ...ticket, game: { ...ticket.game, version: 'tampered' } }, TEST_SECRET)).toBe(false);
    expect(verifyTicketSig({ ...ticket, buildVersion: 'tampered' }, TEST_SECRET)).toBe(false);
  });

  it('returns the complete deterministic terminal result', async () => {
    const fixture = await terminalRprFixture(7777);
    const replay = await verifyRpr(7777, decodeRprTrace(fixture.trace, 18_000).inputs);
    expect(replay.replayHash).toMatch(/^[0-9a-f]{64}$/);
    expect(replay).toEqual(fixture.canonical);
  });
});
