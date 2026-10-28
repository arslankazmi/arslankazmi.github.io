# Gradient Descent Golf — design

A browser golf game where **you are the optimizer**. Each hole is a randomly generated loss
landscape seen from above as a contour map; the cup sits at the **global minimum**. You never aim
the ball — you pick an optimizer and its hyperparameters, press *Descend*, and the ball follows the
gradient for a fixed number of steps. Fewest strokes wins.

Lives at `/fun/gd-golf/`, a sibling of Tritris on the Fun wall. Same shape as the Tritris port:
plain HTML5 canvas + WebAudio, no framework, no build step.

```
fun/gd-golf/
  DESIGN.md   this file
  engine.js   pure logic (RNG, landscape, optimizers, shot sim, hole gen) — no DOM
  main.js     canvas render, UI, input, audio
  index.html  page chrome (personal/paper theme, dark playfield)
  test.mjs    node tests for engine.js (*.mjs → pruned from the published build)
```

## 1. The landscape

Domain is the square `[-1, 1]²`. A hole's loss is a sum of smooth, analytically differentiable
terms, so the gradient is exact (no finite differences in the game loop):

```
L(p) = k · ( u² + κ·v² )                    tilted, anisotropic bowl  (u,v = p − c rotated by θ)
     − Σ dᵢ · exp(−|p − mᵢ|² / 2wᵢ²)        wells   (the true cup + decoy "sand traps")
     + Σ hⱼ · exp(−|p − nⱼ|² / 2sⱼ²)        hills   (ridges to roll around / over)
```

* The **bowl** keeps the course walled in and supplies the *condition number* κ: large κ makes a
  long narrow ravine, where big steps zig-zag across the short axis.
* **Wells** create minima. One deep well is the intended cup; shallower decoys are local minima.
* **Hills** add saddles and plateaus.

## 2. Random holes

Every course is **9 holes from one seed** (mulberry32). The seed is shown in the HUD and kept in the
URL hash (`#seed=…`), so a course can be shared and replayed exactly. *New course* picks a fresh
seed.

Difficulty ramps with hole index `t = i/8`:

| knob | hole 1 | hole 9 |
|---|---|---|
| ravine condition number κ | ~1–2 | up to ~14 |
| decoy wells | 0–1 | 3–5 |
| hills | 1 | 2–3 |
| wind (minibatch gradient noise σ) | 0 (holes 1–3) | ~0.6 |

**Generation is rejection sampling.** A candidate hole is accepted only if:

1. **The cup is unambiguous.** Local minima are found by scanning a 96×96 grid for discrete minima
   and polishing each with gradient descent. The lowest becomes the cup; it must sit inside
   `[-0.8, 0.8]²` and beat the runner-up by ≥ 0.12 loss, so "the bottom" is never a coin-flip.
2. **The tee is far.** Tee is sampled in `[-0.88, 0.88]²` before the hazards are placed, and must
   end up ≥ 0.95 from the cup. On later holes each decoy/hill lands *on the tee→cup line* (with
   sideways jitter) with probability `t`, otherwise anywhere — so hazards get in the way as the
   course goes on instead of sitting harmlessly in a corner.
3. **It is solvable in one shot.** The engine plays the first stroke itself over a hyperparameter
   grid (GD × 14 learning rates, Momentum × 14 × 4 β values, Adam × 14) — with the *exact* wind the
   player will get on stroke 1 — and at least one configuration must sink it.

After 40 rejected candidates the generator relaxes (fewer decoys, lower κ), so it always
terminates.

**Par is data-driven**: the fraction `f` of the grid that holes it in one shot.
`f ≥ 30% → par 2`, `f ≥ 10% → par 3`, else `par 4`. Measured over 80 courses, `f` falls from
~27% on hole 1 to ~15% on hole 9, and par shifts from mostly 3 to a 3/4 mix.

## 3. A shot

The ball starts each stroke at rest wherever the last one ended. The player sets:

