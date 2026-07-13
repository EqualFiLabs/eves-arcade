import type { ArcadeGameManifest } from '../../arcade/types';
import { RPR_CONTRACT } from '@rpr/rug-pull-rumble-core/identity';

/**
 * Rug Pull Rumble manifest (Req 2.1, 3.5). The shell reads this synchronously
 * from the registry; `load()` is the dynamic-import seam that code-splits the
 * game (and Phaser) out of the shell payload.
 *
 * Landscape-only (Req 7.4). The module advertises reasoned suspension so the
 * shell can stop simulation while the orientation gate is active.
 */
export const rugPullRumbleManifest: ArcadeGameManifest = {
  contract: RPR_CONTRACT,
  title: 'Rug Pull Rumble',
  tagline: 'Sminem vs Bogdanoff — proof of fight',
  orientation: 'landscape',
  capabilities: { input: { keyboard: true, pointer: false, touch: true, gamepad: true }, suspension: true, replay: true },
  localBest: { metric: 'score', order: 'desc' },
  sessionLengthSec: [30, 180],
  leaderboards: [
    {
      id: 'rpr.score',
      label: 'Top Rumbles',
      metric: 'score',
      order: 'desc',
    },
  ],
  load: () => import('./index').then((m) => m.rugPullRumbleModule),
};
