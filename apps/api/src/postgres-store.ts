import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { SessionTicket, SubmissionResponse } from '@rpr/protocol';
import type { LeaderboardCategoryDefinition } from './registry';
import {
  ticketsEqual,
  type ArcadeStore,
  type FinalizeAcceptedInput,
  type FinalizeRejectedInput,
  type ReservationResult,
  type StoredResult,
} from './store';
import { parseCanonicalResult, parseSessionTicket } from './validation';

export class PostgresStore implements ArcadeStore {
  readonly pool: Pool;

  constructor(databaseUrl: string, maxConnections = 10) {
    this.pool = new Pool({ connectionString: databaseUrl, max: maxConnections });
  }

  async saveTicket(ticket: SessionTicket): Promise<void> {
    await this.pool.query(
      `INSERT INTO tickets (
        session_id, ticket, game_id, game_version, verifier_id, verifier_revision,
        build_version, expires_at, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'issued')`,
      [ticket.sessionId, ticket, ticket.game.id, ticket.game.version, ticket.verifier.id,
        ticket.verifier.revision, ticket.buildVersion, ticket.expiresAt],
    );
  }

  async getTicket(sessionId: string): Promise<SessionTicket | null> {
    const row = (await this.pool.query('SELECT ticket FROM tickets WHERE session_id=$1', [sessionId])).rows[0];
    return row ? parseTicket(row.ticket) : null;
  }

  async expireTicket(sessionId: string, now: number): Promise<void> {
    await this.pool.query(
      `UPDATE tickets SET status='expired',lease_token=NULL,lease_expires_at=NULL,updated_at=now()
       WHERE session_id=$1 AND expires_at < $2 AND status IN ('issued','verifying')`,
      [sessionId, now],
    );
  }

  async reserveTicket(
    ticket: SessionTicket,
    submissionFingerprint: string,
    now: number,
    leaseMs: number,
  ): Promise<ReservationResult> {
    return this.transaction(async (client) => {
      const row = (await client.query(
        'SELECT ticket,status,lease_expires_at,submission_fingerprint,terminal_response FROM tickets WHERE session_id=$1 FOR UPDATE',
        [ticket.sessionId],
      )).rows[0];
      if (!row || !ticketsEqual(parseTicket(row.ticket), ticket)) return { kind: 'unknown' };
      if (now > ticket.expiresAt) {
        await client.query("UPDATE tickets SET status='expired',updated_at=now() WHERE session_id=$1", [ticket.sessionId]);
        return { kind: 'expired' };
      }
      if (row.status === 'accepted' || row.status === 'rejected') {
        if (row.submission_fingerprint === submissionFingerprint && row.terminal_response) {
          return { kind: 'terminal', response: parseSubmissionResponse(row.terminal_response) };
        }
        return { kind: 'conflict' };
      }
      if (row.status === 'verifying' && Number(row.lease_expires_at) > now) {
        return row.submission_fingerprint === submissionFingerprint
          ? { kind: 'in-progress' }
          : { kind: 'conflict' };
      }
      const leaseToken = randomUUID();
      await client.query(
        `UPDATE tickets SET status='verifying',lease_token=$2,lease_expires_at=$3,
          submission_fingerprint=$4,updated_at=now() WHERE session_id=$1`,
        [ticket.sessionId, leaseToken, now + leaseMs, submissionFingerprint],
      );
      return { kind: 'reserved', leaseToken };
    });
  }

  async releaseReservation(sessionId: string, leaseToken: string): Promise<void> {
    await this.pool.query(
      `UPDATE tickets SET status='issued',lease_token=NULL,lease_expires_at=NULL,
        submission_fingerprint=NULL,updated_at=now()
       WHERE session_id=$1 AND status='verifying' AND lease_token=$2`,
      [sessionId, leaseToken],
    );
  }

  async finalizeAccepted(input: FinalizeAcceptedInput): Promise<boolean> {
    return this.transaction(async (client) => {
      const response: SubmissionResponse = {
        accepted: true,
        canonicalResult: input.canonical,
        placements: [],
      };
      const updated = await client.query(
        `UPDATE tickets SET status='accepted',terminal_response=$3,lease_token=NULL,
          lease_expires_at=NULL,updated_at=now()
         WHERE session_id=$1 AND status='verifying' AND lease_token=$2`,
        [input.ticket.sessionId, input.leaseToken, response],
      );
      if (updated.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO verification_results (
          session_id,submission_fingerprint,player_handle,claim,canonical_result,trace,
          trace_encoding_version,trace_hash,verified,review_flag,submitted_at
        ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,true,false,$8)`,
        [input.ticket.sessionId, input.submissionFingerprint, input.playerHandle, input.canonical,
          Buffer.from(input.trace), input.traceEncodingVersion, input.traceHash, input.submittedAt],
      );
      for (const [categoryId, value] of Object.entries(input.categoryValues)) {
        await client.query(
          'INSERT INTO leaderboard_values(category_id,session_id,value,submitted_at) VALUES ($1,$2,$3,$4)',
          [categoryId, input.ticket.sessionId, value, input.submittedAt],
        );
      }
      return true;
    });
  }

  async finalizeRejected(input: FinalizeRejectedInput): Promise<boolean> {
    return this.transaction(async (client) => {
      const response: SubmissionResponse = {
        accepted: false,
        code: input.code,
        reason: input.reason,
        flagged: true,
        retryable: false,
      };
      const updated = await client.query(
        `UPDATE tickets SET status='rejected',terminal_response=$3,lease_token=NULL,
          lease_expires_at=NULL,updated_at=now()
         WHERE session_id=$1 AND status='verifying' AND lease_token=$2`,
        [input.ticket.sessionId, input.leaseToken, response],
      );
      if (updated.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO verification_results (
          session_id,submission_fingerprint,player_handle,claim,trace,trace_encoding_version,
          trace_hash,verified,review_flag,rejection_code,rejection_reason,submitted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,false,true,$8,$9,$10)`,
        [input.ticket.sessionId, input.submissionFingerprint, input.playerHandle, input.claim,
          Buffer.from(input.trace), input.traceEncodingVersion, input.traceHash,
          input.code, input.reason, input.submittedAt],
      );
      return true;
    });
  }

