import type {
  GameResult,
  ScoreSubmission,
  SessionRequest,
  SessionTicket,
} from '@rpr/protocol';

const HEX_64 = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class RequestValidationError extends Error {}

export function parseSessionRequest(value: unknown): SessionRequest {
  const body = object(value, 'request');
  return {
    gameId: string(body.gameId, 'gameId', 100),
    gameVersion: string(body.gameVersion, 'gameVersion', 100),
    buildVersion: string(body.buildVersion, 'buildVersion', 100),
  };
}

export function parseScoreSubmission(value: unknown): ScoreSubmission {
  const body = object(value, 'submission');
  const playerHandle = body.playerHandle === undefined
    ? undefined
    : string(body.playerHandle, 'playerHandle', 64);
  return {
    ticket: parseTicket(body.ticket),
    inputTrace: string(body.inputTrace, 'inputTrace', 5_000_000),
    traceEncodingVersion: integer(body.traceEncodingVersion, 'traceEncodingVersion', 0),
    claimedResult: parseGameResult(body.claimedResult),
    ...(playerHandle === undefined ? {} : { playerHandle }),
    clientTimestamp: integer(body.clientTimestamp, 'clientTimestamp', 0),
  };
}

export function decodeBase64Strict(value: string): Uint8Array {
  if (value.length === 0 || value.length % 4 !== 0 || !BASE64.test(value)) {
    throw new RequestValidationError('Invalid trace base64');
  }
  try {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return bytes;
  } catch {
    throw new RequestValidationError('Invalid trace base64');
  }
}

function parseTicket(value: unknown): SessionTicket {
  const ticket = object(value, 'ticket');
  const sig = string(ticket.sig, 'ticket.sig', 64);
  if (!HEX_64.test(sig)) throw new RequestValidationError('ticket.sig must be lowercase SHA-256 hex');
  return {
    sessionId: string(ticket.sessionId, 'ticket.sessionId', 100),
    gameId: string(ticket.gameId, 'ticket.gameId', 100),
    gameVersion: string(ticket.gameVersion, 'ticket.gameVersion', 100),
    buildVersion: string(ticket.buildVersion, 'ticket.buildVersion', 100),
    seed: integer(ticket.seed, 'ticket.seed', 0, 0x7fffffff),
    issuedAt: integer(ticket.issuedAt, 'ticket.issuedAt', 0),
    expiresAt: integer(ticket.expiresAt, 'ticket.expiresAt', 0),
    sig,
  };
}

function parseGameResult(value: unknown): GameResult {
  const result = object(value, 'claimedResult');
  const outcome = string(result.outcome, 'claimedResult.outcome', 20);
  if (!['win', 'loss', 'complete', 'abort'].includes(outcome)) {
    throw new RequestValidationError('claimedResult.outcome is invalid');
  }
  const statsValue = object(result.stats, 'claimedResult.stats');
  const stats: Record<string, number> = {};
  const entries = Object.entries(statsValue);
  if (entries.length > 64) throw new RequestValidationError('claimedResult.stats has too many entries');
  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > 100) {
      throw new RequestValidationError('claimedResult.stats contains an invalid key');
    }
    stats[key] = finiteNumber(value, `claimedResult.stats.${key}`);
  }

  const inputTraceHash = string(result.inputTraceHash, 'claimedResult.inputTraceHash', 64);
  const replayHash = string(result.replayHash, 'claimedResult.replayHash', 64);
  if (!HEX_64.test(inputTraceHash)) {
    throw new RequestValidationError('claimedResult.inputTraceHash must be lowercase SHA-256 hex');
  }
  if (!HEX_64.test(replayHash)) {
    throw new RequestValidationError('claimedResult.replayHash must be lowercase SHA-256 hex');
  }

  return {
    gameId: string(result.gameId, 'claimedResult.gameId', 100),
    gameVersion: string(result.gameVersion, 'claimedResult.gameVersion', 100),
    buildVersion: string(result.buildVersion, 'claimedResult.buildVersion', 100),
    sessionId: string(result.sessionId, 'claimedResult.sessionId', 100),
    seed: integer(result.seed, 'claimedResult.seed', 0, 0x7fffffff),
    outcome: outcome as GameResult['outcome'],
    score: integer(result.score, 'claimedResult.score', 0),
    stats,
    durationMs: integer(result.durationMs, 'claimedResult.durationMs', 0),
    inputTraceHash,
    replayHash,
  };
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RequestValidationError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new RequestValidationError(`${path} must be a non-empty string up to ${maxLength} characters`);
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RequestValidationError(`${path} must be finite`);
  }
  return value;
}

function integer(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const number = finiteNumber(value, path);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new RequestValidationError(`${path} must be an integer from ${min} to ${max}`);
  }
  return number;
}
