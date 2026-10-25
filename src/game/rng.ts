/** Deterministic randomness: the same seed string always gives the same sequence. */
export type Rng = {
  (): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  /** Gaussian-ish noise (sum of uniforms), mean 0, roughly unit spread. */
  normal(): number;
};

/** xmur3 string hash → 32-bit seed. */
function hash(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG. */
export function makeRng(seed: string): Rng {
  let a = hash(seed);
  const next = (() => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(next.range(min, max + 1));
  next.pick = (items) => items[Math.floor(next() * items.length)];
  next.chance = (p) => next() < p;
  next.normal = () => (next() + next() + next() + next() - 2) * 1.7;
  return next;
}
