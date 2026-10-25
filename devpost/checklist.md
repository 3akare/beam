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

- [x] **3. It sounds and glows**
  Becomes usable: Bloom on the beam, ambient pad, snap notes, solve arpeggio, mute toggle.
  Why now: Polish layered on a working loop, so it can't block the kernel.
  PRD ref: `prd.md > Sound`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Audio (src/audio.ts)`, `spec.md > Scene (src/render/scene.ts)`
  Build: Add the audio module wired to snaps and solves, the mute button, and the bloom composer.
  Verify (mechanical): Build passes, no console errors, the AudioContext starts after the first click, and the mute toggle flips the state.
  Learner check: Play with sound on and say whether it feels calm.
  Commit: `Add ambient sound and beam glow`

- [x] **4. You can place a mirror from the tray and bend the beam to light a target**
  Becomes usable: The dark neon board, emitter, walls and a white target. Drag a mirror from the tray, move it, rotate it on the dial, and watch the beam re-trace live. Lighting the target completes level 1.
  Why now: This is the new kernel's foundation (free-angle tracing, placement, dial) and replaces the v1 grid.
  PRD ref: `prd.md > The Core Journey` (steps 1–4, 6), `prd.md > Placing and moving`, `prd.md > Rotating`
  Spec ref: `spec.md > Optics tracer (src/game/optics.ts)`, `spec.md > Input (src/input.ts)`, `spec.md > Look and Feel`
  Build: Replace the grid tracer, board, input and UI with the v2 versions. Level 1 with a stored solution. Update the verify script.
  Verify (mechanical): `npm run verify` passes. Build passes. In the browser, scripted placement of the solution lights the target and completes the level, with no console errors.
  Learner check: Drag a mirror out, turn it, and light the target. Say whether moving and rotating feel good.
  Commit: `Rebuild as free-angle optics with inventory placement`

- [x] **5. A prism splits white light onto coloured targets across 3 levels**
  Becomes usable: Prism dispersion, colour targets, levels 2–3, the completion transition, restart, progress and the end card.
  Why now: This is the "white in, colour out" kernel moment, plus the full loop.
  PRD ref: `prd.md > Optics`, `prd.md > Completion and progress`, `prd.md > The Core Journey` (steps 5, 7, 8)
  Spec ref: `spec.md > Optics tracer (src/game/optics.ts)`, `spec.md > Board renderer (src/render/board.ts)`
  Build: Prism refraction with dispersion and TIR, colour targets, levels 2–3 with stored solutions, transitions and sounds.
  Verify (mechanical): `npm run verify` shows all 3 levels unsolved when empty and solved by their stored solutions. A scripted browser play-through reaches the end card.
  Learner check: Play to the end card and say whether the prism moment lands.
  Commit: `Add dispersive prism, colour targets and three levels`

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
- v2 rebuild (slices 4–5): the learner chose a 2D view with 3D-looking assets, the Prism Rules vibe, free-angle optics and inventory placement. This replaces the v1 grid mechanic from slices 1–3. Sound, bloom, progress and the build setup carry over.
- Slices 4 and 5 landed in one commit: the optics engine (mirrors and prism) and all three levels were built and verified together, because level design needed the full tracer.
- Level 3's mirror has a narrow angle window (about 2°). Arrow keys turn in 0.5° steps and the wheel in 1° steps so it stays playable. Targets were kept at radius 0.32 because larger ones block the neighbouring colours.
