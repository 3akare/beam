---
doc: spec
status: approved
---
<!-- Approved by delegation: stack chosen by the learner (Web + Three.js); everything else is agent defaults (2026-10-23). -->

# beam — Technical Spec

## How This Works, In Plain Language
- **Levels** are plain data: grid size, where the core and gate are, the walls, and the mirror pieces (position, starting orientation, what else they turn).
- **The beam tracer** is a small pure function. It walks from the core cell by cell, bouncing off mirrors, and returns the path plus whether it escaped through the gate. It knows nothing about 3D.
- **The board renderer** turns a level into Three.js meshes (stones, walls, core, mirrors, beam) and plays the solve and assemble animations.
- **Input** turns pointer drags and taps into piece rotations and handles snapping.
- **Audio** synthesizes notes with the Web Audio API.
- **The game loop** (main.ts) wires these together: input changes the orientations → the tracer re-runs → the renderer redraws the beam → solved? → transition.

Keeping the puzzle logic separate from the 3D code lets us check every level automatically with a script, with no browser needed.

## The Core Journey Through the System
Page load → `main.ts` reads the saved level → `board.build(level)` creates meshes and plays the assemble animation → the player drags a piece → `input.ts` raycasts, rotates the piece and its linked pieces live, and tells the board to truncate the beam → release → spring to the snapped orientation → `trace(level, orientations)` → `board.setBeam(path)` and `audio.note()` → if `escaped`, `board.playSolve()` → `progress.save(next)` → `board.build(nextLevel)`.
PRD ref: `prd.md > The Core Journey`.

## Stack
- TypeScript + Vite (dev server and build). https://vite.dev
- three.js, including `EffectComposer` + `UnrealBloomPass` from `three/examples/jsm` for the glow. https://threejs.org/docs
- Web Audio API (built into the browser). https://developer.mozilla.org/docs/Web/API/Web_Audio_API
- `tsx` (dev only) to run the level-verification script in Node.

## Where It Runs and How Someone Tries It
Runs in any modern browser, including mobile. Requires Node 18+.
```
npm install
npm run dev        # open the printed localhost URL
npm run verify     # typecheck + check every level is solvable and starts unsolved
npm run build      # production bundle in dist/
```
Demo recording: `npm run dev`, open the URL, play levels 1→3 (`?level=1` resets the starting point).

## Look and Feel
- Background: vertical pastel gradient per level (dawn peach → sea mint → dusk lilac), with matching fog.
- Stone: off-white `#efe9e1` matte (MeshStandardMaterial, roughness 0.9). Walls a shade darker. Soft PCF shadows from one warm directional light plus a hemisphere fill.
- Mirrors: pale silver slab (metalness 0.6, roughness 0.25) on a puck. Followers get a thin ring. Each link group has its own soft accent colour, drawn as a groove line on the board.
- Beam: warm white-gold, HDR colour so only it passes the bloom threshold.
- UI: system sans-serif, lowercase, light weight, low-contrast. Motion uses springs and ease-out curves.

## Components

### Level data (`src/game/levels.ts`, `src/game/types.ts`)
`Level { size, core:{x,y,dir}, gate:{x,y}, walls:[x,y][], pieces: Piece[], palette }`. `Piece { id, x, y, o (0–3), follower?, turns?: id[] }`. The gate is a cell just outside the grid.
PRD ref: `prd.md > Features and Behavior`.

### Beam tracer (`src/game/beam.ts`)
`trace(level, orientations, blocked?) → { points: cell[], end: 'gate'|'wall'|'rim'|'blocked', escaped }`. Mirror type = `o % 2` (0 `/`, 1 `\`). Loop guard: stop after `size² × 4` steps. `turnSet(level, id)` returns the ids that rotate when `id` is touched.
PRD ref: `prd.md > The beam`.

### Board renderer (`src/render/board.ts`)
Builds meshes for a level and exposes `pieceMeshes`, `setPieceAngle(id, rad)`, `setBeam(points, escaped)`, `playAssemble()`, `playSolve()`, and `dispose()`. It runs its own tweens from the render loop.
PRD ref: `prd.md > Look and Feel`, `prd.md > Solving and progress`.

### Scene (`src/render/scene.ts`)
Renderer, camera (fixed 3/4 view, fit to aspect), lights, composer with bloom, background gradient, resize handling.

### Input (`src/input.ts`)
Pointer events → raycast pieces → drag: angle += dx × k, applied to the turn set → release: target = round(angle / 90°). Tap (< 6px, < 250ms): target += 90°. Springs live in `main.ts`.
PRD ref: `prd.md > Twisting pieces`.

### Audio (`src/audio.ts`)
Lazily creates an AudioContext on first gesture. Ambient pad (detuned triangle oscillators → lowpass). `note(i)` plays a pentatonic pluck, `solve()` an arpeggio, `setMuted()`.

### UI (`src/ui.ts`)
DOM overlay: wordmark, level dots, mute button, end card.

## Data Model
Runtime state: `levelIndex`, `orientations: Record<id, number>` (logical, 0–3), `angles: Record<id, {value, target, vel}>` for springs, and `phase: 'assembling'|'playing'|'solving'|'done'`. Persisted: `localStorage['beam.level']` (wrapped in try/catch).

## File Structure
```
beam/
├── index.html
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts            # game loop and state machine
│   ├── style.css
│   ├── audio.ts
│   ├── input.ts
│   ├── ui.ts
│   ├── game/
│   │   ├── types.ts
│   │   ├── levels.ts
│   │   └── beam.ts        # pure beam tracer
│   └── render/
│       ├── scene.ts
│       └── board.ts
├── scripts/
│   └── verify-levels.ts   # brute-force: each level solvable, starts unsolved
└── devpost/               # planning docs
```

## External Services and Dependencies
None at runtime. No APIs, keys or backend.

## Important Failure Modes
- **Audio blocked before a user gesture** → the game stays silent until the first tap, then starts.
- **localStorage unavailable (private mode)** → caught, and play starts at level 1.
- **Bloom too heavy on weak devices** → pixel ratio capped at 2. Bloom runs at half resolution.

## What Was Simplified and Why
- **2D grid logic under a 3D render** instead of true 3D beam paths — far easier to author and verify. Full 3D would need a 3D tracer and a level editor.
- **Synthesized sound** instead of composed music — no assets. Real music is a later pass.
- **Fixed camera** instead of orbit — keeps drag unambiguous.

## Decisions and Open Issues
- Learner chose: web, Three.js, an inspired-by identity. Agent chose everything else (see PRD Product Decisions).
- Uncertainty: whether dragging to rotate feels good on touch. Investigated in slice 1 by trying it, with tap as a fallback.
