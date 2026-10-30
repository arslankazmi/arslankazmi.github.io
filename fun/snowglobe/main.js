/* ============================================================================
   main.js — Snow Globe: scene, render loop, weather, input, HUD (DESIGN.md).

   The sim (sim.js) decides what happens; this file draws it. Scene graph:
     scene ─ rig (shake wobble)
               ├ base + plaque (stay put)
               └ spin (drag to turn)
                   ├ sky dome, sun/moon, sun light
                   ├ ground, water, roads, fields, trees, buildings, people
                   ├ particles: fx, snow/sand, rain, clouds, fog
                   ├ whiteout (blizzard)
                   └ glass
   ============================================================================ */
import * as THREE from "three";
import { Kit, merge, house, landmark, treeKit, personGeos, hatGeo, boat, stall, shade } from "./models.js";

const S = globalThis.SnowSim;
const { DISC, PLAZA_R, ROAD_W } = S;
const GLOBE_R = 10.6, GLOBE_CY = 2.75;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// --- seed + sim ---------------------------------------------------------------------
const hashSeed = /seed=(\d+)/.exec(location.hash);
const seed = hashSeed ? +hashSeed[1] : (Math.random() * 1e9) | 0;
const startAt = /region=([a-z]+)/.exec(location.hash);
const sim = new S.Sim(seed, { start: startAt ? startAt[1] : null });

// --- renderer -------------------------------------------------------------------------
const canvas = document.getElementById("globe");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
// A paper backdrop (the same warm gradient as the page) so the glass has something to refract at its rim.
scene.background = (() => {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 272;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(128, 100, 10, 128, 120, 200);
  gr.addColorStop(0, "#f8f1df"); gr.addColorStop(0.55, "#ecdfc1"); gr.addColorStop(1, "#d9c49b");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 272);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
const LOOK = new THREE.Vector3(0, 4.2, 0);
let camDist = 47, camDistTarget = 47;
const CAM_EL = 0.24;

const rig = new THREE.Group(), spin = new THREE.Group(), town = new THREE.Group();
scene.add(rig); rig.add(spin); spin.add(town);

// --- materials -------------------------------------------------------------------------
const gradientMap = new THREE.DataTexture(new Uint8Array([90, 165, 255]), 3, 1, THREE.RedFormat);
gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
gradientMap.needsUpdate = true;
const U = { snow: { value: 0 } };
/** Toon material whose up-facing surfaces whiten as snow settles. */
function toon(opts, snowy = true) {
  const m = new THREE.MeshToonMaterial(Object.assign({ gradientMap }, opts));
  if (snowy) m.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = U.snow;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSnowN;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvSnowN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSnowN;\nuniform float uSnow;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0), uSnow * smoothstep(0.55, 0.9, vSnowN.y));");
  };
  return m;
}
const M = {
  body: toon({ vertexColors: true }),
  line: new THREE.MeshBasicMaterial({ color: 0x3b2618, side: THREE.BackSide }),
  win: new THREE.MeshBasicMaterial({ color: 0x4b3f4a }),
  neon: new THREE.MeshBasicMaterial({ vertexColors: true }),
  ground: toon({ vertexColors: true }),
  water: toon({ color: 0x5f9fb0, transparent: true, opacity: 0.92 }, false),
  trunk: toon({ color: 0x7a5234 }),
  canopy: toon({ color: 0xffffff }),
  crop: toon({ color: 0x9cc46a }),
  people: toon({ color: 0xffffff }, false),
  helmet: new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, shininess: 90, specular: 0xffffff, depthWrite: false }),
  legs: toon({ color: 0x4a3a30 }, false),
  wood: toon({ color: 0x7a4a2b }, false),
  brass: toon({ color: 0xd2a74a }, false),
  cloud: toon({ color: 0xffffff, transparent: true, opacity: 0.95 }, false),
  scaffold: new THREE.LineBasicMaterial({ color: 0x8a5a38, transparent: true }),
};
const C = (hex) => new THREE.Color(hex);

// --- lights ---------------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xfff4dc, 0x6a5a48, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 60 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
spin.add(sun, sun.target);

// --- base, glass, sky ----------------------------------------------------------------------------
{
  const prof = [[10.1, 0.02], [10.15, 0.02], [10.75, 0.0], [10.95, -0.25], [11.0, -0.6], [11.7, -1.1], [12.35, -2.2], [12.45, -2.95], [11.9, -3.35], [0, -3.35]].map(([r, y]) => new THREE.Vector2(r, y));
  const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), M.wood);
  base.receiveShadow = true;
  const baseLine = new THREE.Mesh(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x * 1.006 + 0.03, p.y)), 72), M.line);
  for (const [r, y, t] of [[10.95, -0.35, 0.14], [12.4, -2.75, 0.12]]) rig.add(new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 72).rotateX(Math.PI / 2).translate(0, y, 0), M.brass));
  rig.add(base, baseLine);
}
const plaqueCanvas = document.createElement("canvas");
plaqueCanvas.width = 768; plaqueCanvas.height = 200;
const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
plaqueTex.colorSpace = THREE.SRGBColorSpace;
plaqueTex.anisotropy = 4;
const plaque = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.36), new THREE.MeshBasicMaterial({ map: plaqueTex }));
plaque.position.set(0, -1.75, 12.3);
plaque.rotation.x = -0.53;
rig.add(plaque);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_R - 0.12, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: C("#8fc3dc") }, uBot: { value: C("#f3e6c4") }, uStars: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 uTop, uBot; uniform float uStars, uFlash, uTime; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vP);
        vec3 col = mix(uBot, uTop, smoothstep(-0.15, 0.85, d.y));
        vec3 cell = floor(d * 70.0), fr = fract(d * 70.0) - 0.5;
        float s = step(0.97, h(cell)) * smoothstep(0.32, 0.08, length(fr)) * smoothstep(0.1, 0.5, d.y) * uStars;
        s *= 0.6 + 0.4 * sin(uTime * 2.0 + h(cell + 1.0) * 30.0);
        col += vec3(s);
        col = mix(col, vec3(1.0), uFlash);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
sky.position.y = GLOBE_CY;
spin.add(sky);

const sunBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
const moonBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2), new THREE.MeshBasicMaterial({ color: 0xf4ecd0 }));
spin.add(sunBall, moonBall);

// Real glass: refractive, clear-coated and reflecting a soft studio room. Only the glass sees the
// environment map; the town inside keeps its flat toon look.
const pmrem = new THREE.PMREMGenerator(renderer);
// A made-to-measure "room": dim warm walls, a tall window up-left, a thin strip light right and a
// soft glow overhead, so the reflections read as glass without covering the town.
const envTex = (() => {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 vP; void main(){ float y = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.18, 0.14, 0.1), vec3(0.42, 0.38, 0.33), smoothstep(-0.6, 0.8, y)), 1.0); }",
  })));
  const light = (w, h, x, y, z, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.96), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m);
  };
  light(14, 22, -26, 16, 28, 6);      // window, up and to the left of the viewer
  light(3, 26, 30, 6, 20, 3);         // thin strip on the right
  light(30, 10, 0, 40, -6, 1.4);      // soft ceiling glow
  const t = pmrem.fromScene(room, 0.02).texture;
  return t;
})();
const glass = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_R, 96, 64),
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.4, ior: 1.46,
    envMap: envTex, envMapIntensity: 1.0, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1,
    attenuationColor: new THREE.Color("#eef6ff"), attenuationDistance: 12, depthWrite: false,
  }),
);
glass.position.y = GLOBE_CY;
glass.renderOrder = 10;
spin.add(glass);

const whiteout = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R - 0.25, 40, 24), new THREE.MeshBasicMaterial({ color: 0xf4f7fb, transparent: true, opacity: 0, depthWrite: false }));
whiteout.position.y = GLOBE_CY;
whiteout.renderOrder = 9;
spin.add(whiteout);

// --- ground, water, roads, fields --------------------------------------------------------------------
let ground = null, water = null, roads = null, fieldsMesh = null, plaza = null;
function hullOf(geo) {
  const h = geo.clone();
  h.computeBoundingBox();
  const c = h.boundingBox.getCenter(new THREE.Vector3()), sz = h.boundingBox.getSize(new THREE.Vector3()), T = 0.028;
  h.translate(-c.x, -c.y, -c.z);
  h.scale((sz.x + 2 * T) / Math.max(sz.x, 0.01), (sz.y + 2 * T) / Math.max(sz.y, 0.01), (sz.z + 2 * T) / Math.max(sz.z, 0.01));
  return h.translate(c.x, c.y, c.z);
}
function disposeMesh(m) { if (!m) return; m.parent && m.parent.remove(m); m.geometry && m.geometry.dispose(); }

