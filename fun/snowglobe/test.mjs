/* ============================================================================
   test.mjs — checks for the Snow Globe sim (see DESIGN.md §9).
   Run: `node fun/snowglobe/test.mjs`.
   This file is *.mjs so the site build prunes it from the published tree.
   ============================================================================ */
import "./sim.js";
const S = globalThis.SnowSim;
const { Sim, DT, AGE_T, BLIZ_T, AGES, TOWN_R, ROAD_W, MAX_B, obbOverlap, segObbDist, corners } = S;

let passed = 0;
const fails = [];
function ok(cond, msg) { if (cond) passed++; else fails.push(msg); }
const steps = (secs) => Math.round(secs / DT);
const CYCLE = AGES.length * AGE_T + BLIZ_T;
const snap = (s) => JSON.stringify({ r: s.region.id, b: s.buildings.map(({ id, x, z, rot, w, d, roof, lm }) => [id, x, z, rot, w, d, roof, lm]), n: s.nodes, t: s.trees.length, f: s.fields.length });

// --- determinism -------------------------------------------------------------------
{
  const a = new Sim(7), b = new Sim(7), c = new Sim(8);
  for (let i = 0; i < steps(CYCLE * 1.5); i++) { a.step(); b.step(); c.step(); }
  ok(snap(a) === snap(b), "same seed → same town");
  ok(snap(a) !== snap(c), "different seed → different town");
}

// --- time scale doesn't change the outcome --------------------------------------------
{
  const a = new Sim(11), b = new Sim(11);
  for (let i = 0; i < steps(200); i++) { a.step(); a.drain(); }
  for (let f = 0; f < steps(200) / 16; f++) { for (let k = 0; k < 16; k++) b.step(); b.drain(); }
  ok(snap(a) === snap(b), "stepping 16 per frame gives the same town as stepping 1 per frame");
}

// --- ages run in order; a cycle ends with a new region, never one of the last two ---------
{
  const s = new Sim(3);
  const ages = [], regions = [s.region.id];
  for (let i = 0; i < steps(CYCLE * 5); i++) {
    s.step();
    for (const e of s.drain()) {
      if (e.e === "age") ages.push(e.age);
      if (e.e === "reset") regions.push(s.region.id);
    }
  }
  const seq = ages.join("");
  ok(seq.length >= 28 && "0123456".repeat(10).startsWith(seq), `ages advance 0→6 then restart (${seq.slice(0, 30)}…)`);
  let fresh = true;
  for (let i = 2; i < regions.length; i++) if (regions[i] === regions[i - 1] || regions[i] === regions[i - 2]) fresh = false;
  ok(regions.length >= 5 && fresh, `regions never repeat the last two (${regions.join(" → ")})`);
}

