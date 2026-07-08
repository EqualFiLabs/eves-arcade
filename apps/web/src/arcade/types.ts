/**
 * Arcade shell contract — the complete shell↔game boundary (Req 2).
 *
 * These types are the ONLY surface the shell and games share beyond the
 * controls/protocol packages. No Phaser types appear here (Req 2.6): games own
 * their Phaser instance and the shell never touches it directly. Each new task
 * extends this surface only as needed (result reporting lands in Task 4, tickets
 * in Task 7).
 */

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
  /** Live score ticks (optional); the result callback lands in Task 4. */
  onScore?(score: number): void;
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
