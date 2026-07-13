/** Hono API for ranked sessions, canonical replay verification, and leaderboards. */
import { Hono, type Context } from 'hono';
import type { ApiConfig } from './config';
import { Store } from './store';
import { signTicket, verifyTicketSig, newSessionId } from './crypto';
import { verifyRpr, type VerifyResult } from './verify/rpr';
import {
  sha256HexBytes,
  type LeaderboardResponse,
  type SessionResponse,
  type SubmissionResponse,
} from '@rpr/protocol';
import {
  RPR_INPUT_SCHEMA,
  RPR_GAME_ID,
  RPR_MAX_TRACE_FRAMES,
  RPR_RESULT_SCHEMA,
  RPR_TRACE_ENCODING_VERSION,
  RPR_TRACE_LIMITS,
  decodeRprTrace,
} from '@rpr/rug-pull-rumble-core';
import {
  RequestValidationError,
  decodeBase64Strict,
  parseScoreSubmission,
  parseSessionRequest,
} from './validation';

export interface AppDeps {
  config: ApiConfig;
  store: Store;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const { config, store } = deps;

  const requestTimestamps = new Map<string, number[]>();
  function rateLimited(ip: string): boolean {
    const now = Date.now();
    const window = 60_000;
    const recent = (requestTimestamps.get(ip) ?? []).filter((time) => now - time < window);
    recent.push(now);
    requestTimestamps.set(ip, recent);
    return recent.length > config.rateLimitPerMin;
  }

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/sessions', async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (rateLimited(ip)) return c.json({ error: 'Rate limit exceeded' }, 429);

    let request;
    try {
      request = parseSessionRequest(await c.req.json());
    } catch (error) {
      return invalidRequest(c, error);
    }

    const supportedBuilds = config.supportedGameBuilds[request.game.id]?.[request.game.version];
    if (!supportedBuilds) {
      return c.json({ error: `Unsupported game version: ${request.game.id}@${request.game.version}` }, 400);
    }
    if (!supportedBuilds.includes(request.buildVersion)) {
      return c.json({ error: `Unsupported build: ${request.buildVersion}` }, 400);
    }

    const now = Date.now();
    const ticket = signTicket({
      sessionId: newSessionId(),
      game: request.game,
      buildVersion: request.buildVersion,
      seed: Math.floor(Math.random() * 0x7fffffff),
      issuedAt: now,
      expiresAt: now + config.ticketTtlMs,
    }, config.ticketSecret);

    store.saveTicket(ticket);
    const response: SessionResponse = { ticket };
    return c.json(response, 201);
  });

  app.post('/results', async (c) => {
    let submission;
    try {
      submission = parseScoreSubmission(await c.req.json());
    } catch (error) {
      return invalidRequest(c, error);
    }

    const { ticket, claimedResult } = submission;
    if (!verifyTicketSig(ticket, config.ticketSecret)) {
      return reject(c, 'Invalid ticket signature', false);
    }
    if (Date.now() > ticket.expiresAt) return reject(c, 'Ticket expired', false);

    const supportedBuilds = config.supportedGameBuilds[ticket.game.id]?.[ticket.game.version];
    if (!supportedBuilds?.includes(ticket.buildVersion)) {
      return reject(c, 'Unsupported ticket game, version, or build', true);
    }

    const identityError = resultIdentityError(ticket, claimedResult);
    if (identityError) return reject(c, identityError, true);

    const storedTicket = store.getTicket(ticket.sessionId);
    if (!storedTicket) return reject(c, 'Ticket unknown', false);

    if (submission.evidence.kind !== 'input-trace') return reject(c, 'Input trace evidence required', false);
    if (!schemasEqual(submission.evidence.schema, RPR_INPUT_SCHEMA)) {
      return reject(c, 'Input schema mismatch', false);
    }
    if (submission.evidence.encodingVersion !== RPR_TRACE_ENCODING_VERSION) {
      return reject(c, 'Unsupported trace encoding version', false);
    }
    if (!schemasEqual(claimedResult.result.schema, RPR_RESULT_SCHEMA)) {
      return reject(c, 'Result schema mismatch', false);
    }

    let traceBytes: Uint8Array;
    let replayInputs: ReturnType<typeof decodeRprTrace>['inputs'];
    const maxFrames = RPR_MAX_TRACE_FRAMES;
    try {
      traceBytes = decodeBase64Strict(submission.evidence.data, RPR_TRACE_LIMITS.maxBytes);
      const decoded = decodeRprTrace(traceBytes, maxFrames);
      if (decoded.version !== submission.evidence.encodingVersion) {
        return reject(c, 'Trace version does not match its envelope', false);
      }
      replayInputs = decoded.inputs;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Invalid trace';
      return reject(c, reason, false);
    }

    const inputTraceHash = await sha256HexBytes(traceBytes);
    if (inputTraceHash !== submission.evidence.hash) {
      return reject(c, 'Input trace hash mismatch', true);
    }

    const claimedFrames = claimedResult.result.metrics.frames;
    if (typeof claimedFrames !== 'number'
      || !Number.isSafeInteger(claimedFrames)
      || claimedFrames < 0
      || claimedFrames > maxFrames) {
      return reject(c, 'Frame count exceeds session bounds', true);
    }

    // Structural validation is complete. From this point a replay attempt uses
    // the ticket even when the gameplay claim is later rejected.
    const consumed = store.consumeTicketIfMatches(ticket);
    if (!consumed) return reject(c, 'Ticket already used or does not match issuance', false);

    if (ticket.game.id !== RPR_GAME_ID) {
      return reject(c, `Verification not implemented for game: ${ticket.game.id}`, false);
    }

    let canonical: VerifyResult;
    try {
      canonical = await verifyRpr(ticket.seed, replayInputs);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Replay failed';
      saveReviewResult(store, submission, traceBytes, inputTraceHash);
      return reject(c, reason, true);
    }

    if (!claimMatchesCanonical(claimedResult, canonical)) {
      saveReviewResult(store, submission, traceBytes, inputTraceHash);
      return reject(c, 'Canonical result mismatch — flagged for review', true);
    }

    store.saveResult({
      sessionId: ticket.sessionId,
      gameId: ticket.game.id,
      gameVersion: ticket.game.version,
      buildVersion: ticket.buildVersion,
      playerHandle: submission.playerHandle ?? 'anon',
      outcome: canonical.outcome,
      score: canonical.metrics.score,
      stats: canonical.metrics,
      durationMs: canonical.durationMs,
      inputTrace: traceBytes,
      traceEncodingVersion: RPR_TRACE_ENCODING_VERSION,
      inputTraceHash,
      replayHash: canonical.replayHash,
      verified: true,
      reviewFlag: false,
      submittedAt: Date.now(),
    });

    const category = config.leaderboardCategories['rpr.score']!;
    const placement = store.countBetterThan(category.gameId, canonical.metrics.score, category.order) + 1;
    const total = store.totalVerified(category.gameId);
    const response: SubmissionResponse = { accepted: true, canonicalResult: canonical, placements: [{ categoryId: 'rpr.score', placement, totalEntries: total }] };
    return c.json(response, 200);
  });

  app.get('/leaderboards/:categoryId', (c) => {
    const categoryId = c.req.param('categoryId');
    const category = config.leaderboardCategories[categoryId];
    if (!category) return c.json({ error: `Unknown leaderboard category: ${categoryId}` }, 404);

    const entries = store.getLeaderboard(category.gameId, category.order);
    const response: LeaderboardResponse = {
      categoryId,
      entries: entries.map((result) => ({
        sessionId: result.sessionId,
        game: { id: result.gameId, version: result.gameVersion },
        result: { schema: RPR_RESULT_SCHEMA, outcome: result.outcome, metrics: { ...result.stats, score: result.score }, durationMs: result.durationMs, replayHash: result.replayHash },
        playerHandle: result.playerHandle,
        submittedAt: result.submittedAt,
      })),
    };
    return c.json(response);
  });

  return app;
}

