/** Hono API for ranked sessions, canonical replay verification, and leaderboards. */
import { Hono, type Context } from 'hono';
import type { ApiConfig } from './config';
import { Store } from './store';
import { signTicket, verifyTicketSig, newSessionId } from './crypto';
import { verifyRpr, type VerifyResult } from './verify/rpr';
import {
  TRACE_ENCODING_VERSION,
  sha256HexBytes,
  unpackTrace,
  type LeaderboardResponse,
  type SessionResponse,
  type SubmissionResponse,
} from '@rpr/protocol';
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

    const supportedBuilds = config.supportedGameBuilds[request.gameId]?.[request.gameVersion];
    if (!supportedBuilds) {
      return c.json({ error: `Unsupported game version: ${request.gameId}@${request.gameVersion}` }, 400);
    }
    if (!supportedBuilds.includes(request.buildVersion)) {
      return c.json({ error: `Unsupported build: ${request.buildVersion}` }, 400);
    }

    const now = Date.now();
    const ticket = signTicket({
      sessionId: newSessionId(),
      gameId: request.gameId,
      gameVersion: request.gameVersion,
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

    const supportedBuilds = config.supportedGameBuilds[ticket.gameId]?.[ticket.gameVersion];
    if (!supportedBuilds?.includes(ticket.buildVersion)) {
      return reject(c, 'Unsupported ticket game, version, or build', true);
    }

    const identityError = resultIdentityError(ticket, claimedResult);
    if (identityError) return reject(c, identityError, true);

    const storedTicket = store.getTicket(ticket.sessionId);
    if (!storedTicket) return reject(c, 'Ticket unknown', false);

    if (submission.traceEncodingVersion !== TRACE_ENCODING_VERSION) {
      return reject(c, 'Unsupported trace encoding version', false);
    }

    let traceBytes: Uint8Array;
    const maxFrames = Math.ceil(config.ticketTtlMs / SIM_STEP_MS);
    try {
      traceBytes = decodeBase64Strict(submission.inputTrace);
      const decoded = unpackTrace(traceBytes, { maxFrames, maxButtons: 13, maxAxes: 0 });
      if (decoded.version !== submission.traceEncodingVersion) {
        return reject(c, 'Trace version does not match its envelope', false);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Invalid trace';
      return reject(c, reason, false);
    }

    const inputTraceHash = await sha256HexBytes(traceBytes);
    if (inputTraceHash !== claimedResult.inputTraceHash) {
      return reject(c, 'Input trace hash mismatch', true);
    }

    const claimedFrames = claimedResult.stats.frames;
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

    if (ticket.gameId !== 'rug-pull-rumble') {
      return reject(c, `Verification not implemented for game: ${ticket.gameId}`, false);
    }

    let canonical: VerifyResult;
    try {
      canonical = await verifyRpr(ticket.seed, traceBytes, maxFrames);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Replay failed';
      return reject(c, reason, true);
    }

    if (!claimMatchesCanonical(claimedResult, canonical)) {
      store.saveResult({
        sessionId: ticket.sessionId,
        gameId: ticket.gameId,
        gameVersion: ticket.gameVersion,
        buildVersion: ticket.buildVersion,
        playerHandle: submission.playerHandle ?? 'anon',
        outcome: claimedResult.outcome,
        score: claimedResult.score,
        stats: claimedResult.stats,
        durationMs: claimedResult.durationMs,
        inputTrace: traceBytes,
        traceEncodingVersion: TRACE_ENCODING_VERSION,
        inputTraceHash,
        replayHash: claimedResult.replayHash,
        verified: false,
        reviewFlag: true,
        submittedAt: Date.now(),
      });
      return reject(c, 'Canonical result mismatch — flagged for review', true);
    }

    store.saveResult({
      sessionId: ticket.sessionId,
      gameId: ticket.gameId,
      gameVersion: ticket.gameVersion,
      buildVersion: ticket.buildVersion,
      playerHandle: submission.playerHandle ?? 'anon',
      outcome: canonical.outcome,
      score: canonical.score,
      stats: canonical.stats,
      durationMs: canonical.durationMs,
      inputTrace: traceBytes,
      traceEncodingVersion: TRACE_ENCODING_VERSION,
      inputTraceHash,
      replayHash: canonical.replayHash,
      verified: true,
      reviewFlag: false,
      submittedAt: Date.now(),
    });

    const category = config.leaderboardCategories['rpr.score']!;
    const placement = store.countBetterThan(category.gameId, canonical.score, category.order) + 1;
    const total = store.totalVerified(category.gameId);
    const response: SubmissionResponse = {
      accepted: true,
      canonicalScore: canonical.score,
      placement,
      totalEntries: total,
    };
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
        score: result.score,
        outcome: result.outcome,
        playerHandle: result.playerHandle,
        gameVersion: result.gameVersion,
        submittedAt: result.submittedAt,
      })),
    };
    return c.json(response);
  });

  return app;
}

const SIM_STEP_MS = 1000 / 60;

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
  result: import('@rpr/protocol').GameResult,
): string | null {
  if (result.sessionId !== ticket.sessionId) return 'Session ID mismatch';
  if (result.gameId !== ticket.gameId) return 'Game ID mismatch';
  if (result.gameVersion !== ticket.gameVersion) return 'Game version mismatch';
  if (result.buildVersion !== ticket.buildVersion) return 'Build version mismatch';
  if (result.seed !== ticket.seed) return 'Seed mismatch';
  return null;
}

function claimMatchesCanonical(
  claim: import('@rpr/protocol').GameResult,
  canonical: VerifyResult,
): boolean {
  return claim.outcome === canonical.outcome
    && claim.score === canonical.score
    && claim.durationMs === canonical.durationMs
    && claim.replayHash === canonical.replayHash
    && numericRecordsEqual(claim.stats, canonical.stats);
}

function numericRecordsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length
    && aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}
