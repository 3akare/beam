---
doc: scope
status: approved
---
<!-- Approved by delegation: the learner asked the agent to make the planning decisions and go straight to building (2026-10-23). -->

# beam

A calm, wordless 3D puzzle in the browser: twist the pieces of a floating stone "seed" until the light trapped inside escapes.

## The Unique Kernel
The puzzle *is* a beam of light. You physically twist mirror pieces with your finger or mouse; the beam re-routes live as each piece snaps, and the moment it finds the gate the seed unfolds and the light carries you onward.

## Who It's For
Someone who enjoyed PRISM / Monument Valley-style games and wants a few quiet minutes of tactile puzzling on a laptop or phone browser, with no install, no text, and no timers.

## The Core Loop
Look at the seed → find where the light is stuck → twist a piece (drag or tap) → watch the beam re-route → repeat until the beam escapes through the gate → the seed opens and the next one assembles.

## Inspiration & Identity
- PRISM by Clint Siu (mood: minimal, ambient, tactile, wordless). Identity is our own: beam-and-mirror puzzles on a stone seed, not PRISM's shapes or levels.
- Soft pastel backgrounds, matte stone pieces, one bright warm beam that glows. Each piece clicks with a musical note.

## Why This Matters to the Learner
They want to build a game in this genre. This proof of concept (PoC) tests the feel before the bigger roadmap.

## What "Working" Looks Like
In a browser you can play 3 short levels end to end. You twist the pieces, the beam visibly re-routes, and solving a level makes the seed open up before the next level assembles. The "oh, that's cool" beat: the last snap makes the beam shoot out through the gate and the walls fold open.

## The POC Boundary
- One board type: a small square grid with walls, a light core, a gate, and rotatable mirror pieces.
- Interactions: drag to twist a piece with snapping, or tap to turn it 90°.
- Linked pieces: twisting one also turns another (level 3).
- 3 handcrafted levels, solve animation, transition, progress saved in the browser.
- Simple synthesized sound and glow.

## Later
Level editor, more mechanics (sliders, hinges, splitters, camera orbit), chapters with palettes, layered adaptive music, PWA / iOS wrapper, accessibility options.

## Explicitly Cut
- Free camera orbit: conflicts with drag-to-twist; it needs its own design pass.
- Level editor: valuable, but not needed to prove the kernel.
- Text tutorials: against the wordless pillar; level 1 teaches by design.
- Accounts, leaderboards, monetisation: irrelevant to the feel.