function invalidRequest(c: Context, error: unknown) {
  const reason = error instanceof RequestValidationError || error instanceof SyntaxError
    ? error.message
    : 'Invalid request';
  return c.json({ error: reason }, 400);
}

function reject(c: Context, reason: string, flagged: boolean) {
  const response: SubmissionResponse = { accepted: false, reason, flagged };
  return c.json(response, 422);
}

function resultIdentityError(
  ticket: import('@rpr/protocol').SessionTicket,
  result: import('@rpr/protocol').GameResultClaim,
): string | null {
  if (result.sessionId !== ticket.sessionId) return 'Session ID mismatch';
  if (result.game.id !== ticket.game.id) return 'Game ID mismatch';
  if (result.game.version !== ticket.game.version) return 'Game version mismatch';
  if (result.buildVersion !== ticket.buildVersion) return 'Build version mismatch';
  if (result.seed !== ticket.seed) return 'Seed mismatch';
  return null;
}

function claimMatchesCanonical(
  claim: import('@rpr/protocol').GameResultClaim,
  canonical: VerifyResult,
): boolean {
  return claim.result.outcome === canonical.outcome
    && schemasEqual(claim.result.schema, canonical.schema)
    && claim.result.metrics.score === canonical.metrics.score
    && claim.result.durationMs === canonical.durationMs
    && claim.result.replayHash === canonical.replayHash
    && numericRecordsEqual(claim.result.metrics, canonical.metrics);
}

function schemasEqual(
  a: import('@rpr/protocol').SchemaIdentity,
  b: import('@rpr/protocol').SchemaIdentity,
): boolean {
  return a.id === b.id && a.version === b.version;
}

function numericRecordsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length
    && aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function saveReviewResult(
  store: Store,
  submission: import('@rpr/protocol').ScoreSubmission,
  traceBytes: Uint8Array,
  inputTraceHash: string,
): void {
  const { ticket, claimedResult } = submission;
  store.saveResult({
    sessionId: ticket.sessionId,
    gameId: ticket.game.id,
    gameVersion: ticket.game.version,
    buildVersion: ticket.buildVersion,
    playerHandle: submission.playerHandle ?? 'anon',
    outcome: claimedResult.result.outcome,
    score: claimedResult.result.metrics.score ?? 0,
    stats: { ...claimedResult.result.metrics },
    durationMs: claimedResult.result.durationMs,
    inputTrace: traceBytes,
    traceEncodingVersion: RPR_TRACE_ENCODING_VERSION,
    inputTraceHash,
    replayHash: claimedResult.result.replayHash ?? '',
    verified: false,
    reviewFlag: true,
    submittedAt: Date.now(),
  });
}
