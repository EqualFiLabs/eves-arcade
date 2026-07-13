/** Pure, versioned arcade wire contracts shared by web and API. */
export interface GameIdentity {
  id: string;
  version: string;
}

export interface SchemaIdentity {
  id: string;
  version: number;
}

export type VerificationDescriptor =
  | { kind: 'input-trace'; schema: SchemaIdentity; encodingVersion: number }
  | { kind: 'none' };

export interface GameContractDescriptor {
  game: GameIdentity;
  resultSchema: SchemaIdentity;
  verification: VerificationDescriptor;
}

export interface CanonicalGameResult {
  schema: SchemaIdentity;
  outcome: string;
  metrics: Readonly<Record<string, number>>;
  durationMs: number;
  replayHash?: string;
}

export interface SessionTicket {
  sessionId: string;
  game: GameIdentity;
  buildVersion: string;
  seed: number;
  issuedAt: number;
  expiresAt: number;
  sig: string;
}

export interface SessionRequest {
  game: GameIdentity;
  buildVersion: string;
}

export interface SessionResponse {
  ticket: SessionTicket;
}

export interface GameResultClaim {
  game: GameIdentity;
  buildVersion: string;
  sessionId: string;
  seed: number;
  result: CanonicalGameResult;
}

export type SerializedVerificationEvidence =
  | {
      kind: 'input-trace';
      schema: SchemaIdentity;
      encodingVersion: number;
      data: string;
      hash: string;
    }
  | { kind: 'none' };

export interface ScoreSubmission {
  ticket: SessionTicket;
  evidence: SerializedVerificationEvidence;
  claimedResult: GameResultClaim;
  playerHandle?: string;
  clientTimestamp: number;
}

export interface LeaderboardCategory {
  id: string;
  label: string;
  metric: string;
  order: 'desc' | 'asc';
  season?: string;
}

export interface LeaderboardPlacement {
  categoryId: string;
  placement: number;
  totalEntries: number;
}

export interface SubmissionAccepted {
  accepted: true;
  canonicalResult: CanonicalGameResult;
  placements: LeaderboardPlacement[];
}

export interface SubmissionRejected {
  accepted: false;
  reason: string;
  flagged: boolean;
}

export type SubmissionResponse = SubmissionAccepted | SubmissionRejected;

export interface LeaderboardEntry {
  sessionId: string;
  game: GameIdentity;
  result: CanonicalGameResult;
  playerHandle: string;
  submittedAt: number;
}

export interface LeaderboardResponse {
  categoryId: string;
  entries: LeaderboardEntry[];
}
