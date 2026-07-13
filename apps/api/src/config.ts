import { execSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { z } from 'zod';
import { RPR_GAME_ID, RPR_GAME_VERSION } from '@rpr/rug-pull-rumble-core/identity';

export interface ApiConfig {
  port: number;
  environment: 'development' | 'test' | 'production';
  databaseUrl: string | null;
  ticketSecret: string;
  ticketTtlMs: number;
  ticketLeaseMs: number;
  rateLimitPerMin: number;
  maxRequestBodyBytes: number;
  trustedProxyCidrs: readonly string[];
  workerMinThreads: number;
  workerMaxThreads: number;
  workerMaxQueue: number;
  verificationTimeoutMs: number;
  supportedGameBuilds: Record<string, Record<string, string[]>>;
}

const integer = (fallback: number, min: number, max: number) => z.coerce.number()
  .int().min(min).max(max).default(fallback);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: integer(3000, 1, 65_535),
  DATABASE_URL: z.string().min(1).optional(),
  TICKET_SECRET: z.string().min(1).optional(),
  TICKET_TTL_MS: integer(300_000, 10_000, 3_600_000),
  TICKET_LEASE_MS: integer(15_000, 1_000, 120_000),
  RATE_LIMIT_PER_MIN: integer(30, 1, 10_000),
  MAX_REQUEST_BODY_BYTES: integer(1_048_576, 4_096, 10_485_760),
  TRUSTED_PROXY_CIDRS: z.string().default(''),
  VERIFIER_MIN_THREADS: integer(1, 1, 128),
  VERIFIER_MAX_THREADS: integer(Math.max(1, availableParallelism() - 1), 1, 128),
  VERIFIER_MAX_QUEUE: integer(Math.max(2, (availableParallelism() - 1) * 2), 1, 10_000),
  VERIFICATION_TIMEOUT_MS: integer(2_000, 100, 120_000),
  KNOWN_BUILD_VERSIONS: z.string().optional(),
  BUILD_VERSION: z.string().optional(),
});

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = environmentSchema.parse(environment);
  if (parsed.VERIFIER_MIN_THREADS > parsed.VERIFIER_MAX_THREADS) {
    throw new Error('VERIFIER_MIN_THREADS cannot exceed VERIFIER_MAX_THREADS');
  }
  if (parsed.NODE_ENV === 'production') {
    if (!parsed.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
    if (!parsed.TICKET_SECRET || Buffer.byteLength(parsed.TICKET_SECRET) < 32) {
      throw new Error('TICKET_SECRET must contain at least 32 bytes in production');
    }
    if (!parsed.KNOWN_BUILD_VERSIONS) {
      throw new Error('KNOWN_BUILD_VERSIONS is required in production');
    }
    if (!parsed.TRUSTED_PROXY_CIDRS) {
      throw new Error('TRUSTED_PROXY_CIDRS is required in production');
    }
  }

  const configuredBuilds = (parsed.KNOWN_BUILD_VERSIONS ?? `${currentBuildVersion(parsed.BUILD_VERSION)},dev,test`)
    .split(',').map((value) => value.trim()).filter(Boolean);
  return {
    port: parsed.PORT,
    environment: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL ?? null,
    ticketSecret: parsed.TICKET_SECRET ?? 'dev-secret-change-in-production',
    ticketTtlMs: parsed.TICKET_TTL_MS,
    ticketLeaseMs: parsed.TICKET_LEASE_MS,
    rateLimitPerMin: parsed.RATE_LIMIT_PER_MIN,
    maxRequestBodyBytes: parsed.MAX_REQUEST_BODY_BYTES,
    trustedProxyCidrs: parsed.TRUSTED_PROXY_CIDRS.split(',').map((value) => value.trim()).filter(Boolean),
    workerMinThreads: parsed.VERIFIER_MIN_THREADS,
    workerMaxThreads: parsed.VERIFIER_MAX_THREADS,
    workerMaxQueue: parsed.VERIFIER_MAX_QUEUE,
    verificationTimeoutMs: parsed.VERIFICATION_TIMEOUT_MS,
    supportedGameBuilds: {
      [RPR_GAME_ID]: { [RPR_GAME_VERSION]: configuredBuilds },
    },
  };
}

function currentBuildVersion(configured: string | undefined): string {
  if (configured) return configured;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}
