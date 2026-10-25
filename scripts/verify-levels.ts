// Checks every level: the empty board is unsolved, the stored solution solves it,
// its pieces are legally placed and within the inventory, and how much slack it has.
import { generateLevel, validateLevel } from '../src/game/generator';
import { canPlace, solved } from '../src/game/optics';
import { LEVELS } from '../src/game/levels';
import type { Level, Placement } from '../src/game/types';

function check(level: Level, n: number): string[] {
  const errors: string[] = [];
  if (solved(level, [])) errors.push('solved with an empty board');

  for (const kind of ['mirror', 'prism'] as const) {
    const used = level.solution.filter((p) => p.kind === kind).length;
    if (used > level.inventory[kind]) errors.push(`solution uses ${used} ${kind}(s), inventory has ${level.inventory[kind]}`);
  }
  level.solution.forEach((p, i) => {
    const others = level.solution.filter((_, j) => j !== i);
    if (!canPlace(level, others, p)) errors.push(`solution ${p.kind} at ${p.x},${p.y} is not a legal spot`);
  });
  if (!solved(level, level.solution)) errors.push('stored solution does not solve it');

  // Angle slack: how far each piece can be turned (in 0.5° steps) and still solve.
  const slack = level.solution.map((p, i) => {
    let deg = 0;
    const turned = (d: number): Placement[] =>
      level.solution.map((q, j) => (j === i ? { ...q, angle: q.angle + (d * Math.PI) / 180 } : q));
    while (deg < 10 && solved(level, turned(deg + 0.5)) && solved(level, turned(-(deg + 0.5)))) deg += 0.5;
    return `${p.kind} ±${deg}°`;
  });
  if (!errors.length) console.log(`level ${n} "${level.name}": ok (${slack.join(', ')})`);
  return errors;
}

let failed = false;
LEVELS.forEach((level, i) => {
  const errors = check(level, i + 1);
  for (const e of errors) console.error(`level ${i + 1}: ${e}`);
  failed ||= errors.length > 0;
});
console.log(`all ${LEVELS.length} handcrafted levels verified`);

// The generator: one level per complexity step must come out valid, and the same seed
// must always give the same level.
for (let c = 1; c <= 10; c++) {
  const seed = `verify-${c}`;
  const a = generateLevel({ seed, complexity: c });
  const b = generateLevel({ seed, complexity: c });
  const v = validateLevel(a.level, { minSlack: a.recipe.minSlack });
  const same = JSON.stringify(a.level) === JSON.stringify(b.level);
  const status = v.ok && same ? 'ok' : `FAIL ${v.problems.join('; ')}${same ? '' : ' (not deterministic)'}`;
  console.log(`generated c${c} ${a.recipe.archetype.padEnd(6)} "${a.level.name}": ${status}`);
  failed ||= !(v.ok && same);
}
if (failed) process.exit(1);
console.log('all checks passed');
