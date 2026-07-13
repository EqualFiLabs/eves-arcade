// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderResultScreen } from '../../apps/web/src/arcade/result-screen';
import type { CanonicalGameResult, ResultPresentation } from '../../apps/web/src/arcade/types';

const result: CanonicalGameResult = {
  schema: { id: 'rpr.result', version: 1 },
  outcome: 'loss',
  metrics: { score: 10, damage: 2, distance: 14.25 },
  durationMs: 1000,
  replayHash: '1'.repeat(64),
};

const presentation: ResultPresentation = {
  headline: 'Defeat',
  summary: 'The market moved against you.',
  tone: 'negative',
  primaryMetric: { metric: 'score', label: 'Score' },
  stats: [{ metric: 'damage', label: 'Damage' }],
  showDuration: true,
  share: { text: 'I survived the rumble.', url: '/play' },
};

describe('generic result screen', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.replaceChildren(root);
  });

  it('does not label a pending ticket as ranked', () => {
    render({ kind: 'submitting' });
    expect(root.querySelector('.arcade-result-badge')?.textContent).toBe('Verifying');
    expect(root.textContent).not.toContain('Ranked');
  });

  it('replaces displayed metrics with the canonical verified result', () => {
    const view = render({ kind: 'submitting' });
    view.updateSubmissionStatus({
      kind: 'verified',
      result: { ...result, metrics: { ...result.metrics, score: 99 } },
      placement: { placement: 2, totalEntries: 10 },
    });
    expect(root.querySelector('.arcade-result-badge')?.textContent).toBe('Verified');
    expect(root.querySelector('.arcade-result-score strong')?.textContent).toBe('99');
    expect(root.querySelector('.arcade-submission-message')?.textContent).toBe('Rank #2 of 10');
  });

  it('renders rejection and network failure without claiming verification', () => {
    const view = render({ kind: 'submitting' });
    view.updateSubmissionStatus({ kind: 'rejected', reason: 'Canonical result mismatch' });
    expect(root.querySelector('.arcade-result-badge')?.textContent).toBe('Rejected');
    expect(root.querySelector('.arcade-submission-detail')?.textContent).toContain('mismatch');

    view.updateSubmissionStatus({ kind: 'submission-failed', message: 'network down' });
    expect(root.querySelector('.arcade-result-badge')?.textContent).toBe('Unranked');
    expect(root.querySelector('.arcade-submission-message')?.textContent).toContain('saved locally');
  });

  it('supports scoreless and differently formatted game results', () => {
    renderResultScreen(root, {
      result,
      presentation: {
        headline: 'Docked', tone: 'neutral',
        primaryMetric: { metric: 'distance', label: 'Distance', fractionDigits: 1, suffix: ' km' },
      },
      submissionStatus: { kind: 'unranked' },
      localBest: 0,
      onPlayAgain() {},
      onBack() {},
    });
    expect(root.querySelector('.arcade-result-score')?.textContent).toBe('Distance 14.3 km');
    expect(root.textContent).not.toContain('Damage');
  });

  it('treats game copy as text and omits unsafe URLs', () => {
    renderResultScreen(root, {
      result,
      presentation: {
        headline: '<img src=x onerror=alert(1)>',
        tone: 'neutral',
        share: { text: '<b>not markup</b>', url: 'javascript:alert(1)' },
        links: [{ label: 'bad', url: 'data:text/html,bad' }, { label: 'safe', url: '/safe' }],
      },
      submissionStatus: { kind: 'unranked' },
      localBest: 0,
      onPlayAgain() {},
      onBack() {},
    });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.arcade-result-outcome')?.textContent).toContain('<img');
    expect(root.querySelector('.arcade-share-url')).toBeNull();
    expect([...root.querySelectorAll('.arcade-result-links a')].map((link) => link.textContent)).toEqual(['safe']);
  });

  it('copies the safe share payload', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render({ kind: 'unranked' });
    (root.querySelector('.arcade-share-copy') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('I survived'));
      expect(root.querySelector('.arcade-share-status')?.textContent).toBe('Copied!');
    });
  });

  function render(submissionStatus: Parameters<typeof renderResultScreen>[1]['submissionStatus']) {
    return renderResultScreen(root, {
      result,
      presentation,
      submissionStatus,
      localBest: 0,
      onPlayAgain() {},
      onBack() {},
    });
  }
});
