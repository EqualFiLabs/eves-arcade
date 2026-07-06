/**
 * Deterministic seeded pseudo-random number generator.
 *
 * Pure TypeScript (no DOM, no crypto). Used by the CPU brain so that fight
 * behavior is reproducible from the match seed (Property: deterministic sim).
 * Algorithm: mulberry32 — small, fast, and good distribution for game AI use.
 */

/** A deterministic, mutable PRNG that produces floats in [0, 1). */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Re-seeds the generator, resetting the sequence. */
  reseed(seed: number): void {
    this.state = seed >>> 0;
  }

  /** Returns the next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in the inclusive range [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }
}
