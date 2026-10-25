import { BANDS, canPlace, emitterOrigin, EMITTER_RADIUS, solved, TARGET_RADIUS, trace, type BeamSegment } from './optics';
import { makeRng, type Rng } from './rng';
import { missDistance, solve } from './solver';
import type { Band, Level, LightColor, PieceKind, Placement, Rect, Target, Vec } from './types';

/**
 * Puzzle archetypes. Each is a recipe for the hidden solution the generator builds first.
 * - bounce: mirrors steer white light to one white target.
 * - split: a prism fans white light onto three colour targets.
 * - pick: a prism, then one band is steered alone onto its target.
 * - steer: a prism, then two bands are each steered by their own mirror.
 */
export type Archetype = 'bounce' | 'split' | 'pick' | 'steer';

export interface Recipe {
  archetype: Archetype;
  width: number;
  height: number;
  /** Mirrors before the prism (or in total, for bounce). */
  leadMirrors: number;
  /** Bands steered by their own mirror after the prism. */
  steered: number;
  /** Solution pieces given to the player pre-placed and bolted down. */
  fixedPieces: number;
  /** Spare pieces in the inventory that the solution doesn't need. */
  decoys: number;
  walls: number;
  /** Smallest angle slack (degrees, each way) a solution piece may have. */
  minSlack: number;
}

/** How the complexity "salt" turns into a recipe. Higher complexity: longer chains, more walls, tighter angles. */
export function recipeFor(complexity: number, rng: Rng): Recipe {
  const c = Math.max(1, Math.min(10, complexity));
  const archetypes: [Archetype, number][] = [
    ['bounce', c < 3 ? 3 : 1.5],
    ['split', c < 2 ? 0 : c < 5 ? 2 : 1],
    ['pick', c < 3 ? 0 : 1.5],
    ['steer', c < 5 ? 0 : 1 + (c - 5) * 0.4],
  ];
  const total = archetypes.reduce((n, [, w]) => n + w, 0);
  let roll = rng() * total;
  const archetype = archetypes.find(([, w]) => (roll -= w) < 0)?.[0] ?? 'bounce';
  const big = c >= 6;
  return {
    archetype,
    width: big ? 14 : 12,
    height: big ? 9 : 8,
    leadMirrors:
      archetype === 'bounce' ? Math.min(4, 1 + Math.floor((c - 1) / 2.5) + (rng.chance(0.3) ? 1 : 0)) : Math.min(2, Math.floor((c - 1) / 3.5)),
    steered: archetype === 'pick' ? 1 : archetype === 'steer' ? 2 : 0,
    fixedPieces: c >= 4 && rng.chance(0.35 + c * 0.03) ? 1 : 0,
    decoys: c >= 7 && rng.chance(0.5) ? 1 : 0,
    walls: 2 + Math.floor(c * 0.9),
    minSlack: c < 4 ? 1.5 : c < 7 ? 1 : 0.5,
  };
}

const TINTS = ['#ff4d3d', '#ff3d9a', '#ffa23d', '#3dd6ff', '#b46bff', '#3dff9e'];
const NAMES_A = ['quiet', 'bright', 'hollow', 'folded', 'distant', 'broken', 'slow', 'hidden', 'second', 'last'];
const NAMES_B = ['light', 'spectrum', 'corner', 'bend', 'signal', 'glass', 'path', 'echo', 'fan', 'arc'];

const add = (a: Vec, d: Vec, k: number): Vec => ({ x: a.x + d.x * k, y: a.y + d.y * k });
const unit = (a: number): Vec => ({ x: Math.cos(a), y: Math.sin(a) });
const len = (s: BeamSegment) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

function distToSegment(p: Vec, a: Vec, b: Vec) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey || 1e-9)));
  return Math.hypot(p.x - (a.x + ex * t), p.y - (a.y + ey * t));
}

/** Shortest distance between a segment and a rectangle (0 if they touch). */
function segmentRectDistance(a: Vec, b: Vec, r: Rect) {
  // Sample along the segment; walls and beams are short, so this is plenty precise.
  let best = Infinity;
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
  for (let i = 0; i <= n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
    const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
    best = Math.min(best, Math.hypot(p.x - cx, p.y - cy));
  }
  return best;
}

const DETENT = (5 * Math.PI) / 180;
const onGrid = (a: number) => Math.round(a / DETENT) * DETENT;