  async getLeaderboard(category: LeaderboardCategoryDefinition, limit = 50): Promise<StoredResult[]> {
    const direction = category.order === 'desc' ? 'DESC' : 'ASC';
    const rows = (await this.pool.query(
      `SELECT t.ticket,r.*,l.value FROM leaderboard_values l
       JOIN verification_results r USING(session_id)
       JOIN tickets t USING(session_id)
       WHERE l.category_id=$1 AND r.verified=true
       ORDER BY l.value ${direction},l.submitted_at ASC LIMIT $2`,
      [category.id, limit],
    )).rows;
    return rows.map((row) => storedResult(row, category.id));
  }

  async countBetterThan(category: LeaderboardCategoryDefinition, value: number): Promise<number> {
    const operator = category.order === 'desc' ? '>' : '<';
    const row = (await this.pool.query(
      `SELECT count(*)::integer AS count FROM leaderboard_values WHERE category_id=$1 AND value ${operator} $2`,
      [category.id, value],
    )).rows[0];
    return Number(row?.count ?? 0);
  }

  async totalVerified(category: LeaderboardCategoryDefinition): Promise<number> {
    const row = (await this.pool.query(
      'SELECT count(*)::integer AS count FROM leaderboard_values WHERE category_id=$1',
      [category.id],
    )).rows[0];
    return Number(row?.count ?? 0);
  }

  async getReviewResults(): Promise<StoredResult[]> {
    const rows = (await this.pool.query(
      `SELECT t.ticket,r.* FROM verification_results r JOIN tickets t USING(session_id)
       WHERE r.review_flag=true AND r.verified=false ORDER BY r.submitted_at DESC`,
    )).rows;
    return rows.map((row) => storedResult(row));
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async referencedVerifierKeys(): Promise<readonly string[]> {
    const rows = (await this.pool.query(
      "SELECT DISTINCT verifier_id,verifier_revision FROM tickets",
    )).rows;
    return rows.map((row) => `${String(row.verifier_id)}@${Number(row.verifier_revision)}`);
  }

  async referencedCategoryIds(): Promise<readonly string[]> {
    return (await this.pool.query('SELECT DISTINCT category_id FROM leaderboard_values')).rows
      .map((row) => String(row.category_id));
  }

  async close(): Promise<void> { await this.pool.end(); }

  async incrementRateLimit(clientKey: string, windowStart: number): Promise<number> {
    const row = (await this.pool.query(
      `INSERT INTO rate_limit_windows(client_key,window_start,request_count) VALUES($1,$2,1)
       ON CONFLICT(client_key,window_start) DO UPDATE
       SET request_count=rate_limit_windows.request_count+1 RETURNING request_count`,
      [clientKey, windowStart],
    )).rows[0];
    return Number(row?.request_count ?? 1);
  }

  async cleanupRateLimits(before: number): Promise<void> {
    await this.pool.query('DELETE FROM rate_limit_windows WHERE window_start < $1', [before]);
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function parseTicket(value: unknown): SessionTicket {
  return parseSessionTicket(value);
}

function parseSubmissionResponse(value: unknown): SubmissionResponse {
  if (!value || typeof value !== 'object' || typeof (value as { accepted?: unknown }).accepted !== 'boolean') {
    throw new Error('Stored terminal response is invalid');
  }
  return value as SubmissionResponse;
}

function storedResult(row: QueryResultRow, categoryId?: string): StoredResult {
  const ticket = parseTicket(row.ticket);
  const canonical = row.canonical_result ? parseCanonicalResult(row.canonical_result) : null;
  const claim = parseCanonicalResult(row.claim);
  const result = canonical ?? claim;
  return {
    sessionId: ticket.sessionId,
    gameId: ticket.game.id,
    gameVersion: ticket.game.version,
    verifierId: ticket.verifier.id,
    verifierRevision: ticket.verifier.revision,
    buildVersion: ticket.buildVersion,
    playerHandle: String(row.player_handle),
    outcome: result.outcome,
    score: result.metrics.score ?? 0,
    stats: { ...result.metrics },
    durationMs: result.durationMs,
    inputTrace: new Uint8Array(row.trace as Buffer),
    traceEncodingVersion: Number(row.trace_encoding_version),
    inputTraceHash: String(row.trace_hash),
    replayHash: result.replayHash ?? '',
    verified: Boolean(row.verified),
    reviewFlag: Boolean(row.review_flag),
    submittedAt: Number(row.submitted_at),
    ...(canonical ? { canonicalResult: canonical } : {}),
    ...(row.rejection_code ? { rejectionCode: String(row.rejection_code) } : {}),
    ...(row.rejection_reason ? { rejectionReason: String(row.rejection_reason) } : {}),
    ...(categoryId ? { categoryValues: { [categoryId]: Number(row.value) } } : {}),
  };
}
