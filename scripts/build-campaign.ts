// Curates levels 4–10 from the generator and writes them to src/game/campaign.json.
//   npm run campaign
// For each slot it generates candidates at that slot's complexity, measures them with the
// solver (effort) and validator (angle slack), and keeps the one closest to the slot's
// target effort, preferring forgiving levels and a different puzzle type from the last.
import { writeFileSync } from 'node:fs';
import { generateLevel, type Generated } from '../src/game/generator';
import { solve } from '../src/game/solver';
import type { Level } from '../src/game/types';

/** Complexity and target solver effort per slot: a gentle ramp after the 3 handcrafted levels. */
const SLOTS = [
  { complexity: 1.5, effort: 120 },
  { complexity: 2.2, effort: 200 },
  { complexity: 2.8, effort: 300 },
  { complexity: 3.4, effort: 500 },
  { complexity: 4, effort: 800 },
  { complexity: 4.8, effort: 1300 },
  { complexity: 5.5, effort: 2200 },
];
const CANDIDATES = 24;
const NAMES = ['first bend', 'new glass', 'open fan', 'one colour', 'bolted', 'the long way', 'full spectrum'];

const picked: Level[] = [];
let lastArchetype = 'split'; // level 3 is a split-and-steer; start with something else

SLOTS.forEach((slot, i) => {
  let best: { g: Generated; score: number; effort: number; slack: number } | null = null;
  for (let c = 0; c < CANDIDATES; c++) {
    const g = generateLevel({ seed: `campaign-${i}-${c}`, complexity: slot.complexity });
    // Effort: median of three solver runs (it's stochastic).
    const runs = [0, 1, 2].map((r) => solve(g.level, { budget: 40000, seed: `effort-${r}` })?.evaluations ?? 40000);
    const effort = runs.sort((a, b) => a - b)[1];
    const slack = Math.min(...g.validation.slack);
    const score =
      Math.abs(Math.log(effort / slot.effort)) + // close to the intended difficulty
      (slack < 1.5 ? 1 : 0) + // forgiving angles
      (g.recipe.archetype === lastArchetype ? 0.6 : 0) + // variety
      (g.level.targets.length > 1 && slot.complexity < 2 ? 0.5 : 0);
    if (!best || score < best.score) best = { g, score, effort, slack };
  }
  const { g, effort, slack } = best!;
  lastArchetype = g.recipe.archetype;
  const level: Level = { ...g.level, name: NAMES[i] };
  delete level.seed;
  delete level.complexity;
  picked.push(level);
  console.log(`level ${i + 4}: ${g.recipe.archetype.padEnd(6)} c${slot.complexity} effort ${effort} slack ±${slack}° "${level.name}"`);
});

// Round coordinates so the file stays small and readable.
const round = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v);
writeFileSync(new URL('../src/game/campaign.json', import.meta.url), JSON.stringify(picked, round) + '\n');
console.log(`wrote ${picked.length} levels to src/game/campaign.json`);