/** Mirror angle that turns direction `din` into `dout`. */
function mirrorFor(din: Vec, dout: Vec) {
  const nx = dout.x - din.x;
  const ny = dout.y - din.y;
  return Math.atan2(ny, nx) + Math.PI / 2;
}

function inside(level: { width: number; height: number }, p: Vec, margin: number) {
  return p.x >= margin && p.y >= margin && p.x <= level.width - margin && p.y <= level.height - margin;
}

/** The last outside-glass segment of each colour, i.e. where each beam finally goes. */
function finalSegments(segs: BeamSegment[]) {
  const out = new Map<LightColor, BeamSegment>();
  for (const s of segs) if (!s.inside) out.set(s.color, s);
  return out;
}

interface Draft {
  level: Level;
  pieces: Placement[];
}

/** Lay a mirror on the beam leaving `seg`'s start, turning it sharply enough to matter. */
function placeMirrorOn(draft: Draft, seg: BeamSegment, rng: Rng, minDist = 1.4): Placement | null {
  const d = { x: (seg.b.x - seg.a.x) / len(seg), y: (seg.b.y - seg.a.y) / len(seg) };
  for (let tries = 0; tries < 30; tries++) {
    const dist = rng.range(minDist, Math.min(len(seg) - 0.9, minDist + 4.5));
    if (dist < minDist) return null;
    const p = add(seg.a, d, dist);
    if (!inside(draft.level, p, 1.1)) continue;
    const turn = (rng.chance(0.5) ? 1 : -1) * rng.range((40 * Math.PI) / 180, (140 * Math.PI) / 180);
    // Snap the mirror to the 5° grid players turn on, then see where light actually goes.
    const angle = onGrid(mirrorFor(d, unit(Math.atan2(d.y, d.x) + turn)));
    const n = { x: -Math.sin(angle), y: Math.cos(angle) };
    const k = 2 * (d.x * n.x + d.y * n.y);
    const dout = { x: d.x - k * n.x, y: d.y - k * n.y };
    const m: Placement = { kind: 'mirror', x: p.x, y: p.y, angle };
    if (!canPlace(draft.level, draft.pieces, m)) continue;
    // The new direction needs some room before it hits the board edge.
    const ahead = add(p, dout, 2.2);
    if (!inside(draft.level, ahead, 0.6)) continue;
    return m;
  }
  return null;
}

