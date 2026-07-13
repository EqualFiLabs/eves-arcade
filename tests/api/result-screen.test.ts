// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { renderResultScreen } from '../../apps/web/src/arcade/result-screen';
import { rugPullRumbleManifest } from '../../apps/web/src/games/rug-pull-rumble/manifest';
import type { GameResult } from '@rpr/protocol';

const result: GameResult = {
  gameId: 'rug-pull-rumble',
  gameVersion: '0.1.0',
  buildVersion: 'test',
  sessionId: 's1',
  seed: 42,
  outcome: 'loss',
  score: 10,
  stats: { damageDealt: 2, damageTaken: 5, frames: 60 },
  durationMs: 1000,
  inputTraceHash: '0'.repeat(64),
  replayHash: '1'.repeat(64),
};

describe('result submission status', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.replaceChildren(root);
  });

  it('does not label a pending ticket as ranked', () => {
    renderResultScreen(root, {
      result,
      manifest: rugPullRumbleManifest,
      submissionStatus: { kind: 'submitting' },
      localBest: 0,
      onPlayAgain() {},
      onBack() {},
    });
    expect(root.querySelector('.arcade-result-badge')?.textContent).toBe('Verifying');
    expect(root.textContent).not.toContain('Ranked');
  });

  it('updates canonical score and placement after verification', () => {
    const view = renderResultScreen(root, {
      result,
      manifest: rugPullRumbleManifest,
      submissionStatus: { kind: 'submitting' },
      localBest: 0,
      onPlayAgain() {},
      onBack() {},
    });
    view.updateSubmissionStatus({
      kind: 'verified',
      canonicalScore: 99,
      placement: 2,
      totalEntries: 10,
    });
    expect(root.querySelector('.arcade-result-badge')?.textContent).toBe('Verified');
    expect(root.querySelector('.arcade-result-score strong')?.textContent).toBe('99');
    expect(root.querySelector('.arcade-submission-message')?.textContent).toBe('Rank #2 of 10');
  });

  it('renders rejection and network failure without claiming verification', () => {
    const view = renderResultScreen(root, {
      result,
      manifest: rugPullRumbleManifest,
      submissionStatus: { kind: 'submitting' },
      localBest: 0,
      onPlayAgain() {},
      onBack() {},
    });
    view.updateSubmissionStatus({ kind: 'rejected', reason: 'Canonical result mismatch' });
    expect(root.querySelector('.arcade-result-badge')?.textContent).toBe('Rejected');
    expect(root.querySelector('.arcade-submission-detail')?.textContent).toContain('mismatch');

    view.updateSubmissionStatus({ kind: 'submission-failed', message: 'network down' });
    expect(root.querySelector('.arcade-result-badge')?.textContent).toBe('Unranked');
    expect(root.querySelector('.arcade-submission-message')?.textContent).toContain('saved locally');
  });
});
