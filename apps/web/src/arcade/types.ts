/**
 * Arcade shell contract — the complete shell↔game boundary (Req 2).
 *
 * These types are the ONLY surface the shell and games share beyond the
 * controls/protocol packages. No Phaser types appear here (Req 2.6): games own
 * their Phaser instance and the shell never touches it directly. Each new task
 * extends this surface only as needed (result reporting lands in Task 4, tickets
 * in Task 7).
 */

/**
 * The outcome of a completed game session. Built by the game on terminal
 * status (KO, completion, abort) and reported to the shell via
 * `ctx.onResult`. The shell shows the DOM result screen and (in ranked play,
 * Task 7+) submits the result + packed trace for server-side verification.
 *
 * `inputTraceHash` and `replayHash` make the result structurally trustworthy:
 * the server re-runs the sim from `(seed, trace)` and checks both (Task 4.4/8).
 */
export interface GameResult {
  gameId: string;
  gameVersion: string;
  /** Build SHA via Vite `define`; identifies the exact deployed binary (Req 8.6). */
  buildVersion: string;
  seed: number;
  outcome: 'win' | 'loss' | 'complete' | 'abort';
  score: number;
  /** Game-defined stats (e.g. `{ damageDealt, damageTaken, frames }`). */
  stats: Record<string, number>;
  durationMs: number;
  /** SHA-256 of the versioned bit-packed input trace (Task 4.4, Req 8.3). */
  inputTraceHash: string;
  /** SHA-256 of the serialized terminal sim state (Req 8.5). */
  replayHash: string;
}

/** Shell-persisted player settings, flowed into a game via the context. */
export interface ArcadeSettings {
  /** Master mute flag. The shell start interaction doubles as the audio unlock (Req 7.6). */
  muted: boolean;
}

/** Minimal analytics seam; the shell provides a concrete (no-op/console) implementation. */
export interface AnalyticsHook {
  track(event: string, props?: Record<string, unknown>): void;
}

/** A play session. Ranked sessions gain a signed ticket in Task 7; V1 is unranked. */
export interface GameSession {
  /** Deterministic simulation seed. Server-chosen when ranked; locally random when unranked. */
  seed: number;
  /** False until ranked tickets land (Task 7/9). Unranked sessions are never submitted. */
  ranked: boolean;
  /** Wall-clock ms the session began, for plausibility checks later. */
  startedAt: number;
}

/** A leaderboard category a game declares in its manifest (fully wired in Task 11). */
export interface LeaderboardCategory {
  id: string;
  gameId: string;
  label: string;
  metric: string;
  order: 'desc' | 'asc';
}

/** The object the shell passes into a game at launch. */
export interface ArcadeGameContext {
  /** Mount element the game creates its canvas inside. */
  parent: HTMLElement;
  session: GameSession;
  settings: ArcadeSettings;
  /** Live score ticks (optional). */
  onScore?(score: number): void;
  /** Terminal result callback — called exactly once when the session ends (Req 4.1). */
  onResult(result: GameResult): void;
  /** Persist a settings change back to shell storage (e.g. mute toggle in-game). */
  updateSettings?(patch: Partial<ArcadeSettings>): void;
  analytics: AnalyticsHook;
}

/** Handle returned by a game on launch; the shell drives teardown/pause through it. */
export interface ArcadeGameHandle {
  /** Present iff the manifest declares `supportsPause`. */
  pause?(): void;
  resume?(): void;
  /** Must destroy the Phaser instance and remove its canvas (Req 3.2). */
  destroy(): void;
}

/** A game module: a factory that launches a Phaser instance for one session. */
export interface ArcadeGameModule {
  launch(ctx: ArcadeGameContext): ArcadeGameHandle;
}

/** Static metadata describing a registered game. */
export interface ArcadeGameManifest {
  id: string;
  title: string;
  tagline?: string;
  /** Game/tuning version, stamped into results in Task 4. */
  version: string;
  /** Asset key namespace (e.g. 'rpr', 'squadron'). */
  assetPrefix: string;
  orientation: 'landscape' | 'portrait' | 'any';
  supportsPause: boolean;
  /** [min, max] expected session length in seconds, for ticket expiry later. */
  sessionLengthSec?: [number, number];
  leaderboards: LeaderboardCategory[];
  /** Dynamic import so game code is code-split out of the shell payload (Req 3.5). */
  load(): Promise<ArcadeGameModule>;
}
