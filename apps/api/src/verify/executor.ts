import { availableParallelism } from 'node:os';
import { createRequire } from 'node:module';
import { Piscina } from 'piscina';
import type { CanonicalGameResult } from '@rpr/protocol';
import verifyInWorker, { type WorkerTaskResult } from './worker-task';
import type { VerificationExecutor, VerificationJob } from '../registry';

export class VerificationCapacityError extends Error {
  constructor(message: string, readonly code: 'queue-full' | 'timeout' | 'worker-failed') {
    super(message);
    this.name = 'VerificationCapacityError';
  }
}

export class VerificationRejectedError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'VerificationRejectedError';
  }
}

export class InlineVerificationExecutor implements VerificationExecutor {
  readonly ready = true;
  async verify(job: VerificationJob): Promise<CanonicalGameResult> {
    return unwrap(await verifyInWorker(job));
  }
}

export interface WorkerVerificationOptions {
  minThreads?: number;
  maxThreads?: number;
  maxQueue?: number;
  timeoutMs?: number;
  /** Test/deployment extension point; production uses the registered worker task. */
  workerFile?: URL;
}

export class WorkerVerificationExecutor implements VerificationExecutor {
  private readonly pool: Piscina;
  private readonly timeoutMs: number;

  constructor(options: WorkerVerificationOptions = {}) {
    const maxThreads = options.maxThreads ?? Math.max(1, availableParallelism() - 1);
    this.timeoutMs = options.timeoutMs ?? 2_000;
    const workerFile = options.workerFile?.href ?? new URL(
      import.meta.url.endsWith('.ts') ? './worker-task.ts' : './verify/worker-task.js',
      import.meta.url,
    ).href;
    const tsxLoader = import.meta.url.endsWith('.ts')
      ? createRequire(import.meta.url).resolve('tsx')
      : null;
    this.pool = new Piscina({
      filename: workerFile,
      minThreads: options.minThreads ?? 1,
      maxThreads,
      maxQueue: options.maxQueue ?? maxThreads * 2,
      idleTimeout: 30_000,
      ...(tsxLoader ? { execArgv: ['--import', tsxLoader] } : {}),
    });
  }

  get ready(): boolean {
    return !this.pool.needsDrain;
  }

  async verify(job: VerificationJob): Promise<CanonicalGameResult> {
    if (this.pool.needsDrain) {
      throw new VerificationCapacityError('Verification queue is full', 'queue-full');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return unwrap(await this.pool.run(job, { signal: controller.signal }) as WorkerTaskResult);
    } catch (error) {
      if (error instanceof VerificationRejectedError) throw error;
      if (controller.signal.aborted) {
        throw new VerificationCapacityError('Verification timed out', 'timeout');
      }
      if (error instanceof Error && /queue limit/i.test(error.message)) {
        throw new VerificationCapacityError('Verification queue is full', 'queue-full');
      }
      throw new VerificationCapacityError(
        error instanceof Error ? error.message : 'Verification worker failed',
        'worker-failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    await this.pool.destroy();
  }
}

function unwrap(result: WorkerTaskResult): CanonicalGameResult {
  if (result.kind === 'rejected') throw new VerificationRejectedError(result.reason, result.code);
  return result.result;
}
