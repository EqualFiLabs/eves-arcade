/** Hono API for durable ranked sessions, replay verification, and leaderboards. */
import { Hono, type Context } from 'hono';
import { randomUUID } from 'node:crypto';
import type { ApiConfig } from './config';
import { signTicket, verifyTicketSig, newSeed, newSessionId } from './crypto';
import {
  sha256HexBytes,
  type CanonicalGameResult,
  type GameResultClaim,
  type LeaderboardPlacement,
  type LeaderboardResponse,
  type ScoreSubmission,
  type SessionResponse,
  type SessionTicket,
  type SubmissionResponse,
} from '@rpr/protocol';
import {
  identitiesEqual,
  leaderboardRegistry as defaultLeaderboardRegistry,
  schemasEqual,
  verifierRegistry as defaultVerifierRegistry,
  type LeaderboardRegistry,
  type VerifierRegistry,
  type VerificationExecutor,
} from './registry';
import {
  RequestValidationError,
  decodeBase64Strict,
  parseScoreSubmission,
  parseSessionRequest,
} from './validation';
import type { ArcadeStore } from './store';
import { MemorySessionRateLimiter, type SessionRateLimiter } from './rate-limit';
import {
  InlineVerificationExecutor,
  VerificationCapacityError,
  VerificationRejectedError,
} from './verify/executor';

export interface AppDeps {
  config: ApiConfig;
  store: ArcadeStore;
  executor?: VerificationExecutor;
  verifiers?: VerifierRegistry;
  leaderboards?: LeaderboardRegistry;
  rateLimiter?: SessionRateLimiter;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const { config, store } = deps;
  const executor = deps.executor ?? new InlineVerificationExecutor();
  const verifiers = deps.verifiers ?? defaultVerifierRegistry;
  const leaderboards = deps.leaderboards ?? defaultLeaderboardRegistry;
  const rateLimiter = deps.rateLimiter ?? new MemorySessionRateLimiter(config);