function buildGround() {
  disposeMesh(ground); disposeMesh(water);
  const R = 52, SEG = 160, g = sim.region.ground;
  const cG = C(g.grass), cS = C(g.sand), cB = C(g.bed), cDark = C(g.grass).multiplyScalar(0.86);
  const pos = [], col = [], idx = [], tmp = new THREE.Color();
  const push = (x, z) => {
    const t = sim.terrainAt(x, z);
    pos.push(x, t.h, z);
    const n = 0.5 + 0.5 * Math.sin(x * 1.3 + Math.sin(z * 0.9) * 2) * Math.sin(z * 1.7 + x * 0.4);
    if (t.water) tmp.copy(cB); else if (t.sand) tmp.copy(cS); else tmp.copy(cG).lerp(cDark, n * 0.7);
    col.push(tmp.r, tmp.g, tmp.b);
  };
  push(0, 0);
  for (let i = 1; i <= R; i++) {
    const r = (DISC * i) / R;
    for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; push(Math.cos(a) * r, Math.sin(a) * r); }
  }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
  for (let i = 1; i < R; i++) for (let j = 0; j < SEG; j++) {
    const a = 1 + (i - 1) * SEG + j, b = 1 + (i - 1) * SEG + ((j + 1) % SEG), c = a + SEG, d = b + SEG;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  ground = new THREE.Mesh(geo, M.ground);
  ground.receiveShadow = true;
  town.add(ground);
  if (sim.terrain.type !== "hills") {
    M.water.color.set(sim.region.water);
    water = new THREE.Mesh(new THREE.CircleGeometry(DISC - 0.05, 96).rotateX(-Math.PI / 2), M.water);
    water.position.y = -0.1;
    water.receiveShadow = true;
    town.add(water);
  }
}

const ROAD_C = ["#b99a6b", "#b39a72", "#a8957a", "#9f978a", "#a39b8e", "#7c7670", "#5f5c62", "#cfd8dc"];
function buildRoads() {
  disposeMesh(roads); disposeMesh(plaza);
  const k = new Kit(), col = ROAD_C[sim.age], N = sim.nodes;
  for (const [a, b] of sim.edges) {
    const A = N[a], B = N[b], L = Math.hypot(B.x - A.x, B.z - A.z), ang = Math.atan2(B.z - A.z, B.x - A.x);
    const n = Math.max(1, Math.ceil(L / 0.5));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
      const g = new THREE.BoxGeometry(L / n + 0.03, 0.05, ROAD_W).rotateY(-ang).translate(x, sim.heightAt(x, z) + 0.02, z);
      k.add(g, col, false);
      if (sim.age === 7 && i % 2 === 0) k.glow(new THREE.BoxGeometry(L / n * 0.7, 0.052, 0.03).rotateY(-ang).translate(x, sim.heightAt(x, z) + 0.022, z), "#5fd3d8");
      if (sim.age === 6 && i % 2 === 0 && L > 1.5) k.add(new THREE.BoxGeometry(0.16, 0.052, 0.03).rotateY(-ang).translate(x, sim.heightAt(x, z) + 0.021, z), "#f4efe2", false);
    }
  }
  for (const n of N) k.add(new THREE.CylinderGeometry(ROAD_W / 2, ROAD_W / 2, 0.05, 10).translate(n.x, sim.heightAt(n.x, n.z) + 0.02, n.z), col, false);
  const cx = sim.center.x, cz = sim.center.z;
  k.add(new THREE.CylinderGeometry(PLAZA_R * 0.95, PLAZA_R, 0.06, 28).translate(cx, sim.heightAt(cx, cz) + 0.025, cz), shade(col, 0.18), false);
  if (sim.age >= 2) k.add(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 12).translate(cx, sim.heightAt(cx, cz) + 0.05, cz), "#b8b0a0");
  roads = new THREE.Mesh(merge(k.body), M.body);
  roads.receiveShadow = true;
  if (k.neon.length) roads.add(new THREE.Mesh(merge(k.neon), M.neon));
  town.add(roads);
}
function buildFields() {
  const soil = [], crops = [];
  for (const f of sim.fields) {
    const h = sim.heightAt(f.x, f.z) + 0.02;
    soil.push(new THREE.BoxGeometry(f.w, 0.06, f.d).rotateY(-f.rot).translate(f.x, h, f.z));
    const rows = Math.max(3, Math.round(f.d / 0.22));
    for (let i = 0; i < rows; i++) {
      const z = -f.d / 2 + ((i + 0.5) * f.d) / rows;
      const g = new THREE.BoxGeometry(f.w * 0.9, f.crop === "rice" ? 0.05 : 0.1, 0.1).translate(0, 0, z).rotateY(-f.rot).translate(f.x, h + 0.06, f.z);
      crops.push(g);
    }
  }
  if (!soil.length) { fieldsMesh = null; return; }
  const k = new Kit();
  for (const g of soil) k.add(g, sim.region.id === "china" || sim.region.id === "japan" ? "#7a8f7a" : "#8a6a44", false);
  fieldsMesh = new THREE.Group();
  const sm = new THREE.Mesh(merge(k.body), M.body);
  const cm = new THREE.Mesh(merge(crops.map((g) => { const n = g.toNonIndexed(); g.dispose(); n.deleteAttribute("uv"); return n; })), M.crop);
  sm.receiveShadow = cm.receiveShadow = true;
  fieldsMesh.add(sm, cm);
  town.add(fieldsMesh);
}
function disposeFields() { if (!fieldsMesh) return; fieldsMesh.children.forEach((m) => m.geometry.dispose()); town.remove(fieldsMesh); fieldsMesh = null; }

