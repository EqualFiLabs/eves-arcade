/**
 * HMAC ticket signing + verification (Req 9.2). Uses Node's `node:crypto`.
 *
 * The signature covers a canonical string built from the ticket fields so the
 * server can verify that a ticket was issued by this server and has not been
 * tampered with.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SessionTicket } from '@rpr/protocol';

/** Builds the canonical string that the HMAC covers. */
function canonical(ticket: Omit<SessionTicket, 'sig'>): string {
  return [
    ticket.sessionId,
    ticket.game.id,
    ticket.game.version,
    ticket.buildVersion,
    ticket.seed,
    ticket.issuedAt,
    ticket.expiresAt,
  ].join('|');
}

/** Signs a ticket, returning the full ticket with the HMAC hex digest. */
export function signTicket(
  fields: Omit<SessionTicket, 'sig'>,
  secret: string,
): SessionTicket {
  const sig = createHmac('sha256', secret).update(canonical(fields)).digest('hex');
  return { ...fields, sig };
}

/** Verifies a ticket's HMAC against the server secret. */
export function verifyTicketSig(ticket: SessionTicket, secret: string): boolean {
  const expected = createHmac('sha256', secret)
    .update(canonical(ticket))
    .digest('hex');
  const a = Buffer.from(ticket.sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Generates a new session ID. */
export function newSessionId(): string {
  return randomUUID();
}
