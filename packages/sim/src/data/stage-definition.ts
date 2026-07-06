/**
 * Stage definition schema.
 *
 * Authored in `@rpr/content`; the sim uses world bounds + floor for movement
 * and collision, while apps/web uses camera/asset fields for presentation.
 */
import type { Box } from '../primitives';
import type { StageId } from '../primitives';

/** Camera framing used by the Phaser stage camera to keep both fighters visible. */
export interface StageCameraConfig {
  minZoom: number;
  maxZoom: number;
  /** Deadzone width as a fraction of viewport width (0–1). */
  deadZoneWidth: number;
  /** Deadzone height as a fraction of viewport height (0–1). */
  deadZoneHeight: number;
}

/** Copy keys resolving to stage name/subtitle in the content copy module. */
export interface StageCopyKeys {
  name: string;
  subtitle?: string;
}

/** Complete definition of a playable stage. */
export interface StageDefinition {
  id: StageId;
  displayName: string;
  /** World-space play area bounds. */
  worldBounds: Box;
  /** Anchor Y of the floor; fighters clamp here when grounded. */
  floorY: number;
  camera: StageCameraConfig;
  /** Background image/layer asset keys, resolved by the stage renderer. */
  backgroundAssetKeys: string[];
  /** Foreground overlay asset keys. */
  foregroundAssetKeys: string[];
  /** Optional stage theme audio key. */
  audioKey?: string;
  copyKeys: StageCopyKeys;
}