/** Build the hidden solution: a chain of pieces along the beam. */
function buildSolution(recipe: Recipe, base: Level, rng: Rng): Draft | null {
  const draft: Draft = { level: { ...base, targets: [], walls: [] }, pieces: [] };
  const beam = () => trace(draft.level, draft.pieces).segments;
  const lastWhite = () => [...beam()].reverse().find((s) => s.color === 'white' && !s.inside)!;

  for (let i = 0; i < recipe.leadMirrors; i++) {
    const m = placeMirrorOn(draft, lastWhite(), rng);
    if (!m) return null;
    draft.pieces.push(m);
  }
  if (recipe.archetype === 'bounce') return draft;

  // The prism: somewhere along the white beam, at an angle that splits all three bands apart.
  const seg = lastWhite();
  const d = { x: (seg.b.x - seg.a.x) / len(seg), y: (seg.b.y - seg.a.y) / len(seg) };
  let prismOk = false;
  for (let tries = 0; tries < 60 && !prismOk; tries++) {
    const dist = rng.range(1.3, Math.min(len(seg) - 1.2, 5));
    if (dist < 1.3) break;
    const p = add(seg.a, d, dist);
    const prism: Placement = { kind: 'prism', x: p.x, y: p.y, angle: rng.int(0, 71) * DETENT };
    if (!inside(draft.level, p, 1.3) || !canPlace(draft.level, draft.pieces, prism)) continue;
    const fin = finalSegments(trace(draft.level, [...draft.pieces, prism]).segments);
    const bands = BANDS.map((b) => fin.get(b));
    if (bands.some((s) => !s || len(s) < 3)) continue;
    // Bands must leave as a fan, not a single overlapping ray.
    const ends = bands.map((s) => add(s!.a, { x: (s!.b.x - s!.a.x) / len(s!), y: (s!.b.y - s!.a.y) / len(s!) }, 3));
    const spread = Math.min(...ends.flatMap((a, i) => ends.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
    if (spread < 0.35) continue;
    draft.pieces.push(prism);
    prismOk = true;
  }
  if (!prismOk) return null;

  // Steer some bands on their own: a mirror only that band touches.
  const order = rng.chance(0.5) ? [...BANDS] : [...BANDS].reverse();
  for (const band of order.slice(0, recipe.steered)) {
    let ok = false;
    for (let tries = 0; tries < 20 && !ok; tries++) {
      const fin = finalSegments(beam());
      const s = fin.get(band)!;
      const m = placeMirrorOn(draft, s, rng, 1.2);
      if (!m) continue;
      const before = finalSegments(beam());
      const after = finalSegments(trace(draft.level, [...draft.pieces, m]).segments);
      // Other bands must be untouched by this mirror.
      const others = BANDS.filter((b) => b !== band);
      if (others.some((b) => before.get(b)!.b.x !== after.get(b)?.b.x || before.get(b)!.b.y !== after.get(b)?.b.y)) continue;
      if (len(after.get(band)!) < 2.2) continue;
      draft.pieces.push(m);
      ok = true;
    }
    if (!ok) return null;
  }
  return draft;
}

/** Put targets on the solution's final beams, spaced apart and off the other beams. */
function placeTargets(recipe: Recipe, draft: Draft, rng: Rng): Target[] | null {
  const segs = trace(draft.level, draft.pieces).segments;
  const fin = finalSegments(segs);
  const colors: LightColor[] =
    recipe.archetype === 'bounce' ? ['white'] : recipe.archetype === 'pick' ? [order(rng)[0]] : recipe.archetype === 'steer' ? [...BANDS] : [...BANDS];
  // In "pick", the steered band is the one to hit.
  if (recipe.archetype === 'pick') {
    const steeredBand = BANDS.find((b) => draft.pieces.length && fin.get(b) && isSteered(draft, b));
    if (steeredBand) colors[0] = steeredBand;
  }
  const targets: Target[] = [];
  for (const color of colors) {
    const s = fin.get(color);
    if (!s) return null;
    let spot: Target | null = null;
    for (let tries = 0; tries < 40 && !spot; tries++) {
      const k = rng.range(0.35, 0.9);
      const p = { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k, color };
      if (!inside(draft.level, p, 0.9)) continue;
      if (Math.hypot(p.x - s.a.x, p.y - s.a.y) < 1.2) continue;
      if (targets.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 1.1)) continue;
      if (draft.pieces.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1.1)) continue;
      if (Math.hypot(p.x - draft.level.emitter.x, p.y - draft.level.emitter.y) < 1.4) continue;
      // Keep clear of beams of other colours, so a target never steals another's light.
      if (segs.some((g) => g.color !== color && !g.inside && distToSegment(p, g.a, g.b) < TARGET_RADIUS + 0.12)) continue;
      spot = p;
    }
    if (!spot) return null;
    targets.push(spot);
  }
  return targets;
}

