import type {
  CanonicalGameResult,
  GameIdentity,
  GameResultClaim,
  SchemaIdentity,
  ScoreSubmission,
  SessionRequest,
  SessionTicket,
} from '@rpr/protocol';

export class RequestValidationError extends Error {}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function parseSessionRequest(value: unknown): SessionRequest {
  const request = object(value, 'request');
  return {
    game: parseGameIdentity(request.game, 'game'),
    buildVersion: string(request.buildVersion, 'buildVersion'),
  };
}

export function parseScoreSubmission(value: unknown): ScoreSubmission {
  const submission = object(value, 'submission');
  const evidenceValue = object(submission.evidence, 'evidence');
  if (evidenceValue.kind !== 'input-trace' && evidenceValue.kind !== 'none') {
    throw new RequestValidationError('evidence.kind is invalid');
  }

  const evidence = evidenceValue.kind === 'none'
    ? { kind: 'none' as const }
    : {
        kind: 'input-trace' as const,
        schema: parseSchemaIdentity(evidenceValue.schema, 'evidence.schema'),
        encodingVersion: nonNegativeInteger(
          evidenceValue.encodingVersion,
          'evidence.encodingVersion',
        ),
        data: encodedData(evidenceValue.data, 'evidence.data'),
        hash: sha256(evidenceValue.hash, 'evidence.hash'),
      };

  const claimValue = object(submission.claimedResult, 'claimedResult');
  const claimedResult: GameResultClaim = {
    game: parseGameIdentity(claimValue.game, 'claimedResult.game'),
    buildVersion: string(claimValue.buildVersion, 'claimedResult.buildVersion'),
    sessionId: string(claimValue.sessionId, 'claimedResult.sessionId'),
    seed: nonNegativeInteger(claimValue.seed, 'claimedResult.seed'),
    result: parseCanonicalResult(claimValue.result),
  };

  return {
    ticket: parseTicket(submission.ticket),
    evidence,
    claimedResult,
    clientTimestamp: nonNegativeInteger(submission.clientTimestamp, 'clientTimestamp'),
    ...(submission.playerHandle === undefined
      ? {}
      : { playerHandle: string(submission.playerHandle, 'playerHandle') }),
  };
}

export function decodeBase64Strict(value: string): Uint8Array {
  if (!STRICT_BASE64.test(value)) throw new RequestValidationError('Invalid base64');
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseTicket(value: unknown): SessionTicket {
  const ticket = object(value, 'ticket');
  return {
    sessionId: string(ticket.sessionId, 'ticket.sessionId'),
    game: parseGameIdentity(ticket.game, 'ticket.game'),
    buildVersion: string(ticket.buildVersion, 'ticket.buildVersion'),
    seed: nonNegativeInteger(ticket.seed, 'ticket.seed'),
    issuedAt: nonNegativeInteger(ticket.issuedAt, 'ticket.issuedAt'),
    expiresAt: nonNegativeInteger(ticket.expiresAt, 'ticket.expiresAt'),
    sig: string(ticket.sig, 'ticket.sig'),
  };
}

function parseCanonicalResult(value: unknown): CanonicalGameResult {
  const result = object(value, 'result');
  const rawMetrics = object(result.metrics, 'result.metrics');
  const metrics: Record<string, number> = {};
  for (const [key, metric] of Object.entries(rawMetrics)) {
    if (!Number.isFinite(metric)) {
      throw new RequestValidationError(`result.metrics.${key} must be finite`);
    }
    metrics[key] = metric as number;
  }

  const replayHash = result.replayHash === undefined
    ? undefined
    : sha256(result.replayHash, 'result.replayHash');
  return {
    schema: parseSchemaIdentity(result.schema, 'result.schema'),
    outcome: string(result.outcome, 'result.outcome'),
    metrics,
    durationMs: nonNegativeInteger(result.durationMs, 'result.durationMs'),
    ...(replayHash ? { replayHash } : {}),
  };
}

function parseGameIdentity(value: unknown, name: string): GameIdentity {
  const identity = object(value, name);
  return {
    id: string(identity.id, `${name}.id`),
    version: string(identity.version, `${name}.version`),
  };
}

function parseSchemaIdentity(value: unknown, name: string): SchemaIdentity {
  const identity = object(value, name);
  return {
    id: string(identity.id, `${name}.id`),
    version: nonNegativeInteger(identity.version, `${name}.version`),
  };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value.length > 200) {
    throw new RequestValidationError(`${name} must be a string`);
  }
  return value;
}

function encodedData(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value.length > 2_000_000) {
    throw new RequestValidationError(`${name} must be encoded data`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RequestValidationError(`${name} must be a non-negative integer`);
  }
  return value as number;
}

function sha256(value: unknown, name: string): string {
  const hash = string(value, name);
  if (!SHA256_HEX.test(hash)) {
    throw new RequestValidationError(`${name} must be SHA-256 hex`);
  }
  return hash;
}
