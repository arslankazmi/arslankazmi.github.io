/* ============================================================================
   test.mjs — checks for the Ninja Ascent engine (see DESIGN.md §7).
   Run: `node fun/ninja-ascent/test.mjs`.
   This file is *.mjs so the site build prunes it from the published tree.
   ============================================================================ */
import "./engine.js";
const E = globalThis.NinjaEngine;
const { Game, DT, NINJA_Y, JUMP_T, ninjaX, overlap, rectOf } = E;

let passed = 0;
const fails = [];
function ok(cond, msg) { if (cond) passed++; else fails.push(msg); }
const run = (g, secs, each) => { for (let i = 0; i < Math.round(secs / DT) && !g.over; i++) { if (each) each(g); g.step(); } };

/** A quiet game: no spawning, so a test can place exactly what it wants. */
function quiet(seed = 1) { const g = new Game(seed); g.spawnRow = () => {}; g.rowTimer = 1e9; return g; }
function place(g, type, side, y, lane = side) {
  g.add({ type, lane, side, x: lane === "air" ? (side === "L" ? E.WALL_L + 14 : side === "R" ? E.WALL_R - 14 : E.W / 2) : wallX(type, side), y, vy: 0 });
  return g.objects[g.objects.length - 1];
}
const wallX = (type, side) => (side === "L" ? E.WALL_L + E.TYPES[type].w / 2 : E.WALL_R - E.TYPES[type].w / 2);

// --- determinism ---------------------------------------------------------------
{
  const a = new Game(42), b = new Game(42);
  run(a, 20); run(b, 20);
  ok(JSON.stringify(a.objects) === JSON.stringify(b.objects) && a.dist === b.dist, "same seed → same run");
  const c = new Game(43);
  run(c, 20);
  ok(JSON.stringify(a.objects.map((o) => o.type)) !== JSON.stringify(c.objects.map((o) => o.type)), "different seed → different run");
}

// --- jumping ----------------------------------------------------------------------
{
  const g = quiet();
  ok(g.ninja.side === "L" && g.ninja.x === ninjaX("L"), "starts on the left wall");
  ok(g.jump(), "can jump from a wall");
  ok(!g.jump(), "no second jump mid-air");
  run(g, JUMP_T - 0.02);
  ok(g.ninja.jumping, "still airborne just before the jump time");
  run(g, 0.04);
  ok(!g.ninja.jumping && g.ninja.side === "R" && g.ninja.x === ninjaX("R") && g.ninja.y === NINJA_Y, "lands on the right wall after 0.30 s");
}

// --- slashing -----------------------------------------------------------------------
{
  const g = quiet();
  const plank = place(g, "plank", "L", NINJA_Y - 60);
  const spikes = place(g, "spikes", "L", NINJA_Y - 80);
  const coin = place(g, "coin", "L", NINJA_Y - 70);
  const far = place(g, "crate", "R", NINJA_Y - 60);
  g.slash();
  g.step();
  ok(!plank.alive && g.cuts === 1, "slash cuts a cuttable in range");
  ok(spikes.alive, "slash does not cut an avoidable");
  ok(coin.alive, "slash does not destroy a collectable");
  ok(far.alive, "slash does not reach the other wall");
  ok(!g.slash(), "slash has a cooldown");
  run(g, E.SLASH_CD);
  ok(g.slash(), "slash is ready again after the cooldown");
}

// --- hits, i-frames, game over --------------------------------------------------------
{
  const g = quiet();
  place(g, "spikes", "L", NINJA_Y - 40);
  place(g, "ac", "L", NINJA_Y - 70);   // right behind: i-frames should cover it
  run(g, 0.5);
  ok(g.hearts === 2, `one hit costs one heart, i-frames block the second (hearts ${g.hearts})`);
  const h = quiet();
  place(h, "lantern", "L", NINJA_Y - 40);
  run(h, 0.3);
  ok(h.hearts === 2, "an uncut cuttable hurts");
  const k = quiet();
  for (let i = 0; i < 3; i++) place(k, "block", "L", NINJA_Y - 40 - i * 400, "air");
  run(k, 6);
  ok(k.over && k.hearts === 0 && k.events.some((e) => e.type === "over"), "three hits end the run");
  const before = k.dist;
  k.step();
  ok(k.dist === before, "nothing moves after game over");
  const m = quiet();
  place(m, "spikes", "R", NINJA_Y - 40);
  run(m, 0.5);
  ok(m.hearts === 3, "objects on the other wall can't reach you");
}

