/**
 * Compile-time fixtures proving the platform contract represents distinct game
 * formats. Runtime behavior belongs to each real game module; these descriptors
 * intentionally exercise only the shared contract surface.
 */
import type { ArcadeGameManifest, ArcadeGameModule } from './types';

const inertModule: ArcadeGameModule = {
  launch() {
    return { ready: Promise.resolve(), async destroy() {} };
  },
};

const load = async (): Promise<ArcadeGameModule> => inertModule;
const loadReplay = async () => ({
  launch: () => ({
    ready: Promise.resolve(),
    progress: Object.freeze({ frame: 0, totalFrames: 0, playing: false, speed: 1 as const }),
    play() {}, pause() {}, step() {}, setSpeed() {}, async destroy() {},
  }),
});

export const PLATFORM_CONTRACT_EXAMPLES = [
  {
    contract: {
      game: { id: 'example-fighter', version: '1.0.0' },
      resultSchema: { id: 'fighter.result', version: 1 },
      verification: { kind: 'input-trace', schema: { id: 'fighter.input', version: 1 }, encodingVersion: 2 },
    },
    title: 'Example Fighter',
    orientation: 'landscape',
    capabilities: { input: { keyboard: true, pointer: false, touch: true, gamepad: true }, suspension: true },
    replay: { load: loadReplay },
    leaderboards: [{ id: 'fighter.wins', label: 'Wins', metric: 'wins', order: 'desc' }],
    localBest: { metric: 'score', label: 'Best Score', order: 'desc' },
    load,
  },
  {
    contract: {
      game: { id: 'example-launcher', version: '2.1.0' },
      resultSchema: { id: 'launcher.result', version: 3 },
      verification: { kind: 'input-trace', schema: { id: 'launcher.commands', version: 4 }, encodingVersion: 2 },
    },
    title: 'Example Launcher',
    orientation: 'portrait',
    capabilities: { input: { keyboard: true, pointer: true, touch: true, gamepad: false }, suspension: true },
    replay: { load: loadReplay },
    leaderboards: [{ id: 'launcher.distance', label: 'Distance', metric: 'distance', order: 'desc' }],
    localBest: { metric: 'distance', label: 'Longest Flight', order: 'desc', fractionDigits: 1, suffix: ' km' },
    load,
  },
  {
    contract: {
      game: { id: 'example-score-only', version: '1.0.0' },
      resultSchema: { id: 'score.result', version: 1 },
      verification: { kind: 'none' },
    },
    title: 'Example Score Attack',
    orientation: 'any',
    capabilities: { input: { keyboard: false, pointer: true, touch: true, gamepad: false }, suspension: false },
    leaderboards: [],
    localBest: { metric: 'points', label: 'Best Points', order: 'desc' },
    load,
  },
  {
    contract: {
      game: { id: 'example-unranked', version: '0.1.0' },
      resultSchema: { id: 'sandbox.result', version: 1 },
      verification: { kind: 'none' },
    },
    title: 'Example Sandbox',
    orientation: 'any',
    capabilities: { input: { keyboard: true, pointer: true, touch: false, gamepad: false }, suspension: true },
    leaderboards: [],
    load,
  },
] as const satisfies readonly ArcadeGameManifest[];
