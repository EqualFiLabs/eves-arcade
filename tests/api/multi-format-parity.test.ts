import { describe, expect, it } from 'vitest';
import {
  TRACE_ENCODING_VERSION,
  decodeTrace,
  encodeTrace,
  sha256HexBytes,
  type CanonicalGameResult,
  type ScoreSubmission,
  type SessionTicket,
  type TraceFrame,
} from '@rpr/protocol';
import { createApp } from '../../apps/api/src/server';
import { loadConfig } from '../../apps/api/src/config';
import {
  LeaderboardRegistry,
  VerifierRegistry,
  type VerifierDescriptor,
  type VerificationExecutor,
} from '../../apps/api/src/registry';
import { Store } from '../../apps/api/src/store';
import { WorkerVerificationExecutor } from '../../apps/api/src/verify/executor';
import {
  ANALOG_CONTRACT,
  ANALOG_INPUT,
  ANALOG_LIMITS,
  BUTTON_CONTRACT,
  BUTTON_INPUT,
  BUTTON_LIMITS,
  deriveAnalogResult,
  deriveButtonResult,
  type AnalogAxis,
  type AnalogButton,
  type ButtonAction,
} from '../../apps/web/src/dev-fixtures/core';

const BUILD = 'test';
const descriptors = [
  descriptor(BUTTON_CONTRACT, BUTTON_LIMITS, (bytes) => decodeTrace(bytes, BUTTON_INPUT, BUTTON_LIMITS), deriveButtonResult),
  descriptor(ANALOG_CONTRACT, ANALOG_LIMITS, (bytes) => decodeTrace(bytes, ANALOG_INPUT, ANALOG_LIMITS), deriveAnalogResult),
];
const verifiers = new VerifierRegistry(descriptors);
const leaderboards = new LeaderboardRegistry([
  category(descriptors[0]!, 'fixture.button.score', 'score'),
  category(descriptors[1]!, 'fixture.analog.distance', 'distance'),
]);
const executor: VerificationExecutor = {
  ready: true,
  async verify(job) {
    const selected = verifiers.byIdentity(job.verifier);
    if (!selected) throw new Error('missing fixture verifier');
    return selected.verify(job.seed, job.traceBytes);
  },
};

describe('multi-format client/server parity', () => {
  it('accepts a button-only trace with one canonical result', async () => {
    const frames: TraceFrame<ButtonAction, never>[] = Array.from({ length: 12 }, (_, index) => ({
      buttons: { press: index % 3 === 0 }, axes: {},
    }));
    const bytes = encodeTrace(BUTTON_INPUT, frames, BUTTON_LIMITS);
    const response = await submit(BUTTON_CONTRACT.game, bytes, deriveButtonResult);
    expect(response.accepted).toBe(true);
    if (response.accepted) expect(response.canonicalResult.metrics.presses).toBe(4);
  });

  it('quantizes analog input identically before client and server replay', async () => {
    const frames: TraceFrame<AnalogButton, AnalogAxis>[] = [
      { buttons: { finish: false }, axes: { steer: 0.123456, throttle: -0.333333 } },
      { buttons: { finish: true }, axes: { steer: -0.765432, throttle: 0.222222 } },
    ];
    const bytes = encodeTrace(ANALOG_INPUT, frames, ANALOG_LIMITS);
    const decoded = decodeTrace(bytes, ANALOG_INPUT, ANALOG_LIMITS);
    expect(decoded.frames[0]!.axes.steer).not.toBe(frames[0]!.axes.steer);
    const response = await submit(ANALOG_CONTRACT.game, bytes, deriveAnalogResult);
    expect(response.accepted).toBe(true);
    if (response.accepted) {
      expect(response.canonicalResult.outcome).toBe('landed');
      expect(response.placements[0]?.categoryId).toBe('fixture.analog.distance');
    }
  });

  it('replays both formats through a real worker thread', async () => {
    const worker = new WorkerVerificationExecutor({
      minThreads: 1,
      maxThreads: 1,
      maxQueue: 1,
      timeoutMs: 5_000,
      workerFile: new URL('../fixtures/format-worker-task.ts', import.meta.url),
    });
    try {
      const buttonBytes = encodeTrace(BUTTON_INPUT, [
        { buttons: { press: true }, axes: {} },
      ], BUTTON_LIMITS);
      const analogBytes = encodeTrace(ANALOG_INPUT, [
        { buttons: { finish: true }, axes: { steer: 0.25, throttle: -0.5 } },
      ], ANALOG_LIMITS);
      await expect(worker.verify({
        verifier: descriptors[0]!.verifier, seed: 3, traceBytes: buttonBytes,
      })).resolves.toEqual(await deriveButtonResult(3, buttonBytes));
      await expect(worker.verify({
        verifier: descriptors[1]!.verifier, seed: 3, traceBytes: analogBytes,
      })).resolves.toEqual(await deriveAnalogResult(3, analogBytes));
    } finally {
      await worker.close();
    }
  });

  it('flags a cross-format canonical claim mismatch', async () => {
    const bytes = encodeTrace(BUTTON_INPUT, [
      { buttons: { press: true }, axes: {} },
    ], BUTTON_LIMITS);
    const result = await submit(BUTTON_CONTRACT.game, bytes, async (seed, trace) => ({
      ...await deriveButtonResult(seed, trace),
      metrics: { score: 999, presses: 1, frames: 1 },
    }));
    expect(result).toMatchObject({ accepted: false, code: 'canonical_mismatch', flagged: true });
  });
});

