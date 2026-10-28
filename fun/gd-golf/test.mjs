/* ============================================================================
   test.mjs — checks for the Gradient Descent Golf engine (see DESIGN.md §6).
   Run: `node fun/gd-golf/test.mjs` (optionally SEEDS=500).
   This file is *.mjs so the site build prunes it from the published tree.
   ============================================================================ */
import "./engine.js";
const E = globalThis.GolfEngine;
const { lossGrad, simulate, classify, generateHole, Course, GRID, HOLES, CUP_R, MAX_STROKES } = E;

let passed = 0;
const fails = [];
function ok(cond, msg) { if (cond) passed++; else fails.push(msg); }

// A hand-built hole: a pure round bowl (λ = 2k along every axis), cup at the origin.
function bowl(extra = {}) {
  const h = { seed: 1, theta: 0, kappa: 1, k: 1, c: [0, 0], wells: [], hills: [], wind: 0, ...extra };
  h.minima = [{ x: h.c[0], y: h.c[1], loss: 0 }];
  h.cup = [h.c[0], h.c[1]];
  return h;
}

// --- gradient is exact ----------------------------------------------------------
{
  const h = generateHole(E.seedToInt("gradck"), 8);
  const eps = 1e-6;
  let worst = 0;
  const rand = E.mulberry32(7);
  for (let i = 0; i < 300; i++) {
    const x = -1 + 2 * rand(), y = -1 + 2 * rand();
    const [, gx, gy] = lossGrad(h, x, y);
    const fx = (E.loss(h, x + eps, y) - E.loss(h, x - eps, y)) / (2 * eps);
    const fy = (E.loss(h, x, y + eps) - E.loss(h, x, y - eps)) / (2 * eps);
    worst = Math.max(worst, Math.abs(fx - gx) / (1 + Math.abs(fx)), Math.abs(fy - gy) / (1 + Math.abs(fy)));
  }
  ok(worst < 1e-5, `analytic gradient matches finite differences (worst rel err ${worst.toExponential(2)})`);
}

// --- determinism --------------------------------------------------------------------
{
  const a = generateHole(E.seedToInt("same"), 4), b = generateHole(E.seedToInt("same"), 4);
  ok(JSON.stringify(a) === JSON.stringify(b), "same seed → identical hole");
  const c = generateHole(E.seedToInt("other"), 4);
  ok(JSON.stringify(a.cup) !== JSON.stringify(c.cup), "different seed → different hole");
  const s1 = simulate(a, a.tee, { opt: "momentum", lr: 0.05, beta: 0.9 }, 3);
  const s2 = simulate(a, a.tee, { opt: "momentum", lr: 0.05, beta: 0.9 }, 3);
  ok(JSON.stringify(s1.path) === JSON.stringify(s2.path), "windy stroke replays identically");
}

// --- GD on a quadratic: converges below 2/λ, diverges above --------------------------
{
  const h = bowl();                 // λ = 2 → critical η = 1
  const start = [0.6, -0.4];
  const slow = simulate(h, start, { opt: "gd", lr: 0.3, beta: 0 }, 1);
  ok(slow.outcome === "holed", `GD η=0.3 < 2/λ holes a round bowl (got ${slow.outcome})`);
  const wild = simulate(h, start, { opt: "gd", lr: 1.2, beta: 0 }, 1);
  ok(wild.outcome === "oob", `GD η=1.2 > 2/λ diverges (got ${wild.outcome})`);
  ok(classify(h, wild, { opt: "gd" }) === "oob", "divergence classified as oob");
  const tiny = simulate(h, start, { opt: "gd", lr: 0.001, beta: 0 }, 1);
  ok(tiny.outcome === "steps" && classify(h, tiny, { opt: "gd" }) === "timid", "tiny η runs out of steps, classified timid");
}

// --- zig-zag in a ravine ----------------------------------------------------------------
{
  const h = bowl({ kappa: 12, k: 1 });       // steep axis λ = 24 → critical η ≈ 0.083
  const res = simulate(h, [0.8, 0.3], { opt: "gd", lr: 0.075, beta: 0 }, 1);
  ok(res.zigzag >= 0.4, `GD near critical η zig-zags in a ravine (flip rate ${res.zigzag.toFixed(2)})`);
}

// --- lip-out ------------------------------------------------------------------------------
{
  // Momentum with a huge β flies straight through the cup at speed.
  const h = bowl();
  const res = simulate(h, [0.9, 0], { opt: "momentum", lr: 0.2, beta: 0.97 }, 1);
  ok(res.lipped, "fast momentum through the cup counts as a lip-out");
}

