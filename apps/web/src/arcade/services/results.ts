import {
  sha256HexBytes,
  type GameIdentity,
  type GameResultClaim,
  type ScoreSubmission,
  type SessionTicket,
  type SubmissionResponse,
} from '@rpr/protocol';
import type { GameCompletion } from '../types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export async function submitResult(
  completion: GameCompletion,
  game: GameIdentity,
  buildVersion: string,
  ticket: SessionTicket,
  options: { signal?: AbortSignal } = {},
): Promise<SubmissionResponse | null> {
  throwIfAborted(options.signal);
  const evidence = completion.evidence.kind === 'none'
    ? { kind: 'none' as const }
    : {
        kind: 'input-trace' as const,
        schema: completion.evidence.schema,
        encodingVersion: completion.evidence.encodingVersion,
        data: toBase64(completion.evidence.bytes),
        hash: await sha256HexBytes(completion.evidence.bytes),
      };
  throwIfAborted(options.signal);
  const claimedResult: GameResultClaim = {
    game,
    buildVersion,
    sessionId: ticket.sessionId,
    seed: ticket.seed,
    result: completion.result,
  };
  const body: ScoreSubmission = {
    ticket,
    evidence,
    claimedResult,
    clientTimestamp: Date.now(),
  };

  try {
    const response = await fetch(`${API_BASE}/results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    return await response.json() as SubmissionResponse;
  } catch {
    if (options.signal?.aborted) {
      throw new DOMException(
        options.signal.reason instanceof Error ? options.signal.reason.message : 'Operation aborted',
        'AbortError',
      );
    }
    // Network failures are represented explicitly by null so the shell can
    // preserve the local result without falsely labelling it verified.
    return null;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException(
      signal.reason instanceof Error ? signal.reason.message : 'Operation aborted',
      'AbortError',
    );
  }
}

export function storeLocalBest(
  id: string,
  metric: string,
  value: number,
  order: 'asc' | 'desc' = 'desc',
): void {
  try {
    const key = `arcade:best:${id}:${metric}`;
    const previous = Number(localStorage.getItem(key));
    if (!Number.isFinite(previous) || (order === 'desc' ? value > previous : value < previous)) {
      localStorage.setItem(key, String(value));
    }
  } catch {
    // Storage is an optional enhancement and may be blocked by the browser.
  }
}

export function getLocalBest(id: string, metric: string): number {
  try {
    return Number(localStorage.getItem(`arcade:best:${id}:${metric}`)) || 0;
  } catch {
    return 0;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
