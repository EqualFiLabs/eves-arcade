/**
 * Asset manifest — keys, source paths, and licensing metadata.
 *
 * Apps/web imports this to drive Phaser's loader; content validation cross-
 * checks referenced keys. Any licensed asset MUST carry attribution (Req 17.6).
 */

export type AssetKind = 'image' | 'audio' | 'atlas' | 'font';

export interface AssetLicense {
  /** License identifier (e.g. "CC0", "CC-BY-4.0", "proprietary"). */
  type: string;
  /** Rights holder / author. */
  holder?: string;
  /** Required attribution text, if the license demands one. */
  attribution?: string;
}

export interface AssetEntry {
  key: string;
  /** Path relative to the web app's public/ assets dir. */
  path: string;
  kind: AssetKind;
  /** License metadata. Absent ⇒ original/proprietary to the project. */
  license?: AssetLicense;
}

/**
 * V1 placeholder manifest. Keys referenced by fighters/stage/moves are listed
 * here with placeholder paths; real assets are produced in later art tasks.
 */
export const assetManifest: AssetEntry[] = [
  // Stage
  { key: 'stage_marketcontrol_bg', path: 'assets/stage/marketcontrol-bg.png', kind: 'image' },
  { key: 'stage_marketcontrol_mid', path: 'assets/stage/marketcontrol-mid.png', kind: 'image' },
  { key: 'stage_marketcontrol_fg', path: 'assets/stage/marketcontrol-fg.png', kind: 'image' },
  { key: 'stage_marketcontrol_theme', path: 'assets/audio/stage-marketcontrol.ogg', kind: 'audio' },

  // UI / fight SFX
  { key: 'sfx_punch_light', path: 'assets/audio/punch-light.ogg', kind: 'audio' },
  { key: 'sfx_punch_heavy', path: 'assets/audio/punch-heavy.ogg', kind: 'audio' },
  { key: 'sfx_block', path: 'assets/audio/block.ogg', kind: 'audio' },
  { key: 'sfx_hit', path: 'assets/audio/hit.ogg', kind: 'audio' },
  { key: 'sfx_ko', path: 'assets/audio/ko.ogg', kind: 'audio' },

  // Sminem SFX
  { key: 'sfx_sminem_attack', path: 'assets/audio/sminem-attack.ogg', kind: 'audio' },
  { key: 'sfx_sminem_hit', path: 'assets/audio/sminem-hit.ogg', kind: 'audio' },
  { key: 'sfx_sminem_ko', path: 'assets/audio/sminem-ko.ogg', kind: 'audio' },
  { key: 'sfx_green_candle', path: 'assets/audio/green-candle.ogg', kind: 'audio' },
  { key: 'sfx_bull_run', path: 'assets/audio/bull-run.ogg', kind: 'audio' },

  // Bogdanoff SFX
  { key: 'sfx_bogdanoff_attack', path: 'assets/audio/bogdanoff-attack.ogg', kind: 'audio' },
  { key: 'sfx_bogdanoff_hit', path: 'assets/audio/bogdanoff-hit.ogg', kind: 'audio' },
  { key: 'sfx_bogdanoff_ko', path: 'assets/audio/bogdanoff-ko.ogg', kind: 'audio' },
  { key: 'sfx_phone_slam', path: 'assets/audio/phone-slam.ogg', kind: 'audio' },
  { key: 'sfx_red_candle', path: 'assets/audio/red-candle.ogg', kind: 'audio' },
  { key: 'sfx_global_dump', path: 'assets/audio/global-dump.ogg', kind: 'audio' },
];
