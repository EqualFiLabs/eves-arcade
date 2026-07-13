import type { ArcadeGameManifest } from '../../arcade/types';
import { RPR_GAME_ID, RPR_GAME_VERSION } from '@rpr/rug-pull-rumble-core/identity';

/**
 * Rug Pull Rumble manifest (Req 2.1, 3.5). The shell reads this synchronously
 * from the registry; `load()` is the dynamic-import seam that code-splits the
 * game (and Phaser) out of the shell payload.
 *
 * Landscape-only (Req 7.4). Pause is not supported in V1 — the orientation gate
 * shows its rotate prompt without pausing when support is absent.
 */
export const rugPullRumbleManifest: ArcadeGameManifest = {
  id: RPR_GAME_ID,
  title: 'Rug Pull Rumble',
  tagline: 'Sminem vs Bogdanoff — proof of fight',
  version: RPR_GAME_VERSION,
  assetPrefix: 'rpr',
  orientation: 'landscape',
  supportsPause: false,
  sessionLengthSec: [30, 180],
  leaderboards: [
    {
      id: 'rpr.score',
      gameId: 'rug-pull-rumble',
      label: 'Top Rumbles',
      metric: 'score',
      order: 'desc',
    },
  ],
  load: () => import('./index').then((m) => m.rugPullRumbleModule),
};
