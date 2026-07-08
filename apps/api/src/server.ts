/**
 * Hono app factory (Req 9.1–9.4, 10.1–10.2).
 *
 * Creates the HTTP app with all routes wired. Exposed as a factory so tests
 * can call `app.request('/path')` without starting a server.
 */
import { Hono, type Context } from 'hono';
import type { ApiConfig } from './config';
import { Store } from './store';
import { signTicket, verifyTicketSig, newSessionId } from './crypto';
import { verifyRpr } from './verify/rpr';
import type {
  SessionResponse,
  SubmissionResponse,
  LeaderboardResponse,
  ScoreSubmission,
} from '@rpr/protocol';

export interface AppDeps {
  config: ApiConfig;
  store: Store;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const { config, store } = deps;

  // Simple per-IP rate limiting for session requests (Req 9.6).
  const requestTimestamps = new Map<string, number[]>();
  function rateLimited(ip: string): boolean {
    const now = Date.now();
    const window = 60_000;
    const recent = (requestTimestamps.get(ip) ?? []).filter((t) => now - t < window);
    recent.push(now);
    requestTimestamps.set(ip, recent);
    return recent.length > config.rateLimitPerMin;
  }

  // ── Health ────────────────────────────────────────────────────────────────

  app.get('/health', (c) => c.json({ ok: true }));

  // ── POST /sessions ────────────────────────────────────────────────────────

  app.post('/sessions', async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (rateLimited(ip)) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    let body: { gameId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const gameId = body.gameId;
    if (!gameId) {
      return c.json({ error: 'Missing gameId' }, 400);
    }

    const knownVersions = config.knownGameVersions[gameId];
    if (!knownVersions || knownVersions.length === 0) {
      return c.json({ error: `Unknown game: ${gameId}` }, 400);
    }

    const gameVersion = knownVersions[knownVersions.length - 1]!;
    const now = Date.now();
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const sessionId = newSessionId();

    const ticket = signTicket({
      sessionId,
      gameId,
      gameVersion,
      seed,
      issuedAt: now,
      expiresAt: now + config.ticketTtlMs,
    }, config.ticketSecret);

    store.saveTicket(ticket);

    const res: SessionResponse = { ticket };
    return c.json(res, 201);
  });

  // ── POST /results ─────────────────────────────────────────────────────────

  app.post('/results', async (c) => {
    let body: ScoreSubmission;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const { ticket, inputTrace, traceEncodingVersion, claimedResult, playerHandle } = body;

    // 1. Validate ticket signature (Req 9.3).
    if (!verifyTicketSig(ticket, config.ticketSecret)) {
      return reject(c, 'Invalid ticket signature', false);
    }

    // 2. Check expiry.
    if (Date.now() > ticket.expiresAt) {
      return reject(c, 'Ticket expired', false);
    }

    // 3. Check game/version match.
    if (ticket.gameId !== claimedResult.gameId) {
      return reject(c, 'Game ID mismatch', true);
    }
    if (ticket.gameVersion !== claimedResult.gameVersion) {
      return reject(c, 'Game version mismatch', true);
    }

    // 4. Single-use: consume the ticket (Req 9.4, Property 5).
    const consumed = store.consumeTicket(ticket.sessionId);
    if (!consumed) {
      return reject(c, 'Ticket already used or unknown', false);
    }

    // 5. Decode the trace.
    const traceBytes = base64ToBytes(inputTrace);
    if (!traceBytes) {
      return reject(c, 'Invalid trace encoding', false);
    }

    // 6. Plausibility checks (Req 10.4).
    const maxFrames = Math.ceil(config.ticketTtlMs / SIM_STEP_MS);
    const claimedFrames = claimedResult.stats.frames ?? 0;
    if (claimedFrames > maxFrames) {
      return reject(c, 'Frame count exceeds session bounds', true);
    }
    const expectedDurationMs = Math.round(claimedFrames * SIM_STEP_MS);
    if (Math.abs(claimedResult.durationMs - expectedDurationMs) > SIM_STEP_MS * 2) {
      return reject(c, 'Duration / frame count mismatch', true);
    }

    // 7. Replay verification (Req 10.1–10.3).
    if (ticket.gameId !== 'rug-pull-rumble') {
      return reject(c, `Verification not implemented for game: ${ticket.gameId}`, false);
    }

    const replay = verifyRpr(ticket.seed, traceBytes);

    // 8. Compare recomputed result to claim (Req 10.2).
    if (replay.replayHash !== claimedResult.replayHash) {
      store.saveResult({
        sessionId: ticket.sessionId,
        gameId: claimedResult.gameId,
        gameVersion: claimedResult.gameVersion,
        buildVersion: claimedResult.buildVersion,
        playerHandle: playerHandle ?? 'anon',
        outcome: claimedResult.outcome,
        score: claimedResult.score,
        stats: claimedResult.stats,
        durationMs: claimedResult.durationMs,
        inputTrace: traceBytes,
        traceEncodingVersion,
        inputTraceHash: claimedResult.inputTraceHash,
        replayHash: claimedResult.replayHash,
        verified: false,
        reviewFlag: true,
        submittedAt: Date.now(),
      });
      return reject(c, 'Replay hash mismatch — flagged for review', true);
    }

    // 9. Accept: store the verified result (Req 10.5).
    const canonicalScore = replay.score;
    store.saveResult({
      sessionId: ticket.sessionId,
      gameId: claimedResult.gameId,
      gameVersion: claimedResult.gameVersion,
      buildVersion: claimedResult.buildVersion,
      playerHandle: playerHandle ?? 'anon',
      outcome: claimedResult.outcome,
      score: canonicalScore,
      stats: claimedResult.stats,
      durationMs: claimedResult.durationMs,
      inputTrace: traceBytes,
      traceEncodingVersion,
      inputTraceHash: claimedResult.inputTraceHash,
      replayHash: replay.replayHash,
      verified: true,
      reviewFlag: false,
      submittedAt: Date.now(),
    });

    // 10. Compute placement.
    const placement = store.countBetterThan(claimedResult.gameId, canonicalScore, 'desc') + 1;
    const total = store.totalVerified(claimedResult.gameId);

    const res: SubmissionResponse = {
      accepted: true,
      canonicalScore,
      placement,
      totalEntries: total,
    };
    return c.json(res, 200);
  });

  // ── GET /leaderboards/:categoryId ────────────────────────────────────────

  app.get('/leaderboards/:categoryId', (c) => {
    const categoryId = c.req.param('categoryId');
    // Parse categoryId: "gameId.metric" (e.g. "rug-pull-rumble.score")
    const [gameId] = categoryId.split('.');
    if (!gameId) {
      return c.json({ error: 'Invalid categoryId' }, 400);
    }

    const entries = store.getLeaderboard(gameId, 'desc');
    const res: LeaderboardResponse = {
      categoryId,
      entries: entries.map((r) => ({
        sessionId: r.sessionId,
        score: r.score,
        outcome: r.outcome,
        playerHandle: r.playerHandle,
        gameVersion: r.gameVersion,
        submittedAt: r.submittedAt,
      })),
    };
    return c.json(res);
  });

  return app;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SIM_STEP_MS = 1000 / 60;

function reject(c: Context, reason: string, flagged: boolean) {
  const res: SubmissionResponse = { accepted: false, reason, flagged };
  return c.json(res, 422);
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
