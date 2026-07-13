import type { CanonicalGameResult } from '@rpr/protocol';
import { verifierRegistry, type VerificationJob } from '../registry.js';

export type WorkerTaskResult =
  | { kind: 'verified'; result: CanonicalGameResult }
  | { kind: 'rejected'; code: string; reason: string };

export default async function verifyInWorker(job: VerificationJob): Promise<WorkerTaskResult> {
  const descriptor = verifierRegistry.byIdentity(job.verifier);
  if (!descriptor) {
    throw new Error(`Unknown verifier worker task: ${job.verifier.id}@${job.verifier.revision}`);
  }
  try {
    return { kind: 'verified', result: await descriptor.verify(job.seed, job.traceBytes) };
  } catch (error) {
    return {
      kind: 'rejected',
      code: error instanceof Error && 'code' in error ? String(error.code) : 'replay_invalid',
      reason: error instanceof Error ? error.message : 'Replay verification failed',
    };
  }
}