function order(rng: Rng): Band[] {
  const b = [...BANDS];
  for (let i = b.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Whether a band's beam is redirected by a mirror after leaving the prism. */
function isSteered(draft: Draft, band: Band) {
  const segs = trace(draft.level, draft.pieces).segments.filter((s) => s.color === band && !s.inside);
  return segs.length >= 2;
}

/** Walls: first ones block the obvious shortcuts, the rest add structure. None may touch the solution's light. */
function placeWalls(recipe: Recipe, draft: Draft, level: Level, rng: Rng): Rect[] {
  const solutionSegs = trace({ ...level, walls: [] }, draft.pieces).segments;
  const walls: Rect[] = [];
  const clear = (r: Rect) => {
    if (r.x < 0 || r.y < 0 || r.x + r.w > level.width || r.y + r.h > level.height) return false;
    if (solutionSegs.some((s) => segmentRectDistance(s.a, s.b, r) < 0.28)) return false;
    const blocked = [...draft.pieces, ...level.targets, level.emitter];
    const reach = (p: Vec) => {
      const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
      return Math.hypot(p.x - cx, p.y - cy);
    };
    if (blocked.some((p) => reach(p) < 0.85)) return false;
    return walls.every((w) => !(r.x < w.x + w.w + 0.5 && r.x + r.w + 0.5 > w.x && r.y < w.y + w.h + 0.5 && r.y + r.h + 0.5 > w.y));
  };
  const snap = (v: number) => Math.round(v * 10) / 10;
  const wallAcross = (p: Vec, d: Vec) => {
    // A short wall perpendicular to direction d, centred on p.
    const vertical = Math.abs(d.x) > Math.abs(d.y);
    const length = rng.range(1.4, 2.6);
    return vertical
      ? { x: snap(p.x - 0.2), y: snap(p.y - length / 2), w: 0.4, h: snap(length) }
      : { x: snap(p.x - length / 2), y: snap(p.y - 0.2), w: snap(length), h: 0.4 };
  };

  // Shortcut blockers: walls across the white beam's straight run past the first piece, and
  // across the direct line from the emitter toward each target.
  const firstPiece = draft.pieces[0];
  const o = emitterOrigin(level);
  const ed = unit(level.emitter.angle);
  const blockerSpots: [Vec, Vec][] = [];
  if (firstPiece) {
    const along = (firstPiece.x - o.x) * ed.x + (firstPiece.y - o.y) * ed.y;
    for (const extra of [1.3, 2.2, 3.2]) blockerSpots.push([add(o, ed, along + extra), ed]);
  }
  for (const t of level.targets) {
    const d = { x: t.x - o.x, y: t.y - o.y };
    const L = Math.hypot(d.x, d.y);
    const u = { x: d.x / L, y: d.y / L };
    for (const k of [0.45, 0.6, 0.75]) blockerSpots.push([add(o, u, L * k), u]);
  }
  for (const [p, d] of blockerSpots) {
    const r = wallAcross(p, d);
    if (clear(r)) walls.push(r);
  }

  for (let tries = 0; tries < 400 && walls.length < recipe.walls; tries++) {
    const horizontal = rng.chance(0.5);
    const length = rng.range(1.2, 4.5);
    const r = horizontal
      ? { x: snap(rng.range(0, level.width - length)), y: snap(rng.range(0.6, level.height - 1)), w: snap(length), h: 0.4 }
      : { x: snap(rng.range(0.6, level.width - 1)), y: snap(rng.range(0, level.height - length)), w: 0.4, h: snap(length) };
    if (clear(r)) walls.push(r);
  }
  return walls;
}

export interface Validation {
  ok: boolean;
  problems: string[];
  /** Degrees each way each solution piece can turn and still solve. */
  slack: number[];
  /** Solver evaluations to find a solution with the full inventory (lower = easier), or null if it gave up. */
  effort: number | null;
}

/**
 * Validates a level: solvable (its stored solution replays), not already solved,
 * humanly precise (every piece has angle slack), and no cheaper solution exists within
 * the solver's budget (so the level needs every piece it hands out).
 */
export function validateLevel(level: Level, opts: { minSlack?: number; shortcutBudget?: number; effortBudget?: number } = {}): Validation {
  const problems: string[] = [];
  if (!solved(level, level.solution)) problems.push('stored solution does not solve it');
  if (solved(level, [])) problems.push('already solved with nothing placed');
  for (const kind of ['mirror', 'prism'] as PieceKind[]) {
    if (level.solution.filter((p) => p.kind === kind).length > level.inventory[kind]) problems.push(`solution needs more ${kind}s than the inventory has`);
  }
  level.solution.forEach((p, i) => {
    if (!canPlace(level, level.solution.filter((_, j) => j !== i), p)) problems.push(`solution ${p.kind} ${i} sits in an illegal spot`);
  });

  const slack = level.solution.map((_, i) => {
    let deg = 0;
    const turned = (d: number) => level.solution.map((q, j) => (j === i ? { ...q, angle: q.angle + (d * Math.PI) / 180 } : q));
    while (deg < 10 && solved(level, turned(deg + 0.25)) && solved(level, turned(-(deg + 0.25)))) deg += 0.25;
    return deg;
  });
  const minSlack = opts.minSlack ?? 0.5;
  if (slack.some((s) => s < minSlack)) problems.push(`a piece needs angles finer than ±${minSlack}°`);

  // Shortcuts: can it be done with one piece fewer of any kind?
  const shortcutBudget = opts.shortcutBudget ?? 4000;
  for (const kind of ['mirror', 'prism'] as PieceKind[]) {
    const needed = level.solution.filter((p) => p.kind === kind).length;
    if (!needed) continue;
    const fewer = { ...level.inventory, [kind]: needed - 1 };
    if (solve(level, { inventory: fewer, budget: shortcutBudget, seed: `shortcut-${kind}` })) problems.push(`solvable with one ${kind} fewer`);
  }

  const effortBudget = opts.effortBudget ?? 0;
  const effort = effortBudget ? (solve(level, { budget: effortBudget, seed: 'effort' })?.evaluations ?? null) : null;
  return { ok: problems.length === 0, problems, slack, effort };
}

export interface GenerateOptions {
  seed: string;
  /** 1 (gentle) to 10 (hard). The "salt" that scales difficulty. */
  complexity: number;
  /** How hard the validator searches for shortcuts (solver evaluations per check). */
  shortcutBudget?: number;
  maxAttempts?: number;
}

export interface Generated {
  level: Level;
  recipe: Recipe;
  attempts: number;
  validation: Validation;
}

/**
 * Generate a solvable level from a seed and a complexity. Same inputs, same level.
 * Builds the solution first, then the board around it, then validates; retries with a
 * derived seed until a candidate passes.
 */
export function generateLevel(opts: GenerateOptions): Generated {
  const maxAttempts = opts.maxAttempts ?? 400;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rng = makeRng(`${opts.seed}#${attempt}`);
    const recipe = recipeFor(opts.complexity, rng);
    const W = recipe.width;
    const H = recipe.height;

    // Emitter on a random side, pointing inward, slightly angled at higher complexity.
    const side = rng.int(0, 3);
    const tilt = opts.complexity >= 4 ? rng.range(-0.3, 0.3) : 0;
    const emitter =
      side === 0
        ? { x: 0.9, y: rng.range(1.2, H - 1.2), angle: 0 + tilt }
        : side === 1
          ? { x: W - 0.9, y: rng.range(1.2, H - 1.2), angle: Math.PI + tilt }
          : side === 2
            ? { x: rng.range(1.2, W - 1.2), y: 0.9, angle: Math.PI / 2 + tilt }
            : { x: rng.range(1.2, W - 1.2), y: H - 0.9, angle: -Math.PI / 2 + tilt };

    const base: Level = {
      name: `${rng.pick(NAMES_A)} ${rng.pick(NAMES_B)}`,
      width: W,
      height: H,
      emitter,
      walls: [],
      targets: [],
      inventory: { mirror: 0, prism: 0 },
      solution: [],
      tint: rng.pick(TINTS),
      seed: opts.seed,
      complexity: opts.complexity,
    };

    const draft = buildSolution(recipe, base, rng);
    if (!draft || !draft.pieces.length) continue;
    const targets = placeTargets(recipe, draft, rng);
    if (!targets) continue;

    let level: Level = { ...base, targets };
    level = { ...level, walls: placeWalls(recipe, draft, level, rng) };

    // Some solution pieces are given pre-placed and bolted; the rest go in the inventory.
    const pieces = [...draft.pieces];
    const fixed: Placement[] = [];
    for (let i = 0; i < recipe.fixedPieces && pieces.length > 1; i++) fixed.push(pieces.splice(rng.int(0, pieces.length - 1), 1)[0]);
    const count = (k: PieceKind) => pieces.filter((p) => p.kind === k).length;
    level = {
      ...level,
      fixed: fixed.length ? fixed : undefined,
      solution: pieces,
      inventory: {
        mirror: count('mirror') + (recipe.decoys && rng.chance(0.6) ? 1 : 0),
        prism: count('prism') + (recipe.decoys && count('prism') && rng.chance(0.4) ? 1 : 0),
      },
    };
    if (!pieces.length) continue;
    // Cheap rejects before the expensive shortcut search.
    if (missDistance(level, []) === 0 || !solved(level, pieces)) continue;

    const validation = validateLevel(level, { minSlack: recipe.minSlack, shortcutBudget: opts.shortcutBudget });
    if (validation.ok) return { level, recipe, attempts: attempt, validation };
  }
  throw new Error(`no valid level for seed "${opts.seed}" at complexity ${opts.complexity} after ${maxAttempts} attempts`);
}

/** Endless mode: the n-th generated level of a run gets harder as n grows. */
export function endlessLevel(runSeed: string, n: number): Generated {
  const complexity = Math.min(10, 1.5 + n * 0.6);
  return generateLevel({ seed: `${runSeed}:${n}`, complexity });
}

export { EMITTER_RADIUS };
