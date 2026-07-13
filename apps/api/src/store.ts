import { randomUUID } from 'node:crypto';
import type {
  CanonicalGameResult,
  SessionTicket,
  SubmissionResponse,
} from '@rpr/protocol';
import type { LeaderboardCategoryDefinition } from './registry';

export type MaybePromise<T> = T | Promise<T>;
export type TicketStatus = 'issued' | 'verifying' | 'accepted' | 'rejected' | 'expired';

export interface StoredResult {
  sessionId: string;
  gameId: string;
  gameVersion: string;
  verifierId?: string;
  verifierRevision?: number;
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
  canonicalResult?: CanonicalGameResult;
  rejectionCode?: string;
  rejectionReason?: string;
  submissionFingerprint?: string;
  categoryValues?: Record<string, number>;
}

export interface TicketRecord {
  ticket: SessionTicket;
  status: TicketStatus;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  submissionFingerprint: string | null;
}

export type ReservationResult =
  | { kind: 'reserved'; leaseToken: string }
  | { kind: 'in-progress' }
  | { kind: 'conflict' }
  | { kind: 'expired' }
  | { kind: 'unknown' }
  | { kind: 'terminal'; response: SubmissionResponse };

export interface FinalizeAcceptedInput {
  ticket: SessionTicket;
  leaseToken: string;
  submissionFingerprint: string;
  playerHandle: string;
  trace: Uint8Array;
  traceEncodingVersion: number;
  traceHash: string;
  canonical: CanonicalGameResult;
  categoryValues: Record<string, number>;
  submittedAt: number;
}

export interface FinalizeRejectedInput extends Omit<FinalizeAcceptedInput, 'canonical' | 'categoryValues'> {
  claim: CanonicalGameResult;
  code: string;
  reason: string;
}

export interface ArcadeStore {
  saveTicket(ticket: SessionTicket): MaybePromise<void>;
  getTicket(sessionId: string): MaybePromise<SessionTicket | null>;
  expireTicket(sessionId: string, now: number): MaybePromise<void>;
  reserveTicket(
    ticket: SessionTicket,
    submissionFingerprint: string,
    now: number,
    leaseMs: number,
  ): MaybePromise<ReservationResult>;
  releaseReservation(sessionId: string, leaseToken: string): MaybePromise<void>;
  finalizeAccepted(input: FinalizeAcceptedInput): MaybePromise<boolean>;
  finalizeRejected(input: FinalizeRejectedInput): MaybePromise<boolean>;
  getLeaderboard(category: LeaderboardCategoryDefinition, limit?: number): MaybePromise<StoredResult[]>;
  countBetterThan(category: LeaderboardCategoryDefinition, value: number): MaybePromise<number>;
  totalVerified(category: LeaderboardCategoryDefinition): MaybePromise<number>;
  getReviewResults(): MaybePromise<StoredResult[]>;
  healthCheck(): MaybePromise<boolean>;
  referencedVerifierKeys(): MaybePromise<readonly string[]>;
  referencedCategoryIds(): MaybePromise<readonly string[]>;
  close?(): Promise<void>;
}

interface MemoryTicket extends TicketRecord {
  terminalResponse?: SubmissionResponse;
}

/** Fast in-memory implementation retained for route unit tests and local fixtures. */
export class Store implements ArcadeStore {
  private readonly tickets = new Map<string, MemoryTicket>();
  private readonly results: StoredResult[] = [];

  saveTicket(ticket: SessionTicket): void {
    this.tickets.set(ticket.sessionId, {
      ticket,
      status: 'issued',
      leaseToken: null,
      leaseExpiresAt: null,
      submissionFingerprint: null,
    });
  }

  getTicket(sessionId: string): SessionTicket | null {
    return this.tickets.get(sessionId)?.ticket ?? null;
  }

  expireTicket(sessionId: string, now: number): void {
    const entry = this.tickets.get(sessionId);
    if (entry && now > entry.ticket.expiresAt && entry.status !== 'accepted' && entry.status !== 'rejected') {
      entry.status = 'expired';
      entry.leaseToken = null;
      entry.leaseExpiresAt = null;
    }
  }