async function submit(
  game: { id: string; version: string },
  bytes: Uint8Array,
  claim: (seed: number, bytes: Uint8Array) => Promise<CanonicalGameResult>,
) {
  const store = new Store();
  const app = createApp({
    config: { ...loadConfig({ NODE_ENV: 'test', KNOWN_BUILD_VERSIONS: BUILD }), ticketSecret: 'fixture-secret' },
    store,
    verifiers,
    leaderboards,
    executor,
  });
  const session = await app.request('/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ game, buildVersion: BUILD }),
  });
  expect(session.status).toBe(201);
  const ticket = (await session.json() as { ticket: SessionTicket }).ticket;
  const canonical = await claim(ticket.seed, bytes);
  const submission: ScoreSubmission = {
    ticket,
    evidence: {
      kind: 'input-trace',
      schema: game.id === BUTTON_CONTRACT.game.id
        ? BUTTON_CONTRACT.verification.schema
        : ANALOG_CONTRACT.verification.schema,
      encodingVersion: TRACE_ENCODING_VERSION,
      data: Buffer.from(bytes).toString('base64'),
      hash: await sha256HexBytes(bytes),
    },
    claimedResult: {
      game,
      buildVersion: BUILD,
      sessionId: ticket.sessionId,
      seed: ticket.seed,
      result: canonical,
    },
    clientTimestamp: Date.now(),
  };
  const response = await app.request('/results', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
  return response.json() as Promise<import('@rpr/protocol').SubmissionResponse>;
}

function descriptor(
  contract: typeof BUTTON_CONTRACT | typeof ANALOG_CONTRACT,
  limits: { maxFrames: number; maxBytes: number },
  validate: (bytes: Uint8Array) => unknown,
  verify: (seed: number, bytes: Uint8Array) => Promise<CanonicalGameResult>,
): VerifierDescriptor {
  return {
    game: contract.game,
    verifier: { id: `${contract.game.id}.verify`, revision: 1 },
    inputSchema: contract.verification.schema,
    resultSchema: contract.resultSchema,
    encodingVersion: contract.verification.encodingVersion,
    maxFrames: limits.maxFrames,
    maxEvidenceBytes: limits.maxBytes,
    validateEvidence: (bytes) => { validate(bytes); },
    verify,
  };
}

function category(entry: VerifierDescriptor, id: string, metric: string) {
  return {
    id,
    label: id,
    game: entry.game,
    verifier: entry.verifier,
    resultSchema: entry.resultSchema,
    metric,
    order: 'desc' as const,
  };
}
