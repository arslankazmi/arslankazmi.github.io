# Ninja Ascent — design

An endless vertical runner. A ninja sprints **up** the gap between two skyscrapers, running on one
building's face at a time. **Jump** wall-jumps across to the other building; **Slash** swings the
sword. Things fall from above and sit in the ninja's path on each wall. There are three kinds:

| kind | what you do | how it reads on screen |
|---|---|---|
| **collectable** | run or jump through it | gold, glowing, bobbing |
| **avoidable** | don't touch it — jump to the other wall or time a jump through the gap | metal / stone, red warning outline |
| **cuttable** | slash it (touching it uncut hurts) | wood / fruit, with a faint dashed cut line |

The sword only cuts cuttables. Slashing an avoidable does nothing, and slashing a collectable
doesn't destroy it.

The author set the premise, the two buildings, one surface at a time, jump = switch buildings,
falling objects plus wall objects, the three object types and a slash that only cuts cuttables.
**Everything below is the builder's call** unless noted.

Lives at `/fun/ninja-ascent/`, a sibling of Tritris and Gradient Descent Golf. Same shape: plain
HTML5 canvas + WebAudio, no framework, no build step, no external assets.

```
fun/ninja-ascent/
  DESIGN.md   this file
  engine.js   pure game logic (fixed-step sim, spawner, collisions) — no DOM
  main.js     canvas render, input, audio, overlays
  index.html  page chrome (personal/paper theme, dark playfield)
  test.mjs    node tests for engine.js (*.mjs → pruned from the published build)
```

## 1. Space and camera

* A portrait **360 × 640** logical playfield, scaled to fit. The left building's inner face is at
  `x = 56`, the right one's at `x = 304`, so the gap is 248 px wide.
* The ninja stays at a fixed screen height (`y = 480`); the **world scrolls down** past them.
  Distance climbed is shown in metres (10 px = 1 m).
* Scroll speed ramps with distance from 230 px/s toward a cap of 520 px/s
  (`230 + 290·(1 − e^(−d/9000))`).

## 2. The ninja

* **Running:** feet on one face, hugging it. Wall objects on that face collide; objects on the
  other face can't reach.
* **Jump** (`Space` / `↑` / `W`, or the left on-screen button): a 0.30 s arc across the gap with a
  small hop. No second jump mid-air. While airborne, wall objects can't touch the ninja, but
  falling objects in the gap can.
* **Slash** (`J` / `X` / `K`, or the right on-screen button): a 0.16 s swing with a 0.32 s
  cooldown. The hit zone reaches up and out from the wall (or all around the ninja mid-air). It
  cuts every cuttable it touches.
* **3 hearts.** Touching an avoidable, or a cuttable you didn't cut, costs a heart, breaks that
  object and gives 1.2 s of invulnerability (the ninja flashes). Zero hearts ends the run.

## 3. Objects

| | on a wall (scrolls with the building) | falling (faster than the scroll) |
|---|---|---|
| collectable | coin trails | coin arcs across the gap; rare **onigiri** = +1 heart (max 3) |
| avoidable | spikes, AC units | flower pots, cinder blocks |
| cuttable | wooden planks, paper lanterns | crates, watermelons |

Falling objects drop either hugging a building face (a threat to a ninja running there) or down
the middle (a threat to a ninja mid-jump).

## 4. Spawning, and keeping it fair

The spawner emits a **row** every `0.95 s → 0.55 s` (shrinking with difficulty `d = min(1,
distance / 12000)`). Each row is one weighted **pattern**: wall hazard, wall cuttable, wall coins,
coin arc, falling hazard, falling cuttable, a hazard-plus-cuttable combo (only once `d > 0.35`), or
a rare onigiri when hurt. Hazards get more common and falling ones only appear once the run is
under way.

Fairness is enforced on **arrival times**, meaning when each avoidable will reach the ninja's line:

* two avoidables on **opposite walls** never arrive within **0.55 s** of each other, so there's
  always time to be on the safe side;
* a **centre-drop** avoidable never arrives within **0.40 s** of a wall avoidable, so you're never
  forced to jump into one.

A pattern that would break a rule is redrawn (up to 6 tries, then the row is just coins).
Cuttables don't count as hazards here, because you can always cut them.

## 5. Score

`score = metres + 10·coins + 25·cuts`. The HUD shows metres, coins, hearts and score. The best
score is stored in `localStorage` (try/catch, optional).

## 6. Look and sound

* Night sky with a moon and a parallax skyline (scrolls at 0.2×). Building faces have a window grid
  with deterministic lit windows, edge highlights and rooftop-free endless height.
* Ninja: a black silhouette with a red headband whose tails stream behind, legs cycling against the
  wall, a sword on the back, a tuck-and-spin mid-jump, and an arc trail on a slash.
* Particles for cuts (wood chips / melon splash), coin sparkles and hits. A short screen shake on a
  hit.
* Synthesized WebAudio: jump whoosh, slash swish, cut thunk, coin ding, hit thud, game-over sting.
  `M` mutes (persisted). `P` or leaving the tab pauses.

## 7. Testing

`node fun/ninja-ascent/test.mjs`:

* the same seed gives the same run;
* jump crosses in 0.30 s; no jump mid-air;
* the slash cuts cuttables in range, but not avoidables, collectables or anything out of range;
* hits cost one heart, i-frames block a double hit, and zero hearts ends the run;
* coins and onigiri apply; speed ramps monotonically and respects the cap;
* **fairness:** over long simulated runs, avoidable arrivals never break the §4 rules;
* **playability:** a simple look-ahead bot (jump away from incoming hazards, slash incoming
  cuttables) survives well past the early game on most seeds.

## 8. Out of scope (for now)

Power-ups beyond onigiri, characters/skins, online leaderboard, sprite art (the art is drawn in code
and can be swapped for openly licensed sprites later).
