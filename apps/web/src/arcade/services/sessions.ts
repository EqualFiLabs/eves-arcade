import type { GameIdentity, SessionRequest, SessionResponse } from '@rpr/protocol';
import type { GameSession } from '../types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class SessionRequestRejectedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SessionRequestRejectedError';
  }
}

export interface SessionRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function fetchSession(
  game: GameIdentity,
  buildVersion: string,
  options: SessionRequestOptions = {},
): Promise<GameSession> {
  const body: SessionRequest = { game, buildVersion };
  const timeoutMs = options.timeoutMs ?? 8_000;
  const request = requestSignal(options.signal, timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: request.signal,
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
    if (options.signal?.aborted) throw abortError(options.signal.reason);
    if (error instanceof SessionRequestRejectedError) throw error;
    return {
      seed: randomSeed(),
      startedAt: Date.now(),
      ranking: { kind: 'unranked', reason: 'service-unavailable' },
    };
  } finally {
    request.dispose();
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  dispose(): void;
} {
  if (parent?.aborted) throw abortError(parent.reason);
  const controller = new AbortController();
  const relayAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', relayAbort, { once: true });
  const timer = globalThis.setTimeout(() => controller.abort(new Error('Session request timed out')), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      globalThis.clearTimeout(timer);
      parent?.removeEventListener('abort', relayAbort);
    },
  };
}

function abortError(reason?: unknown): DOMException {
  return new DOMException(reason instanceof Error ? reason.message : 'Operation aborted', 'AbortError');
}
