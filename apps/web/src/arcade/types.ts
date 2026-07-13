import type {
  CanonicalGameResult,
  GameContractDescriptor,
  LeaderboardCategory,
  SessionTicket,
} from '@rpr/protocol';

export type {
  CanonicalGameResult,
  GameContractDescriptor,
  LeaderboardCategory,
  SessionTicket,
} from '@rpr/protocol';

export interface ArcadeSettings {
  muted: boolean;
}

export interface AnalyticsHook {
  track(event: string, props?: Record<string, unknown>): void;
}

export type SuspensionReason = 'orientation' | 'visibility' | 'shell';

export interface GameSession {
  seed: number;
  startedAt: number;
  ranking:
    | { kind: 'ticketed'; ticket: SessionTicket }
    | { kind: 'unranked'; reason: 'unsupported' | 'service-unavailable' };
}

export interface MetricPresentation {
  metric: string;
  label: string;
  fractionDigits?: number;
  prefix?: string;
  suffix?: string;
}

/** Text and safe links only. Games cannot supply markup or executable renderers. */
export interface ResultPresentation {
  headline: string;
  summary?: string;
  tone: 'positive' | 'negative' | 'neutral';
  primaryMetric?: MetricPresentation;
  stats?: readonly MetricPresentation[];
  showDuration?: boolean;
  share?: { text: string; url?: string };
  links?: readonly { label: string; url: string }[];
}

export type VerificationEvidence =
  | {
      kind: 'input-trace';
      schema: { id: string; version: number };
      encodingVersion: number;
      bytes: Uint8Array;
    }
  | { kind: 'none' };

export interface GameCompletion {
  result: CanonicalGameResult;
  presentation: ResultPresentation;
  evidence: VerificationEvidence;
}

export interface ArcadeGameContext {
  mount: HTMLElement;
  session: GameSession;
  settings: Readonly<ArcadeSettings>;
  signal: AbortSignal;
  complete(completion: GameCompletion): void;
  updateSettings(patch: Partial<ArcadeSettings>): void;
  analytics: AnalyticsHook;
}

export interface ArcadeGameHandle {
  /** Resolves only when the game is playable; rejects when boot cannot complete. */
  ready: Promise<void>;
  suspend?(reason: SuspensionReason): void;
  resume?(reason: SuspensionReason): void;
  /** Resolves after every game-owned resource has been released. Idempotent. */
  destroy(): Promise<void>;
}

export interface ArcadeGameModule {
  /** Launch is synchronous so the shell owns a teardown handle immediately. */
  launch(ctx: ArcadeGameContext): ArcadeGameHandle;
}

export interface ArcadeGameManifest {
  contract: GameContractDescriptor;
  title: string;
  tagline?: string;
  orientation: 'landscape' | 'portrait' | 'any';
  capabilities: {
    input: { keyboard: boolean; pointer: boolean; touch: boolean; gamepad: boolean };
    suspension: boolean;
    replay: boolean;
  };
  sessionLengthSec?: [number, number];
  leaderboards: LeaderboardCategory[];
  localBest?: { metric: string; order: 'desc' | 'asc' };
  lifecycle?: { readyTimeoutMs?: number };
  load(): Promise<ArcadeGameModule>;
}
