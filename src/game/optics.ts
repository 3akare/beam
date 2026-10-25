import type { Band, Level, LightColor, Placement, Rect, Vec } from './types';

export const MIRROR_LENGTH = 1.2;
export const PRISM_SIDE = 1.1;
export const TARGET_RADIUS = 0.32;
export const EMITTER_RADIUS = 0.42;
export const BANDS: Band[] = ['red', 'green', 'blue'];
/** Refractive index per band. The spread is exaggerated so the fan is visible on a small board. */
export const IOR: Record<Band, number> = { red: 1.42, green: 1.52, blue: 1.64 };

export const MAX_BOUNCES = 40;
const MAX_RAYS = 64;
export const EPS = 1e-4;

export interface BeamSegment {
  a: Vec;
  b: Vec;
  color: LightColor;
  /** True while travelling through glass. */
  inside: boolean;
}

export interface TraceResult {
  segments: BeamSegment[];
  lit: boolean[];
}

export interface Surface {
  a: Vec;
  b: Vec;
  kind: 'wall' | 'mirror' | 'prism';
  /** For prism edges: which prism, and the outward normal. */
  prism?: number;
  normal?: Vec;
}

interface Ray {
  o: Vec;
  d: Vec;
  color: LightColor;
  /** Index of the prism the ray is inside, or -1 in air. */
  medium: number;
  depth: number;
  /** Surface the ray just left, ignored for the next hit. */
  skip: number;
}

const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const unit = (a: number): Vec => ({ x: Math.cos(a), y: Math.sin(a) });

export function mirrorEnds(p: Placement): [Vec, Vec] {
  const h = unit(p.angle);
  return [add(p, h, -MIRROR_LENGTH / 2), add(p, h, MIRROR_LENGTH / 2)];
}

/** Equilateral triangle around its centre; at angle 0 one corner points up. */
export function prismCorners(p: Placement): Vec[] {
  const r = PRISM_SIDE / Math.sqrt(3);
  return [-90, 30, 150].map((deg) => add(p, unit(p.angle + (deg * Math.PI) / 180), r));
}

export function emitterOrigin(level: Level): Vec {
  return add(level.emitter, unit(level.emitter.angle), EMITTER_RADIUS);
}

function rectEdges(r: Rect): [Vec, Vec][] {
  const tl = { x: r.x, y: r.y };
  const tr = { x: r.x + r.w, y: r.y };
  const br = { x: r.x + r.w, y: r.y + r.h };
  const bl = { x: r.x, y: r.y + r.h };
  return [
    [tl, tr],
    [tr, br],
    [br, bl],
    [bl, tl],
  ];
}

export function surfaces(level: Level, placed: Placement[]): Surface[] {
  const out: Surface[] = [];
  const border: Rect = { x: 0, y: 0, w: level.width, h: level.height };
  for (const r of [border, ...level.walls]) for (const [a, b] of rectEdges(r)) out.push({ a, b, kind: 'wall' });
  placed.forEach((p, i) => {
    if (p.kind === 'mirror') {
      const [a, b] = mirrorEnds(p);
      out.push({ a, b, kind: 'mirror' });
    } else {
      const c = prismCorners(p);
      for (let k = 0; k < 3; k++) {
        const a = c[k];
        const b = c[(k + 1) % 3];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const len = Math.hypot(mid.x - p.x, mid.y - p.y);
        out.push({ a, b, kind: 'prism', prism: i, normal: { x: (mid.x - p.x) / len, y: (mid.y - p.y) / len } });
      }
    }
  });
  return out;
}

/** Distance along the ray to segment a–b, or Infinity. */
export function hitSegment(o: Vec, d: Vec, a: Vec, b: Vec): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
  const u = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den;
  return t > EPS && u >= 0 && u <= 1 ? t : Infinity;
}

export function hitCircle(o: Vec, d: Vec, c: Vec, r: number): number {
  const fx = o.x - c.x;
  const fy = o.y - c.y;
  const b = fx * d.x + fy * d.y;
  const disc = b * b - (fx * fx + fy * fy - r * r);
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > EPS ? t : Infinity;
}

export function reflect(d: Vec, n: Vec): Vec {
  const k = 2 * dot(d, n);
  return { x: d.x - k * n.x, y: d.y - k * n.y };
}

/** Snell's law; `n` faces the incoming ray. Returns null on total internal reflection. */
export function refract(d: Vec, n: Vec, eta: number): Vec | null {
  const cosi = -dot(n, d);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const f = eta * cosi - Math.sqrt(k);
  return { x: eta * d.x + f * n.x, y: eta * d.y + f * n.y };
}

