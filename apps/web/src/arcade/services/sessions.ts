import type { GameIdentity, SessionRequest, SessionResponse } from '@rpr/protocol';
import type { GameSession } from '../types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class SessionRequestRejectedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SessionRequestRejectedError';
  }
}

export async function fetchSession(game: GameIdentity, buildVersion: string): Promise<GameSession> {
  const body: SessionRequest = { game, buildVersion };
  try {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new SessionRequestRejectedError(
        payload.error ?? `Session request failed (${response.status})`,
        response.status,
      );
    }
    const { ticket } = await response.json() as SessionResponse;
    return {
      seed: ticket.seed,
      startedAt: Date.now(),
      ranking: { kind: 'ticketed', ticket },
    };
  } catch (error) {
    if (error instanceof SessionRequestRejectedError) throw error;
    return {
      seed: randomSeed(),
      startedAt: Date.now(),
      ranking: { kind: 'unranked', reason: 'service-unavailable' },
    };
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