  app.use('*', async (c, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    c.header('x-request-id', requestId);
    await next();
    emitLog(config, {
      level: 'info',
      event: 'request_complete',
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    });
  });
  app.onError((error, c) => {
    emitLog(config, {
      level: 'error',
      event: 'request_failed',
      path: c.req.path,
      message: error.message,
    });
    if (c.req.path === '/results') {
      return reject(c, 'service_unavailable', 'Verification service unavailable', false, true, 503);
    }
    return c.json({ error: 'Service unavailable' }, 503);
  });

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/ready', async (c) => {
    const database = await store.healthCheck();
    const referenced = await store.referencedVerifierKeys();
    const referencedCategories = await store.referencedCategoryIds();
    const missing = referenced.filter((key) => !verifiers.entries.some(
      (entry) => `${entry.verifier.id}@${entry.verifier.revision}` === key,
    ));
    const missingCategories = referencedCategories.filter((id) => !leaderboards.get(id));
    const ok = database && executor.ready && missing.length === 0 && missingCategories.length === 0;
    return c.json({
      ok,
      database,
      workers: executor.ready,
      missingVerifiers: missing,
      missingCategories,
    }, ok ? 200 : 503);
  });

  app.post('/sessions', async (c) => {
    if (await rateLimiter.exceeded(c)) return c.json({ error: 'Rate limit exceeded' }, 429);
    let request;
    try {
      request = parseSessionRequest(await c.req.json());
    } catch (error) {
      return invalidRequest(c, error);
    }
    const descriptor = verifiers.activeForGame(request.game);
    if (!descriptor) {
      return c.json({ error: `Unsupported game version: ${request.game.id}@${request.game.version}` }, 400);
    }
    const supportedBuilds = config.supportedGameBuilds[request.game.id]?.[request.game.version];
    if (!supportedBuilds?.includes(request.buildVersion)) {
      return c.json({ error: `Unsupported build: ${request.buildVersion}` }, 400);
    }
    const now = Date.now();
    const ticket = signTicket({
      sessionId: newSessionId(),
      game: request.game,
      verifier: descriptor.verifier,
      buildVersion: request.buildVersion,
      seed: newSeed(),
      issuedAt: now,
      expiresAt: now + config.ticketTtlMs,
    }, config.ticketSecret);
    await store.saveTicket(ticket);
    const response: SessionResponse = { ticket };
    return c.json(response, 201);
  });

  app.post('/results', async (c) => {
    let submission: ScoreSubmission;
    try {
      submission = parseScoreSubmission(await c.req.json());
    } catch (error) {
      return invalidRequest(c, error);
    }
    const { ticket, claimedResult } = submission;
    if (!verifyTicketSig(ticket, config.ticketSecret)) {
      return reject(c, 'invalid_signature', 'Invalid ticket signature', false, false);
    }
    const descriptor = verifiers.exact(ticket.game, ticket.verifier);
    if (!descriptor) {
      return reject(c, 'unsupported_verifier', 'Unsupported ticket game or verifier revision', false, false);
    }
    if (Date.now() > ticket.expiresAt) {
      await store.expireTicket(ticket.sessionId, Date.now());
      return reject(c, 'ticket_expired', 'Ticket expired', false, false);
    }
    const builds = config.supportedGameBuilds[ticket.game.id]?.[ticket.game.version];
    if (!builds?.includes(ticket.buildVersion)) {
      return reject(c, 'unsupported_build', 'Unsupported ticket build', false, false);
    }
    const identityError = resultIdentityError(ticket, claimedResult);
    if (identityError) return reject(c, 'identity_mismatch', identityError, false, false);
    if (submission.evidence.kind !== 'input-trace') {
      return reject(c, 'evidence_required', 'Input trace evidence required', false, false);
    }
    if (!schemasEqual(submission.evidence.schema, descriptor.inputSchema)) {
      return reject(c, 'input_schema_mismatch', 'Input schema mismatch', false, false);
    }
    if (submission.evidence.encodingVersion !== descriptor.encodingVersion) {
      return reject(c, 'encoding_mismatch', 'Unsupported trace encoding version', false, false);
    }
    if (!schemasEqual(claimedResult.result.schema, descriptor.resultSchema)) {
      return reject(c, 'result_schema_mismatch', 'Result schema mismatch', false, false);
    }
    const storedTicket = await store.getTicket(ticket.sessionId);
    if (!storedTicket) return reject(c, 'ticket_unknown', 'Ticket unknown', false, false);

    let traceBytes: Uint8Array;
    try {
      traceBytes = decodeBase64Strict(submission.evidence.data, descriptor.maxEvidenceBytes);
      descriptor.validateEvidence(traceBytes);
    } catch (error) {
      return reject(c, 'invalid_evidence', errorMessage(error, 'Invalid trace'), false, false);
    }
    const traceHash = await sha256HexBytes(traceBytes);
    if (traceHash !== submission.evidence.hash) {
      return reject(c, 'trace_hash_mismatch', 'Input trace hash mismatch', false, false);
    }
    const claimedFrames = claimedResult.result.metrics.frames;
    if (typeof claimedFrames !== 'number' || !Number.isSafeInteger(claimedFrames)
      || claimedFrames < 0 || claimedFrames > descriptor.maxFrames) {
      return reject(c, 'frame_limit', 'Frame count exceeds verifier bounds', false, false);
    }

    const fingerprint = await submissionFingerprint(submission);
    const reservation = await store.reserveTicket(
      ticket, fingerprint, Date.now(), config.ticketLeaseMs,
    );
    if (reservation.kind === 'unknown') {
      return reject(c, 'ticket_unknown', 'Ticket unknown or does not match issuance', false, false);
    }
    if (reservation.kind === 'expired') {
      return reject(c, 'ticket_expired', 'Ticket expired', false, false);
    }
    if (reservation.kind === 'in-progress') {
      return reject(c, 'submission_in_progress', 'Submission verification is in progress', false, true, 409);
    }
    if (reservation.kind === 'conflict') {
      return reject(c, 'ticket_conflict', 'Ticket was used by a different submission', false, false, 409);
    }
    if (reservation.kind === 'terminal') {
      return c.json(await populatePlacements(reservation.response, store, leaderboards, ticket.verifier), 200);
    }

    let canonical: CanonicalGameResult;
    const verificationStarted = performance.now();
    try {
      canonical = await executor.verify({ verifier: ticket.verifier, seed: ticket.seed, traceBytes });
    } catch (error) {
      if (error instanceof VerificationCapacityError) {
        await store.releaseReservation(ticket.sessionId, reservation.leaseToken);
        return reject(c, error.code, error.message, false, true, 503);
      }
      const code = error instanceof VerificationRejectedError ? error.code : 'replay_invalid';
      const reason = errorMessage(error, 'Replay verification failed');
      await store.finalizeRejected({
        ticket, leaseToken: reservation.leaseToken, submissionFingerprint: fingerprint,
        playerHandle: submission.playerHandle ?? 'anon', trace: traceBytes,
        traceEncodingVersion: descriptor.encodingVersion, traceHash,
        claim: claimedResult.result, code, reason, submittedAt: Date.now(),
      });
      emitLog(config, verificationLog(ticket, code, verificationStarted));
      return reject(c, code, reason, true, false);
    }

    if (!claimMatchesCanonical(claimedResult, canonical)) {
      const reason = 'Canonical result mismatch — flagged for review';
      await store.finalizeRejected({
        ticket, leaseToken: reservation.leaseToken, submissionFingerprint: fingerprint,
        playerHandle: submission.playerHandle ?? 'anon', trace: traceBytes,
        traceEncodingVersion: descriptor.encodingVersion, traceHash,
        claim: claimedResult.result, code: 'canonical_mismatch', reason, submittedAt: Date.now(),
      });
      emitLog(config, verificationLog(ticket, 'canonical_mismatch', verificationStarted));
      return reject(c, 'canonical_mismatch', reason, true, false);
    }

    const categories = leaderboards.forVerifier(ticket.verifier);
    const categoryValues: Record<string, number> = {};
    for (const category of categories) {
      const value = canonical.metrics[category.metric];
      if (!Number.isFinite(value)) {
        await store.releaseReservation(ticket.sessionId, reservation.leaseToken);
        return reject(c, 'verifier_contract', `Verifier omitted metric ${category.metric}`, false, true, 503);
      }
      categoryValues[category.id] = value!;
    }
    const finalized = await store.finalizeAccepted({
      ticket, leaseToken: reservation.leaseToken, submissionFingerprint: fingerprint,
      playerHandle: submission.playerHandle ?? 'anon', trace: traceBytes,
      traceEncodingVersion: descriptor.encodingVersion, traceHash, canonical,
      categoryValues, submittedAt: Date.now(),
    });
    if (!finalized) {
      return reject(c, 'lease_lost', 'Verification lease was lost; retry submission', false, true, 409);
    }
    const placements = await placementsFor(categoryValues, store, leaderboards);
    emitLog(config, verificationLog(ticket, 'accepted', verificationStarted));
    const response: SubmissionResponse = { accepted: true, canonicalResult: canonical, placements };
    return c.json(response, 200);
  });

  app.get('/leaderboards/:categoryId', async (c) => {
    const category = leaderboards.get(c.req.param('categoryId'));
    if (!category) return c.json({ error: `Unknown leaderboard category: ${c.req.param('categoryId')}` }, 404);
    const entries = await store.getLeaderboard(category);
    const response: LeaderboardResponse = {
      categoryId: category.id,
      entries: entries.map((result) => ({
        sessionId: result.sessionId,
        game: { id: result.gameId, version: result.gameVersion },
        result: result.canonicalResult ?? {
          schema: category.resultSchema,
          outcome: result.outcome,
          metrics: { ...result.stats, [category.metric]: result.categoryValues?.[category.id] ?? result.score },
          durationMs: result.durationMs,
          replayHash: result.replayHash,
        },
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
    ? error.message : 'Invalid request';
  return c.json({ error: reason }, 400);
}

function reject(
  c: Context,
  code: string,
  reason: string,
  flagged: boolean,
  retryable: boolean,
  status: 409 | 422 | 503 = 422,
) {
  const response: SubmissionResponse = { accepted: false, code, reason, flagged, retryable };
  return c.json(response, status);
}

function resultIdentityError(ticket: SessionTicket, result: GameResultClaim): string | null {
  if (result.sessionId !== ticket.sessionId) return 'Session ID mismatch';
  if (!identitiesEqual(result.game, ticket.game)) return 'Game identity mismatch';
  if (result.buildVersion !== ticket.buildVersion) return 'Build version mismatch';
  if (result.seed !== ticket.seed) return 'Seed mismatch';
  return null;
}

function claimMatchesCanonical(claim: GameResultClaim, canonical: CanonicalGameResult): boolean {
  return claim.result.outcome === canonical.outcome
    && schemasEqual(claim.result.schema, canonical.schema)
    && claim.result.durationMs === canonical.durationMs
    && claim.result.replayHash === canonical.replayHash
    && numericRecordsEqual(claim.result.metrics, canonical.metrics);
}

function numericRecordsEqual(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length
    && aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

async function submissionFingerprint(submission: ScoreSubmission): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(stableJson({
    sessionId: submission.ticket.sessionId,
    verifier: submission.ticket.verifier,
    evidence: submission.evidence,
    claim: submission.claimedResult,
    playerHandle: submission.playerHandle ?? 'anon',
  })));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function placementsFor(
  values: Record<string, number>,
  store: ArcadeStore,
  leaderboards: LeaderboardRegistry,
): Promise<LeaderboardPlacement[]> {
  const placements: LeaderboardPlacement[] = [];
  for (const [categoryId, value] of Object.entries(values)) {
    const category = leaderboards.get(categoryId);
    if (!category) continue;
    placements.push({
      categoryId,
      placement: await store.countBetterThan(category, value) + 1,
      totalEntries: await store.totalVerified(category),
    });
  }
  return placements;
}

async function populatePlacements(
  response: SubmissionResponse,
  store: ArcadeStore,
  leaderboards: LeaderboardRegistry,
  verifier: SessionTicket['verifier'],
): Promise<SubmissionResponse> {
  if (!response.accepted) return response;
  const values: Record<string, number> = {};
  for (const category of leaderboards.forVerifier(verifier)) {
    const value = response.canonicalResult.metrics[category.metric];
    if (Number.isFinite(value)) values[category.id] = value!;
  }
  return { ...response, placements: await placementsFor(values, store, leaderboards) };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function verificationLog(ticket: SessionTicket, outcome: string, started: number): Record<string, unknown> {
  return {
    level: 'info',
    event: 'verification_complete',
    sessionId: ticket.sessionId,
    verifier: `${ticket.verifier.id}@${ticket.verifier.revision}`,
    outcome,
    durationMs: Math.round(performance.now() - started),
  };
}

function emitLog(config: ApiConfig, record: Record<string, unknown>): void {
  if (config.environment !== 'test') console.log(JSON.stringify(record));
}