export function trace(level: Level, placed: Placement[]): TraceResult {
  const surf = surfaces(level, [...(level.fixed ?? []), ...placed]);
  const segments: BeamSegment[] = [];
  const lit = level.targets.map(() => false);
  const queue: Ray[] = [
    { o: emitterOrigin(level), d: unit(level.emitter.angle), color: 'white', medium: -1, depth: 0, skip: -1 },
  ];
  let rays = 0;

  while (queue.length && rays++ < MAX_RAYS) {
    const ray = queue.shift()!;
    let best = Infinity;
    let hit = -1;
    let target = -1;
    surf.forEach((s, i) => {
      if (i === ray.skip) return;
      if (ray.medium >= 0 && s.prism !== ray.medium) return; // inside glass, only its own edges matter
      const t = hitSegment(ray.o, ray.d, s.a, s.b);
      if (t < best) {
        best = t;
        hit = i;
      }
    });
    if (ray.medium < 0) {
      level.targets.forEach((tg, i) => {
        const t = hitCircle(ray.o, ray.d, tg, TARGET_RADIUS);
        if (t < best) {
          best = t;
          target = i;
        }
      });
    }
    if (!isFinite(best)) continue;

    const p = add(ray.o, ray.d, best);
    segments.push({ a: ray.o, b: p, color: ray.color, inside: ray.medium >= 0 });
    // Targets are only recorded when nearer than every surface.
    if (target >= 0) {
      if (level.targets[target].color === ray.color) lit[target] = true;
      continue;
    }
    if (ray.depth >= MAX_BOUNCES) continue;
    const s = surf[hit];
    const next = (d: Vec, color: LightColor, medium: number) =>
      queue.push({ o: add(p, d, EPS), d, color, medium, depth: ray.depth + 1, skip: hit });

    if (s.kind === 'mirror') {
      const ex = s.b.x - s.a.x;
      const ey = s.b.y - s.a.y;
      const len = Math.hypot(ex, ey);
      next(reflect(ray.d, { x: -ey / len, y: ex / len }), ray.color, -1);
    } else if (s.kind === 'prism') {
      const out = s.normal!;
      if (ray.medium < 0) {
        // Entering glass: white light fans out into its bands.
        const bands = ray.color === 'white' ? BANDS : [ray.color as Band];
        for (const band of bands) {
          const d = refract(ray.d, out, 1 / IOR[band]);
          if (d) next(d, band, s.prism!);
        }
      } else {
        const inward = { x: -out.x, y: -out.y };
        const band = ray.color as Band;
        const d = refract(ray.d, inward, IOR[band]);
        if (d) next(d, band, -1);
        else next(reflect(ray.d, inward), band, ray.medium); // total internal reflection
      }
    }
    // Walls absorb.
  }
  return { segments, lit };
}

/**
 * How close each target is to being lit: 1 when lit, otherwise a gentle 0–0.35 as a beam of
 * its colour passes within 1.5 units. Shown as a faint glow, a "warmer/colder" hint.
 */
export function targetWarmth(level: Level, r: TraceResult): number[] {
  return level.targets.map((t, i) => {
    if (r.lit[i]) return 1;
    let best = Infinity;
    for (const s of r.segments) {
      if (s.inside || s.color !== t.color) continue;
      const ex = s.b.x - s.a.x;
      const ey = s.b.y - s.a.y;
      const k = Math.max(0, Math.min(1, ((t.x - s.a.x) * ex + (t.y - s.a.y) * ey) / (ex * ex + ey * ey || 1e-9)));
      best = Math.min(best, Math.hypot(t.x - (s.a.x + ex * k), t.y - (s.a.y + ey * k)));
    }
    return best === Infinity ? 0 : 0.35 * Math.max(0, 1 - (best - TARGET_RADIUS) / 1.5);
  });
}

export function solved(level: Level, placed: Placement[]): boolean {
  return level.targets.length > 0 && trace(level, placed).lit.every(Boolean);
}

const FOOTPRINT = 0.42;

/** Whether a piece may sit here: on the board, clear of walls, targets, the emitter and other pieces. */
export function canPlace(level: Level, others: Placement[], p: Vec): boolean {
  if (p.x < FOOTPRINT || p.y < FOOTPRINT || p.x > level.width - FOOTPRINT || p.y > level.height - FOOTPRINT) return false;
  for (const r of level.walls) {
    const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
    if (Math.hypot(p.x - cx, p.y - cy) < FOOTPRINT) return false;
  }
  if (level.targets.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < TARGET_RADIUS + FOOTPRINT + 0.05)) return false;
  if (Math.hypot(level.emitter.x - p.x, level.emitter.y - p.y) < EMITTER_RADIUS + FOOTPRINT + 0.1) return false;
  return [...(level.fixed ?? []), ...others].every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= FOOTPRINT * 2 + 0.1);
}
