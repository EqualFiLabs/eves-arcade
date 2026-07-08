import type { GameSession } from '../types';
import type { SessionResponse } from '@rpr/protocol';

/**
 * Session ticket client (Req 9.5, 9.7).
 *
 * Requests a signed ticket from the API with a short timeout. On any failure
 * (API down, network error, non-OK response) falls back to an unranked local
 * session with a random seed — the game remains fully playable offline
 * (Property 7).
 */

const API_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL) ??
  'http://localhost:3000';

const SESSION_TIMEOUT_MS = 3000;

/** Suitable 31-bit positive integer seed for a deterministic sim. */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/**
 * Requests a ranked session ticket. Falls back to an unranked local session on
 * any error (Req 9.5, Property 7).
 */
export async function fetchSession(gameId: string): Promise<GameSession> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
    const res = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as SessionResponse;
    return {
      ticket: data.ticket,
      seed: data.ticket.seed,
      ranked: true,
      startedAt: Date.now(),
    };
  } catch {
    return {
      seed: randomSeed(),
      ranked: false,
      startedAt: Date.now(),
    };
  }
}

export { API_URL };