// --- trees ----------------------------------------------------------------------------------------------
const MAX_TREES = 140;
let trees = null;   // { kit, trunk, canopy, line, state: Map(id → {c, s}) }
const dummy = new THREE.Object3D();
function buildTreeMeshes() {
  if (trees) { for (const m of [trees.trunk, trees.canopy, trees.line]) { town.remove(m); m.dispose(); } trees.kit.trunk.dispose(); trees.kit.canopy.dispose(); trees.kit.canopyHull.dispose(); }
  const kit = treeKit(sim.region.trees);
  const trunk = new THREE.InstancedMesh(kit.trunk, M.trunk, MAX_TREES);
  const canopy = new THREE.InstancedMesh(kit.canopy, M.canopy, MAX_TREES);
  const line = new THREE.InstancedMesh(kit.canopyHull, M.line, MAX_TREES);
  for (const m of [trunk, canopy, line]) { m.count = 0; m.castShadow = m !== line; town.add(m); }
  canopy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TREES * 3), 3);
  trees = { kit, trunk, canopy, line, state: new Map() };
}
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
function updateTrees(dt, season) {
  if (!trees) return;
  const list = sim.trees, k = trees.kit, n = Math.min(list.length, MAX_TREES);
  const target = C(k.colors[season]);
  const leafless = !k.evergreen && season === 3;
  for (let i = 0; i < n; i++) {
    const t = list[i];
    let st = trees.state.get(t.id);
    if (!st) { st = { c: target.clone(), s: 0, v: (Math.sin(t.id * 12.9898) * 43758.5453) % 1 }; trees.state.set(t.id, st); }
    st.s = Math.min(1, st.s + dt * 1.5);
    tmpC2.copy(target).offsetHSL(0, 0, st.v * 0.06);
    st.c.lerp(tmpC2, Math.min(1, dt * 0.8));
    st.leaf = (st.leaf ?? (leafless ? 0 : 1)) + ((leafless ? 0 : 1) - (st.leaf ?? 1)) * Math.min(1, dt * 0.8);
    const y = sim.heightAt(t.x, t.z), s = t.s * (0.3 + 0.7 * easeOutBack(st.s));
    dummy.position.set(t.x, y, t.z); dummy.rotation.set(0, t.id, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    trees.trunk.setMatrixAt(i, dummy.matrix);
    dummy.scale.setScalar(s * Math.max(0.001, st.leaf)); dummy.updateMatrix();
    trees.canopy.setMatrixAt(i, dummy.matrix);
    trees.line.setMatrixAt(i, dummy.matrix);
    trees.canopy.setColorAt(i, st.c);
  }
  for (const m of [trees.trunk, trees.canopy, trees.line]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  trees.canopy.instanceColor.needsUpdate = true;
  M.crop.color.lerp(tmpC.set(cropColor(season)), Math.min(1, dt));
}
function cropColor(season) {
  if (activeEvents.some((a) => a.ev.type === "harvest")) return "#e6bd4a";
  return ["#9cc46a", "#b6c35a", "#dcb44a", "#8a7a5a"][season];
}

// --- buildings ----------------------------------------------------------------------------------------------
const bmeshes = new Map();   // id → group
const pickables = [];
function addBuilding(b, instant = false) {
  const kit = b.kind === "landmark" ? landmark(b, sim.region) : house(b);
  const g = new THREE.Group(), inner = new THREE.Group();
  g.add(inner);
  const body = new THREE.Mesh(merge(kit.body), M.body);
  body.castShadow = body.receiveShadow = true;
  body.userData.b = b;
  inner.add(body);
  pickables.push(body);
  if (kit.line.length) inner.add(new THREE.Mesh(merge(kit.line), M.line));
  if (kit.win.length) inner.add(new THREE.Mesh(merge(kit.win), M.win));
  if (kit.neon.length) inner.add(new THREE.Mesh(merge(kit.neon), M.neon));
  const movers = {};
  for (const [name, mv] of Object.entries(kit.movers)) {
    const mg = new THREE.Group();
    if (mv.body) { const m = new THREE.Mesh(mv.body, M.body); m.castShadow = true; mg.add(m, new THREE.Mesh(hullOf(mv.body), M.line)); }
    if (mv.glow) mg.add(new THREE.Mesh(mv.glow, M.neon));
    if (name === "rocket") mg.position.set(...kit.rocketBase);
    inner.add(mg);
    movers[name] = mg;
  }
  const spinners = kit.spin.map((s) => { const m = new THREE.Mesh(s.geo, M.body); m.position.set(...s.pivot); m.castShadow = true; m.userData.speed = s.speed; inner.add(m); return m; });
  g.position.set(b.x, b.h, b.z);
  g.rotation.y = -b.rot;
  const rnd = S.mulberry32(b.seed);
  if (b.kind === "house") { inner.rotation.z = (rnd() - 0.5) * 0.07; inner.rotation.x = (rnd() - 0.5) * 0.05; }
  body.geometry.computeBoundingBox();
  const bb = body.geometry.boundingBox, size = bb.getSize(new THREE.Vector3());
  let scaffold = null;
  if (!instant) {
    scaffold = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.08, size.y + 0.05, size.z + 0.08)), M.scaffold.clone());
    scaffold.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    g.add(scaffold);
    puff(b.x, b.h + 0.1, b.z, Math.max(b.w, b.d) * 0.6, "#c9b28a", 12);
  }
  g.userData = { b, inner, body, spinners, movers, climb: kit.climb, rocketBase: kit.rocketBase, smoke: kit.smoke, lamp: kit.lamp, p: instant ? 1 : 0, dying: false, scaffold, height: size.y, smokeT: rnd() * 2 };
  town.add(g);
  bmeshes.set(b.id, g);
  if (b.kind === "landmark" && !instant) chime([523, 659, 784]);
}
function removeBuilding(id, instant = false) {
  const g = bmeshes.get(id);
  if (!g) return;
  bmeshes.delete(id);
  const i = pickables.indexOf(g.userData.body);
  if (i >= 0) pickables.splice(i, 1);
  if (instant) disposeGroup(g);
  else { g.userData.dying = true; g.userData.d = 1; puff(g.userData.b.x, g.userData.b.h + 0.2, g.userData.b.z, 0.5, "#cbbd9f", 8); dyingList.push(g); }
}
const dyingList = [];
function disposeGroup(g) {
  town.remove(g);
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== M.body && !Object.values(M).includes(o.material)) o.material.dispose(); });
}
const easeOutBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2; };
function updateBuildings(sdt, rdt) {
  for (const g of bmeshes.values()) {
    const u = g.userData;
    if (u.p < 1) {
      u.p = Math.min(1, u.p + Math.max(sdt, rdt) / 1.6);
      const p = u.p, sy = Math.max(0.02, easeOutBack(p)), sx = 1 + 0.12 * Math.sin(p * Math.PI) * (1 - p);
      u.inner.scale.set(sx, sy, sx);
      if (u.scaffold) {
        u.scaffold.material.opacity = Math.min(1, (1 - p) * 3);
        if (p >= 1) { g.remove(u.scaffold); u.scaffold.geometry.dispose(); u.scaffold.material.dispose(); u.scaffold = null; }
      }
    }
    for (const m of u.spinners) m.rotation.z += rdt * m.userData.speed * Math.max(1, Math.sqrt(speed));
    if (u.movers.climber) { const [a, c] = u.climb; u.movers.climber.position.y = a + (c - a) * (0.5 - 0.5 * Math.cos(vtNow * 0.18 + u.b.seed)); }
    if (u.smoke.length && u.p >= 1) {
      u.smokeT -= sdt;
      if (u.smokeT <= 0) {
        u.smokeT = 0.5 + Math.random() * 0.6;
        for (const [x, y, z] of u.smoke) {
          const w = g.localToWorld(new THREE.Vector3(x, y, z));
          town.worldToLocal(w);
          emit({ x: w.x, y: w.y, z: w.z, vx: 0.05 + Math.random() * 0.05, vy: 0.35, vz: (Math.random() - 0.5) * 0.05, life: 2.6, size: 0.18, grow: 0.25, color: "#d8d2c8", alpha: 0.7 });
        }
      }
    }
  }
  for (let i = dyingList.length - 1; i >= 0; i--) {
    const g = dyingList[i];
    g.userData.d -= Math.max(sdt, rdt) / 0.6;
    const d = Math.max(0, g.userData.d);
    g.userData.inner.scale.set(1 + (1 - d) * 0.15, d, 1 + (1 - d) * 0.15);
    if (d <= 0) { disposeGroup(g); dyingList.splice(i, 1); }
  }
}

// --- people ----------------------------------------------------------------------------------------------------
const MAX_P = 110;
const PG = personGeos();
const people = {
  legs: new THREE.InstancedMesh(PG.legs, M.legs, MAX_P),
  body: new THREE.InstancedMesh(PG.body, M.people, MAX_P),
  head: new THREE.InstancedMesh(PG.head, M.people, MAX_P),
  hat: new THREE.InstancedMesh(hatGeo(0), M.people, MAX_P),
  list: [],
  hatAge: 0,
};
for (const k of ["legs", "body", "head", "hat"]) { people[k].count = 0; people[k].castShadow = true; town.add(people[k]); }
for (const k of ["body", "head", "hat"]) people[k].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_P * 3), 3);
pickables.push(people.body, people.head);
const SKIN = ["#f1c9a0", "#d9a679", "#a8754f", "#7a4f32", "#e8b98f"];
const CLOTHES = [
  ["#a8754f", "#8a6a44", "#c9a66b"], ["#e8dcc0", "#c8955f", "#b4553f"], ["#7f9b5a", "#a24a38", "#6f9fb8"],
  ["#5b7fa6", "#8a3a3a", "#6e8c48", "#a87b4f"], ["#7a3f6a", "#2f5a6a", "#c0674a", "#e0b54a"], ["#3a3a42", "#5a4a3a", "#6a5a7a", "#8a3a3a"], ["#e05a5a", "#5fa0d8", "#f2c94c", "#7fbf7f", "#f4efe2"],
  ["#f4f6f8", "#d9e8ec", "#5fd3d8", "#f2b8e0", "#c9d2da"],
];
const HATC = [["#4a3020", "#2a1a10", "#7a5034"], ["#c8553f", "#e0b54a"], ["#9a9a9a", "#b8a27a"], ["#6a4a3a", "#5b7fa6", "#7f9b5a"], ["#7a1f2f", "#2f2f4a", "#3f6a4a"], ["#1f1f24", "#3a2a22"], ["#e05a5a", "#3a6ad8", "#f2c94c", "#2a2a2a"], ["#cfeff4", "#e6f6ff"]];
const JOBS = [
  ["gatherer", "hunter", "fire-keeper", "storyteller", "toolmaker"], ["potter", "farmer", "scribe", "merchant", "herder"],
  ["smith", "soldier", "weaver", "sailor", "priest"], ["baker", "monk", "squire", "miller", "minstrel"],
  ["painter", "printer", "astronomer", "banker", "apprentice"], ["engineer", "newspaper seller", "mill worker", "chimney sweep", "inventor"],
  ["barista", "programmer", "cyclist", "delivery rider", "student"],
  ["astronaut", "robot mechanic", "hydroponic farmer", "starship pilot", "xenobotanist", "holo-artist"],
];
const DOING = ["on the way home", "off to the market", "out for a stroll", "running late", "looking for a lost cat", "humming a tune", "lost in thought", "visiting a friend"];
function newPerson() {
  const rnd = Math.random, age = sim.age;
  const p = { x: sim.center.x + (rnd() - 0.5), z: sim.center.z + (rnd() - 0.5), node: null, tx: 0, tz: 0, speed: 0.35 + rnd() * 0.3, phase: rnd() * 6, off: (rnd() - 0.5) * 0.18, wait: rnd() * 2, age, born: 0 };
  p.skin = C(SKIN[Math.floor(rnd() * SKIN.length)]);
  p.cloth = C(CLOTHES[age][Math.floor(rnd() * CLOTHES[age].length)]);
  p.hatC = C(HATC[age][Math.floor(rnd() * HATC[age].length)]);
  p.label = `a ${JOBS[age][Math.floor(rnd() * JOBS[age].length)]}, ${DOING[Math.floor(rnd() * DOING.length)]}`;
  if (sim.nodes.length > 1) { p.node = Math.floor(rnd() * sim.nodes.length); const n = sim.nodes[p.node]; p.x = n.x; p.z = n.z; }
  pickNext(p);
  return p;
}
function pickNext(p) {
  const N = sim.nodes;
  if (N.length > 1 && p.node !== null && p.node < N.length) {
    const nb = [];
    for (const [a, b] of sim.edges) { if (a === p.node) nb.push(b); else if (b === p.node) nb.push(a); }
    if (nb.length) { p.node = nb[Math.floor(Math.random() * nb.length)]; p.tx = N[p.node].x; p.tz = N[p.node].z; return; }
  }
  const a = Math.random() * Math.PI * 2, r = PLAZA_R + Math.random() * 1.6;
  p.tx = sim.center.x + Math.cos(a) * r; p.tz = sim.center.z + Math.sin(a) * r;
  if (sim.nodes.length > 1) p.node = 0, (p.tx = sim.nodes[0].x), (p.tz = sim.nodes[0].z);
}
function updatePeople(sdt, rdt) {
  if (people.hatAge !== sim.age) {
    people.hat.geometry.dispose();
    people.hat.geometry = hatGeo(sim.age);
    people.hat.material = sim.age === 7 ? M.helmet : M.people;
    people.hatAge = sim.age;
    for (const p of people.list) { const n = newPerson(); Object.assign(p, { skin: p.skin, cloth: n.cloth, hatC: n.hatC, label: n.label }); }
  }
  const want = sim.state === "bliz" && sim.rebuilt ? 0 : Math.min(MAX_P, Math.round(sim.houses.length * 1.15 + 3));
  while (people.list.length < want) people.list.push(newPerson());
  if (people.list.length > want) people.list.length = want;
  const L = people.list;
  for (let i = 0; i < L.length; i++) {
    const p = L[i];
    p.born = Math.min(1, p.born + rdt * 2);
    if (p.wait > 0) p.wait -= sdt;
    else {
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), step = p.speed * sdt;
      if (d <= step) { p.x = p.tx; p.z = p.tz; if (Math.random() < 0.25) p.wait = 0.5 + Math.random() * 2.5; pickNext(p); }
      else { p.x += (dx / d) * step; p.z += (dz / d) * step; p.dir = Math.atan2(dx, dz); p.phase += step * 18; }
    }
    const nx = Math.cos(p.dir || 0), nz = -Math.sin(p.dir || 0);
    const x = p.x + nx * p.off, z = p.z + nz * p.off;
    const y = sim.heightAt(x, z) + 0.06 + (p.wait > 0 ? 0 : Math.abs(Math.sin(p.phase)) * 0.035);
    dummy.position.set(x, y, z); dummy.rotation.set(0, p.dir || 0, p.wait > 0 ? 0 : Math.sin(p.phase) * 0.08); dummy.scale.setScalar(p.born); dummy.updateMatrix();
    for (const k of ["legs", "body", "head", "hat"]) people[k].setMatrixAt(i, dummy.matrix);
    people.body.setColorAt(i, p.cloth); people.head.setColorAt(i, p.skin); people.hat.setColorAt(i, p.hatC);
  }
  for (const k of ["legs", "body", "head", "hat"]) { people[k].count = L.length; people[k].instanceMatrix.needsUpdate = true; if (people[k].instanceColor) people[k].instanceColor.needsUpdate = true; }
}