// --- collectables ------------------------------------------------------------------------
{
  const g = quiet();
  place(g, "coin", "L", NINJA_Y - 30);
  place(g, "coin", "L", NINJA_Y - 60);
  run(g, 0.4);
  ok(g.coins === 2, "coins on your wall are collected");
  g.hearts = 2;
  place(g, "onigiri", "L", NINJA_Y - 30, "air");
  run(g, 0.3);
  ok(g.hearts === 3, "onigiri restores a heart");
  place(g, "onigiri", "L", NINJA_Y - 30, "air");
  run(g, 0.3);
  ok(g.hearts === 3, "hearts cap at 3");
  ok(g.score === g.meters + 10 * g.coins, "score = metres + 10·coins + 25·cuts");
}

// --- speed ramp ------------------------------------------------------------------------------
{
  const g = quiet();
  let last = 0, mono = true;
  run(g, 240, (x) => { if (x.speed < last) mono = false; last = x.speed; });
  ok(mono && g.speed <= E.SPEED0 + E.SPEED_GAIN && g.speed > 480, `speed ramps monotonically toward the cap (${g.speed.toFixed(0)} px/s after 4 min)`);
}

// --- fairness: actual avoidable crossings honour the spacing rules ----------------------------------
{
  let worstOpp = Infinity, worstCenter = Infinity, crossings = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = new Game(seed, { log: true });
    g.hearts = 1e9;                              // invincible: just watch the spawner
    run(g, 300);
    const L = g.log;
    crossings += L.length;
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length && L[j].t - L[i].t < 1; j++) {
        const a = L[i].side, b = L[j].side, dt = L[j].t - L[i].t;
        if ((a === "L" && b === "R") || (a === "R" && b === "L")) worstOpp = Math.min(worstOpp, dt);
        if ((a === "C") !== (b === "C")) worstCenter = Math.min(worstCenter, dt);
      }
    }
  }
  // Arrival predictions use the current speed; the ramp makes things arrive a hair early.
  ok(worstOpp >= E.OPP_GAP - 0.05, `opposite-wall avoidables never arrive within ${E.OPP_GAP}s (closest ${worstOpp.toFixed(3)}s over ${crossings} crossings)`);
  ok(worstCenter >= E.CENTER_GAP - 0.05, `centre drops never arrive within ${E.CENTER_GAP}s of a wall avoidable (closest ${worstCenter.toFixed(3)}s)`);
}

// --- playability: a simple look-ahead bot survives -------------------------------------------------------
/** Jump away from avoidables about to reach you; slash cuttables in the zone. */
function bot(g) {
  const n = g.ninja;
  const zone = g.slashZone();
  if (g.objects.some((o) => o.alive && o.kind === "cut" && overlap(zone, rectOf(o)))) g.slash();
  if (n.jumping) return;
  const incoming = (side, horizon) => g.objects.some((o) => {
    if (!o.alive || o.kind !== "avoid") return false;
    const r = rectOf(o), x = ninjaX(side);
    if (r.x > x + 10 || r.x + r.w < x - 10) return false;
    const tt = (NINJA_Y - 15 - (r.y + r.h)) / (g.speed + o.vy);
    return tt > -0.05 && tt < horizon;
  });
  if (incoming(n.side, 0.22)) g.jump();
}
{
  const times = [];
  for (let seed = 1; seed <= 40; seed++) {
    const g = new Game(seed);
    run(g, 600, bot);
    times.push(g.t);
  }
  times.sort((a, b) => a - b);
  const median = times[times.length >> 1];
  console.log(`  bot survival: median ${median.toFixed(0)}s, min ${times[0].toFixed(0)}s, max ${times[times.length - 1].toFixed(0)}s`);
  ok(median >= 120, `look-ahead bot survives a median of ≥ 2 min (${median.toFixed(0)}s)`);
}

console.log(`${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log("  ✗ " + f);
process.exit(fails.length ? 1 : 0);
