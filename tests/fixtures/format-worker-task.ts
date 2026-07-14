import type { VerificationJob } from '../../apps/api/src/registry';
import type { WorkerTaskResult } from '../../apps/api/src/verify/worker-task';
import {
  deriveAnalogResult,
  deriveButtonResult,
} from '../../apps/web/src/dev-fixtures/core';

export default async function verifyFormatFixture(job: VerificationJob): Promise<WorkerTaskResult> {
  if (job.verifier.id === 'fixture-button.verify' && job.verifier.revision === 1) {
    return { kind: 'verified', result: await deriveButtonResult(job.seed, job.traceBytes) };
  }
  if (job.verifier.id === 'fixture-analog.verify' && job.verifier.revision === 1) {
    return { kind: 'verified', result: await deriveAnalogResult(job.seed, job.traceBytes) };
  }
  return { kind: 'rejected', code: 'unsupported-verifier', reason: 'Unknown format fixture' };
}
