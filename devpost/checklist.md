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

- [x] **6. An engine generates endless, validated puzzles from a seed and a complexity**
  Becomes usable: After the 3 handcrafted levels, an endless run of generated levels that get harder. `?seed=…&complexity=1..10` plays any specific puzzle. Skip button. `npm run generate` inspects levels from the command line.
  Why now: The learner asked for a rule-based engine, a validator that proves solvability, and a complexity "salt" for endless, harder levels.
  PRD ref: `prd.md > The Core Journey`
  Spec ref: `spec.md > Optics tracer (src/game/optics.ts)`
  Build: Seeded RNG, a recipe per complexity (archetypes bounce/split/pick/steer, pieces, walls, bolted pieces, decoys, required slack), a solution-first generator, a validator (replays the solution, empty board unsolved, angle slack, no solution with fewer pieces via the solver), a stochastic annealing solver for difficulty and shortcut checks, a worker plus prefetch in the game, and fixed-piece rendering.
  Verify (mechanical): `npm run verify` validates the handcrafted levels plus one generated level per complexity 1–10, and checks determinism. In the browser, a custom seed loads and solving it advances to the next generated level.
  Learner check: Play into the endless levels, and try `?seed=anything&complexity=8`.
  Commit: `Add seeded level generator, validator and solver`

- [x] **7. Light that looks like light, on real materials**
  Becomes usable: Beams with a hot core, soft halo and gentle haze that light the floor and walls around them (a blurred half-res light buffer). A 24-wavelength spectral fan through the prism (Cauchy dispersion, Zucconi spectrum, normalised to white). A Fresnel ghost reflection off glass. Impact flares on walls and mirrors. AgX tone mapping, bloom over 1.0, vignette, grain and dither. CC0 assets: a neon-studio HDRI, brick, concrete, brushed steel, silver and fingerprint maps.
  Why now: The learner said the beam "just looks like a straight line that is glowy" and the assets looked poor. The research report ranked these techniques by impact.
  PRD ref: `prd.md > Look and Feel`
  Spec ref: `spec.md > Look and Feel`
  Build: `src/game/light.ts` (visual spectral tracer), `src/render/beams.ts`, `src/render/lighting.ts`, `src/render/assets.ts`, and stage post-processing in `src/render/scene.ts`.
  Verify (mechanical): Build passes, no console errors, and screenshots of levels 2–3 show the spectral fan, floor light and flares.
  Learner check: Look at a prism level and say whether the light now feels right.
  Commit: `Make light physical: spectral dispersion, floor light, real materials`

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
- Generator (slice 6) added at the learner's request (2026-10-25): endless validated levels from seed + complexity. Solvability is proven by replaying each level's built-in solution. The solver only estimates difficulty and hunts shortcuts, because it can't prove unsolvability.
- Learner feedback on slice 7 (2026-10-25): removed the sparkling specks in the beams, the pulsing flares and the target flares. Dust is reduced to a faint few, and target orbs are smooth and still (their spinning facets glinted). The light spill is now blurred to remove its blocky edges.
- Asset downloads (learner-approved): 7 CC0 assets. Christoph Peters' blue-noise zip turned out to be 42 MB, so it was skipped in favour of shader-computed interleaved-gradient noise.
