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

  // 2 — three mirrors in a row. Plan the whole route, not just the next bounce.
  {
    size: 5,
    core: { x: 0, y: 4, dir: 0 },
    gate: { x: 5, y: 3 },
    walls: [
      [2, 3],
      [4, 0],
      [1, 4],
      [2, 2],
    ],
    pieces: [
      { id: 'a', x: 0, y: 1, o: 1 },
      { id: 'b', x: 3, y: 1, o: 0 },
      { id: 'c', x: 3, y: 3, o: 0 },
    ],
    palette: { top: '#b9e0d6', bottom: '#eef6f2', accent: '#4fa893' },
  },

  // 3 — linked pieces. The ringed mirror can't be touched; it turns along
  // with both of its neighbours, so fixing one undoes the other.
  {
    size: 5,
    core: { x: 0, y: 2, dir: 1 },
    gate: { x: 4, y: -1 },
    walls: [
      [0, 0],
      [3, 1],
      [0, 4],
    ],
    pieces: [
      { id: 'a', x: 2, y: 2, o: 0, turns: ['b'] },
      { id: 'b', x: 2, y: 4, o: 1, follower: true },
      { id: 'c', x: 4, y: 4, o: 1, turns: ['b'] },
    ],
    palette: { top: '#d3c6ee', bottom: '#f3f0f8', accent: '#8f7bd0' },
  },
];
