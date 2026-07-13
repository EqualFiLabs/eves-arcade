import * as Phaser from 'phaser';

/**
 * Curated per-game Phaser configuration. It deliberately exposes Phaser's
 * native subsystem configs without attempting to abstract physics or input.
 * Dimensions live only under `scale` in the resulting GameConfig.
 */
export interface PhaserGameConfigOptions {
  parent: HTMLElement | string;
  title: string;
  width: number | string;
  height: number | string;
  backgroundColor: string | number;
  scene: Phaser.Types.Core.GameConfig['scene'];
  renderer?: Phaser.Types.Core.GameConfig['type'];
  render?: Phaser.Types.Core.GameConfig['render'];
  scale?: Omit<Phaser.Types.Core.ScaleConfig, 'parent' | 'width' | 'height'>;
  physics?: Phaser.Types.Core.GameConfig['physics'];
  input?: Phaser.Types.Core.GameConfig['input'];
  callbacks?: Phaser.Types.Core.GameConfig['callbacks'];
  banner?: Phaser.Types.Core.GameConfig['banner'];
  url?: string;
  version?: string;
}

/**
 * Builds a Phaser 4 GameConfig from the curated game-owned options. The factory
 * supplies only neutral browser defaults; it does not decide whether a game's
 * presentation uses a Phaser physics system. RPR deliberately omits physics
 * because its deterministic combat core owns movement and collision.
 */
export function createGameConfig(options: PhaserGameConfigOptions): Phaser.Types.Core.GameConfig {
  return {
    type: options.renderer ?? Phaser.AUTO,
    backgroundColor: options.backgroundColor,
    title: options.title,
    ...(options.url ? { url: options.url } : {}),
    ...(options.version ? { version: options.version } : {}),
    banner: options.banner ?? false,
    disableContextMenu: true,
    scale: {
      mode: options.scale?.mode ?? Phaser.Scale.FIT,
      autoCenter: options.scale?.autoCenter ?? Phaser.Scale.CENTER_BOTH,
      ...options.scale,
      parent: options.parent,
      width: options.width,
      height: options.height,
    },
    ...(options.render ? { render: options.render } : {}),
    ...(options.physics ? { physics: options.physics } : {}),
    ...(options.input !== undefined ? { input: options.input } : {}),
    ...(options.callbacks ? { callbacks: options.callbacks } : {}),
    scene: options.scene,
  };
}
