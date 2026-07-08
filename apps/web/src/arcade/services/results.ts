import type { GameResult, ScoreSubmission, SubmissionResponse } from '@rpr/protocol';
import { TRACE_ENCODING_VERSION } from '@rpr/protocol';

/**
 * Result submission client + local personal-bests (Req 9.7, 11.3, 11.4).
 *
 * Ranked results are submitted to the API for replay verification. Unranked
 * results store a local personal best in localStorage — never submitted.
 */

const API_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL) ??
  'http://localhost:3000';

const SUBMISSION_TIMEOUT_MS = 10_000;

/** Encodes a Uint8Array to base64 for JSON transport. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Submits a ranked result to the API. Returns the server response (accepted
 * with placement, or rejected), or null on network failure.
 */
export async function submitResult(
  result: GameResult,
  packedTrace: Uint8Array,
  ticket: ScoreSubmission['ticket'],
): Promise<SubmissionResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUBMISSION_TIMEOUT_MS);
    const submission: ScoreSubmission = {
      ticket,
      inputTrace: bytesToBase64(packedTrace),
      traceEncodingVersion: TRACE_ENCODING_VERSION,
      claimedResult: result,
      clientTimestamp: Date.now(),
    };
    const res = await fetch(`${API_URL}/results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return (await res.json()) as SubmissionResponse;
  } catch {
    return null;
  }
}

/** Stores a local personal best for unranked play (Req 11.3). */
export function storeLocalBest(gameId: string, score: number): void {
  const key = `arcade:best:${gameId}`;
  try {
    const current = Number(localStorage.getItem(key) ?? 0);
    if (score > current) localStorage.setItem(key, String(score));
  } catch {
    // Private mode / quota — best stays in-memory only.
  }
}

/** Reads the local personal best for unranked play. */
export function getLocalBest(gameId: string): number {
  try {
    return Number(localStorage.getItem(`arcade:best:${gameId}`) ?? 0);
  } catch {
    return 0;
  }
}
