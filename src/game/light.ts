// The *visual* light model. Gameplay uses `trace` in optics.ts (white + three bands);
// this traces many wavelengths so dispersion renders as a smooth spectrum, and adds the
// details that make light read as light: Fresnel ghost reflections off glass, losses at
// each bounce, distance travelled (for falloff and divergence), and what each beam hit.
import { EMITTER_RADIUS, EPS, hitCircle, hitSegment, MAX_BOUNCES, reflect, refract, surfaces, TARGET_RADIUS } from './optics';
import type { Level, Placement, Vec } from './types';

export type RGB = [number, number, number];
export type HitKind = 'wall' | 'mirror' | 'prism' | 'target' | 'none';

export interface LightSegment {
  a: Vec;
  b: Vec;
  /** Linear HDR colour weight (white beam = 1,1,1). */
  rgb: RGB;
  /** Distance from the emitter at `a`. */
  s0: number;
  /** One wavelength of a dispersed fan (rendered as a soft ribbon), or the white beam. */
  spectral: boolean;
  inside: boolean;
  /** A faint Fresnel reflection off glass. */
  ghost: boolean;
  end: HitKind;
  /** Surface normal at `b`, facing the incoming light. */
  normal: Vec | null;
}

/** Wavelengths (nm) sampled across the visible range. */
export const WAVELENGTHS = Array.from({ length: 24 }, (_, i) => 405 + (i * (690 - 405)) / 23);

/**
 * Cauchy's equation n(λ) = A + B/λ², fitted through the gameplay bands
 * (red 650 nm → 1.42, green 530 nm → 1.52, blue 450 nm → 1.64), so visuals and logic agree.
 */
const CAUCHY_B = (1.64 - 1.42) / (1 / 0.45 ** 2 - 1 / 0.65 ** 2);
const CAUCHY_A = 1.42 - CAUCHY_B / 0.65 ** 2;
export const iorAt = (nm: number) => CAUCHY_A + CAUCHY_B / (nm / 1000) ** 2;

/** Zucconi's "spectral_zucconi6" fit: wavelength → linear RGB. */
function spectral(nm: number): RGB {
  const x = Math.min(1, Math.max(0, (nm - 400) / 300));
  const bump = (c: number, x0: number, y0: number) => Math.max(0, 1 - (c * (x - x0)) ** 2 - y0);
  return [
    bump(3.54585104, 0.69549072, 0.02312639) + bump(3.9030714, 0.11748627, 0.8489713),
    bump(2.93225262, 0.49228336, 0.15225084) + bump(3.21182957, 0.86755042, 0.88445281),
    bump(2.41593945, 0.2769988, 0.52607955) + bump(3.96587128, 0.6607786, 0.73949448),
  ];
}

/** Per-wavelength weights that sum to exactly white, so an un-spread fan still looks white. */
export const SPECTRUM: RGB[] = (() => {
  const raw = WAVELENGTHS.map(spectral);
  const sum = raw.reduce((t, c) => [t[0] + c[0], t[1] + c[1], t[2] + c[2]] as RGB, [0, 0, 0] as RGB);
  return raw.map((c) => [c[0] / sum[0], c[1] / sum[1], c[2] / sum[2]] as RGB);
})();

/** Schlick's approximation of Fresnel reflectance for glass (F0 ≈ 4%). */
const schlick = (cos: number) => 0.04 + 0.96 * (1 - Math.max(0, Math.min(1, cos))) ** 5;

interface Ray {
  o: Vec;
  d: Vec;
  rgb: RGB;
  /** Wavelength index, or -1 for white light. */
  wave: number;
  medium: number;
  depth: number;
  skip: number;
  dist: number;
  ghost: boolean;
}

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const MAX_RAYS = 600;