// --- particles: fx (smoke, dust, fire, fireworks) ----------------------------------------------------------------------
function pointsMaterial(blending = THREE.NormalBlending) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending,
    uniforms: { uProj: { value: 600 } },
    vertexShader: `
      attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uProj;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uProj / -mv.z; vA = alpha; vC = color; }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.25, r));
        #include <colorspace_fragment>
      }`,
  });
}
function pointCloud(n, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("size", new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(n), 1));
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  return p;
}
const FX_MAX = 900;
const fxMat = pointsMaterial(), fxGlowMat = pointsMaterial(THREE.AdditiveBlending);
const fxPts = pointCloud(FX_MAX, fxMat), fxGlow = pointCloud(400, fxGlowMat);
town.add(fxPts, fxGlow);
const fx = [], fxg = [];
function emit(o) {
  const list = o.glow ? fxg : fx, max = o.glow ? 400 : FX_MAX;
  if (list.length >= max) return;
  o.t = 0; o.c = C(o.color); o.drag = o.drag ?? 0.3; o.g = o.g ?? 0; o.grow = o.grow ?? 0;
  list.push(o);
}
function puff(x, y, z, r, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    emit({ x: x + Math.cos(a) * r * 0.5, y, z: z + Math.sin(a) * r * 0.5, vx: Math.cos(a) * 0.6, vy: 0.3 + Math.random() * 0.3, vz: Math.sin(a) * 0.6, life: 0.9 + Math.random() * 0.4, size: 0.22, grow: 0.3, color, alpha: 0.75, drag: 2.5 });
  }
}
function updateFx(list, pts, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    o.t += dt;
    if (o.t >= o.life) { list.splice(i, 1); continue; }
    const dr = Math.exp(-o.drag * dt);
    o.vx *= dr; o.vy = o.vy * dr - o.g * dt; o.vz *= dr;
    o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
  }
  const P = pts.geometry.attributes;
  for (let i = 0; i < list.length; i++) {
    const o = list[i], f = o.t / o.life;
    P.position.array.set([o.x, o.y, o.z], i * 3);
    P.color.array.set([o.c.r, o.c.g, o.c.b], i * 3);
    P.size.array[i] = o.size * (1 + o.grow * o.t * 4);
    P.alpha.array[i] = o.alpha * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85);
  }
  pts.geometry.setDrawRange(0, list.length);
  for (const k of ["position", "color", "size", "alpha"]) P[k].needsUpdate = true;
}

// --- weather: precipitation, clouds, fog ------------------------------------------------------------------------------
const FLAKES = 1500;
const snowPts = pointCloud(FLAKES, pointsMaterial());
spin.add(snowPts);
const flakes = [];
const INNER = GLOBE_R - 0.5;
function randInGlobe(minY = 0.2) {
  for (;;) {
    const x = (Math.random() * 2 - 1) * INNER, y = minY + Math.random() * (GLOBE_CY + INNER - minY), z = (Math.random() * 2 - 1) * INNER;
    if (x * x + (y - GLOBE_CY) ** 2 + z * z < INNER * INNER) return [x, y, z];
  }
}
for (let i = 0; i < FLAKES; i++) { const [x, y, z] = randInGlobe(); flakes.push({ x, y, z, vx: 0, vy: 0, vz: 0, s: 0.06 + Math.random() * 0.08, ph: Math.random() * 6 }); }
const RAIN = 520;
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAIN * 6), 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xbcd4e6, transparent: true, opacity: 0 }));
rain.frustumCulled = false;
spin.add(rain);
const drops = [];
for (let i = 0; i < RAIN; i++) { const [x, y, z] = randInGlobe(); drops.push({ x, y, z, v: 9 + Math.random() * 4 }); }

const clouds = new THREE.Group();
spin.add(clouds);
for (let i = 0; i < 6; i++) {
  const c = new THREE.Group();
  const n = 3 + (i % 3);
  for (let j = 0; j < n; j++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + Math.random() * 0.5, 1), M.cloud);
    m.position.set((j - n / 2) * 0.75, Math.random() * 0.3, (Math.random() - 0.5) * 0.6);
    c.add(m);
  }
  c.userData = { a: (i / 6) * Math.PI * 2, r: 2.5 + (i % 3) * 1.6, y: 8.6 + (i % 2) * 0.9, sp: 0.03 + Math.random() * 0.03 };
  clouds.add(c);
}
const fogTex = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
})();
const fogs = [];
for (let i = 0; i < 16; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, color: 0xf2efe8, transparent: true, opacity: 0, depthWrite: false }));
  const a = Math.random() * 6.28, r = Math.random() * 7.5;
  s.position.set(Math.cos(a) * r, 0.6 + Math.random() * 1.4, Math.sin(a) * r);
  s.scale.setScalar(4 + Math.random() * 3);
  s.userData = { a, r, sp: 0.02 + Math.random() * 0.03 };
  spin.add(s); fogs.push(s);
}

