import campaign from './campaign.json';
import { LEVELS } from './levels';
import type { Level } from './types';

/**
 * The game: 3 handcrafted levels, then 7 curated from the generator ahead of time
 * (`npm run campaign`), so nothing is generated while you play.
 */
export const CAMPAIGN: Level[] = [...LEVELS, ...(campaign as Level[])];

/**
 * A one-off generated puzzle for `?seed=…&complexity=…`. The generator lives in a worker
 * that is only downloaded when this is used, so normal play never pays for it.
 */
export function customLevel(seed: string, complexity: number): Promise<Level> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.level);
    };
    worker.postMessage({ id: 1, seed, complexity });
  });
}
