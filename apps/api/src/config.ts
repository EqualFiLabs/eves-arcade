/**
 * API server configuration (Req 9.1). All values have dev defaults; production
 * overrides come from environment variables.
 */
import { execSync } from 'node:child_process';

export interface ApiConfig {
  port: number;
  /** HMAC secret for signing session tickets. */
  ticketSecret: string;
  /** Ticket expiry in ms (added to issuedAt). */
  ticketTtlMs: number;
  /** Per-IP rate limit for session requests (requests per minute). */
  rateLimitPerMin: number;
  /** Exact game-version/build pairs accepted for ranked play. */
  supportedGameBuilds: Record<string, Record<string, string[]>>;
  /** Temporary explicit category map; generalized in architecture Phase 7. */
  leaderboardCategories: Record<string, {
    gameId: string;
    metric: 'score';
    order: 'desc' | 'asc';
  }>;
}

export function loadConfig(): ApiConfig {
  const configuredBuilds = (process.env.KNOWN_BUILD_VERSIONS ?? `${currentBuildVersion()},dev,test`)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    port: Number(process.env.PORT ?? 3000),
    ticketSecret: process.env.TICKET_SECRET ?? 'dev-secret-change-in-production',
    ticketTtlMs: Number(process.env.TICKET_TTL_MS ?? 5 * 60 * 1000),
    rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 30),
    supportedGameBuilds: {
      'rug-pull-rumble': {
        '0.1.0': configuredBuilds,
      },
    },
    leaderboardCategories: {
      'rpr.score': {
        gameId: 'rug-pull-rumble',
        metric: 'score',
        order: 'desc',
      },
    },
  };
}

function currentBuildVersion(): string {
  if (process.env.BUILD_VERSION) return process.env.BUILD_VERSION;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}
