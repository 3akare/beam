---
doc: spec
status: approved
---
<!-- v2 (2026-10-25): same stack; optics engine, pieces, input and UI rebuilt for the learner's option 2. -->

# beam — Technical Spec

## How This Works, In Plain Language
- **Levels** are data: board size, emitter, walls (rectangles), targets (position and colour), the inventory, and one known solution used for checking.
- **The optics tracer** is a pure function. It shoots rays from the emitter, finds the nearest thing each ray hits (wall, mirror, prism edge, target), then reflects, refracts, splits or stops the ray. It returns beam segments and which targets are lit. It knows nothing about 3D.
- **The board renderer** draws the level from above with Three.js: lit 3D meshes for the pieces, additive soft quads for the beams, and bloom for the glow.
- **Input** handles dragging from the tray, moving, selecting and rotating with the dial.
- **UI** is the DOM overlay: title, restart, sound, inventory tray and end card.
- **main.ts** holds the state (placed pieces), re-traces on every change and checks for completion.

## The Core Journey Through the System
Pointer drags a tray item → `input.ts` creates a provisional piece at the pointer's board position → `main.ts` updates the state → `trace(level, pieces)` → `board.setBeams(segments)` and `board.setTargets(lit)` → release: valid → placed, invalid → returned → all targets lit for 0.6 s → `board.playComplete()` → next level.
PRD ref: `prd.md > The Core Journey`.

## Stack
Unchanged: TypeScript, Vite, three.js (bloom via `three/examples/jsm`), Web Audio, and `tsx` for the verification script.

## Where It Runs and How Someone Tries It
```
npm install
npm run dev        # open the printed localhost URL
npm run verify     # typecheck + each level: empty board unsolved, stored solution solves, solution placements valid
npm run build
```
Demo: `npm run dev`, then play levels 1→3 (`?level=1`).

## Look and Feel
- Background #07080d with a radial vignette. Bloom threshold is low (dark scene), with strength around 1.1.
- Walls: box meshes with a procedurally drawn brick CanvasTexture used as the emissive map, tinted per level (warm red, magenta, amber).
- Beams: planes with a soft cross-section gradient texture, additive blending, HDR colours (white `(3,2.9,2.6)`, red, green, blue).
- Mirror: chrome bar (MeshPhysicalMaterial, metalness 1, roughness 0.05) with graphite end caps.
- Prism: an extruded equilateral triangle with a bevel. Glass-like (low-opacity physical material, clearcoat) with emissive edge lines.
- Emitter: brass housing and a glowing lens. Targets: a torus ring plus a crystal orb in the target colour, dim → bright when lit.
- UI: lowercase monospace, low contrast. Glassy buttons and tray.

## Components

### Level data (`src/game/levels.ts`, `src/game/types.ts`)
`Level { name, width, height, emitter:{x,y,angle}, walls: Rect[], targets: {x,y,color}[], inventory: {mirror, prism}, solution: Placed[], tint }`. Coordinates are in board units, with y growing downward.
PRD ref: `prd.md > Features and Behavior`.

### Optics tracer (`src/game/optics.ts`)
`trace(level, placed) → { segments: {a,b,color}[], lit: boolean[] }`. Rays are `{origin, dir, color, inside?}`. Mirrors are segments (length 1.2). Prisms are triangles (side 1.1) with refractive indices `{red 1.42, green 1.52, blue 1.64}`. White hitting a prism splits into three. The board edge is a wall. Ray budget: 40 bounces and 64 rays. Also `overlaps(level, placed, piece)` for placement validity, and `solved(level, placed)`.
PRD ref: `prd.md > Optics`.

### Board renderer (`src/render/board.ts`)
Static meshes (walls, emitter, targets), dynamic piece meshes keyed by id, a beam layer rebuilt per trace, a selection dial, and the complete/assemble animations.
PRD ref: `prd.md > Look and Feel`, `prd.md > Completion and progress`.

### Scene (`src/render/scene.ts`)
Orthographic top-down camera fit to the board plus tray margin, lights, environment, bloom and background.

### Input (`src/input.ts`)
Pointer → board coordinates (ray-plane). Modes: placing from the tray, moving, rotating on the dial. Wheel and arrow keys rotate the selection.
PRD ref: `prd.md > Placing and moving`, `prd.md > Rotating`.

### UI (`src/ui.ts`) and Audio (`src/audio.ts`)
Tray with counts (pointerdown starts a placement), title, restart, sound, end card. Audio adds `tick()` and `chime(color)`.

## Data Model
Runtime: `placed: { id, kind: 'mirror'|'prism', x, y, angle }[]`, `selected`, `phase`. Persisted: `beam.level`, `beam.muted`.

## File Structure
```
src/
├── main.ts            # state, re-trace, completion
├── audio.ts  input.ts  ui.ts  style.css
├── game/  types.ts  levels.ts  optics.ts
└── render/ scene.ts  board.ts  tween.ts  textures.ts
scripts/verify-levels.ts
```

## External Services and Dependencies
None.

## Important Failure Modes
- **Rays bouncing forever between parallel mirrors** → the bounce and ray budget cuts them off.
- **A floating-point ray re-hitting the surface it just left** → a small epsilon offset and ignoring the surface it came from.
- **Free angles too fiddly on touch** → generous target radius (0.32), dial dragging uses the absolute pointer angle, and arrow keys and the wheel allow fine-tuning.

## What Was Simplified and Why
- **Three colour bands** instead of a continuous spectrum: readable and cheap. A continuous spectrum would need many rays and blending.
- **Stored solutions** for verification instead of a solver: free placement is a continuous search space.

## Decisions and Open Issues
- Learner chose: web/Three.js, 2D with 3D-looking assets, the Prism Rules vibe, look and mechanics, placement from inventory.
- Agent chose: three bands, dispersion values, dial interaction, level designs.
- Open: whether free rotation feels good on touch. Check at the learner review.
