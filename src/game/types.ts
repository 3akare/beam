/** Directions: 0 north (-y), 1 east (+x), 2 south (+y), 3 west (-x). */
export type Dir = 0 | 1 | 2 | 3;

export interface Cell {
  x: number;
  y: number;
}

export interface Piece {
  id: string;
  x: number;
  y: number;
  /** Starting orientation in quarter turns. Even = "/" mirror, odd = "\" mirror. */
  o: number;
  /** Followers can't be touched; they only turn through another piece's `turns`. */
  follower?: boolean;
  /** Other pieces that turn along with this one. */
  turns?: string[];
}

export interface Palette {
  top: string;
  bottom: string;
  accent: string;
}

export interface Level {
  size: number;
  core: Cell & { dir: Dir };
  /** A cell just outside the grid; the beam must leave through it. */
  gate: Cell;
  walls: [number, number][];
  pieces: Piece[];
  palette: Palette;
}

/** Orientation per piece id, in quarter turns. */
export type Orientations = Record<string, number>;
