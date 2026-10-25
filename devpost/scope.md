---
doc: scope
status: approved
---
<!-- v1 approved by delegation (2026-10-23). v2 direction chosen by the learner (2026-10-25):
     "2D, but the assets high quality and 3D-like", Prism Rules as the vibe, option 2 (look + mechanics), place from inventory. -->

# beam

A 2D light-bending puzzle in the browser: place and turn mirrors and prisms to split a white beam into colours and light every target.

## The Unique Kernel
White light goes in and colour comes out. You drop a glass prism into the beam, turn it, and watch the white split into red, green and blue rays that you then steer with mirrors onto matching targets. Everything re-traces live as you drag.

## Who It's For
Someone who likes short, tactile physics puzzles (Prism Rules, laser-mirror games) and wants a few minutes of "aha" in a laptop or phone browser, with no install.

## The Core Loop
Read the board (emitter, walls, coloured targets) → drag a mirror or prism from the inventory onto the board → turn it with the dial → watch the beams re-route live → adjust until every target is lit → level complete → next level.

## Inspiration & Identity
- The vibe comes from **Prism Rules** (Fun With Computer Vision): a dark stage, glowing neon walls, thick soft beams, a prism that splits colour, and coloured targets. Its levels, art and UI are not copied.
- Our own identity: a top-down 2D board with glossy, lit 3D-looking pieces (chrome mirrors, a glass prism, a brass emitter, glowing crystal targets), on a deep night background with warm neon brick walls.
- Original inspiration (v1): PRISM by Clint Siu, for the calm, tactile feel.

## Why This Matters to the Learner
They want to build a light-bending game in this style. This proof of concept tests the feel of free-angle optics and placement.

## What "Working" Looks Like
In the browser you can play 3 levels end to end. You drag pieces from the inventory, move and rotate them freely, the beams re-trace live, and lighting every target completes the level. The "oh, that's cool" beat: rotating the prism and watching the spectrum fan across the board onto three coloured targets.

## The POC Boundary
- Free-angle 2D ray tracing with walls, mirrors (two-sided) and a dispersive prism (real refraction, 3 colour bands).
- White and coloured targets. A colour target needs a pure ray of its colour.
- An inventory tray with drag-to-place, drag-to-move, a rotation dial with a degree readout, and drag-back-to-tray to remove.
- 3 handcrafted levels, restart, level-complete transition, progress saved.
- Sound and glow carried over from v1.

## Later
Level editor, more optics (splitters, filters, lenses, portals), a level list screen, more levels, music tracks, PWA / iOS wrapper.

## Explicitly Cut
- Level list screen: 3 levels don't need it. Restart and progress are enough.
- Pre-placed fixed pieces: not needed to prove the kernel.
- The v1 grid / 90° mechanic: replaced by free-angle optics (the learner chose option 2).
