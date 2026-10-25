import { canPlace, trace } from './optics';
import { makeRng, type Rng } from './rng';
import type { Level, PieceKind, Placement, Vec } from './types';

const MISS = 6;

function distToSegment(p: Vec, a: Vec, b: Vec) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len2 = ex * ex + ey * ey || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2));
  return Math.hypot(p.x - (a.x + ex * t), p.y - (a.y + ey * t));
}

/**
 * How far the board is from solved: for each unlit target, the distance from it to the
 * nearest beam of its colour (MISS if there is none). 0 means every target is lit.
 */
export function missDistance(level: Level, placed: Placement[]): number {
  const r = trace(level, placed);
  let total = 0;
  level.targets.forEach((t, i) => {
    if (r.lit[i]) return;
    let best = MISS;
    for (const s of r.segments) if (!s.inside && s.color === t.color) best = Math.min(best, distToSegment(t, s.a, s.b));
    total += best;
  });
  return total;
}

export interface SolveResult {
  placed: Placement[];
  evaluations: number;
}

/** A spot somewhere on the current light path, so a new piece actually touches the beam. */
function onBeam(level: Level, placed: Placement[], rng: Rng): Vec | null {
  const segs = trace(level, placed).segments.filter((s) => !s.inside);
  const total = segs.reduce((n, s) => n + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0);
  if (!total) return null;
  let pick = rng() * total;
  for (const s of segs) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (pick <= len) {
      const k = pick / len;
      return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k };
    }
    pick -= len;
  }
  return null;
}

/**
 * Stochastic solver: seeds pieces onto the beam, then anneals positions and angles to
 * shrink the miss distance, with restarts. It can find solutions but can't prove there
 * are none — solvability is proven by replaying a level's stored solution instead.
 */
export function solve(
  level: Level,
  opts: { inventory?: Record<PieceKind, number>; budget?: number; seed?: string } = {},
): SolveResult | null {
  const inv = opts.inventory ?? level.inventory;
  const budget = opts.budget ?? 20000;
  const rng = makeRng(opts.seed ?? 'solver');
  const kinds: PieceKind[] = [...Array(inv.prism).fill('prism'), ...Array(inv.mirror).fill('mirror')];
  let evaluations = 0;

  if (missDistance(level, []) === 0) return { placed: [], evaluations: 1 };
  if (!kinds.length) return null;

  while (evaluations < budget) {
    // Fresh start: drop pieces one by one onto wherever the light currently goes.
    const placed: Placement[] = [];
    for (const kind of kinds) {
      let spot: Placement | null = null;
      for (let tries = 0; tries < 12 && !spot; tries++) {
        const p = onBeam(level, placed, rng) ?? { x: rng.range(0.5, level.width - 0.5), y: rng.range(0.5, level.height - 0.5) };
        const cand = { kind, x: p.x + rng.normal() * 0.05, y: p.y + rng.normal() * 0.05, angle: rng.range(0, Math.PI * 2) };
        if (canPlace(level, placed, cand)) spot = cand;
      }
      if (spot) placed.push(spot);
    }
    if (!placed.length) {
      evaluations++;
      continue;
    }
    let cur = missDistance(level, placed);
    evaluations++;
    let temp = 1;
    for (let step = 0; step < 500 && evaluations < budget; step++) {
      if (cur === 0) return { placed, evaluations };
      const i = rng.int(0, placed.length - 1);
      const old = placed[i];
      const roll = rng();
      const next: Placement =
        roll < 0.45
          ? { ...old, angle: old.angle + rng.normal() * (0.02 + 0.3 * temp) }
          : roll < 0.9
            ? { ...old, x: old.x + rng.normal() * (0.03 + 0.5 * temp), y: old.y + rng.normal() * (0.03 + 0.5 * temp) }
            : { ...old, ...(onBeam(level, placed.filter((_, j) => j !== i), rng) ?? old), angle: rng.range(0, Math.PI * 2) };
      const others = placed.filter((_, j) => j !== i);
      if (!canPlace(level, others, next)) continue;
      placed[i] = next;
      const s = missDistance(level, placed);
      evaluations++;
      if (s <= cur || rng() < Math.exp((cur - s) / (0.4 * temp))) cur = s;
      else placed[i] = old;
      temp = Math.max(0.02, temp * 0.992);
    }
  }
  return null;
}
