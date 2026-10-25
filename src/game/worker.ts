// Generates levels off the main thread so hard ones (up to ~2 s) never stall the game.
import { generateLevel } from './generator';

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

export interface GenRequest {
  id: number;
  seed: string;
  complexity: number;
}

self.onmessage = (e: MessageEvent<GenRequest>) => {
  const { id, seed, complexity } = e.data;
  try {
    const g = generateLevel({ seed, complexity });
    post({ id, level: g.level, archetype: g.recipe.archetype, slack: g.validation.slack });
  } catch (err) {
    post({ id, error: String(err) });
  }
};
