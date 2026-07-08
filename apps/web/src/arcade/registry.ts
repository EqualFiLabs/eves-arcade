import type { ArcadeGameManifest } from './types';
import { rugPullRumbleManifest } from '../games/rug-pull-rumble/manifest';

/**
 * The registry of registered arcade games (Req 1.1). One item today; adding a
 * game means appending its manifest here and nothing else in the shell.
 */
export const REGISTRY: readonly ArcadeGameManifest[] = [rugPullRumbleManifest];
