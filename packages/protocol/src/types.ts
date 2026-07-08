/**
 * Wire-protocol types shared between the web client and the API server (Req 9.1,
 * 14.1). No Phaser, no DOM, no Node-specific APIs — pure data shapes that both
 * sides compile against.
 */

/** HMAC-signed server grant authorizing one ranked session (Req 9.2). */
export interface SessionTicket {
  sessionId: string;
  gameId: string;
  gameVersion: string;
  seed: number;
  issuedAt: number;
  expiresAt: number;
  /** HMAC-SHA256 over the other fields, hex-encoded. */
  sig: string;
}

/**
 * The outcome of a completed game session. Built by the game, verified by the
 * server. The hashes make the result structurally trustworthy (Req 8.3, 8.5).
 */
export interface GameResult {
  gameId: string;
  gameVersion: string;
  /** Build SHA via Vite `define`; identifies the exact deployed binary (Req 8.6). */
  buildVersion: string;
  /** Present when the session had a ticket (ranked); empty for unranked. */
  sessionId: string;
  seed: number;
  outcome: 'win' | 'loss' | 'complete' | 'abort';
  score: number;
  /** Game-defined stats (e.g. `{ damageDealt, damageTaken, frames }`). */
  stats: Record<string, number>;
  durationMs: number;
  /** SHA-256 of the versioned bit-packed input trace (Req 8.3). */
  inputTraceHash: string;
  /** SHA-256 of the serialized terminal sim state (Req 8.5). */
  replayHash: string;
}

/** Client → server submission of a ranked result + packed trace (Req 10.1). */
export interface ScoreSubmission {
  ticket: SessionTicket;
  /** Bit-packed input trace, base64-encoded for transport. */
  inputTrace: string;
  traceEncodingVersion: number;
  /** The client's claimed result; the server recomputes independently. */
  claimedResult: GameResult;
  /** Untrusted player label (no auth in V1). */
  playerHandle?: string;
  clientTimestamp: number;
}

/** A leaderboard category a game declares in its manifest. */
export interface LeaderboardCategory {
  id: string;
  gameId: string;
  label: string;
  metric: string;
  order: 'desc' | 'asc';
  season?: string;
}

// ── API responses ─────────────────────────────────────────────────────────────

/** `POST /sessions` response. */
export interface SessionResponse {
  ticket: SessionTicket;
}

/** `POST /results` acceptance response. */
export interface SubmissionAccepted {
  accepted: true;
  canonicalScore: number;
  placement: number;
  totalEntries: number;
}

/** `POST /results` rejection response. */
export interface SubmissionRejected {
  accepted: false;
  reason: string;
  flagged: boolean;
}

export type SubmissionResponse = SubmissionAccepted | SubmissionRejected;

/** A single row in a leaderboard response. */
export interface LeaderboardEntry {
  sessionId: string;
  score: number;
  outcome: string;
  playerHandle: string;
  gameVersion: string;
  submittedAt: number;
}

/** `GET /leaderboards/:categoryId` response. */
export interface LeaderboardResponse {
  categoryId: string;
  entries: LeaderboardEntry[];
}
