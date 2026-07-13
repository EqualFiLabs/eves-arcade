import type {
  CanonicalGameResult,
  GameIdentity,
  SchemaIdentity,
  SerializedVerificationEvidence,
  VerifierIdentity,
} from '@rpr/protocol';
import { RPR_VERIFIER, rprVerifierDescriptor } from './verify/rpr';
export { RPR_VERIFIER } from './verify/rpr';

export interface VerifierDescriptor {
  readonly game: GameIdentity;
  readonly verifier: VerifierIdentity;
  readonly inputSchema: SchemaIdentity;
  readonly resultSchema: SchemaIdentity;
  readonly encodingVersion: number;
  readonly maxFrames: number;
  readonly maxEvidenceBytes: number;
  readonly validateEvidence: (bytes: Uint8Array) => void;
  readonly verify: (seed: number, bytes: Uint8Array) => Promise<CanonicalGameResult>;
}

export interface LeaderboardCategoryDefinition {
  readonly id: string;
  readonly label: string;
  readonly game: GameIdentity;
  readonly verifier: VerifierIdentity;
  readonly resultSchema: SchemaIdentity;
  readonly metric: string;
  readonly order: 'asc' | 'desc';
  readonly season?: string;
}

export interface VerificationJob {
  readonly verifier: VerifierIdentity;
  readonly seed: number;
  readonly traceBytes: Uint8Array;
}

export interface VerificationExecutor {
  verify(job: VerificationJob): Promise<CanonicalGameResult>;
  readonly ready: boolean;
  close?(): Promise<void>;
}

export class VerifierRegistry {
  private readonly byGame = new Map<string, VerifierDescriptor>();
  private readonly byVerifier = new Map<string, VerifierDescriptor>();

  constructor(readonly entries: readonly VerifierDescriptor[]) {
    for (const entry of entries) {
      const gameKey = identityKey(entry.game);
      const verifierKey = verifierIdentityKey(entry.verifier);
      if (this.byGame.has(gameKey) || this.byVerifier.has(verifierKey)) {
        throw new Error(`Duplicate verifier registry entry: ${gameKey}/${verifierKey}`);
      }
      this.byGame.set(gameKey, entry);
      this.byVerifier.set(verifierKey, entry);
    }
  }

  activeForGame(game: GameIdentity): VerifierDescriptor | null {
    return this.byGame.get(identityKey(game)) ?? null;
  }

  exact(game: GameIdentity, verifier: VerifierIdentity): VerifierDescriptor | null {
    const entry = this.byVerifier.get(verifierIdentityKey(verifier));
    return entry && identitiesEqual(entry.game, game) ? entry : null;
  }

  byIdentity(verifier: VerifierIdentity): VerifierDescriptor | null {
    return this.byVerifier.get(verifierIdentityKey(verifier)) ?? null;
  }
}

export class LeaderboardRegistry {
  private readonly byId = new Map<string, LeaderboardCategoryDefinition>();

  constructor(readonly entries: readonly LeaderboardCategoryDefinition[]) {
    for (const entry of entries) {
      if (this.byId.has(entry.id)) throw new Error(`Duplicate leaderboard category: ${entry.id}`);
      this.byId.set(entry.id, entry);
    }
  }

  get(id: string): LeaderboardCategoryDefinition | null {
    return this.byId.get(id) ?? null;
  }

  forVerifier(verifier: VerifierIdentity): readonly LeaderboardCategoryDefinition[] {
    return this.entries.filter((entry) => verifierIdentitiesEqual(entry.verifier, verifier));
  }
}

export const verifierRegistry = new VerifierRegistry([rprVerifierDescriptor]);

export const leaderboardRegistry = new LeaderboardRegistry([{
  id: 'rpr.score',
  label: 'High Score',
  game: rprVerifierDescriptor.game,
  verifier: RPR_VERIFIER,
  resultSchema: rprVerifierDescriptor.resultSchema,
  metric: 'score',
  order: 'desc',
}]);

export function evidenceMatches(
  evidence: SerializedVerificationEvidence,
  descriptor: VerifierDescriptor,
): evidence is Extract<SerializedVerificationEvidence, { kind: 'input-trace' }> {
  return evidence.kind === 'input-trace'
    && schemasEqual(evidence.schema, descriptor.inputSchema)
    && evidence.encodingVersion === descriptor.encodingVersion;
}

export function identityKey(identity: GameIdentity): string {
  return `${identity.id}@${identity.version}`;
}

export function verifierIdentityKey(identity: VerifierIdentity): string {
  return `${identity.id}@${identity.revision}`;
}

export function identitiesEqual(a: GameIdentity, b: GameIdentity): boolean {
  return a.id === b.id && a.version === b.version;
}

export function verifierIdentitiesEqual(a: VerifierIdentity, b: VerifierIdentity): boolean {
  return a.id === b.id && a.revision === b.revision;
}

export function schemasEqual(a: SchemaIdentity, b: SchemaIdentity): boolean {
  return a.id === b.id && a.version === b.version;
}
