import type { Level } from './types';

// Grid coordinates: x grows east (right), y grows south (toward the camera).

export const LEVELS: Level[] = [
  // 1 — one mirror. Teaches that twisting re-routes the light.
  {
    size: 5,
    core: { x: 1, y: 2, dir: 1 },
    gate: { x: 3, y: -1 },
    walls: [
      [0, 0],
      [4, 4],
    ],
    pieces: [{ id: 'a', x: 3, y: 2, o: 1 }],
    palette: { top: '#f4cdb6', bottom: '#f6f0ea', accent: '#e39a6f' },
  },
];
