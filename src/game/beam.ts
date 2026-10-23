import type { Cell, Dir, Level, Orientations } from './types';

export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

// Where a beam travelling in direction d goes after hitting each mirror.
const SLASH: Dir[] = [1, 0, 3, 2]; // "/": N→E, E→N, S→W, W→S
const BACKSLASH: Dir[] = [3, 2, 1, 0]; // "\": N→W, E→S, S→E, W→N

export type BeamEnd = 'gate' | 'rim' | 'wall' | 'blocked' | 'loop';

export interface Trace {
  /** Corner points in grid units, from the core to where the beam stops. */
  points: Cell[];
  end: BeamEnd;
  escaped: boolean;
  /** Direction of travel at the end of the path. */
  dir: Dir;
}

const key = (x: number, y: number) => `${x},${y}`;

export function initialOrientations(level: Level): Orientations {
  return Object.fromEntries(level.pieces.map((p) => [p.id, p.o]));
}

/** The ids that rotate when piece `id` is turned. */
export function turnSet(level: Level, id: string): string[] {
  const piece = level.pieces.find((p) => p.id === id);
  return piece ? [id, ...(piece.turns ?? [])] : [];
}

/**
 * Walk the beam from the core cell by cell. Pieces in `blocked` (mid-twist)
 * stop the beam at their edge.
 */
export function trace(level: Level, orientations: Orientations, blocked: ReadonlySet<string> = new Set()): Trace {
  const walls = new Set(level.walls.map(([x, y]) => key(x, y)));
  walls.add(key(level.core.x, level.core.y));
  const pieces = new Map(level.pieces.map((p) => [key(p.x, p.y), p]));

  let { x, y } = level.core;
  let d: Dir = level.core.dir;
  const points: Cell[] = [{ x, y }];
  const seen = new Set<string>();
  const stop = (end: BeamEnd, px: number, py: number): Trace => {
    points.push({ x: px, y: py });
    return { points, end, escaped: end === 'gate', dir: d };
  };

  for (let step = 0; step < level.size * level.size * 4 + 4; step++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= level.size || ny >= level.size) {
      if (nx === level.gate.x && ny === level.gate.y) return stop('gate', nx, ny);
      return stop('rim', x + DX[d] * 0.5, y + DY[d] * 0.5);
    }
    if (walls.has(key(nx, ny))) return stop('wall', x + DX[d] * 0.5, y + DY[d] * 0.5);

    const piece = pieces.get(key(nx, ny));
    if (piece) {
      if (blocked.has(piece.id)) return stop('blocked', nx - DX[d] * 0.38, ny - DY[d] * 0.38);
      const o = (((orientations[piece.id] ?? piece.o) % 2) + 2) % 2;
      d = (o === 0 ? SLASH : BACKSLASH)[d];
      points.push({ x: nx, y: ny });
    }

    const state = `${nx},${ny},${d}`;
    if (seen.has(state)) return stop('loop', nx, ny);
    seen.add(state);
    x = nx;
    y = ny;
  }
  return stop('loop', x, y);
}
