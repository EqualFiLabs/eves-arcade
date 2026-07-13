import { createHmac } from 'node:crypto';
import type { Context } from 'hono';
import proxyaddr from 'proxy-addr';
import type { ApiConfig } from './config';
import type { PostgresStore } from './postgres-store';

export interface SessionRateLimiter {
  exceeded(context: Context): Promise<boolean>;
}

export class MemorySessionRateLimiter implements SessionRateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly config: ApiConfig) {}

  async exceeded(context: Context): Promise<boolean> {
    const key = clientKey(context, this.config);
    const start = Math.floor(Date.now() / 60_000) * 60_000;
    const entry = this.windows.get(key);
    const next = entry?.start === start ? { start, count: entry.count + 1 } : { start, count: 1 };
    this.windows.set(key, next);
    if (this.windows.size > 10_000) {
      for (const [candidate, value] of this.windows) if (value.start < start) this.windows.delete(candidate);
    }
    return next.count > this.config.rateLimitPerMin;
  }
}

export class PostgresSessionRateLimiter implements SessionRateLimiter {
  private lastCleanup = 0;
  constructor(private readonly store: PostgresStore, private readonly config: ApiConfig) {}

  async exceeded(context: Context): Promise<boolean> {
    const now = Date.now();
    const start = Math.floor(now / 60_000) * 60_000;
    const count = await this.store.incrementRateLimit(clientKey(context, this.config), start);
    if (now - this.lastCleanup > 60_000) {
      this.lastCleanup = now;
      void this.store.cleanupRateLimits(start - 600_000).catch(() => undefined);
    }
    return count > this.config.rateLimitPerMin;
  }
}

function clientKey(context: Context, config: ApiConfig): string {
  const peer = context.req.header('x-rpr-peer-ip') ?? '127.0.0.1';
  let address = peer;
  if (config.trustedProxyCidrs.length > 0) {
    const trust = proxyaddr.compile(config.trustedProxyCidrs as string[]);
    if (trust(peer, 0)) {
      const forwarded = context.req.header('x-forwarded-for');
      if (forwarded) {
        const candidate = forwarded.split(',').map((value) => value.trim()).filter(Boolean);
        if (candidate.length === 1) address = candidate[0]!;
      }
    }
  }
  return createHmac('sha256', config.ticketSecret).update(`rate-limit:${address}`).digest('hex');
}
