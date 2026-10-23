---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. You can twist a mirror and free the beam on level 1**
  Becomes usable: A running page with the stone seed, core, gate and one mirror. Drag or tap twists it with snapping, the beam re-routes live, and solving is detected.
  Why now: This is the kernel (twist → beam re-routes). It proves the scene, input and tracer end to end, including scaffolding.
  PRD ref: `prd.md > The Core Journey` (steps 1–3), `prd.md > Twisting pieces`, `prd.md > The beam`
  Spec ref: `spec.md > Components`, `spec.md > File Structure`, `spec.md > Look and Feel`
  Build: Scaffold Vite + TS + three, add types/levels/beam tracer, scene, board, input, springs, and level 1.
  Verify (mechanical): `npm run verify` passes. `npm run build` succeeds. Load in the browser pane with no console errors, tap the mirror, and confirm the beam reaches the gate.
  Learner check: Run `npm run dev`, drag the mirror around, and say whether twisting feels good.
  Commit: `Add twistable mirror and live beam on level 1`

- [x] **2. Solving opens the seed and carries you through 3 levels**
  Becomes usable: Levels 2 and 3 (including linked pieces), solve and assemble animations, progress saved, end card with play again.
  Why now: Completes the core loop. Linked pieces are the last mechanic.
  PRD ref: `prd.md > The Core Journey` (steps 4–6), `prd.md > Solving and progress`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Board renderer (src/render/board.ts)`, `spec.md > Data Model`, `spec.md > UI (src/ui.ts)`
  Build: Add levels 2–3, link grooves and follower rings, solve/assemble tweens, palette transitions, localStorage progress, `?level=N`, UI overlay and end card.
  Verify (mechanical): `npm run verify` confirms all 3 levels are solvable and start unsolved. In the browser, solve each level via scripted taps and confirm the transitions and the end card.
  Learner check: Play from level 1 to the end card and say whether the solve moment lands.
  Commit: `Add solve transition, linked pieces and three levels`

- [ ] **3. It sounds and glows**
  Becomes usable: Bloom on the beam, ambient pad, snap notes, solve arpeggio, mute toggle.
  Why now: Polish layered on a working loop, so it can't block the kernel.
  PRD ref: `prd.md > Sound`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Audio (src/audio.ts)`, `spec.md > Scene (src/render/scene.ts)`
  Build: Add the audio module wired to snaps and solves, the mute button, and the bloom composer.
  Verify (mechanical): Build passes, no console errors, the AudioContext starts after the first click, and the mute toggle flips the state.
  Learner check: Play with sound on and say whether it feels calm.
  Commit: `Add ambient sound and beam glow`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — combined with final review (learner asked for minimal ceremony)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence:
Route and stops:
Edit outcome:
Reflection:
Activity mode:

## Revisions

- Solve and assemble animations, progress saving and the end card were built alongside slice 1 instead of in slice 2 — they shared the board and loop code, so slice 2 became level content plus verification.
