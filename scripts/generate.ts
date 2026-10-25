// Generate levels from the command line and report on them.
//   npm run generate -- --seed demo --complexity 5 --count 10
//   npm run generate -- --seed demo --sweep          (complexity 1..10)
import { generateLevel, validateLevel } from '../src/game/generator';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const seed = flag('seed', 'beam');
const count = Number(flag('count', '5'));
const complexities = args.includes('--sweep') ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [Number(flag('complexity', '3'))];
const json = args.includes('--json');

for (const c of complexities) {
  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    const g = generateLevel({ seed: `${seed}-${c}-${i}`, complexity: c });
    const ms = performance.now() - t0;
    const effort = validateLevel(g.level, { shortcutBudget: 0, effortBudget: 60000 }).effort;
    if (json) {
      console.log(JSON.stringify(g.level));
      continue;
    }
    const pieces = `${g.level.inventory.mirror}m ${g.level.inventory.prism}p${g.level.fixed ? ` +${g.level.fixed.length} fixed` : ''}`;
    console.log(
      [
        `c${c}`.padEnd(4),
        g.recipe.archetype.padEnd(7),
        `"${g.level.name}"`.padEnd(20),
        pieces.padEnd(14),
        `${g.level.targets.length}t ${g.level.walls.length}w`.padEnd(8),
        `slack ±${Math.min(...g.validation.slack)}°`.padEnd(12),
        `effort ${effort ?? '>60000'}`.padEnd(14),
        `${g.attempts} tries, ${ms.toFixed(0)}ms`,
      ].join(' '),
    );
  }
}