// --- layout rules hold throughout, across seeds and regions ------------------------------
{
  let overlaps = 0, water = 0, outside = 0, onRoad = 0, over = 0, checks = 0;
  const perAge = AGES.map(() => []);
  const regionsSeen = new Set();
  for (let seed = 1; seed <= 14; seed++) {
    const s = new Sim(seed * 101);
    for (let i = 0; i < steps(CYCLE * 1.02); i++) {
      s.step();
      if (s.state === "grow" && s.ageT > AGE_T - DT * 1.5 && s.cycle === 0) perAge[s.age].push(s.houses.length);
      if (i % 90) continue;
      checks++;
      regionsSeen.add(s.region.id);
      const B = s.buildings;
      if (B.length > MAX_B) over++;
      for (let p = 0; p < B.length; p++) {
        for (let q = p + 1; q < B.length; q++) if (obbOverlap(B[p], B[q], 0)) overlaps++;
        if (corners(B[p]).some(([x, z]) => Math.hypot(x, z) > TOWN_R + 0.21)) outside++;
        if (corners(B[p]).concat([[B[p].x, B[p].z]]).some(([x, z]) => s.waterDist(x, z) < 0)) water++;
        for (const [a, b] of s.edges) {
          const A = s.nodes[a], C = s.nodes[b];
          if (segObbDist(B[p], A.x, A.z, C.x, C.z) < ROAD_W / 2) onRoad++;
        }
      }
    }
  }
  ok(checks > 100, `layout checked ${checks} times`);
  ok(overlaps === 0, `buildings never overlap (${overlaps})`);
  ok(water === 0, `buildings never stand in water (${water})`);
  ok(outside === 0, `buildings stay inside the globe (${outside})`);
  ok(onRoad === 0, `buildings never sit on a road (${onRoad})`);
  ok(over === 0, `building count stays under the cap of ${MAX_B}`);
  ok(regionsSeen.size >= 5, `the seeds cover most regions (${[...regionsSeen].join(", ")})`);
  const mean = perAge.map((xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
  console.log(`  houses at the end of each age (mean over seeds): ${mean.map((m) => m.toFixed(0)).join(" → ")}`);
  let grows = true;
  for (let i = 1; i < mean.length; i++) if (mean[i] < mean[i - 1]) grows = false;
  ok(grows && mean[6] > 3 * mean[1], "the town grows across the ages");
  ok(mean[6] >= S.TARGET[6] * 0.7, `the Modern town gets close to its target (${mean[6].toFixed(0)} of ${S.TARGET[6]})`);
}

// --- landmarks appear and are named --------------------------------------------------------
{
  const s = new Sim(5);
  const names = new Set();
  for (let i = 0; i < steps(CYCLE); i++) { s.step(); for (const e of s.drain()) if (e.e === "add" && e.b.kind === "landmark") names.add(e.b.label); }
  ok(names.size >= 5, `a cycle builds several landmarks (${[...names].join(", ")})`);
  ok(s.landmarks.length <= 4, "no more than four landmarks stand at once");
}

// --- weather respects the region ------------------------------------------------------------
{
  const s = new Sim(1, { region: "nile" });
  let snow = 0, sand = 0;
  for (let k = 0; k < 4000; k++) {
    s.weather.kind = "clear";
    const ws = s.weatherWeights(k % 4);
    const tot = ws.reduce((a, b) => a + b, 0);
    snow += ws[S.WEATHER.indexOf("snow")] / tot;
    sand += ws[S.WEATHER.indexOf("sandstorm")] / tot;
  }
  ok(snow === 0, "it never snows on the Nile");
  for (const id of ["indus", "punjab", "ganges"]) {
    const r = new Sim(2, { region: id });
    let sn = 0, rainSummer = 0, rainWinter = 0;
    for (let season = 0; season < 4; season++) {
      const ws = r.weatherWeights(season), tot = ws.reduce((a, b) => a + b, 0);
      sn += ws[S.WEATHER.indexOf("snow")];
      if (season === 1) rainSummer = ws[S.WEATHER.indexOf("rain")] / tot;
      if (season === 3) rainWinter = ws[S.WEATHER.indexOf("rain")] / tot;
    }
    ok(sn === 0 && rainSummer > 2 * rainWinter, `${id}: no snow, and the monsoon makes summer the rainy season`);
  }
  ok(sand > 0, "the Nile gets sandstorms");
  const n = new Sim(1, { region: "norse" });
  const kinds = new Set();
  for (let i = 0; i < steps(CYCLE); i++) { n.step(); kinds.add(n.weather.kind); }
  ok(kinds.has("snow") && !kinds.has("sandstorm"), `the fjord gets snow but no sandstorms (${[...kinds].join(", ")})`);
}

// --- South Asian regions name real places ---------------------------------------------------
{
  const s = new Sim(4, { region: "indus" });
  const seen = [];
  for (let k = 0; k < 6; k++) { seen.push(s.placeName); s.nextAge(); }
  seen.push(s.placeName);
  ok(seen[1] === "Mohenjo-daro" && seen[3] === "Multan", `the Indus Valley visits Mohenjo-daro and Multan (${seen.join(" → ")})`);
  const p = new Sim(4, { region: "punjab" });
  for (let k = 0; k < 4; k++) p.nextAge();
  ok(p.placeName === "Lahore", "Punjab becomes Lahore");
  const lms = new Set();
  for (let i = 0; i < steps(CYCLE); i++) { p.step(); for (const e of p.drain()) if (e.e === "add" && e.b.kind === "landmark") lms.add(e.b.lm); }
  ok(S.REGIONS.length === 9, "nine regions in rotation");
}

// --- skipping ahead --------------------------------------------------------------------------
{
  const s = new Sim(9);
  s.nextAge();
  ok(s.age === 1 && s.houses.length >= S.TARGET[0] - 2, `next age finishes the current one first (${s.houses.length} houses)`);
  for (let k = 0; k < 5; k++) s.nextAge();
  ok(s.age === 6, "next age reaches Modern");
  const r0 = s.region.id;
  s.nextAge();
  ok(s.state === "bliz", "next age during Modern starts the blizzard");
  for (let i = 0; i < steps(BLIZ_T + 0.5); i++) s.step();
  ok(s.state === "grow" && s.age === 0 && s.region.id !== r0, "after the blizzard a new region starts at the Stone Age");
}

console.log(`${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log("  ✗ " + f);
process.exit(fails.length ? 1 : 0);
