/* ============================================================================
   sim.js — the Snow Globe town simulation (see DESIGN.md §3–5).

   Pure logic: no three.js, no DOM. A seeded, fixed-step sim of one tiny town
   growing through seven ages, then a blizzard and a new town in a new region.
   The renderer reads the collections (buildings, roads, trees, fields, events)
   and drains `queue` for what changed. Classic script: sets
   globalThis.SnowSim for the browser and the Node test.

   World units: the ground is a disc of radius DISC centred on the origin,
   x/z horizontal, y up. A building is an oriented box {x, z, rot, w, d}:
   w runs along the axis u = (cos rot, sin rot), d along v = (−sin rot, cos rot).
   ============================================================================ */
(function () {
  "use strict";

  // --- config ---------------------------------------------------------------
  const DT = 1 / 30;
  const AGE_T = 42;                 // seconds per age at 1×
  const BLIZ_T = 5;                 // whiteout between towns
  const DAY_T = 60;                 // one day
  const DISC = 10.2;                // ground radius
  const TOWN_R = 8.6;               // buildings and roads stay inside this
  const PLAZA_R = 0.8;              // kept clear around the town centre
  const ROAD_W = 0.34;
  const MAX_B = 150;
  const MAX_LANDMARKS = 4;

  const AGES = [
    { id: "stone", name: "Stone Age", year: "c. 8000 BC" },
    { id: "bronze", name: "Bronze Age", year: "c. 2500 BC" },
    { id: "iron", name: "Iron Age", year: "c. 700 BC" },
    { id: "medieval", name: "Medieval Age", year: "c. 1150" },
    { id: "renaissance", name: "Renaissance", year: "c. 1550" },
    { id: "industrial", name: "Industrial Age", year: "c. 1880" },
    { id: "modern", name: "Modern Age", year: "today" },
    { id: "space", name: "Space Age", year: "c. 2200" },
  ];
  const TARGET = [7, 14, 24, 34, 44, 54, 62, 66];        // houses by the end of each age (later ages also build taller)
  const ROADS_PER_AGE = [3, 5, 6, 8, 9, 10, 10, 6];
  const UPGRADE = [0, 0.5, 0.5, 0.55, 0.55, 0.65, 0.7, 0.75];
  const JITTER = [0.45, 0.35, 0.25, 0.18, 0.12, 0.07, 0.04, 0.03];  // road wiggle: paths → grids

  const LABELS = [
    ["hut", "family hut", "storehouse", "drying hut"],
    ["house", "granary", "pottery", "workshop"],
    ["house", "smithy", "weaver's", "shrine", "barracks"],
    ["cottage", "bakery", "inn", "mill house", "guild hall"],
    ["townhouse", "print shop", "bank", "painter's studio", "library"],
    ["terrace house", "textile mill", "post office", "pub", "workshop"],
    ["apartments", "office", "café", "school", "clinic"],
    ["pod home", "hydroponic farm", "robot repair shop", "teleport booth", "zero-g gym", "star café"],
  ];

  // Footprints (w along the facing road, d deep) and names for landmarks.
  const LANDMARKS = {
    stones: { w: 2.0, d: 2.0, name: "the standing stones" },
    totem: { w: 1.1, d: 1.1, name: "the totem pole" },
    pyramid: { w: 3.0, d: 3.0, name: "the Great Pyramid" },
    ziggurat: { w: 2.8, d: 2.8, name: "the ziggurat" },
    steppyramid: { w: 2.8, d: 2.8, name: "the step pyramid" },
    obelisk: { w: 1.6, d: 1.6, name: "the obelisk" },
    temple: { w: 2.4, d: 1.6, name: "the temple" },
    shrine: { w: 1.6, d: 1.4, name: "the shrine" },
    pagoda: { w: 1.6, d: 1.6, name: "the pagoda" },
    tenshu: { w: 2.4, d: 2.4, name: "the castle keep" },
    castle: { w: 3.0, d: 3.0, name: "the castle" },
    cathedral: { w: 2.8, d: 1.6, name: "the cathedral" },
    domehall: { w: 2.4, d: 2.4, name: "the domed hall" },
    longhall: { w: 2.8, d: 1.2, name: "the longhall" },
    stave: { w: 1.6, d: 1.6, name: "the stave church" },
    lighthouse: { w: 1.2, d: 1.2, name: "the lighthouse" },
    windmill: { w: 1.2, d: 1.2, name: "the windmill" },
    clocktower: { w: 1.2, d: 1.2, name: "the clock tower" },
    factory: { w: 2.6, d: 1.8, name: "the factory" },
    station: { w: 3.0, d: 1.4, name: "the railway station" },
    skytower: { w: 1.6, d: 1.6, name: "the skyscraper" },
    stadium: { w: 3.2, d: 2.6, name: "the stadium" },
    turbine: { w: 0.8, d: 0.8, name: "the wind turbine" },
    neontower: { w: 1.6, d: 1.6, name: "the neon tower" },
    rocket: { w: 2.0, d: 2.0, name: "the launch pad" },
    elevator: { w: 1.6, d: 1.6, name: "the space elevator" },
    arcology: { w: 2.8, d: 2.8, name: "the arcology" },
    ringhab: { w: 2.2, d: 1.2, name: "the ring habitat" },
    greatbath: { w: 2.6, d: 2.0, name: "the Great Bath" },
    granary: { w: 2.4, d: 1.6, name: "the great granary" },
    stupa: { w: 1.8, d: 1.8, name: "the stupa" },
    shikhara: { w: 1.6, d: 1.8, name: "the temple" },
    tomb: { w: 1.8, d: 1.8, name: "the saint's tomb" },
    mosque: { w: 3.0, d: 2.2, name: "the grand mosque" },
    fort: { w: 3.0, d: 3.0, name: "the fort" },
    mausoleum: { w: 2.6, d: 2.6, name: "the marble mausoleum" },
    minar: { w: 1.6, d: 1.6, name: "the minar" },
  };

  // --- palettes ---------------------------------------------------------------
  const P = {
    reed: ["#c9a66b", "#bf9a5c", "#d1b07a"],
    mud: ["#c8955f", "#d4a76f", "#b9844f"],
    sand: ["#e3c48e", "#d9b47a", "#ead2a2"],
    white: ["#f1eadb", "#e9dfc9", "#f4efe2"],
    plaster: ["#efe3c6", "#e6d3ae", "#f0e6d0"],
    wood: ["#9a6a43", "#8a5a38", "#a87b4f"],
    paint: ["#c8553f", "#e0b54a", "#6f9fb8", "#e8dcc0", "#7f9b5a"],
    brick: ["#b4553f", "#a24a38", "#c0674a"],
    stone: ["#a9a49a", "#b8b2a5", "#c4bcac"],
    modern: ["#cfd8dc", "#b9c9d3", "#e6e1d6", "#9fb7c4", "#d8c7a8"],
    stucco: ["#e9b872", "#d77a61", "#7fb2a8", "#f0d9a8", "#c98bb0"],
    future: ["#f4f6f8", "#e6eef2", "#d9e8ec", "#f2ece2", "#cfe3e6"],
    glaze: ["#d9b47a", "#c8955f", "#4f7fae"],
    baked: ["#b8714a", "#a9643f", "#c27c55"],
    redstone: ["#c46a4a", "#b85c40", "#d07b58"],
    haveli: ["#e8d6b0", "#d9b98a", "#c46a4a", "#f0e2c4"],
    pastel: ["#e9c48a", "#e39a7a", "#9cc4b8", "#f0dcb0", "#d9a0b8"],
  };
  const RC = {
    thatch: ["#c9a25a", "#b89048"],
    terra: ["#c0603f", "#b4553a", "#cf7550"],
    slate: ["#5a6470", "#4d5763", "#646e78"],
    tile: ["#3f4a5c", "#4a4f5c"],
    turf: ["#7c9a52", "#6e8c48"],
    copper: ["#6fa58f"],
    mud: ["#b9844f"],
    sand: ["#d8b87e"],
    white: ["#e9dfc9"],
    blue: ["#4f7fae", "#5b8fb8"],
    tileblue: ["#3f78b0", "#2f6aa0"],
    brickdark: ["#9a5a3a"],
  };

  // Generic look per age; each region overrides the parts that make it itself.
  const BASE = [
    { roofs: ["cone", "cone", "tent"], walls: P.reed, roofCs: RC.thatch, floors: [1, 1], size: [0.7, 0.9] },
    { roofs: ["gable", "cone"], walls: P.mud, roofCs: RC.thatch, floors: [1, 1], size: [0.8, 1.05] },
    { roofs: ["gable", "flat"], walls: P.plaster, roofCs: RC.thatch, floors: [1, 2], size: [0.8, 1.1] },
    { roofs: ["gable", "gable", "hip"], walls: P.plaster, roofCs: RC.terra, floors: [1, 2], size: [0.85, 1.15] },
    { roofs: ["gable", "hip"], walls: P.plaster, roofCs: RC.terra, floors: [2, 3], size: [0.9, 1.2] },
    { roofs: ["gable", "flat", "gable"], walls: P.brick, roofCs: RC.slate, floors: [2, 3], size: [0.95, 1.25] },
    { roofs: ["flat", "tower", "tower", "flat"], walls: P.modern, roofCs: RC.slate, floors: [3, 7], size: [1.0, 1.3] },
    { roofs: ["pod", "pod", "glassdome", "gtower", "spire"], walls: P.future, roofCs: ["#5fd3d8", "#8fe0b0", "#f2b8e0", "#ffd27a"], floors: [1, 3], size: [0.95, 1.25] },
  ];

  const REGIONS = [
    {
      id: "nile", name: "Nile Valley", terrain: "river", trees: "palm",
      ground: { grass: "#a6b86a", sand: "#e2c98f", bed: "#8a7a5a" }, water: "#5f9fb0",
      weather: { clear: 7, cloudy: 2, rain: 0.6, snow: 0, fog: 0.6, storm: 0.2, sandstorm: 1.6 },
      ages: [
        {},
        { roofs: ["flat"], walls: P.mud, roofCs: RC.mud },
        { roofs: ["flat", "flat", "dome"], walls: P.sand, roofCs: RC.sand },
        { roofs: ["flat", "dome"], walls: P.white.concat(P.sand), roofCs: RC.copper.concat(RC.white) },
        { roofs: ["flat", "dome", "flat"], walls: P.white, roofCs: RC.copper },
        { roofs: ["flat", "flat", "gable"], walls: P.sand.concat(P.brick) },
        { walls: P.modern.concat(P.sand) },
      ],
      lms: [["stones"], ["pyramid"], ["obelisk", "temple"], ["domehall"], ["domehall", "clocktower"], ["factory", "station"], ["skytower", "stadium"], ["arcology", "rocket"]],
    },
    {
      id: "mesopotamia", name: "Mesopotamia", terrain: "river", trees: "palm",
      ground: { grass: "#b3b86f", sand: "#dcc08a", bed: "#86765a" }, water: "#6a9aa6",
      weather: { clear: 6, cloudy: 2.5, rain: 1, snow: 0.05, fog: 0.6, storm: 0.4, sandstorm: 1.2 },
      ages: [
        {},
        { roofs: ["flat"], walls: P.mud, roofCs: RC.mud },
        { roofs: ["flat"], walls: P.glaze, roofCs: RC.sand },
        { roofs: ["flat", "dome"], walls: P.sand, roofCs: RC.blue },
        { roofs: ["flat", "dome"], walls: P.sand.concat(P.white), roofCs: RC.blue.concat(RC.copper) },
        { roofs: ["flat", "gable"], walls: P.brick.concat(P.sand) },
        { walls: P.modern.concat(P.sand) },
      ],
      lms: [["stones"], ["ziggurat"], ["ziggurat", "temple"], ["domehall"], ["domehall", "clocktower"], ["factory", "station"], ["skytower"], ["arcology", "elevator"]],
    },
    {
      id: "eastasia", name: "East Asia", terrain: "hills", trees: "blossom",
      ground: { grass: "#9fbf72", sand: "#d9c793", bed: "#7a7f63" }, water: "#6aa3b5",
      weather: { clear: 5, cloudy: 3, rain: 3, snow: 1.5, fog: 2, storm: 0.6, sandstorm: 0 },
      ages: [
        {},
        { roofs: ["gable", "cone"], walls: P.wood },
        { roofs: ["hip", "gable"], walls: P.plaster, roofCs: RC.tile },
        { roofs: ["hip", "hip", "pagoda"], walls: P.white.concat(P.wood), roofCs: RC.tile },
        { roofs: ["hip", "pagoda"], walls: P.white, roofCs: RC.tile },
        { roofs: ["hip", "gable", "flat"], walls: P.brick.concat(P.wood), roofCs: RC.tile },
        { roofs: ["tower", "tower", "neon", "flat"], walls: P.modern },
      ],
      lms: [["stones"], ["shrine"], ["pagoda"], ["pagoda", "tenshu"], ["tenshu"], ["factory", "station"], ["neontower", "skytower"], ["elevator", "ringhab"]],
    },
    {
      id: "norse", name: "Norse Fjord", terrain: "coast", trees: "pine",
      ground: { grass: "#8fae6a", sand: "#cfc3a0", bed: "#6c7468" }, water: "#5a8ea6",
      weather: { clear: 3, cloudy: 3, rain: 2.5, snow: 3, fog: 2.5, storm: 1, sandstorm: 0 },
      ages: [
        { roofs: ["cone", "turf"], walls: P.wood, roofCs: RC.turf },
        { roofs: ["turf"], walls: P.wood, roofCs: RC.turf },
        { roofs: ["turf", "gable"], walls: P.wood, roofCs: RC.turf.concat(RC.thatch) },
        { roofs: ["gable"], walls: P.wood, roofCs: RC.slate },
        { roofs: ["gable"], walls: P.paint, roofCs: RC.slate.concat(RC.terra) },
        { roofs: ["gable", "flat"], walls: P.paint.concat(P.brick) },
        { walls: P.modern.concat(P.paint) },
      ],
      lms: [["stones"], ["longhall"], ["longhall"], ["stave"], ["cathedral", "windmill"], ["lighthouse", "factory"], ["turbine", "skytower"], ["rocket", "ringhab"]],
    },
    {
      id: "mesoamerica", name: "Mesoamerica", terrain: "jungle", trees: "jungle",
      ground: { grass: "#88b062", sand: "#d6c48e", bed: "#6f7457" }, water: "#5fa5a0",
      weather: { clear: 4, cloudy: 2.5, rain: 3.5, snow: 0, fog: 2, storm: 1.5, sandstorm: 0 },
      ages: [
        {},
        { roofs: ["cone", "gable"], walls: P.plaster, roofCs: RC.thatch },
        { roofs: ["flat", "gable"], walls: P.stone, roofCs: RC.thatch },
        { roofs: ["flat"], walls: P.stone.concat(P.stucco) },
        { roofs: ["flat", "flat", "gable"], walls: P.stucco, roofCs: RC.terra },
        { roofs: ["flat", "gable"], walls: P.stucco.concat(P.brick) },
        { walls: P.modern.concat(P.stucco) },
      ],
      lms: [["totem"], ["steppyramid"], ["steppyramid"], ["steppyramid", "totem"], ["cathedral"], ["factory", "station"], ["skytower", "stadium"], ["rocket", "arcology"]],
    },
    {
      id: "mediterranean", name: "Mediterranean Coast", terrain: "coast", trees: "cypress",
      ground: { grass: "#a9b86c", sand: "#e4d3a3", bed: "#7d8170" }, water: "#4f95b5",
      weather: { clear: 7, cloudy: 2, rain: 1.5, snow: 0.2, fog: 0.5, storm: 0.7, sandstorm: 0 },
      ages: [
        {},
        { roofs: ["flat", "gable"], walls: P.white, roofCs: RC.thatch },
        { roofs: ["gable", "flat"], walls: P.white, roofCs: RC.terra },
        { roofs: ["gable", "hip"], walls: P.stone.concat(P.white), roofCs: RC.terra },
        { roofs: ["gable", "hip", "dome"], walls: P.plaster.concat(P.stucco), roofCs: RC.terra },
        { roofs: ["gable", "flat"], walls: P.plaster.concat(P.brick), roofCs: RC.terra },
        { walls: P.modern.concat(P.white) },
      ],
      lms: [["stones"], ["temple"], ["temple", "stadium"], ["castle"], ["cathedral", "windmill"], ["factory", "lighthouse"], ["skytower", "stadium"], ["ringhab", "rocket"]],
    },
    // South Asia: the plaque names a real place for each age.
    {
      id: "indus", name: "Indus Valley", terrain: "river", trees: "palm", monsoon: true,
      places: ["Mehrgarh", "Mohenjo-daro", "Taxila", "Multan", "Multan", "Multan", "Multan", "Multan"],
      ground: { grass: "#b4b56c", sand: "#ddc28c", bed: "#857558" }, water: "#6e9a9a",
      weather: { clear: 6, cloudy: 2, rain: 1.2, snow: 0, fog: 0.8, storm: 0.6, sandstorm: 1.2 },
      ages: [
        { roofs: ["flat", "cone"], walls: P.mud, roofCs: RC.mud },
        { roofs: ["flat"], walls: P.baked, roofCs: RC.brickdark },
        { roofs: ["flat", "flat", "dome"], walls: P.baked.concat(P.mud), roofCs: RC.sand },
        { roofs: ["flat", "dome"], walls: P.baked, roofCs: RC.tileblue.concat(RC.white) },
        { roofs: ["flat", "dome"], walls: P.haveli, roofCs: RC.white.concat(RC.tileblue) },
        { roofs: ["flat", "flat", "gable"], walls: P.baked.concat(P.haveli), roofCs: RC.slate },
        { walls: P.modern.concat(P.haveli) },
      ],
      lms: [["stones"], ["greatbath", "granary"], ["stupa"], ["tomb"], ["tomb", "fort"], ["clocktower", "station"], ["skytower"], ["rocket", "arcology"]],
    },
    {
      id: "punjab", name: "Punjab", terrain: "jungle", trees: "banyan", monsoon: true, winterFog: true,
      places: ["the Ravi plains", "Harappa", "Sakala", "Lahore", "Lahore", "Lahore", "Lahore", "Lahore"],
      ground: { grass: "#a3ba68", sand: "#d9c48e", bed: "#7d7a5a" }, water: "#6a9aa6",
      weather: { clear: 5, cloudy: 2.5, rain: 1.5, snow: 0, fog: 1.2, storm: 0.8, sandstorm: 0.4 },
      ages: [
        { roofs: ["cone", "flat"], walls: P.mud, roofCs: RC.thatch },
        { roofs: ["flat"], walls: P.baked, roofCs: RC.brickdark },
        { roofs: ["flat", "gable"], walls: P.baked.concat(P.mud), roofCs: RC.thatch },
        { roofs: ["flat", "dome"], walls: P.baked.concat(P.haveli), roofCs: RC.white },
        { roofs: ["flat", "dome", "flat"], walls: P.redstone.concat(P.haveli), roofCs: RC.white },
        { roofs: ["flat", "gable"], walls: P.redstone.concat(P.brick), roofCs: RC.slate },
        { walls: P.modern.concat(P.haveli) },
      ],
      lms: [["stones"], ["granary", "greatbath"], ["stupa"], ["mosque"], ["fort", "mosque"], ["station", "clocktower"], ["minar", "skytower"], ["elevator", "arcology"]],
    },
    {
      id: "ganges", name: "Ganges Plain", terrain: "river", trees: "banyan", monsoon: true, winterFog: true,
      places: ["the Ganges plain", "the Ganges plain", "Pataliputra", "Varanasi", "Agra", "Kolkata", "Kolkata", "Kolkata"],
      ground: { grass: "#98b862", sand: "#e0cc98", bed: "#7a7a5c" }, water: "#6f9fa8",
      weather: { clear: 4, cloudy: 2.5, rain: 2, snow: 0, fog: 1, storm: 1, sandstorm: 0 },
      ages: [
        { roofs: ["cone", "tent"], walls: P.reed, roofCs: RC.thatch },
        { roofs: ["cone", "flat"], walls: P.mud, roofCs: RC.thatch },
        { roofs: ["flat", "gable"], walls: P.plaster, roofCs: RC.thatch },
        { roofs: ["flat", "dome"], walls: P.pastel, roofCs: RC.white },
        { roofs: ["flat", "dome"], walls: P.pastel.concat(P.haveli), roofCs: RC.white },
        { roofs: ["flat", "gable"], walls: P.pastel.concat(P.brick), roofCs: RC.terra },
        { walls: P.modern.concat(P.pastel) },
      ],
      lms: [["stones"], ["granary"], ["stupa", "shikhara"], ["shikhara"], ["mausoleum"], ["station", "factory"], ["skytower", "stadium"], ["rocket", "ringhab"]],
    },
  ];

  function styleFor(region, age) { return Object.assign({}, BASE[age], region.ages[age] || {}); }

  const WEATHER = ["clear", "cloudy", "rain", "snow", "fog", "storm", "sandstorm"];
  const SEASONS = ["spring", "summer", "autumn", "winter"];
  const SEASON_MOD = [
    { rain: 1.5, snow: 0.3, storm: 0.6 },
    { snow: 0, storm: 1.6, clear: 1.4, fog: 0.5 },
    { fog: 1.6, rain: 1.3, cloudy: 1.3, snow: 0.4 },
    { snow: 3, rain: 0.5, storm: 0.3, clear: 0.8 },
  ];

  // --- helpers ------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(i, j, s) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, z, s) {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // --- oriented boxes -------------------------------------------------------------
  function toLocal(b, x, z) {
    const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
    return [dx * c + dz * s, -dx * s + dz * c];
  }
  function corners(b, m = 0) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2 + m, hd = b.d / 2 + m, out = [];
    for (const [a, e] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      out.push([b.x + c * hw * a - s * hd * e, b.z + s * hw * a + c * hd * e]);
    }
    return out;
  }
  function pointObbDist(b, x, z) {
    const [lx, lz] = toLocal(b, x, z);
    return Math.hypot(Math.max(Math.abs(lx) - b.w / 2, 0), Math.max(Math.abs(lz) - b.d / 2, 0));
  }
  /** Separating-axis test; m grows box a by m on every side. */
  function obbOverlap(a, b, m = 0) {
    const ca = Math.cos(a.rot), sa = Math.sin(a.rot), cb = Math.cos(b.rot), sb = Math.sin(b.rot);
    const ax = [[ca, sa], [-sa, ca], [cb, sb], [-sb, cb]];
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const [nx, nz] of ax) {
      const ra = (a.w / 2 + m) * Math.abs(ca * nx + sa * nz) + (a.d / 2 + m) * Math.abs(-sa * nx + ca * nz);
      const rb = (b.w / 2) * Math.abs(cb * nx + sb * nz) + (b.d / 2) * Math.abs(-sb * nx + cb * nz);
      if (Math.abs(dx * nx + dz * nz) > ra + rb) return false;
    }
    return true;
  }
  function pointSegDist(px, pz, x1, z1, x2, z2) {
    const vx = x2 - x1, vz = z2 - z1, L2 = vx * vx + vz * vz;
    const t = L2 ? Math.max(0, Math.min(1, ((px - x1) * vx + (pz - z1) * vz) / L2)) : 0;
    return Math.hypot(px - x1 - vx * t, pz - z1 - vz * t);
  }
  /** Distance from a segment to a box (0 if they touch). */
  function segObbDist(b, x1, z1, x2, z2) {
    const [ax, az] = toLocal(b, x1, z1), [bx, bz] = toLocal(b, x2, z2);
    const hx = b.w / 2, hz = b.d / 2;
    // Liang–Barsky: does the segment enter the rectangle?
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    const clip = (p, q) => {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    };
    if (clip(-dx, ax + hx) && clip(dx, hx - ax) && clip(-dz, az + hz) && clip(dz, hz - az) && t0 <= t1) return 0;
    const rect = (px, pz) => Math.hypot(Math.max(Math.abs(px) - hx, 0), Math.max(Math.abs(pz) - hz, 0));
    let d = Math.min(rect(ax, az), rect(bx, bz));
    for (const [cx, cz] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) d = Math.min(d, pointSegDist(cx, cz, ax, az, bx, bz));
    return d;
  }
  function segCross(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  // --- the sim ---------------------------------------------------------------------
  class Sim {
    constructor(seed, opts = {}) {
      this.seed = seed >>> 0;
      this.rng = mulberry32(this.seed || 1);
      this.forceRegion = opts.region || null;
      this.startRegion = opts.start || null;      // first town only
      this.t = 0;
      this.cycle = -1;
      this.history = [];
      this.queue = [];
      this.nextId = 1;
      this.state = "grow";
      this.blizT = 0;
      this.snowCover = 0;
      this.weather = { kind: "clear", t0: 0, until: 0 };
      this.newTown();
    }

    r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
    ri(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
    pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
    emit(e) { this.queue.push(e); }
    drain() { const q = this.queue; this.queue = []; return q; }

    get houses() { return this.buildings.filter((b) => b.kind === "house"); }
    get landmarks() { return this.buildings.filter((b) => b.kind === "landmark"); }
    get ageInfo() { return AGES[this.age]; }
    /** A real place name for this age where the region has one, else the region's name. */
    get placeName() { return (this.region.places && this.region.places[this.age]) || this.region.name; }
    get season() { return this.state === "bliz" ? 3 : Math.floor((this.ageT / AGE_T) * 4) % 4; }
    get seasonName() { return SEASONS[this.season]; }
    get dayPhase() { return (this.t / DAY_T + 0.3) % 1; }   // 0 = midnight, 0.5 = noon
    get ageProgress() { return Math.min(1, this.ageT / AGE_T); }

    // --- terrain ---------------------------------------------------------------------
    makeTerrain() {
      const type = this.region.terrain;
      const T = { type, th: this.r(0, Math.PI * 2), seed: (this.rng() * 1e9) | 0 };
      const sgn = this.rng() < 0.5 ? 1 : -1;
      if (type === "river") Object.assign(T, { amp: this.r(1, 1.8), freq: this.r(0.16, 0.26), ph: this.r(0, 6.3), off: sgn * this.r(4.4, 5.6), wid: this.r(0.9, 1.15) });
      if (type === "jungle") Object.assign(T, { amp: this.r(1, 1.8), freq: this.r(0.2, 0.3), ph: this.r(0, 6.3), off: sgn * this.r(5, 6.4), wid: this.r(0.45, 0.6) });
      if (type === "coast") T.c = this.r(5.4, 6.4);
      return T;
    }
    /** Signed distance-ish to water: > 0 on land, < 0 in water. */
    waterDist(x, z) {
      const T = this.terrain;
      if (T.type === "river" || T.type === "jungle") {
        const c = Math.cos(T.th), s = Math.sin(T.th), a = x * c + z * s, b = -x * s + z * c;
        return Math.abs(a - (T.off + T.amp * Math.sin(b * T.freq + T.ph))) - T.wid;
      }
      if (T.type === "coast") {
        const s = x * Math.cos(T.th) + z * Math.sin(T.th) + 0.9 * (vnoise(x * 0.3, z * 0.3, T.seed) - 0.5);
        return T.c - s;
      }
      return 99;
    }
    heightAt(x, z) {
      const T = this.terrain, r = Math.hypot(x, z);
      const wd = this.waterDist(x, z);
      if (wd < 0) return -0.32;
      let h = 0.1 * vnoise(x * 0.35, z * 0.35, T.seed);
      if (T.type === "hills") h += 0.4 * vnoise(x * 0.18 + 7, z * 0.18 + 3, T.seed + 1) + 1.0 * smooth(6.8, 9.8, r) * vnoise(x * 0.5, z * 0.5, T.seed + 2);
      h *= smooth(0, 1.6, wd);
      return h * (1 - smooth(0.9 * DISC, DISC, r));
    }
    terrainAt(x, z) {
      const wd = this.waterDist(x, z);
      return { h: this.heightAt(x, z), water: wd < 0, sand: wd >= 0 && wd < 0.7 };
    }

    // --- a new town ----------------------------------------------------------------------
    newTown() {
      this.cycle++;
      const avoid = this.history.slice(-2);
      const pool = REGIONS.filter((r) => !avoid.includes(r.id));
      const want = this.forceRegion || this.startRegion;
      this.startRegion = null;
      this.region = (want && REGIONS.find((r) => r.id === want)) || this.pick(pool);
      this.history.push(this.region.id);
      if (this.history.length > 24) this.history.shift();
      this.terrain = this.makeTerrain();
      this.buildings = []; this.nodes = []; this.edges = []; this.trees = []; this.fields = []; this.events = [];
      this.center = this.findCenter();
      this.nodes.push({ x: this.center.x, z: this.center.z });
      this.emit({ e: "reset" });
      this.scatterTrees();
      this.startAge(0);
      this.pickWeather();
    }

    findCenter() {
      let best = { x: 0, z: 0 }, bs = Infinity;
      for (let k = 0; k < 300; k++) {
        const a = this.r(0, Math.PI * 2), rad = Math.sqrt(this.rng()) * 3.6;
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        if (!this.landOk(x, z, 1.8)) continue;
        const wd = this.waterDist(x, z);
        const score = wd < 50 ? Math.abs(wd - 2.4) + rad * 0.2 : rad;
        if (score < bs) { bs = score; best = { x, z }; }
      }
      return best;
    }
    landOk(x, z, rad) {
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * Math.PI * 2, rr = k === 8 ? 0 : rad;
        if (this.waterDist(x + Math.cos(a) * rr, z + Math.sin(a) * rr) < 0.3) return false;
      }
      return true;
    }

    scatterTrees() {
      for (let k = 0; k < 500 && this.trees.length < 70; k++) {
        const a = this.r(0, Math.PI * 2), rad = Math.sqrt(this.rng()) * 9.4;
        this.tryTree(Math.cos(a) * rad, Math.sin(a) * rad, PLAZA_R + 2.2);
      }
      this.emit({ e: "trees" });
    }
    tryTree(x, z, clear = PLAZA_R + 0.4) {
      if (Math.hypot(x, z) > 9.5 || this.waterDist(x, z) < 0.4) return false;
      if (Math.hypot(x - this.center.x, z - this.center.z) < clear) return false;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 0.6)) return false;
      if (this.buildings.some((b) => pointObbDist(b, x, z) < 0.35)) return false;
      if (this.fields.some((f) => pointObbDist(f, x, z) < 0.3)) return false;
      if (this.edges.some((e) => this.segDist(e, x, z) < ROAD_W / 2 + 0.3)) return false;
      this.trees.push({ id: this.nextId++, x, z, s: this.r(0.75, 1.3) });
      return true;
    }
    segDist(e, x, z) { const A = this.nodes[e[0]], B = this.nodes[e[1]]; return pointSegDist(x, z, A.x, A.z, B.x, B.z); }
    pruneTrees(test) {
      const n = this.trees.length;
      this.trees = this.trees.filter((t) => !test(t));
      if (this.trees.length !== n) this.emit({ e: "trees" });
    }

    // --- ages ------------------------------------------------------------------------------
    startAge(i) {
      this.age = i;
      this.ageT = 0;
      const S = [];
      const A = AGE_T;
      for (let k = 0; k < ROADS_PER_AGE[i]; k++) S.push({ t: 0.1 + (k / ROADS_PER_AGE[i]) * 0.6 * A, a: "road" });
      const n = Math.max(0, TARGET[i] - this.houses.length);
      for (let k = 0; k < n; k++) S.push({ t: 0.6 + ((k + this.rng() * 0.8) / n) * 0.82 * A, a: "house" });
      if (UPGRADE[i]) {
        const olds = this.houses.filter((b) => b.age < i);
        for (let k = olds.length - 1; k > 0; k--) { const j = Math.floor(this.rng() * (k + 1)); [olds[k], olds[j]] = [olds[j], olds[k]]; }
        const m = Math.round(olds.length * UPGRADE[i]);
        for (let k = 0; k < m; k++) S.push({ t: 1.5 + ((k + this.rng()) / m) * 0.86 * A, a: "upgrade", id: olds[k].id });
      }
      this.region.lms[i].forEach((kind, j) => S.push({ t: (0.2 + 0.4 * j + this.r(0, 0.08)) * A, a: "landmark", kind }));
      if (i >= 1 && i <= 4) for (let k = this.ri(1, 2); k > 0; k--) S.push({ t: this.r(0.1, 0.8) * A, a: "field" });
      for (let k = 0; k < 2; k++) S.push({ t: this.r(0.2, 0.9) * A, a: "tree" });
      for (let k = 0; k < 2; k++) S.push({ t: this.r(0.15, 0.85) * A, a: "event" });
      if (i === 7) for (const f of [0.38, 0.62, 0.86]) S.push({ t: (f + this.r(0, 0.05)) * A, a: "launch" });
      S.sort((p, q) => p.t - q.t);
      this.sched = S;
      this.emit({ e: "age", age: i });
    }
    exec(it) {
      if (it.a === "road") this.growRoad();
      else if (it.a === "house") this.placeHouse();
      else if (it.a === "upgrade") this.upgrade(it.id);
      else if (it.a === "landmark") this.placeLandmark(it.kind);
      else if (it.a === "field") this.placeField();
      else if (it.a === "tree") { for (let k = 0; k < 30; k++) { const a = this.r(0, 6.3), rr = Math.sqrt(this.rng()) * 9; if (this.tryTree(Math.cos(a) * rr, Math.sin(a) * rr)) { this.emit({ e: "trees" }); break; } } }
      else if (it.a === "event") this.startEvent();
      else if (it.a === "launch") { if (this.landmarks.some((b) => b.lm === "rocket")) this.startEvent("launch"); }
    }
    /** Skip ahead: finish this age's building work now, then move on. */
    nextAge() {
      if (this.state === "bliz") return false;
      for (const it of this.sched) if (it.a !== "event" && it.a !== "launch") this.exec(it);
      this.sched = [];
      if (this.age < AGES.length - 1) this.startAge(this.age + 1);
      else this.startBlizzard();
      return true;
    }
    startBlizzard() {
      this.state = "bliz";
      this.blizT = 0;
      this.rebuilt = false;
      this.sched = [];
      this.emit({ e: "blizzard" });
    }

    // --- roads ------------------------------------------------------------------------------
    growRoad() {
      const N = this.nodes, deg = N.map(() => 0);
      for (const [a, b] of this.edges) { deg[a]++; deg[b]++; }
      const C = this.center;
      for (let attempt = 0; attempt < 40; attempt++) {
        // pick a node, favouring ones with free sides near the middle
        let tot = 0;
        const ws = N.map((n, i) => { const cap = i === 0 ? 4 : 3; const w = deg[i] < cap ? (cap - deg[i]) / (1 + 0.12 * Math.hypot(n.x - C.x, n.z - C.z)) : 0; tot += w; return w; });
        if (!tot) return false;
        let pr = this.rng() * tot, ni = 0;
        while (pr > ws[ni]) pr -= ws[ni++];
        const n = N[ni];
        const inc = this.edges.filter((e) => e[0] === ni || e[1] === ni);
        let ang;
        if (!inc.length) ang = this.r(0, Math.PI * 2);
        else {
          const e = this.pick(inc), m = N[e[0] === ni ? e[1] : e[0]];
          const base = Math.atan2(n.z - m.z, n.x - m.x);
          ang = base + this.pick([0, 0, Math.PI / 2, -Math.PI / 2, ...(ni === 0 ? [Math.PI] : [])]);
        }
        ang += this.r(-1, 1) * JITTER[this.age];
        const len = this.r(1.9, 2.7);
        let px = n.x + Math.cos(ang) * len, pz = n.z + Math.sin(ang) * len;
        // snap to a nearby node to close a loop
        let qi = -1;
        for (let k = 0; k < N.length; k++) if (k !== ni && Math.hypot(N[k].x - px, N[k].z - pz) < 0.8) { qi = k; break; }
        if (qi >= 0) {
          if (this.edges.some((e) => (e[0] === ni && e[1] === qi) || (e[1] === ni && e[0] === qi))) continue;
          px = N[qi].x; pz = N[qi].z;
        }
        if (!this.roadOk(ni, qi, n.x, n.z, px, pz)) continue;
        if (qi < 0) { N.push({ x: px, z: pz }); qi = N.length - 1; }
        this.edges.push([ni, qi]);
        const ax = n.x, az = n.z;
        this.pruneTrees((t) => pointSegDist(t.x, t.z, ax, az, px, pz) < ROAD_W / 2 + 0.25);
        const nf = this.fields.length;
        this.fields = this.fields.filter((f) => segObbDist(f, ax, az, px, pz) > ROAD_W / 2);
        if (nf !== this.fields.length) this.emit({ e: "fields" });
        this.emit({ e: "roads" });
        return true;
      }
      return false;
    }
    roadOk(ni, qi, ax, az, bx, bz) {
      if (Math.hypot(bx, bz) > TOWN_R - 0.25) return false;
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (this.waterDist(x, z) < 0.35) return false;
      }
      if (Math.abs(this.heightAt(bx, bz) - this.heightAt(ax, az)) > 0.5) return false;
      const N = this.nodes;
      if (qi < 0) {
        for (let k = 0; k < N.length; k++) if (Math.hypot(N[k].x - bx, N[k].z - bz) < 0.9) return false;
        for (const e of this.edges) if (e[0] !== ni && e[1] !== ni && this.segDist(e, bx, bz) < 0.75) return false;
      }
      for (const e of this.edges) {
        if (e[0] === ni || e[1] === ni || e[0] === qi || e[1] === qi) continue;
        const A = N[e[0]], B = N[e[1]];
        if (segCross([ax, az], [bx, bz], [A.x, A.z], [B.x, B.z])) return false;
      }
      for (const b of this.buildings) if (segObbDist(b, ax, az, bx, bz) < ROAD_W / 2 + 0.06) return false;
      return true;
    }
    pickEdge() {
      if (!this.edges.length) return null;
      const C = this.center, k = 3 + this.age * 1.2;
      let tot = 0;
      const ws = this.edges.map((e) => {
        if (e.full) return 0;
        const [a, b] = e;
        const mx = (this.nodes[a].x + this.nodes[b].x) / 2 - C.x, mz = (this.nodes[a].z + this.nodes[b].z) / 2 - C.z;
        const w = 1 / (1 + (Math.hypot(mx, mz) / k) ** 2);
        tot += w; return w;
      });
      if (!tot) return null;
      let pr = this.rng() * tot, i = 0;
      while (pr > ws[i] && i < ws.length - 1) pr -= ws[i++];
      return this.edges[i];
    }

    // --- buildings --------------------------------------------------------------------------
    /** Can box b stand here? Returns the fields it would flatten, or null. */
    fits(b, { fieldsOk = false, ignore = null, slope = 0.45, houses = true } = {}) {
      for (const [x, z] of corners(b)) if (Math.hypot(x, z) > TOWN_R + 0.2) return null;
      if (pointObbDist(b, this.center.x, this.center.z) < PLAZA_R) return null;
      let lo = Infinity, hi = -Infinity;
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const x = b.x + c * (b.w / 2) * i - s * (b.d / 2) * j, z = b.z + s * (b.w / 2) * i + c * (b.d / 2) * j;
        if (this.waterDist(x, z) < 0.25) return null;
        const h = this.heightAt(x, z);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      if (hi - lo > slope) return null;
      for (const o of this.buildings) {
        if (o === ignore) continue;
        if (!houses && o.kind === "house") continue;
        if (obbOverlap(b, o, 0.07)) return null;
      }
      for (const [p, q] of this.edges) {
        const A = this.nodes[p], B = this.nodes[q];
        if (segObbDist(b, A.x, A.z, B.x, B.z) < ROAD_W / 2 + 0.06) return null;
      }
      const hit = this.fields.filter((f) => obbOverlap(b, f, 0.02));
      if (hit.length && !fieldsOk) return null;
      return hit;
    }
    add(b, hitFields) {
      if (hitFields && hitFields.length) { this.fields = this.fields.filter((f) => !hitFields.includes(f)); this.emit({ e: "fields" }); }
      this.pruneTrees((t) => pointObbDist(b, t.x, t.z) < 0.3);
      b.id = this.nextId++;
      b.seed = (this.rng() * 1e9) | 0;
      b.born = this.t;
      b.h = this.baseHeight(b);
      this.buildings.push(b);
      this.emit({ e: "add", b });
      return b;
    }
    remove(b) {
      const i = this.buildings.indexOf(b);
      if (i < 0) return;
      this.buildings.splice(i, 1);
      for (const e of this.edges) e.full = false;
      this.emit({ e: "remove", id: b.id });
    }
    baseHeight(b) {
      let lo = Infinity;
      for (const [x, z] of corners(b)) lo = Math.min(lo, this.heightAt(x, z));
      return Math.min(lo, this.heightAt(b.x, b.z));
    }
    newHouse(st) {
      const roof = this.pick(st.roofs);
      const tall = roof === "tower" || roof === "neon" || roof === "gtower" || roof === "spire";
      const floors = tall ? this.ri(Math.max(4, st.floors[0]), Math.max(5, st.floors[1] + 2)) : this.ri(st.floors[0], Math.min(st.floors[1], 3));
      const w = this.r(st.size[0], st.size[1]);
      return {
        kind: "house", age: this.age, roof, floors, w, d: w * this.r(0.8, 1.05),
        wall: this.pick(st.walls), roofC: this.pick(st.roofCs),
        label: this.age === 7 ? this.pick(LABELS[7].concat(tall ? ["sky garden", "orbital office"] : [])) : tall ? this.pick(["apartments", "office tower", "hotel"]) : this.pick(LABELS[this.age]),
      };
    }
    placeHouse() {
      if (this.buildings.length >= MAX_B) return false;
      const st = styleFor(this.region, this.age);
      // early on, huts huddle around the fire rather than lining a road
      if (this.age <= 1) {
        for (let k = 0; k < 40; k++) {
          const h = this.newHouse(st), a = this.r(0, Math.PI * 2), rr = this.r(PLAZA_R + 0.6, 3.2 + this.age);
          const b = Object.assign(h, { x: this.center.x + Math.cos(a) * rr, z: this.center.z + Math.sin(a) * rr, rot: a + Math.PI / 2, face: -1 });
          const hit = this.fits(b);
          if (hit && this.rng() < 0.6 + 0.4 * (1 - this.age)) { this.add(b, hit); return true; }
        }
      }
      for (let attempt = 0; attempt < 30; attempt++) {
        const e = this.pickEdge();
        if (!e) return false;
        const A = this.nodes[e[0]], B = this.nodes[e[1]];
        const L = Math.hypot(B.x - A.x, B.z - A.z), ang = Math.atan2(B.z - A.z, B.x - A.x);
        const vx = -Math.sin(ang), vz = Math.cos(ang);
        const h = this.newHouse(st);
        const lo = h.w / 2 / L + 0.04, hi = 1 - lo;
        if (lo >= hi) { e.full = true; continue; }
        // walk the frontage from a random start, both sides
        const t0 = this.rng(), s0 = this.rng() < 0.5 ? 1 : -1;
        for (let k = 0; k < 10; k++) {
          const t = lo + ((t0 + k * 0.137) % 1) * (hi - lo), side = k % 2 ? -s0 : s0;
          const off = ROAD_W / 2 + 0.1 + h.d / 2;
          const b = Object.assign({}, h, { x: A.x + (B.x - A.x) * t + vx * side * off, z: A.z + (B.z - A.z) * t + vz * side * off, rot: ang, face: -side });
          const hit = this.fits(b, { fieldsOk: this.age >= 5 });
          if (hit) { this.add(b, hit); return true; }
        }
        e.full = true;
      }
      return false;
    }
    upgrade(id) {
      const old = this.buildings.find((b) => b.id === id);
      if (!old || old.kind !== "house") return false;
      const st = styleFor(this.region, this.age);
      const h = this.newHouse(st);
      const vx = -Math.sin(old.rot), vz = Math.cos(old.rot), grow = (h.d - old.d) / 2;
      let b = Object.assign({}, h, { x: old.x - vx * old.face * grow, z: old.z - vz * old.face * grow, rot: old.rot, face: old.face });
      let hit = this.fits(b, { fieldsOk: this.age >= 5, ignore: old });
      if (!hit) { b = Object.assign(h, { x: old.x, z: old.z, rot: old.rot, face: old.face, w: old.w, d: old.d }); hit = []; }
      this.remove(old);
      this.add(b, hit);
      return true;
    }
    placeLandmark(kind) {
      const fp = LANDMARKS[kind];
      let best = null, bs = Infinity;
      for (let k = 0; k < 90; k++) {
        let b;
        const e = this.rng() < 0.6 ? this.pickEdge() : null;
        if (e) {
          const A = this.nodes[e[0]], B = this.nodes[e[1]], ang = Math.atan2(B.z - A.z, B.x - A.x), t = this.r(0.2, 0.8), side = this.rng() < 0.5 ? 1 : -1;
          const off = ROAD_W / 2 + 0.12 + fp.d / 2, vx = -Math.sin(ang), vz = Math.cos(ang);
          b = { x: A.x + (B.x - A.x) * t + vx * side * off, z: A.z + (B.z - A.z) * t + vz * side * off, rot: ang, face: -side };
        } else {
          const a = this.r(0, Math.PI * 2), rr = this.r(PLAZA_R + fp.d / 2 + 0.2, 7);
          b = { x: this.center.x + Math.cos(a) * rr, z: this.center.z + Math.sin(a) * rr, rot: this.r(0, Math.PI), face: 1 };
        }
        b.w = fp.w; b.d = fp.d;
        if (!this.fits(b, { fieldsOk: true, slope: 0.6, houses: false })) continue;
        const evict = this.houses.filter((o) => obbOverlap(b, o, 0.07));
        if (evict.length > 3) continue;
        const score = evict.length * 1.5 + Math.hypot(b.x - this.center.x, b.z - this.center.z) * 0.35 + this.rng() * 0.5;
        if (score < bs) { bs = score; best = { b, evict }; }
      }
      if (!best) return false;
      const lms = this.landmarks;
      if (lms.length >= MAX_LANDMARKS) this.remove(lms[0]);
      for (const o of best.evict) this.remove(o);
      const b = Object.assign(best.b, { kind: "landmark", lm: kind, age: this.age, label: this.landmarkName(kind) });
      this.add(b, this.fields.filter((f) => obbOverlap(b, f, 0.02)));
      return true;
    }
    landmarkName(kind) {
      if (kind === "stadium" && this.age < 5) return "the amphitheatre";
      return LANDMARKS[kind].name;
    }

    // --- fields -------------------------------------------------------------------------------
    placeField() {
      if (this.fields.length >= 6) return false;
      for (let k = 0; k < 40; k++) {
        const a = this.r(0, Math.PI * 2), rr = this.r(5, 8.4);
        const f = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, rot: this.r(0, Math.PI), w: this.r(1.3, 1.9), d: this.r(0.9, 1.3) };
        if (corners(f).some(([x, z]) => Math.hypot(x, z) > DISC - 0.7 || this.waterDist(x, z) < 0.3)) continue;
        if (Math.abs(this.heightAt(f.x, f.z) - Math.min(...corners(f).map(([x, z]) => this.heightAt(x, z)))) > 0.3) continue;
        if (this.buildings.some((b) => obbOverlap(f, b, 0.1))) continue;
        if (this.fields.some((o) => obbOverlap(f, o, 0.05))) continue;
        if (this.edges.some(([p, q]) => segObbDist(f, this.nodes[p].x, this.nodes[p].z, this.nodes[q].x, this.nodes[q].z) < ROAD_W / 2 + 0.05)) continue;
        f.id = this.nextId++;
        f.crop = this.region.id === "eastasia" ? "rice" : this.pick(["wheat", "wheat", "veg"]);
        this.fields.push(f);
        this.pruneTrees((t) => pointObbDist(f, t.x, t.z) < 0.3);
        this.emit({ e: "fields" });
        return true;
      }
      return false;
    }

    // --- events -------------------------------------------------------------------------------
    startEvent(force = null) {
      const opts = ["festival"];
      const houses = this.houses;
      if (this.age >= 1 && houses.length >= 4) opts.push("fire");
      if (this.age >= 1) opts.push("market", "market");
      const path = this.age >= 2 ? this.shipPath() : null;
      if (path) opts.push("ship", "ship");
      if (this.fields.length) opts.push("harvest");
      const pad = this.landmarks.find((b) => b.lm === "rocket");
      const type = force || this.pick(opts);
      const ev = { id: this.nextId++, type, t0: this.t, dur: this.r(8, 13), x: this.center.x, z: this.center.z };
      if (type === "fire") { const b = this.pick(houses); ev.target = b.id; ev.x = b.x; ev.z = b.z; }
      if (type === "ship") { ev.path = path; ev.dur = this.r(14, 20); }
      if (type === "launch") { ev.target = pad.id; ev.x = pad.x; ev.z = pad.z; ev.dur = 9; }
      this.events.push(ev);
      this.emit({ e: "event", ev });
    }
    shipPath() {
      const T = this.terrain, pts = [];
      if (T.type === "river") {
        const c = Math.cos(T.th), s = Math.sin(T.th);
        for (let b = -DISC; b <= DISC; b += 0.5) {
          const a = T.off + T.amp * Math.sin(b * T.freq + T.ph);
          const x = a * c - b * s, z = a * s + b * c;
          if (Math.hypot(x, z) < DISC - 1) pts.push([x, z]);
        }
      } else if (T.type === "coast") {
        const c = Math.cos(T.th), s = Math.sin(T.th), d = T.c + 1.7;
        for (let k = -DISC; k <= DISC; k += 0.5) {
          const x = c * d - s * k, z = s * d + c * k;
          if (Math.hypot(x, z) < DISC - 1 && this.waterDist(x, z) < -0.4) pts.push([x, z]);
        }
      }
      return pts.length >= 6 ? pts : null;
    }

    // --- weather ------------------------------------------------------------------------------
    weatherWeights(season) {
      const R = this.region, W = R.weather, M = SEASON_MOD[season];
      const local = (k) => (R.monsoon && season === 1 ? { rain: 3, storm: 2.5, clear: 0.6 }[k] ?? 1 : 1) * (R.winterFog && season === 3 ? { fog: 3 }[k] ?? 1 : 1);
      return WEATHER.map((k) => (W[k] || 0) * (M[k] ?? 1) * local(k) * (k === this.weather.kind ? 0.35 : 1));
    }
    pickWeather() {
      const ws = this.weatherWeights(this.season);
      let tot = ws.reduce((a, b) => a + b, 0), pr = this.rng() * tot, i = 0;
      while (pr > ws[i] && i < ws.length - 1) pr -= ws[i++];
      this.weather = { kind: WEATHER[i], t0: this.t, until: this.t + this.r(14, 30) };
      this.emit({ e: "weather", kind: WEATHER[i] });
    }

    // --- the clock ----------------------------------------------------------------------------
    step() {
      this.t += DT;
      const snowing = this.state === "bliz" || this.weather.kind === "snow";
      if (snowing) this.snowCover = Math.min(1, this.snowCover + 0.07 * DT);
      else this.snowCover = Math.max(0, this.snowCover - (this.season === 3 ? 0.004 : 0.05) * DT);

      if (this.state === "bliz") {
        this.blizT += DT;
        if (!this.rebuilt && this.blizT >= BLIZ_T / 2) { this.rebuilt = true; this.newTown(); }
        if (this.blizT >= BLIZ_T) { this.state = "grow"; this.emit({ e: "clear" }); }
        return;
      }
      this.ageT += DT;
      while (this.sched.length && this.sched[0].t <= this.ageT) this.exec(this.sched.shift());
      for (let i = this.events.length - 1; i >= 0; i--) {
        const ev = this.events[i];
        if (this.t > ev.t0 + ev.dur) { this.events.splice(i, 1); this.emit({ e: "eventEnd", id: ev.id }); }
      }
      if (this.t >= this.weather.until) this.pickWeather();
      if (this.ageT >= AGE_T) {
        if (this.age < AGES.length - 1) this.startAge(this.age + 1);
        else this.startBlizzard();
      }
    }
  }

  globalThis.SnowSim = {
    Sim, DT, AGE_T, BLIZ_T, DAY_T, DISC, TOWN_R, PLAZA_R, ROAD_W, MAX_B,
    AGES, REGIONS, LANDMARKS, TARGET, SEASONS, WEATHER, styleFor,
    obbOverlap, segObbDist, pointObbDist, corners, mulberry32,
  };
})();
