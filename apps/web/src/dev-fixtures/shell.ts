import type { SessionTicket, SubmissionResponse } from '@rpr/protocol';
import { ArcadeShell } from '../arcade/shell';
import type { GameCompletion, GameSession } from '../arcade/types';
import { FIXTURE_REGISTRY } from './registry';

interface FixtureServiceWindow extends Window {
  __fixtureServiceCalls?: { sessions: number; submissions: number };
}

export function createFixtureArcade(root: HTMLElement): ArcadeShell {
  const debug = window as FixtureServiceWindow;
  debug.__fixtureServiceCalls = { sessions: 0, submissions: 0 };
  const shell = new ArcadeShell(root, {
    registry: FIXTURE_REGISTRY,
    acquireSession: async (game, buildVersion): Promise<GameSession> => {
      debug.__fixtureServiceCalls!.sessions += 1;
      const now = Date.now();
      const ticket: SessionTicket = {
        sessionId: crypto.randomUUID(),
        game,
        verifier: { id: `${game.id}.verify`, revision: 1 },
        buildVersion,
        seed: 17,
        issuedAt: now,
        expiresAt: now + 60_000,
        sig: '0'.repeat(64),
      };
      return { seed: ticket.seed, startedAt: now, ranking: { kind: 'ticketed', ticket } };
    },
    submitResult: async (completion: GameCompletion): Promise<SubmissionResponse> => {
      debug.__fixtureServiceCalls!.submissions += 1;
      return {
        accepted: true,
        canonicalResult: completion.result,
        placements: [{
          categoryId: completion.result.schema.id.includes('analog')
            ? 'fixture.analog.distance'
            : 'fixture.button.score',
          placement: 1,
          totalEntries: 1,
        }],
      };
    },
  });
  shell.start();
  return shell;
}