// --- the Space Age: hover cars, an orbital station, satellites ---------------------------------------------
const CARS = 18;
const cars = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }), CARS);
cars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CARS * 3), 3);
const carPath = [];
for (let i = 0; i < CARS; i++) {
  carPath.push({ r: 1.8 + Math.random() * 5.2, h: 1.2 + Math.random() * 2.4, w: (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1), a: Math.random() * 6.28, ph: Math.random() * 6 });
  cars.setColorAt(i, C(["#5fd3d8", "#f2b8e0", "#ffd27a", "#8fe0b0", "#ffffff"][i % 5]));
}
cars.count = 0;
town.add(cars);
const station = new THREE.Group();
{
  const k = new Kit();
  k.add(new THREE.TorusGeometry(0.8, 0.09, 8, 28).rotateX(Math.PI / 2), "#f4f6f8");
  k.add(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 10), "#e6eef2");
  for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(1.6, 0.03, 0.05).rotateY((i * Math.PI) / 3), "#d9e8ec", false);
  for (const s2 of [-1, 1]) k.add(new THREE.BoxGeometry(0.9, 0.02, 0.36).translate(s2 * 1.4, 0, 0), "#3f5f9a");
  const m = new THREE.Mesh(merge(k.body), M.body);
  station.add(m, new THREE.Mesh(merge(k.line), M.line));
}
spin.add(station);
const sats = pointCloud(6, pointsMaterial(THREE.AdditiveBlending));
spin.add(sats);
let spaceAmt = 0;
function updateSpace(rdt, sdt, t) {
  const want = sim.age === 7 && sim.state !== "bliz" ? 1 : 0;
  spaceAmt += (want - spaceAmt) * Math.min(1, rdt * 0.8);
  const on = spaceAmt > 0.01;
  cars.visible = station.visible = sats.visible = on;
  if (!on) return;
  for (let i = 0; i < CARS; i++) {
    const p = carPath[i];
    p.a += p.w * sdt * 0.6;
    const x = sim.center.x + Math.cos(p.a) * p.r, z = sim.center.z + Math.sin(p.a) * p.r;
    dummy.position.set(x, p.h + Math.sin(t * 1.3 + p.ph) * 0.08, z);
    dummy.rotation.set(0, -p.a - (p.w > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
    dummy.scale.setScalar(spaceAmt);
    dummy.updateMatrix();
    cars.setMatrixAt(i, dummy.matrix);
  }
  cars.count = CARS;
  cars.instanceMatrix.needsUpdate = true;
  const sa = t * 0.05;
  station.position.set(Math.cos(sa) * 3.6, GLOBE_CY + 7.4, Math.sin(sa) * 3.6);
  station.rotation.set(0.35, t * 0.3, 0.1);
  station.scale.setScalar(spaceAmt * 0.8);
  const P = sats.geometry.attributes;
  for (let i = 0; i < 6; i++) {
    const a = t * (0.12 + i * 0.03) + i, r = 5 + (i % 3) * 1.2, y = GLOBE_CY + 5.8 + (i % 2) * 1.1;
    P.position.array.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    P.color.array.set([1, 0.95, 0.8], i * 3);
    P.size.array[i] = 0.12 * (0.7 + 0.3 * Math.sin(t * 4 + i));
    P.alpha.array[i] = spaceAmt;
  }
  sats.geometry.setDrawRange(0, 6);
  for (const k of ["position", "color", "size", "alpha"]) P[k].needsUpdate = true;
}

// Weather targets blend smoothly.
const W = { cloud: 0, rain: 0, snow: 0, fog: 0, sand: 0, storm: 0 };
const WT = {
  clear: { cloud: 0.1 }, cloudy: { cloud: 0.9 }, rain: { cloud: 1, rain: 1 }, snow: { cloud: 0.7, snow: 0.8 },
  fog: { cloud: 0.3, fog: 1 }, storm: { cloud: 1, rain: 1, storm: 1 }, sandstorm: { sand: 1, fog: 0.3 },
};
let shakeE = 0, shakeT = 9, flash = 0, flashT = 3;
function updateWeather(dt) {
  const bliz = sim.state === "bliz";
  const tgt = bliz ? { cloud: 1, snow: 1 } : WT[sim.weather.kind] || {};
  for (const k of Object.keys(W)) W[k] += ((tgt[k] || 0) - W[k]) * Math.min(1, dt * 0.6);

  // snow / sand / shake flurry
  const sand = W.sand, flurry = Math.max(shakeE, bliz ? 1 : 0);
  const active = Math.round(FLAKES * Math.min(1, Math.max(W.snow, sand * 0.8, flurry)));
  const P = snowPts.geometry.attributes, wcol = C("#ffffff"), scol = C("#d8b27a");
  const windX = Math.cos(sim.t * 0.05) * 2.5, windZ = Math.sin(sim.t * 0.05) * 2.5;
  for (let i = 0; i < active; i++) {
    const f = flakes[i];
    if (flurry > 0.05) {
      const r = Math.hypot(f.x, f.z) || 1;
      f.vx += (-f.z / r) * flurry * 6 * dt + (Math.random() - 0.5) * flurry * 3 * dt;
      f.vz += (f.x / r) * flurry * 6 * dt + (Math.random() - 0.5) * flurry * 3 * dt;
      f.vy += (Math.random() - 0.45) * flurry * 4 * dt;
    }
    const tx = sand * windX + Math.sin(sim.t + f.ph) * 0.15, ty = -(0.55 + f.s * 3) * (1 - sand * 0.8), tz = sand * windZ + Math.cos(sim.t * 0.8 + f.ph) * 0.15;
    const k = Math.min(1, dt * (flurry > 0.05 ? 0.6 : 2));
    f.vx += (tx - f.vx) * k; f.vy += (ty - f.vy) * k; f.vz += (tz - f.vz) * k;
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    const out = f.x * f.x + (f.y - GLOBE_CY) ** 2 + f.z * f.z > INNER * INNER;
    if (f.y < 0.05 || out) {
      const [x, y, z] = sand > 0.5 ? randInGlobe(0.1) : randInGlobe(GLOBE_CY + 3);
      Object.assign(f, { x, y, z, vx: 0, vy: 0, vz: 0 });
      if (sand < 0.5 && flurry < 0.05) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * Math.sqrt(Math.max(0, INNER * INNER - (f.y - GLOBE_CY) ** 2)); f.x = Math.cos(a) * rr; f.z = Math.sin(a) * rr; }
    }
    P.position.array.set([f.x, f.y, f.z], i * 3);
    const c = sand > 0.5 && flurry < 0.5 ? scol : wcol;
    P.color.array.set([c.r, c.g, c.b], i * 3);
    P.size.array[i] = sand > 0.5 && flurry < 0.5 ? f.s * 0.7 : f.s * 1.4;
    P.alpha.array[i] = 0.9;
  }
  snowPts.geometry.setDrawRange(0, active);
  for (const k of ["position", "color", "size", "alpha"]) P[k].needsUpdate = true;

  // rain
  rain.material.opacity = W.rain * 0.55;
  rain.visible = W.rain > 0.02;
  if (rain.visible) {
    const a = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN; i++) {
      const d = drops[i];
      d.y -= d.v * dt; d.x += 0.6 * dt;
      if (d.y < 0.05 || d.x * d.x + (d.y - GLOBE_CY) ** 2 + d.z * d.z > INNER * INNER) {
        const [x, y, z] = randInGlobe(GLOBE_CY + 2);
        Object.assign(d, { x, y, z });
        if (Math.random() < 0.3) emit({ x: d.x, y: 0.1, z: d.z, vx: 0, vy: 0.4, vz: 0, life: 0.25, size: 0.07, color: "#dbe8f2", alpha: 0.6, drag: 3, g: 3 });
      }
      a.set([d.x, d.y, d.z, d.x - 0.04, d.y + 0.35, d.z], i * 6);
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // clouds
  const storm = W.storm;
  M.cloud.color.copy(C("#ffffff")).lerp(C("#7d808c"), Math.min(1, storm * 0.8 + W.rain * 0.35));
  for (const c of clouds.children) {
    const u = c.userData;
    u.a += u.sp * dt;
    c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
    c.rotation.y = -u.a;
    c.scale.setScalar(Math.max(0.001, W.cloud * (0.8 + 0.2 * Math.sin(u.a * 3))));
    c.visible = W.cloud > 0.02;
  }
  // fog
  for (const s of fogs) {
    s.userData.a += s.userData.sp * dt;
    s.position.x = Math.cos(s.userData.a) * s.userData.r; s.position.z = Math.sin(s.userData.a) * s.userData.r;
    s.material.opacity = Math.max(W.fog * 0.55, W.sand * 0.4);
    s.material.color.set(W.sand > W.fog ? "#e2c48e" : "#f2efe8");
    s.visible = s.material.opacity > 0.01;
  }
  // lightning
  flashT -= dt;
  if (storm > 0.6 && flashT <= 0) { flash = 1; flashT = 2 + Math.random() * 5; thunder(); }
  flash = Math.max(0, flash - dt * 3);
  // blizzard whiteout
  const wo = bliz ? Math.sin(Math.PI * Math.min(1, sim.blizT / S.BLIZ_T)) : 0;
  whiteout.material.opacity = Math.min(0.97, wo * 1.25);
  whiteout.visible = whiteout.material.opacity > 0.01;
  glass.material.roughness = 0.02 + Math.max(wo * 0.35, sim.snowCover * 0.04);
}

// --- day and night ---------------------------------------------------------------------------------------------------------
const SKY = {
  night: [C("#1c2347"), C("#3a3a6a")], dawn: [C("#7c9fc8"), C("#f2b98a")], day: [C("#8fc3dc"), C("#f6e8c8")], dusk: [C("#6a6aa8"), C("#f0a070")],
};
const sunDir = new THREE.Vector3();
let daylight = 1;
function updateSky(t) {
  const ph = ((t / S.DAY_T) + 0.3) % 1;              // 0 midnight, 0.25 dawn, 0.5 noon
  const ang = (ph - 0.25) * Math.PI * 2;
  sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
  const h = sunDir.y;
  daylight = THREE.MathUtils.smoothstep(h, -0.12, 0.3);
  const top = new THREE.Color(), bot = new THREE.Color();
  const glowAmt = Math.exp(-((h - 0.05) ** 2) / 0.02);
  const edge = ph < 0.5 ? SKY.dawn : SKY.dusk;
  top.copy(SKY.night[0]).lerp(SKY.day[0], daylight).lerp(edge[0], glowAmt * 0.6);
  bot.copy(SKY.night[1]).lerp(SKY.day[1], daylight).lerp(edge[1], glowAmt * 0.75);
  const grey = Math.min(1, W.cloud * 0.5 + W.rain * 0.3 + W.storm * 0.4);
  top.lerp(C("#9aa2ad").multiplyScalar(0.4 + 0.6 * daylight), grey * 0.7);
  bot.lerp(C("#c9c4ba").multiplyScalar(0.4 + 0.6 * daylight), grey * 0.6);
  if (W.sand > 0.01) { top.lerp(C("#d8b27a"), W.sand * 0.6); bot.lerp(C("#e6c48e"), W.sand * 0.7); }
  const U2 = sky.material.uniforms;
  U2.uTop.value.copy(top); U2.uBot.value.copy(bot);
  U2.uStars.value = (1 - daylight) * (1 - grey);
  U2.uFlash.value = flash * 0.7;
  U2.uTime.value = t;

  const R = 8.4;
  sunBall.position.set(sunDir.x * R, GLOBE_CY + sunDir.y * R - 1.2, sunDir.z * R);
  moonBall.position.set(-sunDir.x * R, GLOBE_CY - sunDir.y * R - 1.2, -sunDir.z * R);
  sunBall.visible = sunBall.position.y > 0.4 && W.cloud < 0.85;
  moonBall.visible = moonBall.position.y > 0.4 && W.cloud < 0.85;

  const moon = 1 - daylight;
  const L = h > 0 ? sunDir : V3.copy(sunDir).negate();
  sun.position.set(L.x * 25, Math.max(9, L.y * 25), L.z * 25);
  sun.intensity = daylight * 2.4 * (1 - grey * 0.5) + moon * 0.55 + flash * 2;
  sun.color.copy(C("#fff0d0")).lerp(C("#ffb07a"), glowAmt * 0.6).lerp(C("#9fb0ff"), moon);
  hemi.intensity = 0.55 + daylight * 0.75 + flash;
  hemi.color.copy(C("#fff4dc")).lerp(C("#8a95c8"), moon);
  M.win.color.copy(C("#4b3f4a")).lerp(C("#ffd27a"), THREE.MathUtils.smoothstep(1 - daylight, 0.3, 0.8));
}
const V3 = new THREE.Vector3();

// --- events ---------------------------------------------------------------------------------------------------------------
const activeEvents = [];
function startEventFx(ev) {
  const a = { ev, meshes: [], t: 0 };
  if (ev.type === "market") {
    const rnd = S.mulberry32(ev.id);
    for (let i = 0; i < 5; i++) {
      const k = stall(rnd), ang = (i / 5) * Math.PI * 2 + rnd(), r = PLAZA_R * 0.62;
      const m = kitMesh(k);
      const x = sim.center.x + Math.cos(ang) * r, z = sim.center.z + Math.sin(ang) * r;
      m.position.set(x, sim.heightAt(x, z) + 0.05, z);
      m.rotation.y = -ang + Math.PI / 2;
      m.scale.setScalar(0.01);
      town.add(m); a.meshes.push(m);
    }
  }
  if (ev.type === "ship") {
    const m = kitMesh(boat(sim.age, S.mulberry32(ev.id)));
    m.userData.smoke = boatSmoke;
    town.add(m); a.meshes.push(m);
  }
  activeEvents.push(a);
}
const boatSmoke = [];
function kitMesh(k) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(merge(k.body), M.body);
  body.castShadow = true;
  g.add(body);
  if (k.line.length) g.add(new THREE.Mesh(merge(k.line), M.line));
  if (k.win.length) g.add(new THREE.Mesh(merge(k.win), M.win));
  g.userData.smokePts = k.smoke;
  return g;
}
function endEventFx(id) {
  const i = activeEvents.findIndex((a) => a.ev.id === id);
  if (i < 0) return;
  const a = activeEvents[i];
  a.ending = 0;
  if (a.rocket) { const g = bmeshes.get(a.ev.target); if (g) { a.rocket.position.set(...g.userData.rocketBase); a.rocket.visible = true; a.rocket.scale.setScalar(0.01); growing.push(a.rocket); } }
}
const growing = [];
function clearEvents() { for (const a of activeEvents) for (const m of a.meshes) disposeGroup(m); activeEvents.length = 0; }
function updateEvents(sdt) {
  for (let i = activeEvents.length - 1; i >= 0; i--) {
    const a = activeEvents[i], ev = a.ev;
    a.t += sdt;
    const f = Math.min(1, (sim.t - ev.t0) / ev.dur);
    if (a.ending !== undefined) {
      a.ending += sdt;
      for (const m of a.meshes) m.scale.setScalar(Math.max(0.001, 1 - a.ending * 2));
      if (a.ending > 0.5) { for (const m of a.meshes) disposeGroup(m); activeEvents.splice(i, 1); }
      continue;
    }
    if (ev.type === "market") for (const m of a.meshes) m.scale.setScalar(Math.min(1, a.t * 2));
    if (ev.type === "ship" && ev.path) {
      const P = ev.path, u = f * (P.length - 1), j = Math.min(P.length - 2, Math.floor(u)), t = u - j;
      const x = P[j][0] + (P[j + 1][0] - P[j][0]) * t, z = P[j][1] + (P[j + 1][1] - P[j][1]) * t;
      const m = a.meshes[0];
      m.position.set(x, -0.12 + Math.sin(sim.t * 2) * 0.02, z);
      m.rotation.y = -Math.atan2(P[j + 1][1] - P[j][1], P[j + 1][0] - P[j][0]);
      m.rotation.z = Math.sin(sim.t * 1.7) * 0.04;
      m.scale.setScalar(Math.min(1, a.t * 2, (1 - f) * 20));
      a.smokeT = (a.smokeT || 0) - sdt;
      if (m.userData.smokePts.length && a.smokeT <= 0) {
        a.smokeT = 0.35;
        const [sx, sy, sz] = m.userData.smokePts[0], w = m.localToWorld(new THREE.Vector3(sx, sy, sz));
        town.worldToLocal(w);
        emit({ x: w.x, y: w.y, z: w.z, vx: 0, vy: 0.4, vz: 0, life: 2.2, size: 0.16, grow: 0.3, color: "#6a6a70", alpha: 0.7 });
      }
    }
    if (ev.type === "fire") {
      const g = bmeshes.get(ev.target);
      if (g) {
        const top = g.position.y + (g.userData.height || 0.8) * 0.8;
        for (let k = 0; k < 3; k++) emit({ glow: true, x: g.position.x + (Math.random() - 0.5) * 0.4, y: top, z: g.position.z + (Math.random() - 0.5) * 0.4, vx: 0, vy: 0.8 + Math.random() * 0.5, vz: 0, life: 0.6, size: 0.18, color: Math.random() < 0.5 ? "#ff8a3a" : "#ffd25a", alpha: 0.9, drag: 0.5 });
        if (Math.random() < 0.3) emit({ x: g.position.x, y: top + 0.3, z: g.position.z, vx: 0.08, vy: 0.5, vz: 0, life: 2.5, size: 0.22, grow: 0.3, color: "#5a5250", alpha: 0.6 });
      }
    }
    if (ev.type === "launch") {
      const g = bmeshes.get(ev.target), rk = g && g.userData.movers.rocket;
      if (rk) {
        const t = sim.t - ev.t0 + acc, base = g.userData.rocketBase;
        const lift = Math.max(0, t - 2);
        rk.position.y = base[1] + 0.5 * 2.4 * lift * lift;
        rk.position.x = base[0] + (t < 2 ? Math.sin(t * 60) * 0.01 : 0);
        const w = rk.getWorldPosition(new THREE.Vector3());
        town.worldToLocal(w);
        const ceiling = GLOBE_CY + Math.sqrt(Math.max(0, GLOBE_R ** 2 - (w.x * w.x + w.z * w.z))) - 0.8;
        const gone = w.y > ceiling;
        if (gone && rk.visible) { for (let k2 = 0; k2 < 30; k2++) emit({ glow: true, x: w.x, y: w.y, z: w.z, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.3) * 2, vz: (Math.random() - 0.5) * 2, life: 0.8, size: 0.1, color: "#fff2b0", alpha: 1, drag: 2 }); chime([1046, 1318, 1568]); }
        rk.visible = !gone;
        if (t > 1 && !gone) {
          for (let k2 = 0; k2 < (t > 2 ? 4 : 1); k2++) emit({ glow: true, x: w.x + (Math.random() - 0.5) * 0.1, y: w.y - 0.05, z: w.z + (Math.random() - 0.5) * 0.1, vx: (Math.random() - 0.5) * 0.4, vy: -1.2 - Math.random(), vz: (Math.random() - 0.5) * 0.4, life: 0.45, size: 0.16, color: Math.random() < 0.5 ? "#ffb04a" : "#fff0a0", alpha: 1, drag: 1 });
          if (Math.random() < 0.6) emit({ x: w.x, y: Math.max(sim.heightAt(w.x, w.z) + 0.2, w.y - 0.3), z: w.z, vx: (Math.random() - 0.5) * 1.2, vy: 0.1, vz: (Math.random() - 0.5) * 1.2, life: 2.5, size: 0.3, grow: 0.4, color: "#e8e4dc", alpha: 0.7, drag: 1.2 });
        }
        if (!a.rumbled && t > 1.8) { a.rumbled = true; rumble(); }
        a.rocket = rk;
      }
    }
    if (ev.type === "festival") {
      a.cd = (a.cd || 0) - sdt;
      if (a.cd <= 0) {
        if (daylight < 0.4) {
          a.cd = 0.5 + Math.random() * 0.5;
          const x = sim.center.x + (Math.random() - 0.5) * 3, y = 5 + Math.random() * 2.5, z = sim.center.z + (Math.random() - 0.5) * 3;
          const col = ["#ff6b6b", "#ffd166", "#7bdff2", "#b5f27b", "#f7a6ff"][Math.floor(Math.random() * 5)];
          for (let k = 0; k < 36; k++) {
            const th = Math.random() * Math.PI * 2, phi = Math.acos(Math.random() * 2 - 1), v = 1.6 + Math.random() * 0.4;
            emit({ glow: true, x, y, z, vx: Math.sin(phi) * Math.cos(th) * v, vy: Math.cos(phi) * v, vz: Math.sin(phi) * Math.sin(th) * v, life: 1.3, size: 0.12, color: col, alpha: 1, drag: 1.2, g: 1.2 });
          }
          pop();
        } else {
          a.cd = 0.15;
          const col = ["#ff6b6b", "#ffd166", "#7bdff2", "#b5f27b", "#f7a6ff"][Math.floor(Math.random() * 5)];
          emit({ x: sim.center.x + (Math.random() - 0.5) * 1.6, y: 0.4, z: sim.center.z + (Math.random() - 0.5) * 1.6, vx: (Math.random() - 0.5) * 0.2, vy: 0.9, vz: (Math.random() - 0.5) * 0.2, life: 4, size: 0.2, color: col, alpha: 1, drag: 0.1 });
        }
      }
    }
    if (ev.type === "harvest" && Math.random() < 0.3 && sim.fields.length) {
      const fd = sim.fields[Math.floor(Math.random() * sim.fields.length)];
      emit({ x: fd.x + (Math.random() - 0.5) * fd.w, y: sim.heightAt(fd.x, fd.z) + 0.2, z: fd.z + (Math.random() - 0.5) * fd.d, vx: 0.2, vy: 0.3, vz: 0, life: 1.5, size: 0.06, color: "#f2d27a", alpha: 0.9 });
    }
  }
}

