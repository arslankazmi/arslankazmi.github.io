/* ============================================================================
   engine.js — Gradient Descent Golf core logic (see DESIGN.md).

   Pure logic only — no DOM, no canvas, no audio. A course is 9 randomly
   generated holes from one seed; each hole is an analytic loss landscape on
   [-1,1]² whose global minimum is the cup. A stroke is a run of optimizer
   steps from where the ball rests. Classic script: sets globalThis.GolfEngine
   so it works as a browser <script> and via import in the Node test.
   ============================================================================ */
(function () {
  "use strict";

  // --- config ---------------------------------------------------------------
  const HOLES = 9;
  const STEPS = 50;          // optimizer steps per stroke
  const CUP_R = 0.05;        // cup radius
  const LIP = 0.06;          // a step longer than this rolls over the cup
  const REST = 2e-4;         // a step shorter than this (3x running) = at rest
  const MAX_STROKES = 10;    // pick up after this many
  const LR_MIN = 1e-3, LR_MAX = 1;
  const LRS = Array.from({ length: 14 }, (_, i) => 10 ** (-3 + (3 * i) / 13));
  const BETAS = [0.5, 0.8, 0.9, 0.95];
  const ADAM_B1 = 0.9, ADAM_B2 = 0.999, ADAM_EPS = 1e-8;
  const OPTIMIZERS = ["gd", "momentum", "adam"];
  const OPT_NAMES = { gd: "GD", momentum: "Momentum", adam: "Adam" };

  // --- seeded randomness ----------------------------------------------------
  function mulberry32(a) {
    a >>>= 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Mix any number of integers into one 32-bit seed. */
  function hash(...nums) {
    let h = 0x811c9dc5;
    for (const n of nums) {
      h ^= n >>> 0;
      h = Math.imul(h, 0x01000193);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return h >>> 0;
  }
  /** Course seeds are short strings (shareable in the URL); map to an int. */
  function seedToInt(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function randomSeed(rand = Math.random) {
    return Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0");
  }
  function gauss(rand) {
    const u = Math.max(rand(), 1e-12), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // --- the landscape ----------------------------------------------------------
  /** Loss and exact gradient at (x, y): returns [L, dL/dx, dL/dy]. */
  function lossGrad(h, x, y) {
    const c = Math.cos(h.theta), s = Math.sin(h.theta);
    const dx = x - h.c[0], dy = y - h.c[1];
    const u = c * dx + s * dy, v = -s * dx + c * dy;
    let L = h.k * (u * u + h.kappa * v * v);
    const du = 2 * h.k * u, dv = 2 * h.k * h.kappa * v;
    let gx = du * c - dv * s, gy = du * s + dv * c;
    for (const w of h.wells) {
      const rx = x - w.x, ry = y - w.y, inv = 1 / (w.w * w.w);
      const e = w.d * Math.exp(-(rx * rx + ry * ry) * 0.5 * inv);
      L -= e; gx += e * rx * inv; gy += e * ry * inv;
    }
    for (const b of h.hills) {
      const rx = x - b.x, ry = y - b.y, inv = 1 / (b.s * b.s);
      const e = b.h * Math.exp(-(rx * rx + ry * ry) * 0.5 * inv);
      L += e; gx -= e * rx * inv; gy -= e * ry * inv;
    }
    return [L, gx, gy];
  }
  const loss = (h, x, y) => lossGrad(h, x, y)[0];

  /** All local minima: discrete grid minima polished with backtracking GD. */
  function findMinima(h, n = 96) {
    const vals = new Float64Array(n * n);
    const at = (i) => -1 + (2 * i) / (n - 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[j * n + i] = loss(h, at(i), at(j));
    const found = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = vals[j * n + i];
        let isMin = true;
        for (let dj = -1; dj <= 1 && isMin; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
            if (vals[jj * n + ii] < v) { isMin = false; break; }
          }
        }
        if (!isMin) continue;
        const p = polish(h, at(i), at(j));
        if (found.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < 0.03)) continue;
        found.push(p);
      }
    }
    return found.sort((a, b) => a.loss - b.loss);
  }
  function polish(h, x, y) {
    let [L, gx, gy] = lossGrad(h, x, y), a = 0.01;
    for (let it = 0; it < 300 && Math.hypot(gx, gy) > 1e-7; it++) {
      const nx = x - a * gx, ny = y - a * gy, nL = loss(h, nx, ny);
      if (nL < L) { x = nx; y = ny; [L, gx, gy] = lossGrad(h, x, y); a *= 1.3; }
      else a *= 0.5;
      if (a < 1e-12) break;
    }
    return { x, y, loss: L };
  }

  // --- a stroke ----------------------------------------------------------------
  function inBounds(x, y) { return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 1 && Math.abs(y) <= 1; }
  /** Closest distance from point c to segment a→b. */
  function segDist(ax, ay, bx, by, cx, cy) {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    const t = l2 ? Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / l2)) : 0;
    return Math.hypot(ax + t * vx - cx, ay + t * vy - cy);
  }

  /**
   * Play one stroke from `start` with optimizer config `cfg` ({opt, lr, beta}).
   * Wind is seeded by (hole.seed, stroke), so replays are exact.
   * Returns {path:[[x,y],...], outcome, lipped, zigzag, travelled}.
   * outcome ∈ holed | oob | stopped | steps.
   */
  function simulate(h, start, cfg, stroke) {
    const rand = mulberry32(hash(h.seed, stroke, 0x5eed));
    let [x, y] = start;
    const path = [[x, y]];
    let vx = 0, vy = 0, mx = 0, my = 0, sx = 0, sy = 0;
    let rest = 0, lipped = false, flips = 0, travelled = 0, pdx = 0, pdy = 0;
    let outcome = "steps";
    for (let t = 1; t <= STEPS; t++) {
      let [, gx, gy] = lossGrad(h, x, y);
      if (h.wind) { gx += h.wind * gauss(rand); gy += h.wind * gauss(rand); }
      let dx, dy;
      if (cfg.opt === "momentum") {
        vx = cfg.beta * vx - cfg.lr * gx; vy = cfg.beta * vy - cfg.lr * gy;
        dx = vx; dy = vy;
      } else if (cfg.opt === "adam") {
        mx = ADAM_B1 * mx + (1 - ADAM_B1) * gx; my = ADAM_B1 * my + (1 - ADAM_B1) * gy;
        sx = ADAM_B2 * sx + (1 - ADAM_B2) * gx * gx; sy = ADAM_B2 * sy + (1 - ADAM_B2) * gy * gy;
        const c1 = 1 - ADAM_B1 ** t, c2 = 1 - ADAM_B2 ** t;
        dx = (-cfg.lr * (mx / c1)) / (Math.sqrt(sx / c2) + ADAM_EPS);
        dy = (-cfg.lr * (my / c1)) / (Math.sqrt(sy / c2) + ADAM_EPS);
      } else {
        dx = -cfg.lr * gx; dy = -cfg.lr * gy;
      }
      const nx = x + dx, ny = y + dy, len = Math.hypot(dx, dy);
      if (t > 1 && dx * pdx + dy * pdy < 0) flips++;
      pdx = dx; pdy = dy;
      if (!inBounds(nx, ny)) {
        const fx = Number.isFinite(nx) ? Math.max(-1.05, Math.min(1.05, nx)) : x;
        const fy = Number.isFinite(ny) ? Math.max(-1.05, Math.min(1.05, ny)) : y;
        path.push([fx, fy]);
        outcome = "oob";
        break;
      }
      const dCup = Math.hypot(nx - h.cup[0], ny - h.cup[1]);
      travelled += len;
      if (dCup < CUP_R && len < LIP) {
        path.push([h.cup[0], h.cup[1]]);
        outcome = "holed";
        break;
      }
      if (len >= LIP && segDist(x, y, nx, ny, h.cup[0], h.cup[1]) < CUP_R) lipped = true;
      x = nx; y = ny;
      path.push([x, y]);
      rest = len < REST ? rest + 1 : 0;
      if (rest >= 3) { outcome = "stopped"; break; }
    }
    const steps = path.length - 1;
    return { path, outcome, lipped, zigzag: steps >= 6 ? flips / (steps - 1) : 0, travelled, steps };
  }

  /**
   * What the caddie should say about a stroke. Priority:
   * holed > oob > lip > trap > zigzag > timid > short.
   */
  function classify(h, res, cfg) {
    if (res.outcome === "holed") return "holed-" + cfg.opt;
    if (res.outcome === "oob") return "oob";
    if (res.lipped) return "lip";
    const [ex, ey] = res.path[res.path.length - 1];
    const [, gx, gy] = lossGrad(h, ex, ey);
    const nearDecoy = h.minima.slice(1).some((m) => Math.hypot(m.x - ex, m.y - ey) < 0.08);
    if (nearDecoy && Math.hypot(gx, gy) < 0.6) return "trap";
    if (res.zigzag >= 0.4) return "zigzag";
    if (res.travelled < 0.2) return "timid";
    return "short";
  }

  const LESSONS = {
    "oob": ["Diverged.", "η beat ~2/λ along the steepest direction, so each step overshot by more than it corrected. This is your loss going to NaN at lr=1e-1."],
    "zigzag": ["Zig-zagging across the ravine.", "The valley is ill-conditioned: steep one way, gentle the other. Momentum averages the back-and-forth away; Adam rescales each axis on its own."],
    "trap": ["Stuck in a sand trap.", "That's a local minimum: the gradient is ~0 but it isn't the bottom. Momentum can carry you over the lip, and gradient noise (wind) can knock you out of it."],
    "timid": ["Too timid.", "A tiny learning rate is safe but slow. That's a training run that never finishes inside its budget of epochs."],
    "lip": ["Lipped out!", "You were in the right place going too fast. This is why schedules decay the learning rate late in training: big steps to travel, small steps to settle."],
    "short": ["Still rolling.", "Progress, but not there yet. Read the contours: tight lines mean a steep slope (shrink η), wide gaps mean a plateau (grow η or add momentum)."],
    "holed-gd": ["In the hole with plain GD.", "No tricks needed on a well-conditioned slope. Plain gradient descent works when the landscape is round and has no traps."],
    "holed-momentum": ["Sunk with momentum.", "The heavy ball built up speed down the valley and over small dips. This is why SGD+momentum is still a default for vision models."],
    "holed-adam": ["Adam holes out.", "Per-axis step sizes ignore how badly scaled the slope is. That's why Adam is the default for transformers."],
  };

  // --- hole generation ---------------------------------------------------------
  function candidate(rand, t, seed) {
    const u = (a, b) => a + (b - a) * rand();
    const theta = u(0, Math.PI);
    const kappa = 1 + u(0, 1) * (0.8 + 13 * t);
    const k = u(0.45, 0.75);
    const c = [u(-0.35, 0.35), u(-0.35, 0.35)];
    const along = u(-0.5, 0.5);
    const cup = { x: c[0] + along * Math.cos(theta), y: c[1] + along * Math.sin(theta), d: u(1.0, 1.5), w: u(0.14, 0.22) };
    // The tee is picked up front so later holes can put hazards *in the way*.
    let tee = null;
    for (let i = 0; i < 30 && !tee; i++) {
      const p = [u(-0.88, 0.88), u(-0.88, 0.88)];
      if (Math.hypot(p[0] - cup.x, p[1] - cup.y) >= 1.05) tee = p;
    }
    if (!tee) tee = [cup.x > 0 ? -0.85 : 0.85, cup.y > 0 ? -0.85 : 0.85];
    // A point on the tee→cup line (s ∈ [0,1]) with sideways jitter j.
    const onPath = (s, j) => {
      const px = tee[0] + s * (cup.x - tee[0]), py = tee[1] + s * (cup.y - tee[1]);
      const len = Math.hypot(cup.x - tee[0], cup.y - tee[1]);
      return [px - (j * (cup.y - tee[1])) / len, py + (j * (cup.x - tee[0])) / len];
    };
    const spot = (lo, hi, jit) => (rand() < t ? onPath(u(lo, hi), u(-jit, jit)) : [u(-0.85, 0.85), u(-0.85, 0.85)]);
    const wells = [cup];
    const nDecoys = Math.floor(t * 4 + u(0, 1.6));
    for (let i = 0; i < nDecoys; i++) {
      const [x, y] = spot(0.2, 0.75, 0.15);
      wells.push({ x, y, d: cup.d * u(0.3, 0.7), w: u(0.07, 0.15) });
    }
    const hills = [];
    const nHills = 1 + Math.floor(u(0, 1 + 2 * t));
    for (let i = 0; i < nHills; i++) {
      const [x, y] = spot(0.3, 0.7, 0.25);
      hills.push({ x, y, h: u(0.4, 1.2), s: u(0.12, 0.25) });
    }
    return { seed, theta, kappa, k, c, wells, hills, tee };
  }

  /** Every optimizer config the solvability check tries. */
  const GRID = [
    ...LRS.map((lr) => ({ opt: "gd", lr, beta: 0 })),
    ...BETAS.flatMap((beta) => LRS.map((lr) => ({ opt: "momentum", lr, beta }))),
    ...LRS.map((lr) => ({ opt: "adam", lr, beta: 0 })),
  ];

  function parFor(frac) { return frac >= 0.3 ? 2 : frac >= 0.1 ? 3 : 4; }

  /** Hole `index` (0-based) of course `courseSeed` (int). Deterministic. */
  function generateHole(courseSeed, index) {
    const t0 = index / (HOLES - 1);
    for (let attempt = 0; ; attempt++) {
      const seed = hash(courseSeed, index, attempt);
      const rand = mulberry32(seed);
      // Relax difficulty every 40 rejects; past 200, a plain round bowl.
      const t = attempt >= 200 ? 0 : t0 * 0.5 ** Math.floor(attempt / 40);
      const h = candidate(rand, t, seed);
      h.index = index;
      h.wind = index < 3 || t === 0 ? 0 : 0.6 * t * (0.6 + 0.4 * rand());
      h.minima = findMinima(h);
      const best = h.minima[0];
      if (!best || Math.abs(best.x) > 0.8 || Math.abs(best.y) > 0.8) continue;
      if (h.minima[1] && h.minima[1].loss - best.loss < 0.12) continue;
      h.cup = [best.x, best.y];
      h.cupLoss = best.loss;
      const tee = h.tee;
      if (Math.hypot(tee[0] - best.x, tee[1] - best.y) < 0.95) continue;
      let solved = 0, solution = null;
      for (const cfg of GRID) {
        if (simulate(h, tee, cfg, 1).outcome === "holed") { solved++; solution = solution || cfg; }
      }
      if (!solved) continue;
      h.solveFrac = solved / GRID.length;
      h.solution = solution;
      h.par = parFor(h.solveFrac);
      h.attempts = attempt + 1;
      // Range of the map's loss for colouring: cup loss → 95th percentile.
      const samples = [];
      for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) samples.push(loss(h, -1 + i / 11.5, -1 + j / 11.5));
      samples.sort((a, b) => a - b);
      h.range = [best.loss, samples[Math.floor(samples.length * 0.95)]];
      return h;
    }
  }

  // --- a course (game state) -------------------------------------------------------
  class Course {
    constructor(seedStr) {
      this.seedStr = seedStr;
      this.seed = seedToInt(seedStr);
      this.holes = [];
      this.scores = [];      // strokes per finished hole
      this.holeIdx = 0;
      this.startHole();
    }
    get hole() {
      while (this.holes.length <= this.holeIdx) this.holes.push(generateHole(this.seed, this.holes.length));
      return this.holes[this.holeIdx];
    }
    startHole() {
      const h = this.hole;
      this.ball = h.tee.slice();
      this.strokes = 0;
      this.shots = [];       // {cfg, res, kind, from}
      this.done = false;
      this.pickedUp = false;
    }
    restartHole() { this.startHole(); }
    /** Take a stroke. Returns the shot record; applies its result to the state. */
    shoot(cfg) {
      if (this.done) return null;
      const h = this.hole;
      const from = this.ball.slice();
      const res = simulate(h, from, cfg, this.strokes + 1);
      const kind = classify(h, res, cfg);
      this.strokes += res.outcome === "oob" ? 2 : 1;
      if (res.outcome !== "oob") this.ball = res.path[res.path.length - 1].slice();
      const shot = { cfg: { ...cfg }, res, kind, from };
      this.shots.push(shot);
      if (res.outcome === "holed") this.finish();
      else if (this.strokes >= MAX_STROKES) { this.strokes = MAX_STROKES; this.pickedUp = true; this.finish(); }
      return shot;
    }
    finish() { this.done = true; this.scores[this.holeIdx] = this.strokes; }
    /** The most instructive lesson of the hole just played. */
    holeLesson() {
      const order = ["oob", "lip", "trap", "zigzag", "timid"];
      for (const k of order) if (this.shots.some((s) => s.kind === k)) return k;
      const last = this.shots[this.shots.length - 1];
      return last ? last.kind : "short";
    }
    nextHole() {
      if (!this.done || this.finished) return false;
      this.holeIdx++;
      this.startHole();
      return true;
    }
    get finished() { return this.done && this.holeIdx === HOLES - 1; }
    get totalStrokes() { return this.scores.reduce((a, b) => a + (b || 0), 0); }
    get totalPar() { return this.scores.reduce((a, b, i) => a + (b ? this.holes[i].par : 0), 0); }
  }

  function scoreName(strokes, par) {
    if (strokes === 1) return "Hole in one!";
    const d = strokes - par;
    return d <= -3 ? "Albatross" : d === -2 ? "Eagle" : d === -1 ? "Birdie" : d === 0 ? "Par"
      : d === 1 ? "Bogey" : d === 2 ? "Double bogey" : `+${d}`;
  }

  globalThis.GolfEngine = {
    HOLES, STEPS, CUP_R, LIP, MAX_STROKES, LR_MIN, LR_MAX, LRS, BETAS, GRID, OPTIMIZERS, OPT_NAMES, LESSONS,
    mulberry32, hash, seedToInt, randomSeed, lossGrad, loss, findMinima, simulate, classify,
    generateHole, parFor, Course, scoreName,
  };
})();
