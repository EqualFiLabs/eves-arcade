import type { CanonicalGameResult, MetricPresentation, ResultPresentation } from './types';

export type SubmissionStatus =
  | { kind: 'unranked' }
  | { kind: 'submitting' }
  | { kind: 'verified'; result: CanonicalGameResult; placement?: { placement: number; totalEntries: number } }
  | { kind: 'rejected'; reason: string }
  | { kind: 'submission-failed'; message: string };

export interface ResultScreenHandle {
  updateSubmissionStatus(status: SubmissionStatus): void;
}

export interface ResultScreenOptions {
  gameTitle: string;
  result: CanonicalGameResult;
  presentation: ResultPresentation;
  submissionStatus: SubmissionStatus;
  localBest?: { value: number; presentation: MetricPresentation };
  onPlayAgain(): void;
  onBack(): void;
}

export function renderResultScreen(root: HTMLElement, options: ResultScreenOptions): ResultScreenHandle {
  const section = element('section', 'arcade-result');
  section.classList.add('arcade-scroll-surface');
  section.setAttribute('aria-labelledby', 'arcade-result-title');
  const heading = element('h2', `arcade-result-outcome arcade-${options.presentation.tone}`);
  heading.id = 'arcade-result-title';
  heading.tabIndex = -1;
  heading.textContent = options.presentation.headline;
  section.append(heading);

  const gameTitle = element('p', 'arcade-result-game');
  gameTitle.textContent = options.gameTitle;
  section.append(gameTitle);

  if (options.presentation.summary) {
    const summary = element('p', 'arcade-result-summary');
    summary.textContent = options.presentation.summary;
    section.append(summary);
  }

  const canonical = element('div', 'arcade-canonical');
  canonical.setAttribute('aria-live', 'polite');
  renderMetrics(canonical, options.result, options.presentation);
  section.append(canonical);

  const submission = element('div', 'arcade-submission-status');
  submission.setAttribute('role', 'status');
  submission.setAttribute('aria-live', 'polite');
  submission.setAttribute('aria-atomic', 'true');
  const badge = element('span', 'arcade-result-badge');
  const message = element('p', 'arcade-submission-message');
  const detail = element('p', 'arcade-submission-detail');
  submission.append(badge, message, detail);
  section.append(submission);

  if (options.localBest) {
    const best = element('div', 'arcade-result-best');
    best.textContent = `${options.localBest.presentation.label}: ${formatMetric(
      options.localBest.value,
      options.localBest.presentation,
    )}`;
    section.append(best);
  }

  if (options.presentation.showDuration) {
    const duration = element('div', 'arcade-result-duration');
    duration.textContent = `${Math.round(options.result.durationMs / 1000)}s`;
    section.append(duration);
  }

  renderShare(section, options.presentation);
  renderLinks(section, options.presentation);

  const actions = element('div', 'arcade-result-actions');
  const playAgain = button('Play Again', 'arcade-play-again', options.onPlayAgain);
  const back = button('← Arcade', 'arcade-back-to-arcade', options.onBack);
  actions.append(playAgain, back);
  section.append(actions);
  root.replaceChildren(section);
  heading.focus();

  const updateSubmissionStatus = (status: SubmissionStatus): void => {
    badge.className = `arcade-result-badge ${badgeClass(status)}`;
    badge.textContent = badgeText(status);
    message.textContent = status.kind === 'verified' && status.placement
      ? `Rank #${status.placement.placement} of ${status.placement.totalEntries}`
      : status.kind === 'rejected'
        ? 'This run could not be verified.'
        : status.kind === 'submission-failed'
          ? 'Submission failed — result saved locally.'
          : '';
    detail.textContent = status.kind === 'rejected'
      ? status.reason
      : status.kind === 'submission-failed'
        ? status.message
        : '';
    if (status.kind === 'verified') renderMetrics(canonical, status.result, options.presentation);
  };

  updateSubmissionStatus(options.submissionStatus);
  return { updateSubmissionStatus };
}

function renderMetrics(root: HTMLElement, result: CanonicalGameResult, presentation: ResultPresentation): void {
  root.replaceChildren();
  const primary = presentation.primaryMetric;
  if (primary && hasMetric(result, primary.metric)) {
    const score = element('div', 'arcade-result-score');
    score.append(`${primary.label} `);
    const value = element('strong');
    value.textContent = formatMetric(result.metrics[primary.metric]!, primary);
    score.append(value);
    root.append(score);
  }

  const stats = element('dl', 'arcade-result-stats');
  for (const metric of presentation.stats ?? []) {
    if (!hasMetric(result, metric.metric)) continue;
    const term = document.createElement('dt');
    term.textContent = metric.label;
    const value = document.createElement('dd');
    value.textContent = formatMetric(result.metrics[metric.metric]!, metric);
    stats.append(term, value);
  }
  if (stats.childElementCount > 0) root.append(stats);
}

function renderShare(root: HTMLElement, presentation: ResultPresentation): void {
  if (!presentation.share) return;
  const share = element('div', 'arcade-share');
  const text = element('p', 'arcade-share-text');
  text.textContent = presentation.share.text;
  share.append(text);

  const safeUrl = safeWebUrl(presentation.share.url);
  if (safeUrl) {
    const url = document.createElement('a');
    url.className = 'arcade-share-url';
    url.href = safeUrl;
    url.textContent = safeUrl;
    url.rel = 'noopener noreferrer';
    share.append(url);
  }

  const status = element('span', 'arcade-share-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const copyText = [presentation.share.text, safeUrl].filter(Boolean).join(' ');
  const copy = button('Copy', 'arcade-share-copy', () => {
    void copyToClipboard(copyText).then((copied) => {
      status.textContent = copied ? 'Copied!' : 'Copy unavailable';
    });
  });
  share.append(copy, status);
  root.append(share);
}

function renderLinks(root: HTMLElement, presentation: ResultPresentation): void {
  const links = element('nav', 'arcade-result-links');
  links.setAttribute('aria-label', 'Related links');
  for (const item of presentation.links ?? []) {
    const safeUrl = safeWebUrl(item.url);
    if (!safeUrl) continue;
    const link = document.createElement('a');
    link.className = 'arcade-result-link';
    link.href = safeUrl;
    link.textContent = item.label;
    link.rel = 'noopener noreferrer';
    links.append(link);
  }
  if (links.childElementCount > 0) root.append(links);
}

function badgeText(status: SubmissionStatus): string {
  switch (status.kind) {
    case 'verified': return 'Verified';
    case 'submitting': return 'Verifying';
    case 'rejected': return 'Rejected';
    default: return 'Unranked';
  }
}

function badgeClass(status: SubmissionStatus): string {
  switch (status.kind) {
    case 'verified': return 'arcade-ranked';
    case 'submitting': return 'arcade-submitting';
    case 'rejected': return 'arcade-rejected';
    default: return 'arcade-unranked';
  }
}

function formatMetric(value: number, presentation: MetricPresentation): string {
  return `${presentation.prefix ?? ''}${value.toFixed(presentation.fractionDigits ?? 0)}${presentation.suffix ?? ''}`;
}

function hasMetric(result: CanonicalGameResult, metric: string): boolean {
  return Number.isFinite(result.metrics[metric]);
}

function safeWebUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  return result;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const result = element('button', className);
  result.type = 'button';
  result.textContent = label;
  result.addEventListener('click', onClick);
  return result;
}