// --- sim events → scene ---------------------------------------------------------------------------------------------------------
function resetTown() {
  for (const id of [...bmeshes.keys()]) removeBuilding(id, true);
  for (const g of dyingList) disposeGroup(g);
  dyingList.length = 0;
  clearEvents();
  fx.length = 0; fxg.length = 0;
  buildGround();
  buildTreeMeshes();
  disposeFields();
  buildRoads();
  people.list.length = 0;
}
function handle(events) {
  for (const e of events) {
    switch (e.e) {
      case "reset": resetTown(); hud(true); break;
      case "add": addBuilding(e.b, sim.state === "bliz"); break;
      case "remove": removeBuilding(e.id, sim.state === "bliz"); break;
      case "roads": buildRoads(); break;
      case "fields": disposeFields(); buildFields(); break;
      case "age": buildRoads(); hud(true); if (sim.age > 0) chime([392, 523, 659, 784]); break;
      case "weather": hud(); break;
      case "event": startEventFx(e.ev); break;
      case "eventEnd": endEventFx(e.id); break;
      case "blizzard": hud(); break;
    }
  }
}

// --- HUD + plaque -------------------------------------------------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const displayFont = getComputedStyle(document.querySelector(".brand h1")).fontFamily || "Georgia, serif";
function drawPlaque() {
  const g = plaqueCanvas.getContext("2d"), w = plaqueCanvas.width, h = plaqueCanvas.height;
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, "#e6c56e"); gr.addColorStop(0.5, "#c99a3c"); gr.addColorStop(1, "#a77d2c");
  g.fillStyle = "#6b4a1c"; roundRect(g, 0, 0, w, h, 26); g.fill();
  g.fillStyle = gr; roundRect(g, 6, 6, w - 12, h - 12, 22); g.fill();
  g.strokeStyle = "rgba(90,60,20,0.55)"; g.lineWidth = 3; roundRect(g, 20, 20, w - 40, h - 40, 14); g.stroke();
  for (const [x, y] of [[36, 36], [w - 36, 36], [36, h - 36], [w - 36, h - 36]]) { g.fillStyle = "#8a6424"; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  const bliz = sim.state === "bliz" && !sim.rebuilt;
  const place = sim.placeName, named = place !== sim.region.name;
  const title = bliz ? "· · ·" : place.toUpperCase();
  const sub = bliz ? "a new age is coming" : `${named ? sim.region.name + " · " : ""}${sim.ageInfo.name} · ${sim.ageInfo.year}`;
  g.textAlign = "center"; g.textBaseline = "middle";
  const text = (s, y, size, style = "") => {
    g.font = `${style} ${size}px ${displayFont}`;
    const fit = g.measureText(s).width;
    if (fit > w - 90) g.font = `${style} ${Math.floor((size * (w - 90)) / fit)}px ${displayFont}`;
    g.fillStyle = "rgba(255,240,200,0.55)"; g.fillText(s, w / 2, y + 2);
    g.fillStyle = "#3e2a0e"; g.fillText(s, w / 2, y);
  };
  g.save(); g.font = `600 58px ${displayFont}`;
  text(title, 80, 56, "600");
  g.restore();
  text(sub, 140, 36, "italic");
  plaqueTex.needsUpdate = true;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const WEATHER_NAMES = { clear: "clear skies", cloudy: "cloudy", rain: "rain", snow: "snow", fog: "fog", storm: "thunderstorm", sandstorm: "sandstorm" };
function hud(plaqueToo = false) {
  if (plaqueToo) drawPlaque();
  const bliz = sim.state === "bliz";
  $("hudPlace").textContent = sim.placeName;
  $("hudRegion").textContent = sim.placeName !== sim.region.name ? sim.region.name : "";
  $("hudAge").textContent = sim.ageInfo.name;
  $("hudYear").textContent = sim.ageInfo.year;
  $("hudSeason").textContent = bliz ? "winter" : sim.seasonName;
  $("hudWeather").textContent = bliz ? "blizzard" : WEATHER_NAMES[sim.weather.kind];
  $("hudCount").textContent = `${sim.buildings.length} buildings · ${people.list.length} people`;
  const dots = $("ageDots");
  if (dots.children.length !== S.AGES.length) dots.innerHTML = S.AGES.map((a) => `<span title="${a.name}"></span>`).join("");
  [...dots.children].forEach((d, i) => { d.className = i < sim.age ? "done" : i === sim.age ? "now" : ""; });
  $("ageFill").style.width = `${(bliz ? 1 : sim.ageProgress) * 100}%`;
}

// --- audio --------------------------------------------------------------------------------------------------------------------------------
let actx = null, master = null, windG = null, rainG = null;
let muted = store.get("snowglobe-mute") !== "0";
function audioInit() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
  const buf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = (type, freq, q) => { const s = actx.createBufferSource(); s.buffer = buf; s.loop = true; const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = actx.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(master); s.start(); return g; };
  windG = src("bandpass", 380, 0.6);
  rainG = src("highpass", 2400, 0.3);
}
function updateAudio() {
  if (!actx || muted) return;
  const bliz = sim.state === "bliz" ? 1 : 0;
  windG.gain.setTargetAtTime(0.03 + 0.25 * Math.min(1, W.snow * 0.4 + W.sand + bliz + W.storm * 0.4 + shakeE * 0.5), actx.currentTime, 0.4);
  rainG.gain.setTargetAtTime(0.12 * W.rain, actx.currentTime, 0.4);
}
function tone(freq, when, dur, vol = 0.12, type = "sine") {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(master); o.start(when); o.stop(when + dur + 0.05);
}
function chime(freqs) { if (!actx || muted) return; const t = actx.currentTime; freqs.forEach((f, i) => { tone(f, t + i * 0.12, 1.4, 0.07); tone(f * 2, t + i * 0.12, 0.8, 0.02); }); }
function pop() { if (!actx || muted) return; tone(180 + Math.random() * 120, actx.currentTime, 0.25, 0.05, "triangle"); }
function thunder() { if (!actx || muted) return; const t = actx.currentTime; tone(55, t, 1.6, 0.12, "sawtooth"); tone(42, t + 0.1, 1.8, 0.1, "triangle"); }
function rumble() { if (!actx || muted) return; const t = actx.currentTime; tone(48, t, 3.5, 0.14, "sawtooth"); tone(36, t + 0.2, 3.2, 0.12, "triangle"); }
function jingle() { if (!actx || muted) return; const t = actx.currentTime; for (let i = 0; i < 7; i++) tone(1400 + Math.random() * 1600, t + i * 0.06 + Math.random() * 0.04, 0.5, 0.025); }
function setMuted(m) {
  muted = m;
  store.set("snowglobe-mute", m ? "1" : "0");
  $("muteBtn").textContent = m ? "🔇" : "🔊";
  $("muteBtn").setAttribute("aria-pressed", String(!m));
  if (!m) { audioInit(); actx.resume(); master.gain.setTargetAtTime(0.5, actx.currentTime, 0.1); }
  else if (actx) master.gain.setTargetAtTime(0, actx.currentTime, 0.1);
}

