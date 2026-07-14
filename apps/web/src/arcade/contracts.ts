import type { ArcadeGameManifest, GameCompletion, MetricPresentation } from './types';

export class ArcadeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArcadeContractError';
  }
}

/** Validates the complete static shell contract and rejects ambiguous registries. */
export function defineArcadeRegistry(
  manifests: readonly ArcadeGameManifest[],
): readonly ArcadeGameManifest[] {
  const games = new Set<string>();
  const categories = new Set<string>();
  for (const manifest of manifests) {
    validateManifest(manifest);
    const gameKey = `${manifest.contract.game.id}@${manifest.contract.game.version}`;
    if (games.has(gameKey)) fail(`Duplicate game registration: ${gameKey}`);
    games.add(gameKey);
    for (const category of manifest.leaderboards) {
      if (categories.has(category.id)) fail(`Duplicate leaderboard category: ${category.id}`);
      categories.add(category.id);
    }
  }
  return Object.freeze([...manifests]);
}

export function validateManifest(manifest: ArcadeGameManifest): void {
  validateIdentity(manifest.contract.game.id, manifest.contract.game.version, 'game');
  validateIdentity(
    manifest.contract.resultSchema.id,
    manifest.contract.resultSchema.version,
    'result schema',
  );
  if (!manifest.title.trim()) fail('Game title cannot be empty');
  if (!['landscape', 'portrait', 'any'].includes(manifest.orientation)) {
    fail(`Unsupported game orientation: ${String(manifest.orientation)}`);
  }
  if (typeof manifest.load !== 'function') fail('Game manifest must provide a module loader');

  const verification = manifest.contract.verification;
  if (verification.kind === 'input-trace') {
    validateIdentity(verification.schema.id, verification.schema.version, 'input schema');
    if (!Number.isSafeInteger(verification.encodingVersion) || verification.encodingVersion < 1) {
      fail('Trace encoding version must be a positive safe integer');
    }
    if (!manifest.capabilities.suspension) fail('Ranked games must support suspension');
    if (!manifest.replay || typeof manifest.replay.load !== 'function') {
      fail('Ranked games must provide a replay adapter');
    }
  } else if (manifest.leaderboards.length > 0) {
    fail('Unranked games cannot declare verified leaderboards');
  }

  for (const category of manifest.leaderboards) {
    if (!category.id.trim() || !category.label.trim() || !category.metric.trim()) {
      fail('Leaderboard categories require id, label, and metric');
    }
    if (category.order !== 'asc' && category.order !== 'desc') {
      fail(`Leaderboard ${category.id} has an invalid order`);
    }
  }
  if (manifest.localBest) validateMetricPresentation(manifest.localBest, 'local best');
}

/** Validates game-owned terminal data before the shell tears the game down. */
export function validateCompletion(
  manifest: ArcadeGameManifest,
  completion: GameCompletion,
): void {
  const expected = manifest.contract.resultSchema;
  const actual = completion.result.schema;
  if (actual.id !== expected.id || actual.version !== expected.version) {
    fail(`Result schema does not match ${expected.id}@${expected.version}`);
  }
  if (!completion.result.outcome.trim()) fail('Result outcome cannot be empty');
  if (!Number.isFinite(completion.result.durationMs) || completion.result.durationMs < 0) {
    fail('Result duration must be a finite non-negative number');
  }
  for (const [metric, value] of Object.entries(completion.result.metrics)) {
    if (!metric.trim() || !Number.isFinite(value)) fail(`Result metric ${metric || '<empty>'} is invalid`);
  }

  const verification = manifest.contract.verification;
  if (verification.kind === 'none') {
    if (completion.evidence.kind !== 'none') fail('Unranked games cannot provide ranked evidence');
  } else {
    if (completion.evidence.kind !== 'input-trace') fail('Ranked games must provide input trace evidence');
    if (completion.evidence.schema.id !== verification.schema.id
      || completion.evidence.schema.version !== verification.schema.version) {
      fail('Completion input schema does not match the manifest');
    }
    if (completion.evidence.encodingVersion !== verification.encodingVersion) {
      fail('Completion trace encoding does not match the manifest');
    }
    if (!(completion.evidence.bytes instanceof Uint8Array)) fail('Completion trace must be bytes');
    if (!completion.result.replayHash?.trim()) fail('Ranked results must provide a replay hash');
  }

  const presentations = [
    completion.presentation.primaryMetric,
    ...(completion.presentation.stats ?? []),
  ].filter((entry): entry is MetricPresentation => entry !== undefined);
  for (const presentation of presentations) {
    validateMetricPresentation(presentation, 'result presentation');
    if (!(presentation.metric in completion.result.metrics)) {
      fail(`Result presentation references missing metric: ${presentation.metric}`);
    }
  }
}

function validateMetricPresentation(value: MetricPresentation, label: string): void {
  if (!value.metric.trim() || !value.label.trim()) fail(`${label} requires a metric and label`);
  if (value.fractionDigits !== undefined
    && (!Number.isSafeInteger(value.fractionDigits)
      || value.fractionDigits < 0
      || value.fractionDigits > 20)) {
    fail(`${label} fraction digits must be between 0 and 20`);
  }
}

function validateIdentity(id: string, version: string | number, label: string): void {
  if (!id.trim()) fail(`${label} id cannot be empty`);
  if (typeof version === 'number') {
    if (!Number.isSafeInteger(version) || version < 1) fail(`${label} version must be positive`);
  } else if (!version.trim()) {
    fail(`${label} version cannot be empty`);
  }
}

function fail(message: string): never {
  throw new ArcadeContractError(message);
}
