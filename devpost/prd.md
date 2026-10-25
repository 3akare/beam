---
doc: prd
status: approved
---
<!-- v2: direction and placement-from-inventory chosen by the learner (2026-10-25); details are agent defaults. -->

# beam — Product Requirements

A 2D light-bending puzzle for players who like tactile physics puzzles. Source: `scope.md > The Unique Kernel`.

## The Core Journey
1. The page opens on a dark board ringed by glowing brick walls. An emitter shoots a thick, soft white beam, and one or more glowing targets sit unlit.
2. The bottom tray shows the level's inventory (for example `mirror ×2`, `prism ×1`).
3. The player drags a piece from the tray onto the board. The beams re-trace live while it moves.
4. Clicking or tapping a placed piece selects it. A dial ring with a degree readout appears, and dragging on the dial (or scrolling, or using the arrow keys) rotates it freely. Dragging the piece body moves it.
5. Light that hits a mirror reflects. White light that enters a prism leaves as three separated colour rays (red, green, blue). Coloured light passing through a prism refracts and keeps its colour.
6. A target lights when a ray of its colour reaches it. White targets need white light.
7. When every target stays lit for a moment, the level completes: the targets flare, the walls pulse, and the next level fades in.
8. After level 10, an end card offers "play again". Levels 1–3 are handcrafted, and 4–10 are curated from the generator ahead of time.

## Screens and Layout
A single full-screen board. Top left: the level number and name. Top right: restart and sound. Bottom centre: the inventory tray. A centred end card at the end.

## Look and Feel
- Background: deep night (#07080d) with a subtle vignette.
- Walls: dark blocks with a warm neon brick glow, tinted per level.
- Beams: thick, soft-edged and additive. White is warm white; the colour bands are vivid red, green and blue. They bloom against the dark.
- Pieces: lit 3D-looking objects seen from above. Chrome mirror bars with dark end caps, a glass triangular prism with bright edges, a brass emitter with a glowing lens, and targets as crystal orbs in glowing rings.
- The rotation dial is orange on a dark backing with 5°/15° ticks, a big knob and a degree readout. It brightens on hover and glows while turning. The UI text is a small lowercase monospace.

## Features and Behavior

### Placing and moving
- Drag from the tray to place. A piece that overlaps a wall, another piece, a target or the emitter shows as invalid (red tint). Releasing there returns it to where it came from (the tray, or its previous spot).
- Dragging a placed piece moves it. Dropping it on the tray returns it to the inventory.
- Tray counts update as pieces are placed and returned.

### Rotating
- Selecting a piece shows the dial. Dragging on the dial ring rotates the piece in 5° clicks, and so do the mouse wheel and arrow keys. Hold Shift for fine control. Every solution sits on the 5° grid.
- A target glows faintly as a beam of its colour gets close (a "warmer/colder" hint).
- A soft tick sounds every 15°.

### Optics
- Walls and the board edge absorb light. Mirrors are two-sided.
- The prism uses Snell's law with a different refractive index per colour (dispersion), including total internal reflection. Each ray stops after 40 bounces.

### Completion and progress
- The level completes when all targets are lit for 0.6 s and nothing is being dragged.
- Restart clears the placed pieces. Progress is saved in the browser, and `?level=N` jumps to a level.

### Sound
- Kept from v1: an ambient pad, a pluck when a piece is placed, a chime in the target's pitch when it lights, an arpeggio on completion, and a mute toggle.

## States and Boundaries
- **Empty board:** unsolved by design. No level is solved with an empty inventory placed.
- **Dragging:** live re-trace, with the invalid tint where applicable.
- **Complete:** input locked → transition → next level.
- **Persistence:** level index and mute state only.
- **Small screens:** the board scales to fit and the tray stays tappable.

## Product Decisions
- Look and mechanics, with placement from an inventory — the learner's choice (option 2, 2026-10-25).
- 2D board with 3D-looking assets — the learner's choice (2026-10-25).
- Three colour bands instead of a continuous spectrum (agent default) — readable targets, cheap tracing.
- Dial-based rotation instead of 90° snaps (agent default, follows the reference vibe).

## What We're Building
Everything in The Core Journey, Features and Behavior, and States and Boundaries.

## Deferred From the POC
Level list, undo history, fixed pre-placed pieces, a hint system.

## Possible Later Enhancements
Splitters, colour filters, lenses, portals, a level editor, more levels, composed music.

## Non-Goals
- No copying of Prism Rules' levels, art, text or UI layout.
- No timers or scores.

## Open Questions
None blocking.
