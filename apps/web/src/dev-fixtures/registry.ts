import type { ArcadeGameManifest } from '../arcade/types';
import { defineArcadeRegistry } from '../arcade/contracts';
import { ANALOG_CONTRACT, BUTTON_CONTRACT, UNRANKED_CONTRACT } from './core';

export const FIXTURE_REGISTRY: readonly ArcadeGameManifest[] = defineArcadeRegistry([
  {
    contract: BUTTON_CONTRACT,
    title: 'Button Fixture',
    tagline: 'Ranked digital input',
    orientation: 'landscape',
    capabilities: {
      input: { keyboard: true, pointer: false, touch: false, gamepad: false },
      suspension: true,
    },
    leaderboards: [
      { id: 'fixture.button.score', label: 'Button Score', metric: 'score', order: 'desc' },
    ],
    localBest: { metric: 'score', label: 'Button Best', order: 'desc' },
    replay: {
      load: async () => {
        const { fixtureReplayAdapter } = await import('./replay');
        return fixtureReplayAdapter('Button Fixture');
      },
    },
    load: () => import('./button-game').then((module) => module.buttonFixtureModule),
  },
  {
    contract: ANALOG_CONTRACT,
    title: 'Analog Fixture',
    tagline: 'Ranked quantized axes',
    orientation: 'portrait',
    capabilities: {
      input: { keyboard: true, pointer: true, touch: true, gamepad: false },
      suspension: true,
    },
    leaderboards: [
      { id: 'fixture.analog.distance', label: 'Analog Distance', metric: 'distance', order: 'desc' },
    ],
    localBest: {
      metric: 'distance', label: 'Distance Best', order: 'desc', fractionDigits: 3,
    },
    replay: {
      load: async () => {
        const { fixtureReplayAdapter } = await import('./replay');
        return fixtureReplayAdapter('Analog Fixture');
      },
    },
    load: () => import('./analog-game').then((module) => module.analogFixtureModule),
  },
  {
    contract: UNRANKED_CONTRACT,
    title: 'Unranked Fixture',
    tagline: 'No ticket, no leaderboard',
    orientation: 'any',
    capabilities: {
      input: { keyboard: true, pointer: false, touch: false, gamepad: false },
      suspension: true,
    },
    leaderboards: [],
    load: () => import('./unranked-game').then((module) => module.unrankedFixtureModule),
  },
]);
