// Checks every level: well-formed, starts unsolved, and is solvable.
// Breadth-first search over tap moves gives the shortest solution.
import { initialOrientations, trace, turnSet } from '../src/game/beam';
import { LEVELS } from '../src/game/levels';
import type { Level, Orientations } from '../src/game/types';

function check(level: Level, n: number): string[] {
  const errors: string[] = [];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < level.size && y < level.size;
  const taken = new Set<string>();
  const place = (what: string, x: number, y: number) => {
    if (!inside(x, y)) errors.push(`${what} at ${x},${y} is outside the grid`);
    const k = `${x},${y}`;
    if (taken.has(k)) errors.push(`${what} at ${x},${y} overlaps another cell`);
    taken.add(k);
  };
  place('core', level.core.x, level.core.y);
  level.walls.forEach(([x, y]) => place('wall', x, y));
  level.pieces.forEach((p) => place(`piece ${p.id}`, p.x, p.y));

  const { x: gx, y: gy } = level.gate;
  const onRim = (gx === -1 || gx === level.size) !== (gy === -1 || gy === level.size);
  const besideGrid = (gx >= 0 && gx < level.size) || (gy >= 0 && gy < level.size);
  if (!onRim || !besideGrid) errors.push(`gate ${gx},${gy} is not on an edge`);

  const ids = new Set(level.pieces.map((p) => p.id));
  for (const p of level.pieces) for (const t of p.turns ?? []) if (!ids.has(t)) errors.push(`piece ${p.id} turns unknown ${t}`);
  if (level.pieces.every((p) => p.follower)) errors.push('no touchable pieces');

  const start = initialOrientations(level);
  if (trace(level, start).escaped) errors.push('starts already solved');

  const touchable = level.pieces.filter((p) => !p.follower).map((p) => p.id);
  const stateKey = (o: Orientations) => level.pieces.map((p) => ((o[p.id] % 4) + 4) % 4).join('');
  const queue: [Orientations, string[]][] = [[start, []]];
  const seen = new Set([stateKey(start)]);
  let solution: string[] | null = null;
  while (queue.length && !solution) {
    const [o, moves] = queue.shift()!;
    for (const id of touchable) {
      const next = { ...o };
      for (const t of turnSet(level, id)) next[t] = (next[t] + 1) % 4;
      const k = stateKey(next);
      if (seen.has(k)) continue;
      seen.add(k);
      if (trace(level, next).escaped) {
        solution = [...moves, id];
        break;
      }
      queue.push([next, [...moves, id]]);
    }
  }
  if (!solution) errors.push('unsolvable');
  else console.log(`level ${n}: ok, shortest solution ${solution.length} taps (${solution.join(' ')}), ${seen.size} states`);
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
