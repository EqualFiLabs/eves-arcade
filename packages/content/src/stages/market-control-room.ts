import { type StageDefinition, stageId } from '@rpr/sim';

export const MARKET_CONTROL_ROOM_ID = stageId('marketControlRoom');

/**
 * V1 stage — the Market Control Room. Asset keys are placeholders resolved by
 * the asset manifest / stage renderer; real art lands in a later task.
 */
export const marketControlRoom: StageDefinition = {
  id: MARKET_CONTROL_ROOM_ID,
  displayName: 'Market Control Room',
  worldBounds: { x: -640, y: 0, width: 1280, height: 720 },
  floorY: 600,
  camera: {
    minZoom: 0.85,
    maxZoom: 1.15,
    deadZoneWidth: 0.4,
    deadZoneHeight: 0.5,
  },
  backgroundAssetKeys: ['stage_marketcontrol_bg', 'stage_marketcontrol_mid'],
  foregroundAssetKeys: ['stage_marketcontrol_fg'],
  audioKey: 'stage_marketcontrol_theme',
  copyKeys: {
    name: 'stage_marketcontrol_name',
    subtitle: 'stage_marketcontrol_subtitle',
  },
};
