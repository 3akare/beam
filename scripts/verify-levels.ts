// Checks every level: the empty board is unsolved, the stored solution solves it,
// its pieces are legally placed and within the inventory, and how much slack it has.
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
if (failed) process.exit(1);
console.log(`all ${LEVELS.length} levels verified`);