* **Optimizer** — `GD`, `Momentum`, `Adam`.
* **Learning rate η** — log slider, `1e-3 … 1`. Each optimizer remembers its own η.
* **Momentum β** — `0 … 0.99` (Momentum only; Adam uses fixed β₁=0.9, β₂=0.999).

Updates (with `g = ∇L(p) + σ·ε`, ε a seeded standard normal per step):

```
GD        p ← p − η·g
Momentum  v ← β·v − η·g ;  p ← p + v
Adam      m ← β₁m + (1−β₁)g ;  s ← β₂s + (1−β₂)g² ;  p ← p − η·m̂ / (√ŝ + 1e-8)
```

A stroke runs **up to 50 steps** and ends when one of:

| outcome | rule | golf meaning |
|---|---|---|
| **holed** | within the cup radius (0.05) *and* the step was short (< 0.06) | in the hole |
| **lip-out** | passed through the cup too fast | rolled over the cup |
| **out of bounds** | left `[-1, 1]²` or a non-finite loss | diverged → +1 penalty, ball returns |
| **stopped** | step < 2e-4 for 3 steps in a row | ball came to rest |
| **out of steps** | 50 steps used | ran out of epochs |

Wind is deterministic per `(hole seed, stroke #, step #)`, so a replayed seed plays identically and
the solvability check in §2 is exact for stroke 1. A hole is capped at **10 strokes** (picked up).

## 4. The caddie: every shot is an ML lesson

After each stroke the engine classifies what happened and the caddie line explains it in training
terms. The hole-complete card repeats the most instructive one.

| detected | caddie says (gist) |
|---|---|
| out of bounds | η beat ~2/λ on the steep axis — this is your loss going NaN |
| zig-zag (consecutive steps point opposite ways ≥ 40% of the time) | ill-conditioned ravine; momentum averages it out, Adam rescales each axis |
| stopped in a decoy well | local minimum; momentum / noise help you climb out |
| out of steps, barely moved | η too timid — a training run that never finishes |
| lip-out | too fast near the minimum — why we decay the learning rate late in training |
| holed with Adam / Momentum / GD | short note on why that optimizer suited the hole |

## 5. Screen

Dark playfield (like Tritris) inside the paper-theme page chrome.

* **Map** — filled contour bands, green fairway at low loss → sand → rough at high loss, with thin
  band-edge lines. Rendered once per hole into an offscreen canvas.
* **Ball** with a dotted trail of the current stroke; earlier strokes fade. A small arrow at the ball
  shows `−∇L` (where plain GD would go next). Flag at the cup. Tee marker.
* **HUD** — hole `n/9`, par, strokes, course total vs par, loss & |∇L| at the ball, wind, seed.
* **Controls** — optimizer buttons, η and β sliders, *Descend*. Keys: `Space` descend, `1/2/3`
  optimizer, `← →` η, `↑ ↓` β, `R` restart hole, `N` new course, `M` mute.
* **Scorecard** after hole 9: per-hole strokes vs par, total, best course stored in `localStorage`
  (try/catch, optional).

Audio (WebAudio, synthesized): soft tick per step, putt "plonk" when holed, a low buzz for
divergence. Mute persists in `localStorage`.

## 6. Testing

`node fun/gd-golf/test.mjs`:

* analytic gradient matches central finite differences on random holes;
* the same seed yields identical holes; different seeds differ;
* GD on a pure quadratic converges below `η < 2/λ` and diverges above it;
* for 200 seeds × 9 holes: generation terminates, cup is the lowest minimum found, tee distance
  holds, par ∈ {2, 3, 4}, and the recorded solving configuration really sinks the hole in one stroke;
* outcome classification (oob / holed / lip-out / stopped) on hand-built cases.

## 7. Out of scope (for now)

Hole editor, online leaderboard, 3-D view, second-order optimizers (Newton, L-BFGS), learning-rate
schedules as a player control.