  reserveTicket(
    ticket: SessionTicket,
    submissionFingerprint: string,
    now: number,
    leaseMs: number,
  ): ReservationResult {
    const entry = this.tickets.get(ticket.sessionId);
    if (!entry || !ticketsEqual(entry.ticket, ticket)) return { kind: 'unknown' };
    if (now > ticket.expiresAt) {
      entry.status = 'expired';
      return { kind: 'expired' };
    }
    if (entry.status === 'accepted' || entry.status === 'rejected') {
      if (entry.submissionFingerprint === submissionFingerprint && entry.terminalResponse) {
        return { kind: 'terminal', response: entry.terminalResponse };
      }
      return { kind: 'conflict' };
    }
    if (entry.status === 'verifying' && (entry.leaseExpiresAt ?? 0) > now) {
      return entry.submissionFingerprint === submissionFingerprint
        ? { kind: 'in-progress' }
        : { kind: 'conflict' };
    }
    const leaseToken = randomUUID();
    entry.status = 'verifying';
    entry.leaseToken = leaseToken;
    entry.leaseExpiresAt = now + leaseMs;
    entry.submissionFingerprint = submissionFingerprint;
    return { kind: 'reserved', leaseToken };
  }

  releaseReservation(sessionId: string, leaseToken: string): void {
    const entry = this.tickets.get(sessionId);
    if (!entry || entry.status !== 'verifying' || entry.leaseToken !== leaseToken) return;
    entry.status = 'issued';
    entry.leaseToken = null;
    entry.leaseExpiresAt = null;
    entry.submissionFingerprint = null;
  }

  finalizeAccepted(input: FinalizeAcceptedInput): boolean {
    const entry = this.validLease(input.ticket.sessionId, input.leaseToken);
    if (!entry) return false;
    const placements = Object.keys(input.categoryValues).map((categoryId) => ({
      categoryId,
      placement: 0,
      totalEntries: 0,
    }));
    const response: SubmissionResponse = {
      accepted: true,
      canonicalResult: input.canonical,
      placements,
    };
    entry.status = 'accepted';
    entry.terminalResponse = response;
    this.results.push(resultFromAccepted(input));
    return true;
  }

  finalizeRejected(input: FinalizeRejectedInput): boolean {
    const entry = this.validLease(input.ticket.sessionId, input.leaseToken);
    if (!entry) return false;
    const response: SubmissionResponse = {
      accepted: false,
      code: input.code,
      reason: input.reason,
      flagged: true,
      retryable: false,
    };
    entry.status = 'rejected';
    entry.terminalResponse = response;
    this.results.push(resultFromRejected(input));
    return true;
  }

  getLeaderboard(categoryOrGame: LeaderboardCategoryDefinition | string, orderOrLimit?: 'asc' | 'desc' | number, oldLimit = 50): StoredResult[] {
    const category = typeof categoryOrGame === 'string' ? null : categoryOrGame;
    const limit = typeof orderOrLimit === 'number' ? orderOrLimit : oldLimit;
    const order = category ? category.order : (typeof orderOrLimit === 'string' ? orderOrLimit : 'desc');
    const filtered = this.results.filter((result) => result.verified && (
      category ? result.categoryValues?.[category.id] !== undefined : result.gameId === categoryOrGame
    ));
    filtered.sort((a, b) => {
      const av = category ? a.categoryValues?.[category.id] ?? 0 : a.score;
      const bv = category ? b.categoryValues?.[category.id] ?? 0 : b.score;
      return order === 'desc' ? bv - av : av - bv;
    });
    return filtered.slice(0, limit);
  }

  countBetterThan(categoryOrGame: LeaderboardCategoryDefinition | string, value: number, legacyOrder?: 'asc' | 'desc'): number {
    const category = typeof categoryOrGame === 'string' ? null : categoryOrGame;
    const order = category?.order ?? legacyOrder ?? 'desc';
    return this.getLeaderboard(categoryOrGame, order).filter((result) => {
      const stored = category ? result.categoryValues?.[category.id] ?? 0 : result.score;
      return order === 'desc' ? stored > value : stored < value;
    }).length;
  }

  totalVerified(categoryOrGame: LeaderboardCategoryDefinition | string): number {
    return this.getLeaderboard(categoryOrGame).length;
  }