// --- controls ---------------------------------------------------------------------------------------------------------------------------
let speed = 1, lastSpeed = 1;
function setSpeed(s) {
  if (s > 0) lastSpeed = s;
  speed = s;
  document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", +b.dataset.speed === s));
  $("pauseBtn").textContent = s === 0 ? "▶" : "❚❚";
  $("pauseBtn").title = s === 0 ? "Play (Space)" : "Pause (Space)";
}
function shake() {
  shakeE = 1; shakeT = 0;
  for (let i = 0; i < FLAKES; i++) { if (i >= Math.round(FLAKES * Math.max(W.snow, W.sand * 0.8)) && Math.random() < 0.6) { const [x, y, z] = randInGlobe(0.3); Object.assign(flakes[i], { x, y, z }); } const f = flakes[i]; f.vy = 2 + Math.random() * 3; }
  jingle();
}
function nextAge() { if (sim.nextAge()) handle(sim.drain()); hud(true); }
$("pauseBtn").onclick = () => setSpeed(speed === 0 ? lastSpeed : 0);
document.querySelectorAll("[data-speed]").forEach((b) => (b.onclick = () => setSpeed(+b.dataset.speed)));
$("nextBtn").onclick = nextAge;
$("shakeBtn").onclick = shake;
$("muteBtn").onclick = () => setMuted(!muted);

