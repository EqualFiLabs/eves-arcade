import type { ArcadeGameManifest } from './types';
import type { GameResult } from './types';
import { distributionHooks, shareCopy, gameCopy } from '@rpr/content';

/**
 * Shared DOM result screen (Req 4.1–4.6).
 *
 * Supersedes the in-Phaser `ResultScene`/`ShareView`/`DistributionHookView` from
 * `crypto-fighter-v1` Task 18 (DOM does this better and survives game teardown).
 * Copy and hook content come from `@rpr/content`; the shell calls
 * `renderResultScreen` after `ctx.onResult` fires.
 */

export interface ResultScreenOptions {
  result: GameResult;
  manifest: ArcadeGameManifest;
  submissionStatus: SubmissionStatus;
  /** Local personal best for unranked play (Req 11.3). */
  localBest: number;
  onPlayAgain(): void;
  onBack(): void;
}

export type SubmissionStatus =
  | { kind: 'unranked' }
  | { kind: 'submitting' }
  | { kind: 'verified'; canonicalScore: number; placement: number; totalEntries: number }
  | { kind: 'rejected'; reason: string }
  | { kind: 'submission-failed'; message: string };

export interface ResultScreenHandle {
  updateSubmissionStatus(status: SubmissionStatus): void;
}

/** Renders the result screen into `root` and wires up all actions. */
export function renderResultScreen(root: HTMLElement, opts: ResultScreenOptions): ResultScreenHandle {
  const { result, manifest, localBest, onPlayAgain, onBack } = opts;
  const won = result.outcome === 'win';
  const outcomeLabel = won
    ? (gameCopy.playerWin[0] ?? 'VICTORY')
    : (gameCopy.playerLoss[0] ?? 'DEFEAT');

  const shareLine = pick(won ? shareCopy.win : shareCopy.loss);
  const hooks = distributionHooks.filter((h) => h.enabled && /^https?:\/\//.test(h.url));

  const statsHtml = Object.entries(result.stats)
    .map(([k, v]) => `<dt>${escapeHtml(formatStatKey(k))}</dt><dd>${v}</dd>`)
    .join('');

  root.innerHTML = `
    <section class="arcade-result" aria-label="result screen">
      <h2 class="arcade-result-outcome ${won ? 'arcade-win' : 'arcade-loss'}">${escapeHtml(outcomeLabel)}</h2>
      <div class="arcade-result-game">${escapeHtml(manifest.title)}</div>
      <div class="arcade-result-score">Score <strong>${result.score}</strong></div>
      <div class="arcade-result-badge"></div>
      <div class="arcade-submission-message" hidden></div>
      ${opts.submissionStatus.kind === 'unranked' && localBest > 0 ? `<div class="arcade-result-best">Personal best: ${localBest}</div>` : ''}
      <dl class="arcade-result-stats">${statsHtml}</dl>
      <div class="arcade-result-duration">${formatDuration(result.durationMs)}</div>

      <div class="arcade-share">
        <p class="arcade-share-text">${escapeHtml(shareLine)}</p>
        <div class="arcade-share-url">${escapeHtml(shareCopy.url)}</div>
        <button class="arcade-share-copy" type="button">Copy</button>
        <span class="arcade-share-status" hidden></span>
      </div>

      ${hooks.length > 0 ? `
      <div class="arcade-hooks">
        ${hooks.map((h) => `<a class="arcade-hook" href="${escapeHtml(h.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(h.label)}</a>`).join('')}
      </div>` : ''}

      <div class="arcade-result-actions">
        <button class="arcade-play-again" type="button">Play Again</button>
        <button class="arcade-back-to-arcade" type="button">← Arcade</button>
      </div>

      <details class="arcade-result-debug">
        <summary>Technical details</summary>
        <dl>
          <dt>Game</dt><dd>${escapeHtml(result.gameId)} v${escapeHtml(result.gameVersion)}</dd>
          <dt>Build</dt><dd>${escapeHtml(result.buildVersion)}</dd>
          <dt>Seed</dt><dd>${result.seed}</dd>
          <dt>Trace hash</dt><dd><code>${escapeHtml(result.inputTraceHash)}</code></dd>
          <dt>Replay hash</dt><dd><code>${escapeHtml(result.replayHash)}</code></dd>
          <dt>Submission</dt><dd class="arcade-submission-detail"></dd>
        </dl>
      </details>
    </section>
  `;

  // Clipboard copy with visible-text fallback (Req 14.5/14.6)
  const copyBtn = root.querySelector<HTMLButtonElement>('.arcade-share-copy');
  const status = root.querySelector<HTMLElement>('.arcade-share-status');
  copyBtn?.addEventListener('click', async () => {
    const text = `${shareLine} ${shareCopy.url}`;
    try {
      await navigator.clipboard.writeText(text);
      showStatus(status, 'Copied!');
    } catch {
      // Fallback: select the visible text so the user can manually copy
      const range = document.createRange();
      range.selectNode(root.querySelector('.arcade-share-text')!);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      showStatus(status, 'Selected — press Ctrl+C');
    }
  });

  root.querySelector<HTMLButtonElement>('.arcade-play-again')?.addEventListener('click', onPlayAgain);
  root.querySelector<HTMLButtonElement>('.arcade-back-to-arcade')?.addEventListener('click', onBack);

  const handle: ResultScreenHandle = {
    updateSubmissionStatus(status) {
      updateSubmissionStatus(root, status);
    },
  };
  handle.updateSubmissionStatus(opts.submissionStatus);
  return handle;
}

function updateSubmissionStatus(root: HTMLElement, status: SubmissionStatus): void {
  const badge = root.querySelector<HTMLElement>('.arcade-result-badge');
  const message = root.querySelector<HTMLElement>('.arcade-submission-message');
  const detail = root.querySelector<HTMLElement>('.arcade-submission-detail');
  const score = root.querySelector<HTMLElement>('.arcade-result-score strong');
  if (!badge || !message || !detail) return;

  badge.className = 'arcade-result-badge';
  message.hidden = true;
  message.textContent = '';

  switch (status.kind) {
    case 'unranked':
      badge.classList.add('arcade-unranked');
      badge.textContent = 'Unranked';
      detail.textContent = 'Local session — not submitted';
      break;
    case 'submitting':
      badge.classList.add('arcade-submitting');
      badge.textContent = 'Verifying';
      message.hidden = false;
      message.textContent = 'Replaying your run on the server…';
      detail.textContent = 'Submission pending';
      break;
    case 'verified':
      badge.classList.add('arcade-ranked');
      badge.textContent = 'Verified';
      message.hidden = false;
      message.textContent = `Rank #${status.placement} of ${status.totalEntries}`;
      detail.textContent = `Accepted — canonical score ${status.canonicalScore}`;
      if (score) score.textContent = String(status.canonicalScore);
      break;
    case 'rejected':
      badge.classList.add('arcade-rejected');
      badge.textContent = 'Rejected';
      message.hidden = false;
      message.textContent = 'This run could not be verified.';
      detail.textContent = status.reason;
      break;
    case 'submission-failed':
      badge.classList.add('arcade-unranked');
      badge.textContent = 'Unranked';
      message.hidden = false;
      message.textContent = 'Submission failed — result saved locally.';
      detail.textContent = status.message;
      break;
  }
}

function showStatus(el: HTMLElement | null, msg: string): void {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 2000);
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function formatStatKey(k: string): string {
  const labels: Record<string, string> = {
    damageDealt: 'Damage Dealt',
    damageTaken: 'Damage Taken',
    frames: 'Sim Frames',
  };
  return labels[k] ?? k;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${s}s`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
