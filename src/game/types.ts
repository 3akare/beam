export type Band = 'red' | 'green' | 'blue';
export type LightColor = 'white' | Band;
export type PieceKind = 'mirror' | 'prism';

export interface Vec {
  x: number;
  y: number;
}

/** Axis-aligned wall; x/y is the top-left corner. Board units, y grows downward. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Target extends Vec {
  color: LightColor;
}

export interface Placement extends Vec {
  kind: PieceKind;
  /** Radians, y-down: 0 points right, positive turns clockwise on screen. */
  angle: number;
}

export interface Placed extends Placement {
  id: string;
}

export interface Level {
  name: string;
  width: number;
  height: number;
  emitter: Vec & { angle: number };
  walls: Rect[];
  targets: Target[];
  inventory: Record<PieceKind, number>;
  /** Pieces bolted to the board: they bend light but can't be moved or turned. */
  fixed?: Placement[];
  /** One known solution (the player's pieces only). Replaying it proves the level is solvable. */
  solution: Placement[];
  /** Set on generated levels. */
  seed?: string;
  complexity?: number;
  /** Neon colour of the walls. */
  tint: string;
}
