# Beam — Devpost submission draft

> Draft from our build notes. Read it through and put it in your own words where it doesn't sound like you. The hackathon asks for learner-written submissions.

## Project name

Beam

## Elevator pitch

A light-bending puzzle in your browser: place mirrors and prisms, split white light into a real rainbow, and steer every colour onto its target.

## About the project

## Inspiration

I was inspired by **PRISM**, a calm, tactile iOS puzzle game from around 2016–2018. I wanted to see if I could build something with that same feeling — and thought it would be fun. Along the way it found its own identity: a dark, neon stage where the puzzle *is* the light. You drop a glass prism into a white beam, turn it, and watch it fan into a rainbow that you steer, colour by colour, onto matching targets.

## What it does

- You drag **mirrors** and **prisms** from an inventory onto the board and turn them with a dial.
- A white beam from the emitter reflects off mirrors, and a prism **disperses** it into a spectrum.
- Each target lights only when a beam of **its** colour reaches it. Light every target to finish the level.
- There are **10 levels**: 3 handcrafted, and 7 picked from a puzzle generator that proves each level is solvable.

## How we built it

Beam is TypeScript + **three.js**, built with Vite, and runs in any modern browser.

**The optics are real.** Rays reflect off mirrors (\\( \mathbf{d}' = \mathbf{d} - 2(\mathbf{d}\cdot\mathbf{n})\mathbf{n} \\)) and refract through glass using Snell's law, including total internal reflection:

$$ n_1 \sin\theta_1 = n_2 \sin\theta_2 $$

Dispersion comes from making the refractive index depend on wavelength, using Cauchy's equation:

$$ n(\lambda) = A + \frac{B}{\lambda^2} $$

For gameplay, light is traced as white plus three bands (red, green, blue). For the visuals, it's traced as **24 wavelengths**. Each one is coloured with a spectral fit and normalised so that all 24 add back up to exactly white. That way the fan starts white at the prism and separates into a smooth rainbow as it spreads.

**Making light look like light.** A glowing line isn't light. Light is what it does to the things around it. Each beam has:
- an HDR white-hot core inside a soft coloured halo, with slow drifting haze;
- a faint Fresnel reflection off the glass face;
- a blurred, low-resolution **light buffer** that the floor and walls sample, so beams actually illuminate the stage.

Tone mapping is AgX, with bloom only above HDR 1.0. Textures (brick, concrete, brushed steel, silver, fingerprint smudges) and a studio HDRI for reflections are CC0 assets from Poly Haven and ambientCG.

**A puzzle engine.** Levels are generated **solution-first** from a seed and a complexity "salt" from 1 to 10. The engine:
1. walks the beam from the emitter and drops pieces at chosen turns;
2. places targets on the resulting light, then adds walls that block shortcuts but never the solution;
3. validates the result: the stored solution must replay (which proves the level is solvable), the empty board must be unsolved, and every piece must have angle slack;
4. runs a separate annealing **solver** that tries to beat the level with *fewer* pieces, and rejects the level if it succeeds.

The solver's effort also measures difficulty, which is how the 7 generated levels were picked for a smooth ramp.

**Planning first.** I used the Devpost Learn skill pack with Claude Code. It walked me through scope → PRD → spec → build, with the docs in `devpost/`.

## Challenges we ran into

- **The first version was the wrong game.** It started as a calm grid puzzle with 90° turns. After seeing the neon light-bending vibe I actually wanted, I rebuilt it around free-angle optics and placing pieces from an inventory.
- **Light that looked like a line.** Getting from "a glowy stripe" to something that reads as real light took research: floor illumination, a spectral fan instead of three hard colours, and fixing overblown bloom, blocky halos and distracting sparkles.
- **Difficulty.** Free rotation was too fiddly. Adding 5° detents, generating every solution on that grid, and a faint "warmer/colder" glow on targets made it much friendlier.
- **Proving levels are solvable.** A solver can find solutions but can't prove that none exist. The trick was to build every level around a known solution and use the solver only to hunt for shortcuts.
- **Speed.** I compressed the assets from 10 MB to 0.7 MB, loaded the reflection image lazily, rendered shadows only when something moves, and kept the generator out of the game bundle. The first download is about 175 KB gzipped.

## Accomplishments that we're proud of

- The moment the prism fans white light into a rainbow across the floor.
- Every level is verified solvable by a script (`npm run verify`), and the same seed always produces the same level.

## What we learned

- **Plan before you build.** Writing a scope, PRD and spec first made big pivots, like the full rebuild, manageable.
- Real optics: Snell's law, dispersion, Fresnel, and how HDR, tone mapping and bloom work together.
- Procedural generation: generate solution-first, then validate, and measure difficulty with a solver.

## What's next for Beam

- Colour filters, beam splitters and lenses.
- A level editor.
- More levels.
- Composed music.
- An installable mobile version.

## Built with

`typescript` · `three.js` · `webgl` · `glsl` · `vite` · `web-audio-api` · `web-workers` · `html5` · `css3` · `node.js` · `vercel` · `claude-code` · `poly-haven` · `ambientcg`

## "Try it out" links

- Live game: *(add your Vercel URL after deploying)*
- Source code: *(add your public GitHub repo URL)*

## Project media

Gallery images (1800×1200, 3:2) are in `media-kit/`:

1. `01-prism-fan.png`: white light splitting through the prism onto three targets (use as the cover).
2. `02-around-the-corner.png`: a mirror folds the beam down into the prism.
3. `03-full-spectrum.png`: level 10 solved.
4. `04-dial.png`: turning a mirror with the orange dial.
5. `05-one-colour.png`: steering a single colour.
6. `06-the-long-way.png`: a longer route.

## Video demo link

Upload `media-kit/beam-demo.webm` to YouTube (or Vimeo), then paste the link here.
