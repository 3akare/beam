import type { Level } from './types';

// Board units, origin top-left, y grows downward. Angles in radians (clockwise on screen).
const deg = (d: number) => (d * Math.PI) / 180;

export const LEVELS: Level[] = [
  // 1 — one mirror. The wall eats the beam; bounce it up to the light.
  {
    name: 'first light',
    width: 12,
    height: 8,
    emitter: { x: 1, y: 6, angle: 0 },
    walls: [
      { x: 7, y: 3, w: 0.4, h: 5 },
      { x: 2.2, y: 3.4, w: 3, h: 0.4 },
    ],
    targets: [{ x: 6, y: 1.5, color: 'white' }],
    inventory: { mirror: 1, prism: 0 },
    solution: [{ kind: 'mirror', x: 6, y: 6, angle: deg(-45) }],
    tint: '#ff4d3d',
  },

  // 2 — the prism. White goes in, three colours fan out across the floor.
  {
    name: 'white into colour',
    width: 12,
    height: 8,
    emitter: { x: 1, y: 4, angle: 0 },
    walls: [
      { x: 6.2, y: 0, w: 0.4, h: 2.4 },
      { x: 10.6, y: 2.6, w: 1.4, h: 0.4 },
    ],
    targets: [
      { x: 7.04, y: 7, color: 'blue' },
      { x: 8.2, y: 7, color: 'green' },
      { x: 9.47, y: 7, color: 'red' },
    ],
    inventory: { mirror: 0, prism: 1 },
    solution: [{ kind: 'prism', x: 4.5, y: 4, angle: deg(20) }],
    tint: '#ff3d9a',
  },

  // 3 — fold the light down with a mirror, then split it around the corner.
  {
    name: 'around the corner',
    width: 12,
    height: 8,
    emitter: { x: 1, y: 1.4, angle: 0 },
    walls: [
      { x: 4.2, y: 3.2, w: 7.8, h: 0.4 },
      { x: 8.6, y: 0, w: 0.4, h: 2 },
    ],
    targets: [
      { x: 3.6, y: 5.5, color: 'green' },
      { x: 3.2, y: 6.44, color: 'red' },
      { x: 4.72, y: 6.62, color: 'blue' },
    ],
    inventory: { mirror: 1, prism: 1 },
    solution: [
      { kind: 'mirror', x: 3.78, y: 1.24, angle: 1.0496 },
      { kind: 'prism', x: 3.46, y: 2.78, angle: 4.8835 },
    ],
    tint: '#ffa23d',
  },
];
