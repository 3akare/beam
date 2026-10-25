import { LEVELS } from './levels';
import type { Level } from './types';

/** Endless mode: the n-th level of a run (0-based, after the handcrafted ones) and its complexity. */
export function endlessComplexity(n: number) {
  return Math.round(Math.min(10, 1.5 + n * 0.6) * 10) / 10;
}

/**
 * Where levels come from: the handcrafted tutorial first, then an endless run of generated
 * levels. Generation happens in a worker and the next level is prefetched.
 */
export class LevelSource {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<number, (level: Level) => void>();
  private cache = new Map<string, Promise<Level>>();
  private nextId = 1;

  constructor(readonly runSeed: string) {
    this.worker.onmessage = (e) => {
      const { id, level, error } = e.data;
      if (error) console.error(error);
      this.pending.get(id)?.(level);
      this.pending.delete(id);
    };
  }

  get handcrafted() {
    return LEVELS.length;
  }

  /** Generate (or reuse) a level for an explicit seed and complexity. */
  custom(seed: string, complexity: number): Promise<Level> {
    const key = `${seed}|${complexity}`;
    let p = this.cache.get(key);
    if (!p) {
      p = new Promise((resolve) => {
        const id = this.nextId++;
        this.pending.set(id, resolve);
        this.worker.postMessage({ id, seed, complexity });
      });
      this.cache.set(key, p);
    }
    return p;
  }

  /** Level by overall index: handcrafted first, then generated. */
  level(index: number): Promise<Level> {
    if (index < LEVELS.length) return Promise.resolve(LEVELS[index]);
    const n = index - LEVELS.length;
    return this.custom(`${this.runSeed}:${n}`, endlessComplexity(n));
  }

  /** Start generating a level ahead of time. */
  prefetch(index: number) {
    if (index >= LEVELS.length) void this.level(index);
  }
}