  getReviewResults(): StoredResult[] {
    return this.results.filter((result) => result.reviewFlag && !result.verified);
  }

  healthCheck(): boolean { return true; }

  referencedVerifierKeys(): readonly string[] {
    return [...new Set([...this.tickets.values()].map(
      ({ ticket }) => `${ticket.verifier.id}@${ticket.verifier.revision}`,
    ))];
  }

  referencedCategoryIds(): readonly string[] {
    return [...new Set(this.results.flatMap((result) => Object.keys(result.categoryValues ?? {})))];
  }

  /** Compatibility helpers retained for focused unit tests. */
  consumeTicket(sessionId: string): SessionTicket | null {
    const entry = this.tickets.get(sessionId);
    if (!entry || entry.status !== 'issued') return null;
    entry.status = 'verifying';
    return entry.ticket;
  }

  consumeTicketIfMatches(ticket: SessionTicket): SessionTicket | null {
    const entry = this.tickets.get(ticket.sessionId);
    if (!entry || entry.status !== 'issued' || !ticketsEqual(entry.ticket, ticket)) return null;
    entry.status = 'verifying';
    return entry.ticket;
  }

  saveResult(result: StoredResult): void {
    this.results.push(result);
  }

  flagResult(sessionId: string): void {
    const result = this.results.find((candidate) => candidate.sessionId === sessionId);
    if (result) result.reviewFlag = true;
  }

  reset(): void {
    this.tickets.clear();
    this.results.length = 0;
  }

  private validLease(sessionId: string, leaseToken: string): MemoryTicket | null {
    const entry = this.tickets.get(sessionId);
    return entry?.status === 'verifying' && entry.leaseToken === leaseToken ? entry : null;
  }
}

export function ticketsEqual(a: SessionTicket, b: SessionTicket): boolean {
  return a.sessionId === b.sessionId
    && a.game.id === b.game.id
    && a.game.version === b.game.version
    && a.verifier.id === b.verifier.id
    && a.verifier.revision === b.verifier.revision
    && a.buildVersion === b.buildVersion
    && a.seed === b.seed
    && a.issuedAt === b.issuedAt
    && a.expiresAt === b.expiresAt
    && a.sig === b.sig;
}

function resultFromAccepted(input: FinalizeAcceptedInput): StoredResult {
  return {
    sessionId: input.ticket.sessionId,
    gameId: input.ticket.game.id,
    gameVersion: input.ticket.game.version,
    verifierId: input.ticket.verifier.id,
    verifierRevision: input.ticket.verifier.revision,
    buildVersion: input.ticket.buildVersion,
    playerHandle: input.playerHandle,
    outcome: input.canonical.outcome,
    score: input.canonical.metrics.score ?? 0,
    stats: { ...input.canonical.metrics },
    durationMs: input.canonical.durationMs,
    inputTrace: input.trace,
    traceEncodingVersion: input.traceEncodingVersion,
    inputTraceHash: input.traceHash,
    replayHash: input.canonical.replayHash ?? '',
    verified: true,
    reviewFlag: false,
    submittedAt: input.submittedAt,
    canonicalResult: input.canonical,
    submissionFingerprint: input.submissionFingerprint,
    categoryValues: { ...input.categoryValues },
  };
}

function resultFromRejected(input: FinalizeRejectedInput): StoredResult {
  return {
    sessionId: input.ticket.sessionId,
    gameId: input.ticket.game.id,
    gameVersion: input.ticket.game.version,
    verifierId: input.ticket.verifier.id,
    verifierRevision: input.ticket.verifier.revision,
    buildVersion: input.ticket.buildVersion,
    playerHandle: input.playerHandle,
    outcome: input.claim.outcome,
    score: input.claim.metrics.score ?? 0,
    stats: { ...input.claim.metrics },
    durationMs: input.claim.durationMs,
    inputTrace: input.trace,
    traceEncodingVersion: input.traceEncodingVersion,
    inputTraceHash: input.traceHash,
    replayHash: input.claim.replayHash ?? '',
    verified: false,
    reviewFlag: true,
    submittedAt: input.submittedAt,
    rejectionCode: input.code,
    rejectionReason: input.reason,
    submissionFingerprint: input.submissionFingerprint,
  };
}