// --- a ball at rest in a decoy is a trap ----------------------------------------------------
{
  const h = bowl({ wells: [{ x: 0.6, y: 0.6, d: 0.5, w: 0.1 }] });
  h.minima = E.findMinima(h);
  const res = simulate(h, [0.62, 0.58], { opt: "gd", lr: 0.01, beta: 0 }, 1);
  ok(classify(h, res, { opt: "gd" }) === "trap", `resting in a decoy well is a trap (got ${classify(h, res, { opt: "gd" })})`);
}

// --- generated courses ------------------------------------------------------------------------
const SEEDS = Number(process.env.SEEDS || 60);
{
  const t0 = performance.now();
  let holes = 0, bad = 0, worstAttempts = 0;
  const pars = { 2: 0, 3: 0, 4: 0 };
  for (let s = 0; s < SEEDS; s++) {
    const seed = E.hash(s, 0xc0);
    for (let i = 0; i < HOLES; i++) {
      const h = generateHole(seed, i);
      holes++;
      worstAttempts = Math.max(worstAttempts, h.attempts);
      pars[h.par]++;
      const lowest = h.minima.every((m) => m.loss >= h.cupLoss - 1e-9);
      const far = Math.hypot(h.tee[0] - h.cup[0], h.tee[1] - h.cup[1]) >= 0.95;
      const inside = Math.abs(h.cup[0]) <= 0.8 && Math.abs(h.cup[1]) <= 0.8;
      const solves = simulate(h, h.tee, h.solution, 1).outcome === "holed";
      const parOk = h.par === 2 || h.par === 3 || h.par === 4;
      const calm = i >= 3 || h.wind === 0;
      const unlocked = JSON.stringify(h.allowed) === JSON.stringify(E.allowedFor(i)) && h.allowed.includes(h.solution.opt);
      if (!(lowest && far && inside && solves && parOk && calm && unlocked)) {
        bad++;
        if (bad <= 5) fails.push(`seed ${s} hole ${i + 1}: lowest=${lowest} far=${far} inside=${inside} solves=${solves} par=${h.par} calm=${calm} unlocked=${unlocked}`);
      }
    }
  }
  ok(bad === 0, `all ${holes} generated holes valid`);
  const ms = (performance.now() - t0) / holes;
  console.log(`  ${holes} holes, ${ms.toFixed(1)} ms/hole, worst ${worstAttempts} attempts, pars`, pars);
  ok(ms < 150, `generation is fast enough for the browser (${ms.toFixed(1)} ms/hole)`);
}

// --- course flow ---------------------------------------------------------------------------------
{
  const c = new Course("flow01");
  // Play every hole with its known solution: each should be a hole-in-one.
  for (let i = 0; i < HOLES; i++) {
    const shot = c.shoot(c.hole.solution);
    ok(shot.res.outcome === "holed" && c.done, `course hole ${i + 1} holes with its solution`);
    if (i < HOLES - 1) ok(c.nextHole(), `advance to hole ${i + 2}`);
  }
  ok(c.finished && c.totalStrokes === HOLES, `9 aces → ${c.totalStrokes} strokes`);
  ok(!c.nextHole(), "no hole after 9");

  const d = new Course("flow02");
  const before = d.ball.slice();
  d.shoot({ opt: "gd", lr: 1, beta: 0 });
  const last = d.shots[0];
  if (last.res.outcome === "oob") {
    ok(d.strokes === 2 && d.ball[0] === before[0] && d.ball[1] === before[1], "oob = stroke + penalty, ball returns");
  }
  while (!d.done) d.shoot({ opt: "gd", lr: 0.001, beta: 0 });
  ok(d.strokes === MAX_STROKES && d.pickedUp, "picked up at the stroke cap");
}

// --- optimizer unlocks ------------------------------------------------------------------------------
{
  ok(JSON.stringify(E.allowedFor(0)) === '["gd"]' && JSON.stringify(E.allowedFor(2)) === '["gd"]', "holes 1–3: GD only");
  ok(JSON.stringify(E.allowedFor(3)) === '["gd","momentum"]' && JSON.stringify(E.allowedFor(5)) === '["gd","momentum"]', "holes 4–6: + Momentum");
  ok(E.allowedFor(6).length === 3 && E.allowedFor(8).includes("adam"), "holes 7–9: + Adam");
  const c = new Course("locks1");
  ok(c.shoot({ opt: "adam", lr: 0.03, beta: 0 }) === null && c.strokes === 0, "a locked optimizer can't be used (no stroke taken)");
  ok(c.shoot({ opt: "gd", lr: 0.01, beta: 0 }) !== null && c.strokes >= 1, "an unlocked optimizer can");
}

ok(E.scoreName(1, 3) === "Hole in one!" && E.scoreName(2, 3) === "Birdie" && E.scoreName(5, 3) === "Double bogey", "score names");
ok(CUP_R > 0 && GRID.length === 84, "grid has 84 configs");

console.log(`${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log("  ✗ " + f);
process.exit(fails.length ? 1 : 0);
