import type { GameSession } from '../types';
import type { SessionRequest, SessionResponse } from '@rpr/protocol';

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
  '/api';

const SESSION_TIMEOUT_MS = 3000;

/** Suitable 31-bit positive integer seed for a deterministic sim. */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/**
 * Requests a ranked session ticket. Falls back to an unranked local session on
 * any error (Req 9.5, Property 7).
 */
export async function fetchSession(
  gameId: string,
  gameVersion: string,
  buildVersion: string,
): Promise<GameSession> {
  const request: SessionRequest = { gameId, gameVersion, buildVersion };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new SessionRequestRejectedError(body?.error ?? `HTTP ${res.status}`);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as SessionResponse;
    return {
      ticket: data.ticket,
      seed: data.ticket.seed,
      ranked: true,
      startedAt: Date.now(),
    };
  } catch (error) {
    if (error instanceof SessionRequestRejectedError) throw error;
    return {
      seed: randomSeed(),
      ranked: false,
      startedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class SessionRequestRejectedError extends Error {}

export { API_URL };