// Full screen: the real Fullscreen API where there is one, else (iPhone Safari) a fixed overlay.
const fsEl = document.querySelector(".col");
const fsNow = () => document.fullscreenElement || document.webkitFullscreenElement;
function syncFs() {
  const on = !!fsNow() || fsEl.classList.contains("fake");
  fsEl.classList.toggle("fs", on);
  $("fsBtn").textContent = on ? "exit ⤡" : "⛶";
  $("fsBtn").title = on ? "Exit full screen (F)" : "Full screen (F)";
}
function toggleFs() {
  if (fsNow()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else if (fsEl.classList.contains("fake")) fsEl.classList.remove("fake");
  else {
    const req = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
    const fake = () => fsEl.classList.add("fake");
    if (!req) fake();
    else { const p = req.call(fsEl); if (p && p.catch) p.catch(() => { fake(); syncFs(); }); }
  }
  syncFs();
}
document.addEventListener("fullscreenchange", syncFs);
document.addEventListener("webkitfullscreenchange", syncFs);
$("fsBtn").onclick = toggleFs;
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); setSpeed(speed === 0 ? lastSpeed : 0); }
  else if (k === "1") setSpeed(1);
  else if (k === "2") setSpeed(4);
  else if (k === "3") setSpeed(16);
  else if (k === "n") nextAge();
  else if (k === "s") shake();
  else if (k === "m") setMuted(!muted);
  else if (k === "f") toggleFs();
  else if (k === "escape" && fsEl.classList.contains("fake")) toggleFs();
});

// drag to spin, flick back and forth to shake, tap to ask, scroll/pinch to zoom
let spinVel = 0, dragging = false;
const AUTO = reduceMotion ? 0.015 : 0.05;
const pointers = new Map();
let down = null, flicks = [], pinch0 = 0, pinchDist0 = 0;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchDist0 = camDistTarget; }
  down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, lx: e.clientX, lt: performance.now() };
  dragging = true;
  flicks = [];
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0) camDistTarget = THREE.MathUtils.clamp((pinchDist0 * pinch0) / d, 26, 60);
    return;
  }
  if (!down) return;
  const now = performance.now(), dx = e.clientX - down.lx, dt = Math.max(1, now - down.lt) / 1000;
  down.moved += Math.abs(dx) + Math.abs(e.clientY - down.y) * 0.1;
  const rate = (dx / canvas.clientWidth) * Math.PI * 1.6;
  spin.rotation.y += rate;
  spinVel = rate / dt;
  if (Math.abs(dx) > 6) {
    const s = Math.sign(dx);
    if (!flicks.length || flicks[flicks.length - 1].s !== s) flicks.push({ s, t: now });
    flicks = flicks.filter((f) => now - f.t < 700);
    if (flicks.length >= 4) { shake(); flicks = []; }
  }
  down.lx = e.clientX; down.lt = now;
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = 0;
  if (!down) return;
  if (down.moved < 6 && performance.now() - down.t < 400 && pointers.size === 0) pick(e);
  if (pointers.size === 0) { dragging = false; down = null; }
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); camDistTarget = THREE.MathUtils.clamp(camDistTarget * (1 + e.deltaY * 0.0012), 26, 60); }, { passive: false });

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const bubble = $("bubble");
let bubbleT = 0, bubbleAnchor = null;
function pick(e) {
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (!hit) { bubble.classList.remove("show"); return; }
  let text, anchor;
  if (hit.object.userData.b) {
    const b = hit.object.userData.b;
    text = b.kind === "landmark" ? cap(b.label) : `${b.label[0].match(/[aeiou]/) ? "an" : "a"} ${b.label}`;
    const g = bmeshes.get(b.id);
    anchor = { obj: g || hit.object, local: new THREE.Vector3(0, (g?.userData.height || 1) + 0.25, 0) };
  } else {
    const p = people.list[hit.instanceId];
    if (!p) return;
    text = cap(p.label);
    anchor = { person: p };
  }
  bubble.textContent = text;
  bubble.classList.add("show");
  bubbleT = 3.2; bubbleAnchor = anchor;
  placeBubble();
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
function placeBubble() {
  if (!bubbleAnchor) return;
  const v = new THREE.Vector3();
  if (bubbleAnchor.person) { const p = bubbleAnchor.person; v.set(p.x, sim.heightAt(p.x, p.z) + 0.7, p.z); town.localToWorld(v); }
  else { v.copy(bubbleAnchor.local); bubbleAnchor.obj.localToWorld(v); }
  v.project(camera);
  const r = canvas.getBoundingClientRect(), box = canvas.parentElement.getBoundingClientRect();
  bubble.style.left = `${(v.x * 0.5 + 0.5) * r.width + (r.left - box.left)}px`;
  bubble.style.top = `${(-v.y * 0.5 + 0.5) * r.height + (r.top - box.top)}px`;
}

// --- size ----------------------------------------------------------------------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const proj = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  for (const m of [fxMat, fxGlowMat, snowPts.material, sats.material]) m.uniforms.uProj.value = proj;
}
new ResizeObserver(resize).observe(canvas);

// --- loop ----------------------------------------------------------------------------------------------------------------------------------------
let last = performance.now(), acc = 0, hudT = 0, vtNow = 0;
handle(sim.drain());
hud(true);
setSpeed(1);
setMuted(muted);
document.fonts && document.fonts.ready.then(() => drawPlaque());
$("seedLink").href = `#seed=${seed}`;
$("seedLink").textContent = `seed ${seed}`;

function frame(now) {
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += rdt * speed;
  let n = 0;
  while (acc >= S.DT && n < 40) { sim.step(); acc -= S.DT; n++; handle(sim.drain()); }
  if (n >= 40) acc = 0;
  const sdt = n * S.DT;
  const vt = sim.t + acc;
  vtNow = vt;

  // spin + shake
  if (!dragging) {
    spinVel += (AUTO - spinVel) * Math.min(1, rdt * 1.5);
    spin.rotation.y += spinVel * rdt;
  }
  shakeT += rdt;
  shakeE = Math.max(0, shakeE - rdt * 0.22);
  const wob = Math.exp(-shakeT * 2.2) * (reduceMotion ? 0.03 : 0.09);
  rig.rotation.z = Math.sin(shakeT * 22) * wob;
  rig.rotation.x = Math.cos(shakeT * 17) * wob * 0.5;
  rig.position.y = Math.abs(Math.sin(shakeT * 22)) * wob * 3;
  camDist += (camDistTarget - camDist) * Math.min(1, rdt * 6);
  camera.position.set(0, LOOK.y + Math.sin(CAM_EL) * camDist, Math.cos(CAM_EL) * camDist);
  camera.lookAt(LOOK);

  U.snow.value = sim.snowCover;
  updateWeather(rdt);
  updateSky(vt);
  updateBuildings(sdt, rdt);
  updatePeople(sdt, rdt);
  updateTrees(rdt, sim.season);
  updateEvents(sdt);
  updateSpace(rdt, sdt, vt);
  for (let i = growing.length - 1; i >= 0; i--) { const m = growing[i]; m.scale.setScalar(Math.min(1, m.scale.x + rdt * 1.5)); if (m.scale.x >= 1) growing.splice(i, 1); }
  updateFx(fx, fxPts, rdt * Math.max(1, Math.min(4, speed)));
  updateFx(fxg, fxGlow, rdt * Math.max(1, Math.min(4, speed)));
  for (const s of [...bmeshes.values()].filter((g) => g.userData.lamp)) {
    if (daylight < 0.5 && Math.random() < rdt * 4) {
      const [x, y, z] = s.userData.lamp, w = s.localToWorld(new THREE.Vector3(x, y, z));
      town.worldToLocal(w);
      emit({ glow: true, x: w.x, y: w.y, z: w.z, vx: 0, vy: 0, vz: 0, life: 0.5, size: 0.9, color: "#ffe27a", alpha: 0.5, drag: 0 });
    }
  }
  if (water) water.position.y = -0.1 + Math.sin(vt * 0.8) * 0.012;
  M.neon.color.setScalar(0.85 + 0.15 * Math.sin(now * 0.02) * (Math.random() < 0.02 ? 0 : 1));
  updateAudio();
  if (bubbleT > 0) { bubbleT -= rdt; placeBubble(); if (bubbleT <= 0) bubble.classList.remove("show"); }
  hudT -= rdt;
  if (hudT <= 0) { hudT = 0.5; hud(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener("hashchange", () => location.reload());
