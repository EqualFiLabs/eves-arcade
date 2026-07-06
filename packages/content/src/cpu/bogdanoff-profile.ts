import { type CpuProfile } from '@rpr/sim';

/**
 * Default V1 Bogdanoff CPU profile — first-pass tuning values (final tuning is
 * Task 22). Balanced so a first-time player can win with blocking and spacing
 * (Req 8.9) while still losing if they mash carelessly (Req 8.10). Difficulty
 * changes these behavior parameters rather than damage (Req 9.8).
 */
export const bogdanoffCpuProfile: CpuProfile = {
  id: 'bogdanoff-v1',
  reactionFrames: 4,
  aggression: 0.5,
  blockChance: 0.35,
  punishChance: 0.45,
  throwPressureChance: 0.25,
  specialChance: 0.15,
  randomSeedOffset: 0,
};
