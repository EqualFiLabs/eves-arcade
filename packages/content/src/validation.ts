/**
 * V1 content bundle + validation helpers.
 *
 * `validateContent` runs the V1 contract checks required by Task 3.9 / the
 * design's `content-validation.test.ts`: required fighters, moves, and stage
 * exist and are internally consistent; fighter move references resolve; stage
 * asset keys exist in the manifest; copy is present; distribution hooks and
 * asset licenses are well-formed.
 */
import type {
  FighterDefinition,
  FighterDefinitionId,
  MoveDefinition,
  MoveId,
  StageDefinition,
  StageId,
} from '@rpr/sim';

import type { AssetEntry } from './assets/asset-manifest';
import { assetManifest } from './assets/asset-manifest';
import { bogdanoffDefinition } from './fighters/bogdanoff';
import { sminemDefinition } from './fighters/sminem';
import { bogdanoffMoves } from './moves/bogdanoff-moves';
import { sminemMoves } from './moves/sminem-moves';
import { marketControlRoom } from './stages/market-control-room';
import type { DistributionHook } from './distribution/distribution-hooks';
import { distributionHooks } from './distribution/distribution-hooks';
import type { GameCopy } from './copy/game-copy';
import { gameCopy } from './copy/game-copy';

// --- V1 contract: required content IDs ---

export const REQUIRED_V1_FIGHTER_IDS: readonly FighterDefinitionId[] = [
  sminemDefinition.id,
  bogdanoffDefinition.id,
];

/** All V1 move IDs that must be present. `activate_global_dump` is an optional boss super. */
export const REQUIRED_V1_MOVE_IDS: readonly MoveId[] = [...sminemMoves, ...bogdanoffMoves]
  .map((m) => m.id)
  .filter((id) => String(id) !== 'activate_global_dump');

export const REQUIRED_V1_STAGE_ID: StageId = marketControlRoom.id;

// --- Content bundle ---

export interface V1Content {
  fighters: FighterDefinition[];
  moves: MoveDefinition[];
  stages: StageDefinition[];
  copy: GameCopy;
  distributionHooks: DistributionHook[];
  assets: AssetEntry[];
}

export function getV1Content(): V1Content {
  return {
    fighters: [sminemDefinition, bogdanoffDefinition],
    moves: [...sminemMoves, ...bogdanoffMoves],
    stages: [marketControlRoom],
    copy: gameCopy,
    distributionHooks,
    assets: assetManifest,
  };
}

// --- Validation result ---

export interface ContentValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// --- Helpers ---

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

// --- Main validator ---