export function traceLight(level: Level, placed: Placement[]): LightSegment[] {
  const surf = surfaces(level, [...(level.fixed ?? []), ...placed]);
  const out: LightSegment[] = [];
  const d0 = { x: Math.cos(level.emitter.angle), y: Math.sin(level.emitter.angle) };
  const queue: Ray[] = [
    {
      o: { x: level.emitter.x + d0.x * EMITTER_RADIUS, y: level.emitter.y + d0.y * EMITTER_RADIUS },
      d: d0,
      rgb: [1, 1, 1],
      wave: -1,
      medium: -1,
      depth: 0,
      skip: -1,
      dist: 0,
      ghost: false,
    },
  ];
  let rays = 0;

  while (queue.length && rays++ < MAX_RAYS) {
    const ray = queue.shift()!;
    let best = Infinity;
    let hit = -1;
    let onTarget = false;
    surf.forEach((s, i) => {
      if (i === ray.skip || (ray.medium >= 0 && s.prism !== ray.medium)) return;
      const t = hitSegment(ray.o, ray.d, s.a, s.b);
      if (t < best) {
        best = t;
        hit = i;
      }
    });
    if (ray.medium < 0) {
      for (const tg of level.targets) {
        const t = hitCircle(ray.o, ray.d, tg, TARGET_RADIUS);
        if (t < best) {
          best = t;
          onTarget = true;
        }
      }
    }
    if (!isFinite(best)) continue;

    const p = { x: ray.o.x + ray.d.x * best, y: ray.o.y + ray.d.y * best };
    const s = hit >= 0 ? surf[hit] : null;
    let normal: Vec | null = null;
    if (s && !onTarget) {
      const ex = s.b.x - s.a.x;
      const ey = s.b.y - s.a.y;
      const L = Math.hypot(ex, ey);
      normal = { x: -ey / L, y: ex / L };
      if (normal.x * ray.d.x + normal.y * ray.d.y > 0) normal = { x: -normal.x, y: -normal.y };
    }
    const end: HitKind = onTarget ? 'target' : (s?.kind ?? 'none');
    out.push({ a: ray.o, b: p, rgb: ray.rgb, s0: ray.dist, spectral: ray.wave >= 0, inside: ray.medium >= 0, ghost: ray.ghost, end, normal });
    if (onTarget || !s || ray.depth >= MAX_BOUNCES) continue;

    const dist = ray.dist + best;
    const spawn = (d: Vec, rgb: RGB, wave: number, medium: number, ghost = ray.ghost) => {
      if (Math.max(...rgb) < 0.004) return;
      queue.push({ o: { x: p.x + d.x * EPS, y: p.y + d.y * EPS }, d, rgb, wave, medium, depth: ray.depth + 1, skip: hit, dist, ghost });
    };

    if (s.kind === 'mirror') {
      // Silvered mirrors keep ~92% of the light.
      spawn(reflect(ray.d, normal!), scale(ray.rgb, 0.92), ray.wave, -1);
    } else if (s.kind === 'prism') {
      const cos = -(ray.d.x * normal!.x + ray.d.y * normal!.y);
      const F = schlick(cos);
      if (ray.medium < 0) {
        // A faint reflection off the glass face — the detail that sells "glass".
        if (!ray.ghost) spawn(reflect(ray.d, normal!), scale(ray.rgb, F * 2.5), ray.wave, -1, true);
        if (ray.ghost) continue;
        const waves = ray.wave >= 0 ? [ray.wave] : WAVELENGTHS.map((_, i) => i);
        for (const w of waves) {
          const d = refract(ray.d, normal!, 1 / iorAt(WAVELENGTHS[w]));
          if (!d) continue;
          const rgb = ray.wave >= 0 ? ray.rgb : ([ray.rgb[0] * SPECTRUM[w][0], ray.rgb[1] * SPECTRUM[w][1], ray.rgb[2] * SPECTRUM[w][2]] as RGB);
          spawn(d, scale(rgb, 1 - F), w, s.prism!);
        }
      } else {
        const n = iorAt(WAVELENGTHS[Math.max(0, ray.wave)]);
        const d = refract(ray.d, normal!, n);
        if (d) spawn(d, scale(ray.rgb, 1 - F), ray.wave, -1);
        else spawn(reflect(ray.d, normal!), ray.rgb, ray.wave, ray.medium); // total internal reflection
      }
    }
  }
  return out;
}
