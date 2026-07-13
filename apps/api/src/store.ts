/**
 * In-memory store for session tickets, results, and traces (Req 9.4).
 *
 * V1 uses a simple Map-based store — sufficient for testing and single-server
 * deployments. The interface is designed to swap for SQLite/Postgres later
 * without touching route code. Single-use enforcement is via the `used` flag on
 * tickets (Property 5).
 */
import type { SessionTicket } from '@rpr/protocol';

interface StoredResult {
  sessionId: string;
  gameId: string;
  gameVersion: string;
  buildVersion: string;
  playerHandle: string;
  outcome: string;
  score: number;
  stats: Record<string, number>;
  durationMs: number;
  inputTrace: Uint8Array;
  traceEncodingVersion: number;
  inputTraceHash: string;
  replayHash: string;
  verified: boolean;
  reviewFlag: boolean;
  submittedAt: number;
}

interface StoredTicket {
  ticket: SessionTicket;
  used: boolean;
}

export class Store {
  private readonly tickets = new Map<string, StoredTicket>();
  private readonly results: StoredResult[] = [];

  // ── Tickets ──────────────────────────────────────────────────────────────

  saveTicket(ticket: SessionTicket): void {
    this.tickets.set(ticket.sessionId, { ticket, used: false });
  }

  /** Returns the ticket and marks it used. Returns null if not found or already used. */
  consumeTicket(sessionId: string): SessionTicket | null {
    const entry = this.tickets.get(sessionId);
    if (!entry || entry.used) return null;
    entry.used = true;
    return entry.ticket;
  }

  /** Atomically consumes the stored ticket only when every signed field matches. */
  consumeTicketIfMatches(ticket: SessionTicket): SessionTicket | null {
    const entry = this.tickets.get(ticket.sessionId);
    if (!entry || entry.used || !ticketsEqual(entry.ticket, ticket)) return null;
    entry.used = true;
    return entry.ticket;
  }

  getTicket(sessionId: string): SessionTicket | null {
    return this.tickets.get(sessionId)?.ticket ?? null;
  }

  // ── Results ──────────────────────────────────────────────────────────────

  saveResult(result: StoredResult): void {
    this.results.push(result);
  }

  flagResult(sessionId: string): void {
    const r = this.results.find((r) => r.sessionId === sessionId);
    if (r) r.reviewFlag = true;
  }

  /** Verified results for a leaderboard, ordered by score. */
  getLeaderboard(gameId: string, order: 'desc' | 'asc', limit = 50): StoredResult[] {
    const filtered = this.results.filter((r) => r.gameId === gameId && r.verified);
    filtered.sort((a, b) => (order === 'desc' ? b.score - a.score : a.score - b.score));
    return filtered.slice(0, limit);
  }

  /** Count of verified entries with a better score (for placement). */
  countBetterThan(gameId: string, score: number, order: 'desc' | 'asc'): number {
    return this.results.filter(
      (r) => r.gameId === gameId && r.verified && (order === 'desc' ? r.score > score : r.score < score),
    ).length;
  }

  totalVerified(gameId: string): number {
    return this.results.filter((r) => r.gameId === gameId && r.verified).length;
  }

  /** Clears all data (for tests). */
  reset(): void {
    this.tickets.clear();
    this.results.length = 0;
  }
}

function ticketsEqual(a: SessionTicket, b: SessionTicket): boolean {
  return a.sessionId === b.sessionId
    && a.gameId === b.gameId
    && a.gameVersion === b.gameVersion
    && a.buildVersion === b.buildVersion
    && a.seed === b.seed
    && a.issuedAt === b.issuedAt
    && a.expiresAt === b.expiresAt
    && a.sig === b.sig;
}

export type { StoredResult };