export function validateContent(content: V1Content = getV1Content()): ContentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const movesById = new Map<MoveId, MoveDefinition>();
  for (const move of content.moves) {
    if (movesById.has(move.id)) {
      errors.push(`Duplicate move id: ${String(move.id)}`);
    }
    movesById.set(move.id, move);
  }

  const fightersById = new Map<FighterDefinitionId, FighterDefinition>();
  for (const fighter of content.fighters) {
    if (fightersById.has(fighter.id)) {
      errors.push(`Duplicate fighter id: ${String(fighter.id)}`);
    }
    fightersById.set(fighter.id, fighter);
  }

  const stagesById = new Map<StageId, StageDefinition>();
  for (const stage of content.stages) {
    stagesById.set(stage.id, stage);
  }

  const assetKeys = new Set(content.assets.map((a) => a.key));

  // 1. Required fighters.
  for (const id of REQUIRED_V1_FIGHTER_IDS) {
    if (!fightersById.has(id)) {
      errors.push(`Missing required fighter definition: ${String(id)}`);
    }
  }

  // 2. Required moves (already excludes the optional boss super).
  for (const id of REQUIRED_V1_MOVE_IDS) {
    if (!movesById.has(id)) {
      errors.push(`Missing required move definition: ${String(id)}`);
    }
  }

  // 3. Each move is internally consistent.
  for (const move of content.moves) {
    const prefix = `Move ${String(move.id)}`;
    if (move.startupFrames < 0) errors.push(`${prefix}: startupFrames must be >= 0`);
    if (move.activeFrames <= 0) errors.push(`${prefix}: activeFrames must be > 0`);
    if (move.recoveryFrames < 0) errors.push(`${prefix}: recoveryFrames must be >= 0`);
    if (move.damage < 0) errors.push(`${prefix}: damage must be >= 0`);
    if (move.chipDamage < 0) errors.push(`${prefix}: chipDamage must be >= 0`);
    if (move.meterCost < 0) errors.push(`${prefix}: meterCost must be >= 0`);

    const activeStart = move.startupFrames;
    const activeEnd = move.startupFrames + move.activeFrames - 1;
    for (const box of move.hitboxes) {
      const bp = `${prefix} hitbox`;
      if (box.width <= 0 || box.height <= 0) errors.push(`${bp}: dimensions must be > 0`);
      if (box.frameStart > box.frameEnd) errors.push(`${bp}: frameStart > frameEnd`);
      if (box.frameStart < activeStart || box.frameEnd > activeEnd) {
        errors.push(`${bp}: frames ${box.frameStart}-${box.frameEnd} outside active ${activeStart}-${activeEnd}`);
      }
    }
  }

  // 4. Each fighter's move map resolves and slots are valid.
  for (const fighter of content.fighters) {
    const fp = `Fighter ${String(fighter.id)}`;
    if (fighter.maxHealth <= 0) errors.push(`${fp}: maxHealth must be > 0`);
    if (fighter.maxMeter < 0) errors.push(`${fp}: maxMeter must be >= 0`);
    if (!Number.isInteger(fighter.maxAirJumps) || fighter.maxAirJumps < 0) {
      errors.push(`${fp}: maxAirJumps must be a non-negative integer`);
    }
    const slots: Array<['lightHigh' | 'lightLow' | 'heavyHigh' | 'heavyLow' | 'special' | 'super', MoveId | undefined]> = [
      ['lightHigh', fighter.moves.lightHigh],
      ['lightLow', fighter.moves.lightLow],
      ['heavyHigh', fighter.moves.heavyHigh],
      ['heavyLow', fighter.moves.heavyLow],
      ['special', fighter.moves.special],
      ['super', fighter.moves.super],
    ];
    for (const [slot, id] of slots) {
      if (id === undefined) {
        if (slot === 'super') {
          // optional
        } else {
          errors.push(`${fp}: missing required move slot '${slot}'`);
        }
        continue;
      }
      if (!movesById.has(id)) {
        errors.push(`${fp}: move slot '${slot}' references unknown move ${String(id)}`);
      }
    }
    if (fighter.animationKeys.idle.length === 0) errors.push(`${fp}: missing idle animation key`);
  }

  // 5. Required stage present + asset keys resolve.
  const stage = stagesById.get(REQUIRED_V1_STAGE_ID);
  if (!stage) {
    errors.push(`Missing required stage: ${String(REQUIRED_V1_STAGE_ID)}`);
  } else {
    if (stage.backgroundAssetKeys.length === 0) {
      errors.push(`Stage ${String(stage.id)}: no background asset keys`);
    }
    for (const key of stage.backgroundAssetKeys) {
      if (!assetKeys.has(key)) errors.push(`Stage ${String(stage.id)}: asset key '${key}' missing from manifest`);
    }
    for (const key of stage.foregroundAssetKeys) {
      if (!assetKeys.has(key)) errors.push(`Stage ${String(stage.id)}: fg asset key '${key}' missing from manifest`);
    }
    if (stage.audioKey && !assetKeys.has(stage.audioKey)) {
      errors.push(`Stage ${String(stage.id)}: audio key '${stage.audioKey}' missing from manifest`);
    }
    if (stage.camera.deadZoneWidth < 0 || stage.camera.deadZoneWidth > 1) {
      errors.push(`Stage ${String(stage.id)}: deadZoneWidth must be in [0,1]`);
    }
    if (stage.camera.deadZoneHeight < 0 || stage.camera.deadZoneHeight > 1) {
      errors.push(`Stage ${String(stage.id)}: deadZoneHeight must be in [0,1]`);
    }
  }

  // 6. Copy required fields.
  const c = content.copy;
  if (!c.title.trim()) errors.push('Copy: title is empty');
  if (!c.subtitle.trim()) errors.push('Copy: subtitle is empty');
  for (const field of ['roundStart', 'fightStart', 'playerWin', 'playerLoss', 'ko'] as const) {
    if (c[field].length === 0) errors.push(`Copy: ${field} has no lines`);
  }
  if (!c.restartHint.trim()) errors.push('Copy: restartHint is empty');
  if (!c.muteHint.trim()) errors.push('Copy: muteHint is empty');
  if (!c.unsupportedBrowser.trim()) errors.push('Copy: unsupportedBrowser is empty');

  // 7. Distribution hooks: unique ids, enabled hooks need valid URLs.
  const hookIds = new Set<string>();
  for (const hook of content.distributionHooks) {
    if (hookIds.has(hook.id)) errors.push(`Distribution hook: duplicate id '${hook.id}'`);
    hookIds.add(hook.id);
    if (!hook.label.trim()) errors.push(`Distribution hook '${hook.id}': empty label`);
    if (hook.enabled && !isHttpUrl(hook.url)) {
      errors.push(`Distribution hook '${hook.id}': enabled hook needs http(s) url`);
    }
  }

  // 8. Asset manifest: unique keys, licensed entries need attribution.
  const seenAssetKeys = new Set<string>();
  for (const asset of content.assets) {
    if (seenAssetKeys.has(asset.key)) errors.push(`Asset manifest: duplicate key '${asset.key}'`);
    seenAssetKeys.add(asset.key);
    if (!asset.path.trim()) errors.push(`Asset '${asset.key}': empty path`);
    if (asset.license && asset.license.type.toUpperCase() !== 'CC0' && !(asset.license.attribution ?? '').trim()) {
      errors.push(`Asset '${asset.key}': license '${asset.license.type}' requires attribution`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
