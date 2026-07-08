/**
 * API server configuration (Req 9.1). All values have dev defaults; production
 * overrides come from environment variables.
 */

export interface ApiConfig {
  port: number;
  /** HMAC secret for signing session tickets. */
  ticketSecret: string;
  /** Ticket expiry in ms (added to issuedAt). */
  ticketTtlMs: number;
  /** Per-IP rate limit for session requests (requests per minute). */
  rateLimitPerMin: number;
  /** Known game versions accepted for ranked play. */
  knownGameVersions: Record<string, string[]>;
}

export function loadConfig(): ApiConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    ticketSecret: process.env.TICKET_SECRET ?? 'dev-secret-change-in-production',
    ticketTtlMs: Number(process.env.TICKET_TTL_MS ?? 5 * 60 * 1000),
    rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 30),
    knownGameVersions: {
      'rug-pull-rumble': ['0.1.0'],
    },
  };
}
