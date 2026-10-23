---
doc: prd
status: approved
---
<!-- Approved by delegation: decisions below are agent defaults, made at the learner's request (2026-10-23). -->

# beam — Product Requirements

A wordless browser puzzle for a player who likes calm, tactile games. Source: `scope.md > The Unique Kernel`.

## The Core Journey
1. The player opens the page. A stone seed floats on a soft background: a square board ringed by low walls, a glowing crystal core, and a small gap in the wall (the gate).
2. A warm beam shoots from the core and stops wherever it hits a wall or leaves the board somewhere other than the gate.
3. The player drags a mirror piece sideways to twist it (or taps it to turn it 90°). While a piece is being twisted the beam stops at that piece. When the piece snaps to a quarter turn, it clicks with a note and the beam re-routes.
4. When the beam leaves through the gate, the level is solved: the beam brightens and shoots off into the distance, the walls fold outward, the pieces lift and drift apart, and the scene fades into the next level's palette.
5. The next seed assembles (pieces drop in). Repeat for 3 levels.
6. After level 3, a quiet end card says the light is free and offers "play again".

## Screens and Layout
A single full-screen 3D view. A small overlay shows the wordmark (top left), progress dots for the levels (bottom centre) and a sound toggle (bottom right). The end card is centred over the scene.

## Look and Feel
Pastel gradient background that changes per level. Matte off-white stone with soft shadows. Mirrors are thin pale-silver slabs on round pucks, and linked pieces share a faint coloured groove. The beam is warm white-gold and the only thing that glows. Motion is soft and springy, never snappy-linear. Lowercase, thin type. Almost no text.

## Features and Behavior

### Twisting pieces
- Dragging horizontally on a rotatable piece rotates it continuously. On release it springs to the nearest quarter turn.
- A short tap (little movement) turns it +90° with the same spring.
- Pieces linked to the one you touch turn by the same amount at the same time.
- Follower pieces (marked with a ring) can't be touched directly; they only move through links.
- Fixed walls and the core don't respond to input.

### The beam
- Travels cell by cell from the core. Mirrors reflect it 90° (`/` or `\` depending on orientation). Walls and the rim stop it.
- Recomputed whenever a piece snaps. While any piece is mid-twist, the beam stops at that piece.

### Solving and progress
- Solved = the beam exits through the gate. Input locks during the solve animation.
- The reached level is saved in the browser. Reloading resumes there. `?level=N` jumps to a level (for demo/debug).

### Sound
- The first interaction starts a soft ambient pad. Each snap plays a note from a pentatonic scale. Solving plays a rising arpeggio. The toggle mutes everything.

## States and Boundaries
- **First load:** level 1, or the saved level if one exists.
- **Mid-twist:** beam truncated at the twisting piece.
- **Solved:** input locked → transition → next level.
- **Complete:** end card after level 3. "Play again" resets progress to level 1.
- **Persistence:** only the current level index (localStorage). If storage is unavailable, the game still works, just without resume.
- **Small screens:** the board scales to fit, and touch works like a mouse.

## Product Decisions
- Grid-and-mirror puzzles (agent default) — the clearest "solved" rule for a beam game and cheap to author as data.
- Drag and tap both supported (agent default) — drag for feel, tap for accessibility and quick play.
- 3 levels: single mirror (teach), three-mirror route (plan), linked pieces (aha) (agent default).
- Synthesized audio instead of audio files (agent default) — no assets to license, tiny bundle.

## What We're Building
Everything in The Core Journey, Features and Behavior, and States and Boundaries above.

## Deferred From the POC
Level select, undo/reset button (levels are small, so twisting back is easy), settings menu, keyboard play.

## Possible Later Enhancements
Level editor, sliders/hinges/splitters, more chapters and palettes, adaptive music layers, PWA install and iOS wrapper.

## Non-Goals
- No timers, scores or fail states — this is a calm game.
- No free camera — conflicts with twisting.
- No reuse of PRISM's assets, shapes or level layouts.

## Open Questions
None blocking.
