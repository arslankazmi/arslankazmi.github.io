/* ============================================================================
   models.js — procedural geometry for the Snow Globe (see DESIGN.md §2).

   Everything is built from primitives in code: no model or texture files.
   A Kit collects parts in a building's local frame (x along the road, z deep,
   y up from the ground) and merges them into a few geometries:
     body  — toon-shaded, coloured per vertex
     line  — inverted-hull outlines (each part grown a little, drawn back-faced)
     win   — windows (one shared material that lights up at night)
     neon  — always-bright bits (fires, lamps, neon signs)
   plus smoke points and spinning parts (windmill sails, turbine blades).
   ============================================================================ */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const { mulberry32 } = globalThis.SnowSim;
const OUT = 0.028;                       // outline thickness
const V = new THREE.Vector3(), V2 = new THREE.Vector3();

// --- kit ------------------------------------------------------------------------
function prep(g) {
  if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  g.clearGroups();
  return g;
}
function paint(g, color) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
function hull(g) {
  const h = g.clone();
  if (h.attributes.color) h.deleteAttribute("color");
  h.computeBoundingBox();
  const c = h.boundingBox.getCenter(V), s = h.boundingBox.getSize(V2);
  h.translate(-c.x, -c.y, -c.z);
  h.scale((s.x + 2 * OUT) / Math.max(s.x, 0.01), (s.y + 2 * OUT) / Math.max(s.y, 0.01), (s.z + 2 * OUT) / Math.max(s.z, 0.01));
  h.translate(c.x, c.y, c.z);
  return h;
}
export function merge(list) {
  if (!list.length) return null;
  const m = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return m;
}
export class Kit {
  constructor() { this.body = []; this.line = []; this.win = []; this.neon = []; this.smoke = []; this.spin = []; this.lamp = null; this.movers = {}; }
  add(geo, color, outline = true) { const g = paint(prep(geo), color); this.body.push(g); if (outline) this.line.push(hull(g)); return this; }
  window(geo) { this.win.push(prep(geo)); return this; }
  glow(geo, color) { this.neon.push(paint(prep(geo), color)); return this; }
  /** A separately animated part (a rocket that launches, a climber that rides a cable). */
  mover(name, parts) { this.movers[name] = { body: merge(parts.filter((p) => !p[2]).map(([g, c]) => paint(prep(g), c))), glow: merge(parts.filter((p) => p[2]).map(([g, c]) => paint(prep(g), c))) }; return this; }
  /** A part that spins about local z through `pivot`; its geometry is centred on the pivot. */
  spinner(parts, pivot, speed) { this.spin.push({ geo: merge(parts.map(([g, c]) => paint(prep(g), c))), pivot, speed }); return this; }
}

// --- colours ----------------------------------------------------------------------
export const shade = (hex, k) => { const c = new THREE.Color(hex); return k >= 0 ? c.lerp(new THREE.Color("#ffffff"), k) : c.multiplyScalar(1 + k); };
const DOOR = "#5a3a24", STONE = "#b8b0a0", DARKSTONE = "#8f887c", GOLD = "#e0b24a", WOOD = "#8a5a38";
const NEON = ["#ff5fa2", "#5ff2ff", "#ffe066", "#9dff6a", "#ff9a4a"];

// --- primitives (y is the bottom unless noted) --------------------------------------------
export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  return g.translate(x, y + h / 2, z);
}
export function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0) { return new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z); }
export function cone(r, h, seg, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.ConeGeometry(r, h, seg);
  if (ry) g.rotateY(ry);
  return g.translate(x, y + h / 2, z);
}
export function ball(r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1) {
  return new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz).translate(x, y, z);   // y is the centre
}
function dome(r, x = 0, y = 0, z = 0) { return new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z); }
/** Square pyramid w × d, h tall. */
function pyr(w, h, d, x = 0, y = 0, z = 0) { return new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d).translate(x, y + h / 2, z); }
/** Triangular prism: triangle across x (w wide, h tall), extruded d along z. */
function prism(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  if (ry) g.rotateY(ry);
  return g.translate(x, y, z);
}
/** One sloped roof slab, centred at (x, y, z), tilted about z. */
function slab(len, t, d, x, y, z, tilt) { return new THREE.BoxGeometry(len, t, d).rotateZ(tilt).translate(x, y, z); }

// --- building parts ----------------------------------------------------------------------
function door(k, y0, zFace, w = 0.16, h = 0.26) { k.add(box(w, h, 0.03, 0, y0, zFace), DOOR, false); }
function windows(k, W, D, floors, FH, y0, face, gap = 0.3) {
  const nx = Math.max(1, Math.floor((W - 0.12) / gap)), nz = Math.max(1, Math.floor((D - 0.12) / gap));
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * FH + FH * 0.36;
    for (let i = 0; i < nx; i++) {
      const x = -W / 2 + ((i + 0.5) * W) / nx;
      for (const s of [1, -1]) {
        if (f === 0 && s === face && Math.abs(x) < 0.13) continue;   // the door
        k.window(box(0.12, 0.15, 0.03, x, y, s * (D / 2 + 0.006)));
      }
    }
    for (let i = 0; i < nz; i++) {
      const z = -D / 2 + ((i + 0.5) * D) / nz;
      for (const s of [1, -1]) k.window(box(0.03, 0.15, 0.12, s * (W / 2 + 0.006), y, z));
    }
  }
}
/** Gable roof: wall-coloured gable ends plus two overhanging slabs. Ridge along z, or along x if `alongX`. */
function gable(k, W, D, y, rh, wallC, roofC, alongX = false, t = 0.07) {
  const w = alongX ? D : W, d = alongX ? W : D, ry = alongX ? Math.PI / 2 : 0;
  const parts = [[prism(w, rh, d, 0, y, 0), wallC]];
  const th = Math.atan2(rh, w / 2), len = Math.hypot(w / 2, rh) + 0.1;
  const nx = Math.sin(th) * t * 0.5, ny = Math.cos(th) * t * 0.5;
  parts.push([slab(len, t, d + 0.14, -w / 4 - nx, y + rh / 2 + ny, 0, th), roofC]);
  parts.push([slab(len, t, d + 0.14, w / 4 + nx, y + rh / 2 + ny, 0, -th), roofC]);
  for (const [g, c] of parts) { if (ry) g.rotateY(ry); k.add(g, c); }
}
function chimney(k, x, y, z, c = "#9a5a44") { k.add(box(0.12, 0.38, 0.12, x, y, z), c); k.smoke.push([x, y + 0.4, z]); }

// --- houses ---------------------------------------------------------------------------------
export function house(b) {
  const k = new Kit(), rnd = mulberry32(b.seed || 1);
  const W = b.w * 0.88, D = b.d * 0.88, FH = 0.4, face = b.face || 1, y0 = 0.04;
  const wall = b.wall, roofC = b.roofC;
  k.add(box(W + 0.08, 0.3, D + 0.08, 0, -0.26, 0), STONE, false);
  const H = b.floors * FH;
  switch (b.roof) {
    case "tent": {
      const r = Math.min(W, D) / 2;
      k.add(cone(r * 1.05, 0.72, 7, 0, y0, 0), roofC);
      k.add(box(0.13, 0.2, 0.03, 0, y0, face * r * 0.52), DOOR, false);
      break;
    }
    case "cone": {
      const r = (Math.min(W, D) / 2) * 0.9, h = 0.36;
      k.add(cyl(r, r * 1.04, h, 10, 0, y0, 0), wall);
      k.add(cone(r * 1.35, r * 1.15, 10, 0, y0 + h, 0), roofC);
      door(k, y0, face * r * 1.01, 0.14, 0.24);
      break;
    }
    case "flat": {
      k.add(box(W, H, D, 0, y0, 0), wall);
      k.add(box(W + 0.06, 0.07, D + 0.06, 0, y0 + H, 0), roofC);
      if (rnd() < 0.45) k.add(box(W * 0.38, 0.24, D * 0.38, (rnd() - 0.5) * W * 0.4, y0 + H + 0.07, (rnd() - 0.5) * D * 0.4), wall);
      if (rnd() < 0.5) k.add(box(0.42, 0.03, 0.2, 0, y0 + 0.32, face * (D / 2 + 0.1)), NEON[Math.floor(rnd() * 3)], false);
      windows(k, W, D, b.floors, FH, y0, face);
      door(k, y0, face * (D / 2 + 0.01));
      if (b.age >= 5 && rnd() < 0.5) chimney(k, W * 0.25, y0 + H, -D * 0.2);
      break;
    }
    case "gable":
    case "turf": {
      const turf = b.roof === "turf", h = turf ? 0.3 : H, along = turf || rnd() < 0.5;
      k.add(box(W, h, D, 0, y0, 0), wall);
      gable(k, W, D, y0 + h, (along ? D : W) * (turf ? 0.55 : 0.48), wall, roofC, along, turf ? 0.12 : 0.07);
      if (!turf) windows(k, W, D, b.floors, FH, y0, face);
      door(k, y0, face * (D / 2 + 0.01));
      if (b.age >= 3 && rnd() < (b.age >= 5 ? 0.6 : 0.4)) chimney(k, W * 0.22, y0 + h + 0.1, D * 0.15);
      break;
    }
    case "hip": {
      k.add(box(W, H, D, 0, y0, 0), wall);
      k.add(pyr(W * 1.22, Math.min(W, D) * 0.48, D * 1.22, 0, y0 + H, 0), roofC);
      windows(k, W, D, b.floors, FH, y0, face);
      door(k, y0, face * (D / 2 + 0.01));
      if (b.age >= 3 && rnd() < 0.35) chimney(k, W * 0.2, y0 + H + 0.08, 0);
      break;
    }
    case "pagoda": {
      let y = y0;
      for (let f = 0; f < b.floors; f++) {
        const s = 1 - f * 0.16, h = FH * 0.85;
        k.add(box(W * s, h, D * s, 0, y, 0), wall);
        k.add(pyr(W * s * 1.5, 0.22, D * s * 1.5, 0, y + h, 0), roofC);
        y += h + 0.12;
      }
      k.add(cyl(0.025, 0.025, 0.25, 6, 0, y + 0.08, 0), GOLD);
      door(k, y0, face * (D / 2 + 0.01));
      break;
    }
    case "dome": {
      k.add(box(W, H, D, 0, y0, 0), wall);
      k.add(box(W + 0.06, 0.07, D + 0.06, 0, y0 + H, 0), wall);
      const r = Math.min(W, D) * 0.36;
      k.add(cyl(r * 0.92, r * 0.92, 0.1, 14, 0, y0 + H + 0.07, 0), wall);
      k.add(dome(r, 0, y0 + H + 0.17, 0), roofC);
      windows(k, W, D, b.floors, FH, y0, face);
      door(k, y0, face * (D / 2 + 0.01));
      break;
    }
    case "tower":
    case "neon": {
      const th = Math.max(4, b.floors) * 0.36, w = W * 0.86, d = D * 0.86;
      k.add(box(w, th, d, 0, y0, 0), wall);
      k.add(box(w + 0.05, 0.08, d + 0.05, 0, y0 + th, 0), shade(wall, -0.25));
      if (rnd() < 0.5) k.add(box(w * 0.6, 0.35, d * 0.6, 0, y0 + th + 0.08, 0), wall);
      if (rnd() < 0.4) k.add(cyl(0.015, 0.015, 0.6, 5, w * 0.2, y0 + th + 0.08, 0), "#777");
      windows(k, w, d, Math.max(4, b.floors), 0.36, y0, face, 0.24);
      door(k, y0, face * (d / 2 + 0.01), 0.22, 0.28);
      if (b.roof === "neon") {
        const c = NEON[Math.floor(rnd() * NEON.length)];
        k.glow(box(0.07, th * 0.55, 0.2, w / 2 + 0.05, y0 + th * 0.3, face * d * 0.3), c);
        k.glow(box(w * 0.8, 0.07, 0.03, 0, y0 + th * 0.92, face * (d / 2 + 0.02)), NEON[Math.floor(rnd() * NEON.length)]);
      }
      break;
    }
    case "pod": {
      const r = Math.min(W, D) / 2 * 0.92, h = 0.32 + (b.floors - 1) * 0.3;
      k.add(cyl(r, r * 0.92, h, 16, 0, y0, 0), wall);
      k.add(ball(r, 0, y0 + h, 0, 1, 0.75, 1, 2), wall);
      k.glow(cyl(r * 1.02, r * 1.02, 0.05, 16, 0, y0 + h * 0.82, 0), roofC);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + rnd(); k.window(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10).rotateX(Math.PI / 2).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * r * 1.01, y0 + h * 0.45, Math.sin(a) * r * 1.01)); }
      k.add(cyl(0.012, 0.012, 0.3, 4, r * 0.3, y0 + h + r * 0.7, 0), "#9aa", false);
      k.glow(ball(0.035, r * 0.3, y0 + h + r * 0.7 + 0.32, 0, 1, 1, 1, 0), roofC);
      door(k, y0, face * r * 0.98, 0.16, 0.24);
      break;
    }
    case "glassdome": {
      const r = Math.min(W, D) / 2 * 0.95;
      k.add(cyl(r, r * 1.02, 0.12, 18, 0, y0, 0), wall);
      k.add(dome(r * 0.96, 0, y0 + 0.12, 0), "#bfe6e8");
      for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(r * 0.965, 0.012, 4, 24, Math.PI).rotateY((i * Math.PI) / 4).translate(0, y0 + 0.12, 0), "#f4f6f8", false);
      k.add(ball(r * 0.3, -r * 0.25, y0 + 0.3, 0.05, 1, 0.8, 1, 1), "#6faf5a", false);
      k.add(ball(r * 0.22, r * 0.3, y0 + 0.24, -0.1, 1, 0.8, 1, 1), "#8fc46a", false);
      break;
    }
    case "gtower": {
      const th = Math.max(4, b.floors) * 0.36, w = W * 0.8, d = D * 0.8;
      let y = y0;
      const levels = Math.max(2, Math.round(th / 0.7));
      for (let i = 0; i < levels; i++) {
        const lh = th / levels, sh = 1 - i * 0.06;
        k.add(box(w * sh, lh * 0.82, d * sh, 0, y, 0), wall);
        k.add(box(w * sh + 0.1, lh * 0.18, d * sh + 0.1, 0, y + lh * 0.82, 0), "#7fb56a");
        for (let j = 0; j < 3; j++) k.add(ball(0.07, (rnd() - 0.5) * w * sh, y + lh + 0.03, (rnd() - 0.5) * d * sh, 1, 0.8, 1, 0), "#5f9f4a", false);
        windows(k, w * sh, d * sh, 1, lh, y, face, 0.22);
        y += lh;
      }
      k.glow(box(0.04, th * 0.8, 0.04, w / 2, y0 + th * 0.1, d / 2), roofC);
      door(k, y0, face * (d / 2 + 0.01), 0.22, 0.26);
      break;
    }
    case "spire": {
      const th = Math.max(4, b.floors) * 0.42, r = Math.min(W, D) * 0.36;
      k.add(new THREE.CylinderGeometry(r * 0.35, r, th, 8).translate(0, y0 + th / 2, 0), wall);
      for (const f of [0.35, 0.7]) k.glow(new THREE.TorusGeometry(r * (1 - f * 0.62) + 0.06, 0.03, 6, 20).rotateX(Math.PI / 2).translate(0, y0 + th * f, 0), roofC);
      k.add(cone(r * 0.35, 0.5, 8, 0, y0 + th, 0), wall);
      k.glow(ball(0.05, 0, y0 + th + 0.55, 0, 1, 1, 1, 0), "#ff6a8a");
      for (let i = 0; i < Math.round(th / 0.45); i++) k.window(new THREE.BoxGeometry(0.03, 0.14, 0.1).translate(r * (1 - ((i + 0.5) * 0.45) / th * 0.62) * 0.98, y0 + (i + 0.5) * 0.45, 0).rotateY(i * 1.3));
      door(k, y0, face * r * 0.95, 0.16, 0.24);
      break;
    }
    default:
      k.add(box(W, H, D, 0, y0, 0), wall);
  }
  return k;
}

// --- landmarks ------------------------------------------------------------------------------
export function landmark(b, region) {
  const k = new Kit(), rnd = mulberry32(b.seed || 1);
  const W = b.w * 0.9, D = b.d * 0.9, y0 = 0.04, rid = region.id;
  const S = Math.min(W, D);
  switch (b.lm) {
    case "stones": {
      k.add(cyl(S * 0.5, S * 0.52, 0.05, 20, 0, -0.01, 0), "#a7a07f", false);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, r = S * 0.4;
        k.add(box(0.22, 0.55 + rnd() * 0.2, 0.14, Math.cos(a) * r, y0, Math.sin(a) * r, -a + Math.PI / 2), STONE);
      }
      k.add(box(0.5, 0.1, 0.16, Math.cos(0.45) * S * 0.4, y0 + 0.62, Math.sin(0.45) * S * 0.4, -0.45 + Math.PI / 2), STONE);
      for (let i = 0; i < 3; i++) k.add(box(0.36, 0.06, 0.07, 0, y0, 0, (i * Math.PI) / 3), WOOD, false);
      k.glow(cone(0.13, 0.3, 6, 0, y0 + 0.05, 0), "#ff9a3a");
      k.glow(cone(0.07, 0.2, 6, 0, y0 + 0.08, 0), "#ffe27a");
      k.smoke.push([0, y0 + 0.45, 0]);
      break;
    }
    case "totem": {
      const cs = ["#c8553f", "#3f8f8a", "#e0b54a", "#4a5a8a"];
      let y = y0;
      for (let i = 0; i < 4; i++) { k.add(cyl(0.18, 0.2, 0.36, 8, 0, y, 0), cs[i]); y += 0.36; }
      k.add(box(0.9, 0.08, 0.14, 0, y - 0.3, 0), cs[2]);
      k.add(cone(0.08, 0.2, 4, 0, y - 0.12, 0.2), cs[2]);
      k.add(cyl(S * 0.45, S * 0.48, 0.05, 16, 0, -0.01, 0), "#a7a07f", false);
      break;
    }
    case "pyramid": {
      const h = W * 0.62;
      k.add(pyr(W, h, D, 0, y0 - 0.05, 0), "#e3c48e");
      k.add(pyr(W * 0.14, h * 0.14, D * 0.14, 0, y0 - 0.05 + h * 0.86, 0), GOLD, false);
      break;
    }
    case "ziggurat": {
      const c = rid === "mesopotamia" ? "#c8955f" : "#d4a76f";
      let y = y0;
      [[1, 0.45], [0.72, 0.42], [0.48, 0.4]].forEach(([s, h]) => { k.add(box(W * s, h, D * s, 0, y, 0), c); y += h; });
      k.add(box(W * 0.24, 0.32, D * 0.24, 0, y, 0), "#4f7fae");
      for (let i = 0; i < 6; i++) k.add(box(0.36, 0.08 + i * 0.13, 0.12, 0, y0, D * 0.5 + 0.06 - i * 0.12), shade(c, -0.08), false);
      break;
    }
    case "steppyramid": {
      const c = "#c4bcac";
      let y = y0;
      for (let i = 0; i < 5; i++) { const s = 1 - i * 0.17; k.add(box(W * s, 0.3, D * s, 0, y, 0), shade(c, -i * 0.03)); y += 0.3; }
      k.add(box(W * 0.26, 0.34, D * 0.22, 0, y, 0), "#d77a61");
      k.add(box(W * 0.2, 0.18, 0.05, 0, y + 0.34, 0), "#d77a61");
      for (let i = 0; i < 5; i++) k.add(box(0.34, 0.06, 0.18, 0, y0 + i * 0.3 + 0.24, D * (0.5 - i * 0.085) + 0.02), shade(c, 0.15), false);
      break;
    }
    case "obelisk": {
      k.add(box(W, 0.08, D, 0, y0 - 0.04, 0), "#e3c48e", false);
      k.add(box(0.36, 0.14, 0.36, 0, y0 + 0.04, 0), "#d9b47a");
      k.add(new THREE.CylinderGeometry(0.08, 0.15, 2.0, 4).rotateY(Math.PI / 4).translate(0, y0 + 0.18 + 1.0, 0), "#e3c48e");
      k.add(cone(0.11, 0.18, 4, 0, y0 + 2.18, 0, Math.PI / 4), GOLD);
      break;
    }
    case "temple": {
      const late = b.age >= 3;
      k.add(box(W, 0.12, D, 0, y0 - 0.04, 0), "#e9e2d0");
      k.add(box(W * 0.94, 0.1, D * 0.9, 0, y0 + 0.08, 0), "#efe8d8");
      const nx = 6, nz = 3, ch = 0.85, yb = y0 + 0.18;
      for (let i = 0; i < nx; i++) for (const s of [-1, 1]) k.add(cyl(0.065, 0.075, ch, 8, -W * 0.42 + (i * W * 0.84) / (nx - 1), yb, s * D * 0.36), "#f4efe2");
      for (let i = 1; i < nz; i++) for (const s of [-1, 1]) k.add(cyl(0.065, 0.075, ch, 8, s * W * 0.42, yb, -D * 0.36 + (i * D * 0.72) / nz), "#f4efe2");
      k.add(box(W * 0.6, ch, D * 0.5, 0, yb, 0), "#e6dcc4");
      k.add(box(W * 0.96, 0.12, D * 0.86, 0, yb + ch, 0), "#efe8d8");
      gable(k, W * 0.96, D * 0.86, yb + ch + 0.12, W * 0.18, "#efe8d8", late ? "#c0603f" : "#d8cfb8", true);
      break;
    }
    case "shrine": {
      const red = "#c8402f";
      for (const s of [-1, 1]) k.add(cyl(0.04, 0.045, 0.75, 8, s * 0.3, y0, D * 0.45), red);
      k.add(box(0.85, 0.06, 0.08, 0, y0 + 0.7, D * 0.45), "#2f2a2a");
      k.add(box(0.72, 0.05, 0.06, 0, y0 + 0.58, D * 0.45), red);
      k.add(box(W * 0.6, 0.4, D * 0.45, 0, y0, -D * 0.12), "#e9dfc9");
      k.add(pyr(W * 0.82, 0.32, D * 0.66, 0, y0 + 0.4, -D * 0.12), "#3f4a5c");
      break;
    }
    case "pagoda": {
      let y = y0;
      k.add(box(W * 0.85, 0.1, D * 0.85, 0, y - 0.04, 0), STONE, false);
      for (let f = 0; f < 5; f++) {
        const s = 0.62 - f * 0.08, h = 0.32;
        k.add(box(W * s, h, D * s, 0, y, 0), f ? "#c8553f" : "#b4483a");
        k.add(pyr(W * s * 1.55, 0.18, D * s * 1.55, 0, y + h, 0), "#3f4a5c");
        y += h + 0.1;
      }
      k.add(cyl(0.025, 0.03, 0.5, 6, 0, y + 0.05, 0), GOLD);
      for (let i = 0; i < 3; i++) k.add(cyl(0.06, 0.06, 0.025, 8, 0, y + 0.12 + i * 0.1, 0), GOLD, false);
      break;
    }
    case "tenshu": {
      k.add(new THREE.CylinderGeometry(S * 0.42, S * 0.56, 0.55, 4).rotateY(Math.PI / 4).translate(0, y0 + 0.24, 0), DARKSTONE);
      let y = y0 + 0.5;
      for (let f = 0; f < 3; f++) {
        const s = 0.62 - f * 0.14, h = 0.38;
        k.add(box(S * s, h, S * s, 0, y, 0), "#f2ede0");
        k.add(pyr(S * s * 1.4, 0.24, S * s * 1.4, 0, y + h, 0), "#3f4a5c");
        windows(k, S * s, S * s, 1, h, y - 0.05, 1, 0.22);
        y += h + 0.14;
      }
      k.add(box(0.18, 0.08, 0.04, 0, y - 0.1, 0), GOLD, false);
      break;
    }
    case "castle": {
      const c = "#b8b2a5", R = S * 0.42, h = 0.55;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        k.add(cyl(0.22, 0.24, h + 0.3, 10, sx * R, y0, sz * R), c);
        k.add(cone(0.3, 0.42, 10, sx * R, y0 + h + 0.3, sz * R), "#5b7fa6");
      }
      for (const [x, z, w, d] of [[0, -R, 2 * R, 0.16], [0, R, 2 * R, 0.16], [-R, 0, 0.16, 2 * R], [R, 0, 0.16, 2 * R]]) {
        k.add(box(w, h, d, x, y0, z), c);
        for (let i = -2; i <= 2; i++) k.add(box(w > d ? 0.12 : 0.18, 0.1, w > d ? 0.18 : 0.12, x + (w > d ? (i * w) / 5.5 : 0), y0 + h, z + (w > d ? 0 : (i * d) / 5.5)), c, false);
      }
      k.add(box(0.26, 0.34, 0.04, 0, y0, R + 0.09), DOOR, false);
      k.add(box(0.8, 1.2, 0.8, 0, y0, -0.1), shade(c, 0.05));
      k.add(pyr(1.0, 0.5, 1.0, 0, y0 + 1.2, -0.1), "#5b7fa6");
      k.add(box(0.03, 0.4, 0.03, 0, y0 + 1.7, -0.1), "#555", false);
      k.add(box(0.24, 0.14, 0.01, 0.12, y0 + 1.94, -0.1), "#c8402f", false);
      break;
    }
    case "cathedral": {
      if (rid === "mediterranean" && b.age === 3) {
        // St Mark's, Venice: a Greek-cross basilica with five domes
        const c = "#e9dcc4", lead = "#8f9aa0";
        k.add(box(W * 0.9, 0.85, D * 0.62, 0, y0, 0), c);
        k.add(box(D * 0.62, 0.85, W * 0.5, 0, y0, 0), c);
        for (let i = 0; i < 5; i++) k.add(box(0.26, 0.38, 0.03, -W * 0.36 + i * W * 0.18, y0, D * 0.31 + 0.01), i === 2 ? "#e0b24a" : "#6a4a3a", false);
        for (const [x, z, r] of [[0, 0, 0.36], [-W * 0.3, 0, 0.26], [W * 0.3, 0, 0.26], [0, -D * 0.2, 0.26], [0, D * 0.2, 0.26]]) {
          k.add(cyl(r * 0.85, r * 0.85, 0.18, 14, x, y0 + 0.85, z), c);
          k.add(ball(r, x, y0 + 1.05, z, 1, 1.15, 1), lead);
          k.add(cone(0.03, 0.18, 6, x, y0 + 1.05 + r * 1.1, z), GOLD, false);
        }
        break;
      }
      if (rid === "mediterranean" && b.age === 4) {
        // the Duomo, Florence: striped marble nave and Brunelleschi's ribbed red dome
        const c = "#f1ece0", green = "#6f8f7a";
        k.add(box(W * 0.9, 0.9, D * 0.55, 0, y0, 0), c);
        for (let i = 0; i < 6; i++) k.add(box(0.03, 0.9, D * 0.555, -W * 0.4 + i * W * 0.16, y0, 0), green, false);
        gable(k, W * 0.9, D * 0.55, y0 + 0.9, D * 0.22, c, "#c0603f", true);
        k.add(new THREE.CylinderGeometry(0.5, 0.52, 0.45, 8).rotateY(Math.PI / 8).translate(W * 0.18, y0 + 1.12, 0), c);
        k.add(ball(0.5, W * 0.18, y0 + 1.34, 0, 1, 1.25, 1, 2).scale(1, 1, 1), "#c0603f");
        for (let i = 0; i < 8; i++) k.add(new THREE.TorusGeometry(0.5, 0.018, 4, 16, Math.PI / 2).rotateZ(0).scale(1, 1.25, 1).rotateY((i * Math.PI) / 4).translate(W * 0.18, y0 + 1.34, 0), "#f1ece0", false);
        k.add(cyl(0.08, 0.1, 0.24, 8, W * 0.18, y0 + 1.95, 0), c);
        k.add(cone(0.05, 0.14, 8, W * 0.18, y0 + 2.19, 0), GOLD, false);
        break;
      }
      const domed = rid === "mediterranean" || rid === "mesoamerica";
      const wallC = rid === "mesoamerica" ? "#f0d9a8" : domed ? "#efe3c6" : "#c4bcac";
      k.add(box(W * 0.9, 0.9, D * 0.6, 0, y0, 0), wallC);
      gable(k, W * 0.9, D * 0.6, y0 + 0.9, D * 0.3, wallC, domed ? "#c0603f" : "#4d5763", true);
      windows(k, W * 0.9, D * 0.6, 1, 0.9, y0 + 0.1, 1, 0.38);
      if (domed) {
        k.add(cyl(0.42, 0.42, 0.4, 16, 0, y0 + 1.1, 0), wallC);
        k.add(dome(0.45, 0, y0 + 1.5, 0), "#6fa58f");
        k.add(cyl(0.06, 0.08, 0.25, 8, 0, y0 + 1.92, 0), wallC);
        for (const s of [-1, 1]) {
          k.add(box(0.36, 1.5, 0.36, s * W * 0.38, y0, D * 0.32), wallC);
          k.add(pyr(0.44, 0.35, 0.44, s * W * 0.38, y0 + 1.5, D * 0.32), "#c0603f");
        }
      } else {
        k.add(box(0.5, 1.7, 0.5, -W * 0.38, y0, 0), wallC);
        k.add(pyr(0.56, 1.1, 0.56, -W * 0.38, y0 + 1.7, 0), "#4d5763");
        k.glow(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12).rotateX(Math.PI / 2).translate(-W * 0.38, y0 + 1.25, 0.26), "#ffd27a");
      }
      break;
    }
    case "domehall": {
      const wallC = rid === "nile" ? "#ead2a2" : "#e3c48e", domeC = rid === "mesopotamia" ? "#4f7fae" : "#6fa58f";
      k.add(box(W * 0.78, 0.7, D * 0.78, 0, y0, 0), wallC);
      k.add(box(W * 0.82, 0.08, D * 0.82, 0, y0 + 0.7, 0), shade(wallC, -0.1));
      k.add(cyl(0.48, 0.5, 0.25, 16, 0, y0 + 0.78, 0), wallC);
      k.add(dome(0.5, 0, y0 + 1.03, 0), domeC);
      k.add(cone(0.05, 0.25, 6, 0, y0 + 1.5, 0), GOLD, false);
      windows(k, W * 0.78, D * 0.78, 1, 0.7, y0 + 0.05, 1, 0.34);
      for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        k.add(cyl(0.09, 0.11, 1.7, 8, sx * W * 0.46, y0, sz * D * 0.46), wallC);
        k.add(cyl(0.14, 0.14, 0.06, 8, sx * W * 0.46, y0 + 1.4, sz * D * 0.46), shade(wallC, -0.1), false);
        k.add(cone(0.1, 0.3, 8, sx * W * 0.46, y0 + 1.7, sz * D * 0.46), domeC);
      }
      break;
    }
    case "longhall": {
      k.add(box(W * 0.92, 0.32, D * 0.7, 0, y0, 0), "#8a5a38");
      gable(k, W * 0.92, D * 0.7, y0 + 0.32, D * 0.5, "#8a5a38", "#7c9a52", true, 0.14);
      for (const s of [-1, 1]) k.add(box(0.06, 0.28, 0.06, s * W * 0.48, y0 + 0.5, 0), "#5a3a24");
      door(k, y0, D * 0.35 + 0.01, 0.2, 0.26);
      k.smoke.push([W * 0.2, y0 + 0.75, 0]);
      break;
    }
    case "stave": {
      let y = y0;
      k.add(box(W * 0.6, 0.45, D * 0.6, 0, y, 0), "#5e3d27");
      y += 0.45;
      for (let i = 0; i < 3; i++) {
        const s = 0.75 - i * 0.18;
        gable(k, W * s, D * s, y, 0.38, "#5e3d27", "#3a2a22", i % 2 === 1, 0.07);
        y += 0.32;
        if (i < 2) { k.add(box(W * s * 0.6, 0.22, D * s * 0.6, 0, y - 0.1, 0), "#5e3d27"); y += 0.12; }
      }
      k.add(cone(0.06, 0.35, 4, 0, y, 0), "#3a2a22");
      break;
    }
    case "lighthouse": {
      let y = y0;
      for (let i = 0; i < 5; i++) { const r0 = 0.32 - i * 0.035; k.add(cyl(r0 - 0.035, r0, 0.42, 12, 0, y, 0), i % 2 ? "#c8402f" : "#f4efe2"); y += 0.42; }
      k.add(cyl(0.2, 0.2, 0.06, 12, 0, y, 0), "#333");
      k.glow(cyl(0.13, 0.13, 0.22, 10, 0, y + 0.06, 0), "#ffe27a");
      k.add(cone(0.19, 0.22, 10, 0, y + 0.28, 0), "#c8402f");
      k.lamp = [0, y + 0.17, 0];
      break;
    }
    case "windmill": {
      const h = 1.35;
      k.add(cyl(0.24, 0.36, h, 10, 0, y0, 0), "#f1eadb");
      k.add(cone(0.3, 0.4, 10, 0, y0 + h, 0), "#c0603f");
      door(k, y0, 0.35, 0.14, 0.24);
      const sails = [];
      for (let i = 0; i < 4; i++) {
        const g = new THREE.BoxGeometry(0.12, 0.7, 0.02).translate(0, 0.4, 0).rotateZ((i * Math.PI) / 2);
        sails.push([g, "#efe3c6"]);
        sails.push([new THREE.BoxGeometry(0.025, 0.8, 0.03).translate(0, 0.4, 0.015).rotateZ((i * Math.PI) / 2), WOOD]);
      }
      k.spinner(sails, [0, y0 + h - 0.05, 0.36], 1.2);
      break;
    }
    case "clocktower": {
      const c = rid === "nile" || rid === "mesopotamia" ? "#e3c48e" : "#b4553f";
      k.add(box(0.7, 2.1, 0.7, 0, y0, 0), c);
      k.add(box(0.78, 0.08, 0.78, 0, y0 + 2.1, 0), shade(c, 0.2));
      k.add(box(0.62, 0.45, 0.62, 0, y0 + 2.18, 0), c);
      for (const [x, z, ry] of [[0, 0.32, 0], [0, -0.32, 0], [0.32, 0, Math.PI / 2], [-0.32, 0, Math.PI / 2]]) {
        k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16).rotateX(Math.PI / 2).rotateY(ry).translate(x, y0 + 2.4, z), "#f4efe2");
        k.add(box(0.02, 0.15, 0.02, x * 1.06, y0 + 2.38, z * 1.06, ry), "#333", false);
      }
      k.add(pyr(0.8, 0.55, 0.8, 0, y0 + 2.63, 0), "#4d5763");
      k.add(cyl(0.02, 0.02, 0.3, 5, 0, y0 + 3.18, 0), GOLD, false);
      break;
    }
    case "factory": {
      const c = "#a24a38";
      k.add(box(W * 0.8, 0.75, D * 0.8, 0, y0, 0), c);
      for (let i = 0; i < 3; i++) {
        const x = -W * 0.4 + (i + 0.5) * (W * 0.8) / 3;
        k.add(prism(W * 0.8 / 3, 0.35, D * 0.8, x, y0 + 0.75, 0).rotateZ(0), i % 2 ? "#5a6470" : "#4d5763");
      }
      windows(k, W * 0.8, D * 0.8, 1, 0.75, y0 + 0.05, 1, 0.3);
      for (const s of [-1, 1]) {
        const x = s * W * 0.25, z = -D * 0.25;
        k.add(cyl(0.12, 0.16, 1.9, 10, x, y0, z), "#8e3f30");
        k.add(cyl(0.15, 0.15, 0.08, 10, x, y0 + 1.9, z), "#333", false);
        k.smoke.push([x, y0 + 2.0, z]);
      }
      break;
    }
    case "station": {
      k.add(box(W * 0.9, 0.6, D * 0.55, 0, y0, -D * 0.1), "#c0674a");
      k.add(new THREE.CylinderGeometry(D * 0.36, D * 0.36, W * 0.9, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, y0 + 0.6, -D * 0.1), "#7f8f99");
      k.add(box(W * 0.95, 0.08, D * 0.3, 0, y0, D * 0.3), "#b8b2a5", false);
      windows(k, W * 0.9, D * 0.55, 1, 0.6, y0 + 0.05, 1, 0.3);
      k.add(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16).rotateX(Math.PI / 2).translate(0, y0 + 0.45, D * 0.18 + 0.02), "#f4efe2");
      break;
    }
    case "skytower":
    case "neontower": {
      const c = b.lm === "neontower" ? "#3f4a5c" : "#9fb7c4";
      let y = y0, w = W * 0.62;
      for (const [s, h] of [[1, 2.4], [0.8, 1.8], [0.58, 1.4]]) {
        k.add(box(w * s, h, w * s, 0, y, 0), c);
        k.add(box(w * s + 0.06, 0.08, w * s + 0.06, 0, y + h, 0), shade(c, 0.3));
        windows(k, w * s, w * s, Math.round(h / 0.36), 0.36, y, 1, 0.22);
        y += h + 0.08;
      }
      k.add(cyl(0.02, 0.03, 1.0, 6, 0, y, 0), "#888");
      k.glow(ball(0.06, 0, y + 1.02, 0), "#ff4a3a");
      if (b.lm === "neontower") {
        for (let i = 0; i < 4; i++) k.glow(box(w * 0.9, 0.06, 0.03, 0, y0 + 0.5 + i * 1.1, w / 2 + 0.03), NEON[i % NEON.length]);
        k.glow(box(0.06, 1.6, 0.25, w / 2 + 0.06, y0 + 0.6, 0), NEON[0]);
      }
      break;
    }
    case "stadium": {
      const ancient = b.age < 5, c = ancient ? "#d9cdb0" : "#e6e1d6";
      const pts = [new THREE.Vector2(0.62, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 0.5), new THREE.Vector2(0.94, 0.5), new THREE.Vector2(0.66, 0.08)];
      k.add(new THREE.LatheGeometry(pts, 28).scale(W / 2, 1, D / 2).translate(0, y0, 0), c);
      k.add(cyl(1, 1, 0.04, 28, 0, y0, 0).scale(W * 0.31, 1, D * 0.31), ancient ? "#d6c48e" : "#7fae5a", false);
      if (!ancient) for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        k.add(cyl(0.02, 0.02, 1.2, 5, Math.cos(a) * W * 0.5, y0, Math.sin(a) * D * 0.5), "#888", false);
        k.glow(box(0.2, 0.1, 0.05, Math.cos(a) * W * 0.5, y0 + 1.2, Math.sin(a) * D * 0.5), "#fff6c8");
      }
      break;
    }
    case "turbine": {
      k.add(cyl(0.04, 0.08, 3.0, 8, 0, y0, 0), "#f4efe2");
      k.add(box(0.12, 0.12, 0.3, 0, y0 + 2.95, 0), "#f4efe2");
      const bl = [];
      for (let i = 0; i < 3; i++) bl.push([new THREE.BoxGeometry(0.06, 0.95, 0.02).translate(0, 0.48, 0).rotateZ((i * Math.PI * 2) / 3), "#f4efe2"]);
      k.spinner(bl, [0, y0 + 3.01, 0.17], 2.4);
      break;
    }
    case "rocket": {
      k.add(cyl(S * 0.48, S * 0.5, 0.12, 20, 0, y0 - 0.04, 0), "#9aa3ab");
      k.add(cyl(S * 0.3, S * 0.3, 0.02, 20, 0, y0 + 0.08, 0), "#e0b54a", false);
      const gx = S * 0.32;
      for (const s2 of [-1, 1]) k.add(box(0.06, 2.4, 0.06, gx, y0, s2 * 0.12), "#c8402f", false);
      for (let i = 0; i < 8; i++) k.add(box(0.05, 0.03, 0.3, gx, y0 + 0.3 * i + 0.15, 0), "#c8402f", false);
      k.add(box(0.28, 0.04, 0.05, gx - 0.14, y0 + 1.6, 0), "#c8402f", false);
      const R = 0.2, parts = [];
      parts.push([cyl(R, R, 1.5, 14, 0, 0.25, 0), "#f4f6f8"]);
      parts.push([cone(R, 0.5, 14, 0, 1.75, 0), "#c8402f"]);
      parts.push([cyl(R * 1.02, R * 1.02, 0.08, 14, 0, 1.1, 0), "#3f78b0"]);
      parts.push([cyl(R * 0.8, R * 0.95, 0.25, 12, 0, 0, 0), "#555"]);
      for (let i = 0; i < 3; i++) parts.push([box(0.03, 0.4, 0.22, 0, 0.1, 0, (i * Math.PI * 2) / 3).translate(0, 0, 0), "#c8402f"]);
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; parts[parts.length - 3 + i][0].translate(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); }
      parts.push([new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10).rotateX(Math.PI / 2).translate(0, 1.35, R), "#bfe6e8"]);
      k.mover("rocket", parts);
      k.rocketBase = [0, y0 + 0.1, 0];
      break;
    }
    case "elevator": {
      k.add(cyl(S * 0.42, S * 0.46, 0.3, 16, 0, y0 - 0.04, 0), "#e6eef2");
      k.add(dome(S * 0.3, 0, y0 + 0.26, 0), "#bfe6e8");
      // the cable rises to just under the glass above this spot
      const top = 2.75 + Math.sqrt(Math.max(0, 10.6 ** 2 - (b.x * b.x + b.z * b.z))) - 0.35 - (b.h || 0);
      k.add(cyl(0.05, 0.05, top - y0 - 0.3, 8, 0, y0 + 0.3, 0), "#7d8a96");
      k.glow(cyl(0.015, 0.015, top - y0 - 0.3, 4, 0.06, y0 + 0.3, 0), "#5fd3d8");
      k.add(cyl(0.2, 0.12, 0.12, 10, 0, top - 0.12, 0), "#9aa3ab");
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; k.add(box(0.06, 0.7, 0.06, Math.cos(a) * S * 0.36, y0 + 0.2, Math.sin(a) * S * 0.36), "#9aa3ab", false); }
      k.mover("climber", [[box(0.26, 0.22, 0.26, 0, -0.11, 0), "#f4f6f8"], [box(0.27, 0.04, 0.27, 0, 0.02, 0), "#5fd3d8", true]]);
      k.climb = [0.6, top - 0.3];
      break;
    }
    case "arcology": {
      let y = y0;
      for (let i = 0; i < 5; i++) {
        const sz = S * (0.95 - i * 0.16), h = 0.42;
        k.add(box(sz, h, sz, 0, y, 0), i % 2 ? "#e6eef2" : "#f4f6f8");
        k.add(box(sz + 0.08, 0.06, sz + 0.08, 0, y + h, 0), "#7fb56a");
        windows(k, sz, sz, 1, h, y, 1, 0.24);
        for (let j = 0; j < 4; j++) k.add(ball(0.06, (rnd() - 0.5) * sz, y + h + 0.08, (rnd() - 0.5) * sz, 1, 0.8, 1, 0), "#5f9f4a", false);
        y += h + 0.06;
      }
      k.add(cyl(0.02, 0.05, 1.2, 6, 0, y, 0), "#d9e8ec");
      k.glow(ball(0.06, 0, y + 1.22, 0, 1, 1, 1, 0), "#5fd3d8");
      break;
    }
    case "ringhab": {
      k.add(box(W * 0.3, 0.2, D * 0.6, 0, y0, 0), "#9aa3ab");
      k.add(cyl(0.08, 0.1, 1.0, 8, 0, y0 + 0.2, 0), "#d9e8ec");
      const ring = [[new THREE.TorusGeometry(0.85, 0.1, 8, 28), "#f4f6f8"], [new THREE.TorusGeometry(0.85, 0.104, 4, 28, Math.PI / 3), "#3f78b0"]];
      for (let i = 0; i < 4; i++) ring.push([new THREE.BoxGeometry(0.04, 1.7, 0.04).rotateZ((i * Math.PI) / 4), "#d9e8ec"]);
      ring.push([ball(0.14, 0, 0, 0, 1, 1, 1, 1), "#e6eef2"]);
      k.spinner(ring, [0, y0 + 1.25, 0], 0.5);
      break;
    }
    case "pylon": {
      // Karnak: a pylon gateway, then a forest of papyrus columns
      const c = "#e3c48e";
      // two broad, sloping pylon towers either side of the gate
      const bw = W * 0.4, r0 = (bw / 2) * Math.SQRT2;
      for (const sx of [-1, 1]) {
        k.add(new THREE.CylinderGeometry(r0 * 0.8, r0, 1.2, 4).rotateY(Math.PI / 4).scale(1, 1, 0.34 / bw).translate(sx * (bw / 2 + 0.1), y0 + 0.6, D * 0.36), c);
        k.add(box(bw * 0.82, 0.06, 0.32, sx * (bw / 2 + 0.1), y0 + 1.2, D * 0.36), shade(c, 0.12), false);
      }
      k.add(box(0.26, 0.85, 0.24, 0, y0, D * 0.36), shade(c, -0.05));
      k.add(box(0.2, 0.6, 0.02, 0, y0, D * 0.45), DOOR, false);
      for (const sx of [-1, 1]) for (const o of [-0.15, 0.15]) k.add(cyl(0.015, 0.015, 1.6, 4, sx * (bw / 2 + 0.1) + o, y0, D * 0.36 + 0.2), WOOD, false);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const x = -W * 0.3 + (i * W * 0.6) / 3, z = -D * 0.32 + j * D * 0.2;
        k.add(cyl(0.08, 0.09, 0.9, 8, x, y0, z), shade(c, 0.05));
        k.add(cyl(0.13, 0.08, 0.12, 8, x, y0 + 0.9, z), "#d9b47a", false);
      }
      k.add(box(W * 0.72, 0.1, D * 0.5, 0, y0 + 1.02, -D * 0.12), shade(c, -0.08));
      break;
    }
    case "tvtower": {
      const c = "#d9b47a";
      k.add(cyl(0.3, 0.38, 0.2, 10, 0, y0, 0), "#b8b0a0");
      k.add(cyl(0.11, 0.16, 2.8, 10, 0, y0 + 0.2, 0), c);
      for (let i = 0; i < 6; i++) k.add(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4).rotateZ(0.12).translate(0.15, 0, 0).rotateY((i * Math.PI) / 3).translate(0, y0 + 2.4, 0), shade(c, -0.15), false);
      k.add(cyl(0.34, 0.2, 0.22, 14, 0, y0 + 2.95, 0), "#f2ede2");
      k.window(cyl(0.345, 0.345, 0.07, 14, 0, y0 + 3.03, 0));
      k.add(cyl(0.02, 0.03, 0.5, 6, 0, y0 + 3.17, 0), "#888", false);
      break;
    }
    case "tpillars": {
      const c = "#cdbf9f";
      k.add(cyl(S * 0.5, S * 0.52, 0.18, 20, 0, y0 - 0.06, 0), "#a99a7c");
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, r = S * 0.42, ry = -a + Math.PI / 2;
        k.add(box(0.12, 0.5, 0.06, Math.cos(a) * r, y0, Math.sin(a) * r, ry), c);
        k.add(box(0.24, 0.08, 0.08, Math.cos(a) * r, y0 + 0.5, Math.sin(a) * r, ry), c);
      }
      for (const sx of [-1, 1]) { k.add(box(0.14, 0.75, 0.08, sx * 0.18, y0, 0), c); k.add(box(0.3, 0.1, 0.1, sx * 0.18, y0 + 0.75, 0), c); }
      break;
    }
    case "ishtargate": {
      const blue = "#2f5f9a", gold = "#e0b24a";
      k.add(box(W, 0.7, D * 0.5, 0, y0, 0), blue);
      for (const sx of [-1, 1]) k.add(box(0.5, 1.15, D * 0.75, sx * 0.42, y0, 0), blue);
      for (let i = -6; i <= 6; i++) if (Math.abs(i) > 2) k.add(box(0.1, 0.12, D * 0.5, (i * W) / 13.5, y0 + 0.7, 0), blue, false);
      for (const sx of [-1, 1]) for (const o of [-0.17, 0, 0.17]) k.add(box(0.1, 0.14, D * 0.75, sx * 0.42 + o, y0 + 1.15, 0), blue, false);
      k.add(box(0.3, 0.6, 0.03, 0, y0, D * 0.38), DOOR, false);
      for (let i = 0; i < 6; i++) k.add(box(0.12, 0.07, 0.02, -W * 0.42 + (i % 3) * 0.16 + (i > 2 ? W * 0.62 : 0), y0 + 0.4, D * 0.26), gold, false);
      for (const sx of [-1, 1]) k.add(box(0.14, 0.09, 0.02, sx * 0.42, y0 + 0.8, D * 0.38), gold, false);
      break;
    }
    case "spiralminaret": {
      const c = "#d4a76f";
      k.add(box(W, 0.2, D, 0, y0 - 0.05, 0), "#c8955f");
      let y = y0 + 0.15;
      for (let i = 0; i < 7; i++) { const r = S * 0.4 * (1 - i * 0.11); k.add(cyl(r * 0.94, r, 0.28, 16, 0, y, 0), shade(c, i % 2 ? 0.04 : -0.04)); y += 0.28; }
      for (let i = 0; i < 24; i++) { const a = i * 0.8, r = S * 0.4 * (1 - (i / 24) * 0.75) + 0.01; k.add(box(0.12, 0.04, 0.05, Math.cos(a) * r, y0 + 0.15 + i * 0.08, Math.sin(a) * r, -a), shade(c, -0.15), false); }
      k.add(cyl(0.12, 0.12, 0.22, 8, 0, y, 0), c);
      k.add(dome(0.12, 0, y + 0.22, 0), c);
      break;
    }
    case "kiln": {
      k.add(dome(0.42, 0, y0, 0), "#b9844f");
      k.add(cyl(0.08, 0.1, 0.35, 8, 0.18, y0 + 0.28, 0), "#a9643f");
      k.add(box(0.18, 0.16, 0.03, 0, y0, 0.41), "#3a2a1a", false);
      k.glow(box(0.12, 0.08, 0.02, 0, y0 + 0.02, 0.43), "#ff8a3a");
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 1.2 + 2.2; k.add(cyl(0.05, 0.07, 0.12, 8, Math.cos(a) * 0.55, y0, Math.sin(a) * 0.55), ["#c8553f", "#d9a679", "#8a4a2a"][i % 3], false); }
      k.smoke.push([0.18, y0 + 0.66, 0]);
      break;
    }
    case "palacehall": {
      const ming = b.age >= 4;
      const plat = ming ? "#f1ece0" : "#c9a26a", wall = ming ? "#b8402f" : "#c9a26a", roof = ming ? "#e8b83a" : "#c9a25a";
      k.add(box(W, 0.3, D, 0, y0 - 0.05, 0), plat);
      if (ming) k.add(box(W * 1.04, 0.14, D * 1.04, 0, y0 - 0.06, 0), plat, false);
      k.add(box(W * 0.78, 0.6, D * 0.6, 0, y0 + 0.25, 0), wall);
      for (let i = 0; i < 8; i++) k.add(cyl(0.035, 0.035, 0.6, 6, -W * 0.39 + (i * W * 0.78) / 7, y0 + 0.25, D * 0.31), ming ? "#9a2f22" : WOOD, false);
      k.add(pyr(W * 1.0, 0.25, D * 0.86, 0, y0 + 0.85, 0), roof);
      k.add(box(W * 0.58, 0.18, D * 0.4, 0, y0 + 1.05, 0), wall);
      k.add(pyr(W * 0.82, 0.32, D * 0.62, 0, y0 + 1.2, 0), roof);
      k.add(box(0.3, 0.32, 0.18, 0, y0 + 0.25 - 0.3, D * 0.5 + 0.05), plat, false);
      break;
    }
    case "citygate": {
      const ming = b.age >= 4, wall = ming ? "#b8402f" : "#9a948a", roof = ming ? "#e8b83a" : "#4a4f5c";
      k.add(box(W, 0.75, D * 0.8, 0, y0, 0), ming ? "#b8402f" : "#8f8a84");
      for (let i = -5; i <= 5; i++) k.add(box(0.12, 0.1, D * 0.8, (i * W) / 11.5, y0 + 0.75, 0), ming ? "#b8402f" : "#8f8a84", false);
      k.add(box(0.36, 0.45, 0.03, 0, y0, D * 0.41), "#3a2a1a", false);
      k.add(box(W * 0.6, 0.38, D * 0.55, 0, y0 + 0.85, 0), wall);
      for (let i = 0; i < 6; i++) k.add(cyl(0.03, 0.03, 0.38, 6, -W * 0.28 + (i * W * 0.56) / 5, y0 + 0.85, D * 0.29), "#9a2f22", false);
      k.add(pyr(W * 0.8, 0.22, D * 0.85, 0, y0 + 1.23, 0), roof);
      k.add(box(W * 0.42, 0.2, D * 0.38, 0, y0 + 1.4, 0), wall);
      k.add(pyr(W * 0.62, 0.3, D * 0.62, 0, y0 + 1.6, 0), roof);
      break;
    }
    case "pearltower": {
      const pink = "#d9608a";
      k.add(cyl(S * 0.45, S * 0.48, 0.12, 16, 0, y0, 0), "#9aa3ab");
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; k.add(new THREE.CylinderGeometry(0.06, 0.07, 1.4, 8).rotateZ(Math.cos(a) * 0.18).rotateX(-Math.sin(a) * 0.18).translate(Math.cos(a) * 0.32, y0 + 0.75, Math.sin(a) * 0.32), "#e6eef2"); }
      k.add(ball(0.42, 0, y0 + 1.15, 0, 1, 1, 1, 2), pink);
      k.add(cyl(0.08, 0.1, 1.5, 10, 0, y0 + 1.5, 0), "#e6eef2");
      for (let i = 0; i < 3; i++) k.add(ball(0.09, 0, y0 + 1.8 + i * 0.32, 0, 1, 1, 1, 1), pink, false);
      k.add(ball(0.24, 0, y0 + 3.0, 0, 1, 1, 1, 2), pink);
      k.add(cyl(0.025, 0.04, 0.9, 6, 0, y0 + 3.2, 0), "#e6eef2");
      k.glow(ball(0.05, 0, y0 + 4.12, 0, 1, 1, 1, 0), "#ff4a3a");
      break;
    }
    case "sixpillar": {
      for (const x of [-0.35, 0, 0.35]) for (const z of [-0.25, 0.25]) k.add(cyl(0.07, 0.08, 1.9, 8, x, y0, z), "#7a5234");
      for (const h of [0.6, 1.2, 1.8]) {
        k.add(box(0.95, 0.06, 0.66, 0, y0 + h, 0), "#9a6a43");
        for (const z of [-0.25, 0.25]) k.add(box(0.95, 0.05, 0.05, 0, y0 + h + 0.12, z), "#8a5a38", false);
      }
      k.add(box(0.06, 0.6, 0.06, 0.45, y0, 0.35), "#8a5a38", false);
      break;
    }
    case "raisedstore": {
      for (const x of [-0.3, 0.3]) for (const z of [-0.22, 0.22]) k.add(cyl(0.035, 0.04, 0.55, 6, x, y0, z), "#7a5234");
      for (const x of [-0.3, 0.3]) for (const z of [-0.22, 0.22]) k.add(cyl(0.08, 0.08, 0.025, 8, x, y0 + 0.45, z), "#5a3a24", false);
      k.add(box(0.8, 0.06, 0.6, 0, y0 + 0.55, 0), "#8a5a38");
      k.add(box(0.64, 0.32, 0.46, 0, y0 + 0.61, 0), "#9a6a43");
      gable(k, 0.64, 0.46, y0 + 0.93, 0.36, "#9a6a43", "#c9a25a", true, 0.1);
      k.add(new THREE.BoxGeometry(0.1, 0.62, 0.04).rotateX(-0.5).translate(0, y0 + 0.28, 0.42), "#8a5a38", false);
      break;
    }
    case "tokyotower": {
      const red = "#e0522f", white = "#f4efe6";
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.add(new THREE.BoxGeometry(0.1, 1.3, 0.1).rotateZ(sx * 0.32).rotateX(-sz * 0.32).translate(sx * 0.5, y0 + 0.6, sz * 0.5), red);
      let y = y0 + 1.2;
      const secs = [[0.5, 0.36, red], [0.36, 0.26, white], [0.26, 0.18, red], [0.18, 0.12, white], [0.12, 0.06, red]];
      for (const [rb, rt, c] of secs) { k.add(new THREE.CylinderGeometry(rt, rb, 0.6, 4).rotateY(Math.PI / 4).translate(0, y + 0.3, 0), c); y += 0.6; if (y < y0 + 1.9) { k.add(box(0.85, 0.16, 0.85, 0, y - 0.1, 0), white); k.window(box(0.86, 0.06, 0.86, 0, y - 0.05, 0)); } }
      k.add(box(0.36, 0.1, 0.36, 0, y0 + 2.6, 0), white);
      k.add(cyl(0.02, 0.04, 0.8, 6, 0, y, 0), red, false);
      k.glow(ball(0.04, 0, y + 0.82, 0, 1, 1, 1, 0), "#ff4a3a");
      break;
    }
    case "opera": {
      k.add(new THREE.BoxGeometry(W * 0.95, 0.08, D * 0.9).rotateX(0.18).translate(0, y0 + 0.2, 0), "#f4f6f8");
      k.add(box(W * 0.45, 0.7, D * 0.4, -W * 0.12, y0, -D * 0.12), "#bfe0ea");
      k.add(box(W * 0.3, 0.95, D * 0.3, W * 0.18, y0, -D * 0.18), "#e6eef2");
      k.add(new THREE.BoxGeometry(W * 0.32, 0.06, 0.6).rotateX(-0.5).translate(W * 0.18, y0 + 0.75, D * 0.02), "#f4f6f8");
      k.window(box(W * 0.45, 0.4, 0.02, -W * 0.12, y0 + 0.1, D * 0.08 + 0.01));
      break;
    }
    case "olmechead": {
      const c = "#6f7466";
      k.add(box(0.8, 0.1, 0.8, 0, y0 - 0.04, 0), "#8a8a7a", false);
      k.add(ball(0.42, 0, y0 + 0.48, 0, 1, 1.12, 0.92, 2), c);
      k.add(ball(0.44, 0, y0 + 0.7, -0.02, 1.02, 0.55, 0.96, 1), shade(c, -0.15));
      for (const sx of [-1, 1]) { k.add(box(0.12, 0.05, 0.03, sx * 0.14, y0 + 0.58, 0.38), "#3a3c34", false); k.add(ball(0.08, sx * 0.4, y0 + 0.48, 0, 0.6, 1.2, 1, 0), c, false); }
      k.add(new THREE.ConeGeometry(0.08, 0.16, 4).rotateX(Math.PI / 2).translate(0, y0 + 0.46, 0.42), c, false);
      k.add(box(0.26, 0.05, 0.04, 0, y0 + 0.3, 0.37), "#3a3c34", false);
      break;
    }
    case "ballcourt": {
      const c = "#d9cdb0";
      k.add(box(W * 0.7, 0.04, D * 0.35, 0, y0 - 0.02, 0), "#b9a77f", false);
      for (const sz of [-1, 1]) {
        k.add(new THREE.BoxGeometry(W * 0.9, 0.5, 0.35).rotateX(sz * 0.35).translate(0, y0 + 0.22, sz * D * 0.34), c);
        k.add(box(W * 0.9, 0.3, 0.3, 0, y0 + 0.22, sz * D * 0.47), shade(c, -0.05));
        k.add(new THREE.TorusGeometry(0.1, 0.03, 6, 12).translate(0, y0 + 0.45, sz * D * 0.2), "#b8b0a0");
      }
      k.add(box(0.3, 0.3, 0.3, W * 0.48, y0, 0), c);
      k.add(pyr(0.4, 0.2, 0.4, W * 0.48, y0 + 0.3, 0), "#c9a25a");
      break;
    }
    case "minoanpalace": {
      const c = "#efe3c6", red = "#b8402f";
      k.add(box(W * 0.9, 0.45, D * 0.8, 0, y0, 0), c);
      k.add(box(W * 0.5, 0.4, D * 0.5, -W * 0.15, y0 + 0.45, -D * 0.1), c);
      k.add(box(W * 0.3, 0.1, D * 0.25, 0, y0 - 0.02, D * 0.05), "#d6c48e", false);
      for (let i = 0; i < 5; i++) {
        const x = -W * 0.36 + i * W * 0.18;
        k.add(cyl(0.065, 0.045, 0.4, 8, x, y0 + 0.02, D * 0.42), red);
        k.add(cyl(0.08, 0.08, 0.05, 8, x, y0 + 0.42, D * 0.42), "#2a2a2a", false);
      }
      k.add(box(W * 0.92, 0.06, D * 0.16, 0, y0 + 0.45, D * 0.42), c);
      for (const x of [-0.18, 0.18]) for (const sx of [-0.06, 0.06]) k.add(cone(0.04, 0.16, 5, x + sx, y0 + 0.85, -D * 0.1), c, false);
      k.add(box(0.5, 0.1, 0.02, W * 0.2, y0 + 0.2, D * 0.401), "#3f78b0", false);
      break;
    }
    case "campanile": {
      const florence = b.age >= 4;
      const c = florence ? "#f1ece0" : "#b4553f";
      k.add(box(0.62, 2.0, 0.62, 0, y0, 0), c);
      if (florence) for (const h of [0.5, 1.0, 1.5]) k.add(box(0.63, 0.05, 0.63, 0, y0 + h, 0), "#6f8f7a", false);
      k.add(box(0.66, 0.4, 0.66, 0, y0 + 2.0, 0), florence ? c : "#efe3c6");
      for (const [x, z, ry] of [[0, 0.33, 0], [0, -0.33, 0], [0.33, 0, Math.PI / 2], [-0.33, 0, Math.PI / 2]]) k.add(box(0.3, 0.26, 0.02, x, y0 + 2.07, z, ry), "#3a2a1a", false);
      if (florence) k.add(box(0.7, 0.06, 0.7, 0, y0 + 2.4, 0), c);
      else { k.add(box(0.5, 0.2, 0.5, 0, y0 + 2.4, 0), c); k.add(pyr(0.52, 0.85, 0.52, 0, y0 + 2.6, 0), "#6fa58f"); k.add(ball(0.05, 0, y0 + 3.5, 0, 1, 1, 1, 0), GOLD, false); }
      break;
    }
    case "sagrada": {
      const c = "#d9c49b";
      k.add(box(W * 0.8, 0.8, D * 0.6, 0, y0, 0), c);
      gable(k, W * 0.8, D * 0.6, y0 + 0.8, D * 0.3, c, shade(c, -0.1), true);
      const tips = ["#e0522f", "#e8b83a", "#3f78b0", "#7fb56a"];
      for (let i = 0; i < 4; i++) for (const sz of [-1, 1]) {
        const x = -W * 0.3 + i * W * 0.2, h = 1.8 + (i === 1 || i === 2 ? 0.5 : 0);
        k.add(new THREE.CylinderGeometry(0.06, 0.14, h, 8).translate(x, y0 + h / 2, sz * D * 0.32), c);
        for (let j = 1; j < 5; j++) k.add(cyl(0.12 - j * 0.015, 0.12 - j * 0.015, 0.02, 8, x, y0 + (h * j) / 5, sz * D * 0.32), shade(c, -0.15), false);
        k.add(ball(0.06, x, y0 + h + 0.05, sz * D * 0.32, 1, 1.4, 1, 0), tips[i], false);
      }
      k.add(new THREE.CylinderGeometry(0.08, 0.22, 2.8, 8).translate(0, y0 + 1.4, 0), shade(c, 0.05));
      k.add(ball(0.09, 0, y0 + 2.88, 0, 1, 1, 1, 1), "#f4efe6", false);
      k.add(cyl(0.012, 0.012, 0.3, 4, 0, y0 + 2.95, 0), "#f4efe6", false);
      break;
    }
    case "ashokapillar": {
      k.add(cyl(S * 0.45, S * 0.48, 0.06, 16, 0, y0 - 0.02, 0), "#c9b48a", false);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; k.add(box(0.04, 0.16, 0.04, Math.cos(a) * S * 0.42, y0, Math.sin(a) * S * 0.42), "#b9a77f", false); }
      k.add(cyl(0.07, 0.09, 2.0, 12, 0, y0, 0), "#e6d6b0");
      k.add(cyl(0.14, 0.09, 0.16, 12, 0, y0 + 2.0, 0), "#d9c49b");
      k.add(cyl(0.14, 0.14, 0.08, 12, 0, y0 + 2.16, 0), "#cdb88f");
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; k.add(ball(0.07, Math.cos(a) * 0.07, y0 + 2.32, Math.sin(a) * 0.07, 1, 1.2, 1, 0), "#d9c49b", false); }
      k.add(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6).rotateX(Math.PI / 2).translate(0, y0 + 2.42, 0), "#3f78b0", false);
      break;
    }
    case "greatbath": {
      const brick = "#b8714a";
      k.add(box(W, 0.28, D, 0, y0 - 0.06, 0), brick);
      const pw = W * 0.5, pd = D * 0.42;
      k.add(box(pw, 0.05, pd, 0, y0 + 0.14, 0), "#5f9fb0", false);
      for (const [x, z, w, d] of [[0, -pd / 2 - 0.05, pw + 0.2, 0.1], [0, pd / 2 + 0.05, pw + 0.2, 0.1], [-pw / 2 - 0.05, 0, 0.1, pd], [pw / 2 + 0.05, 0, 0.1, pd]]) k.add(box(w, 0.08, d, x, y0 + 0.22, z), shade(brick, 0.08), false);
      for (let i = 0; i < 3; i++) k.add(box(0.3, 0.06, 0.08, 0, y0 + 0.16 + i * 0.03, pd / 2 - 0.06 - i * 0.08), shade(brick, 0.12), false);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.add(box(0.36, 0.3, 0.32, s * W * 0.38, y0 + 0.22, -D * 0.3 + i * D * 0.3), shade(brick, -0.06));
      break;
    }
    case "granary": {
      const brick = "#a9643f";
      k.add(box(W, 0.3, D, 0, y0 - 0.06, 0), brick);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
        const x = -W * 0.36 + (i * W * 0.72) / 3, z = (r - 0.5) * D * 0.5;
        k.add(box(W * 0.17, 0.3, D * 0.36, x, y0 + 0.24, z), shade(brick, 0.06));
        k.add(box(W * 0.2, 0.05, D * 0.4, x, y0 + 0.54, z), "#8a5a38");
      }
      k.add(box(0.3, 0.06, 0.4, 0, y0 + 0.24, D / 2 + 0.1), shade(brick, 0.12), false);
      break;
    }
    case "stupa": {
      const c = "#efe6d2";
      k.add(box(W, 0.18, D, 0, y0 - 0.04, 0), "#c9b48a");
      k.add(cyl(S * 0.36, S * 0.38, 0.22, 20, 0, y0 + 0.14, 0), c);
      k.add(dome(S * 0.33, 0, y0 + 0.36, 0), c);
      k.add(box(0.2, 0.12, 0.2, 0, y0 + 0.36 + S * 0.32, 0), "#c9b48a");
      k.add(cyl(0.015, 0.015, 0.4, 5, 0, y0 + 0.48 + S * 0.32, 0), WOOD, false);
      for (let i = 0; i < 3; i++) k.add(cyl(0.12 - i * 0.03, 0.12 - i * 0.03, 0.025, 10, 0, y0 + 0.56 + S * 0.32 + i * 0.1, 0), GOLD, false);
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.add(box(0.04, 0.16, 0.04, Math.cos(a) * S * 0.46, y0 + 0.14, Math.sin(a) * S * 0.46), "#c9b48a", false); }
      break;
    }
    case "shikhara": {
      const c = "#d9a066";
      k.add(box(W, 0.14, D, 0, y0 - 0.04, 0), "#c9a878");
      k.add(box(W * 0.55, 0.5, W * 0.55, 0, y0 + 0.1, -D * 0.14), c);
      let y = y0 + 0.6;
      for (let i = 0; i < 6; i++) { const r = W * 0.34 * (1 - (i / 6) ** 1.6 * 0.75); k.add(cyl(r * 0.94, r, 0.22, 8, 0, y, -D * 0.14), shade(c, i % 2 ? 0.05 : -0.04)); y += 0.22; }
      k.add(cyl(0.16, 0.16, 0.06, 12, 0, y, -D * 0.14), shade(c, 0.1));
      k.add(cone(0.05, 0.16, 8, 0, y + 0.06, -D * 0.14), GOLD, false);
      k.add(box(W * 0.45, 0.36, D * 0.32, 0, y0 + 0.1, D * 0.24), c);
      k.add(pyr(W * 0.52, 0.32, D * 0.38, 0, y0 + 0.46, D * 0.24), shade(c, -0.08));
      k.add(box(0.03, 0.4, 0.03, W * 0.2, y0 + 0.78, D * 0.3), "#555", false);
      k.add(box(0.2, 0.12, 0.01, W * 0.2 + 0.1, y0 + 1.06, D * 0.3), "#e8742a", false);
      break;
    }
    case "tomb": {
      const shrine = rid === "mesopotamia";   // a gold-domed shrine with blue tilework
      const brick = shrine ? "#4f7fae" : "#b8714a", blue = shrine ? "#e0b24a" : "#3f78b0";
      k.add(new THREE.CylinderGeometry(S * 0.44, S * 0.48, 0.75, 8).rotateY(Math.PI / 8).translate(0, y0 + 0.375, 0), brick);
      k.add(new THREE.CylinderGeometry(S * 0.445, S * 0.445, 0.08, 8).rotateY(Math.PI / 8).translate(0, y0 + 0.62, 0), blue, false);
      k.add(new THREE.CylinderGeometry(S * 0.32, S * 0.34, 0.4, 8).rotateY(Math.PI / 8).translate(0, y0 + 0.95, 0), brick);
      k.add(new THREE.CylinderGeometry(S * 0.325, S * 0.325, 0.06, 8).rotateY(Math.PI / 8).translate(0, y0 + 1.06, 0), blue, false);
      k.add(dome(S * 0.3, 0, y0 + 1.15, 0), shrine ? GOLD : "#f2ede2");
      k.add(cone(0.04, 0.18, 6, 0, y0 + 1.15 + S * 0.3, 0), GOLD, false);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; k.add(cyl(0.05, 0.06, 0.9, 6, Math.cos(a) * S * 0.47, y0, Math.sin(a) * S * 0.47), shade(brick, -0.08)); k.add(dome(0.06, Math.cos(a) * S * 0.47, y0 + 0.9, Math.sin(a) * S * 0.47), "#f2ede2", false); }
      k.add(box(0.2, 0.32, 0.03, 0, y0, S * 0.45), DOOR, false);
      break;
    }
    case "mosque": {
      const red = "#c46a4a", white = "#f4efe6";
      k.add(box(W, 0.16, D, 0, y0 - 0.04, 0), shade(red, -0.05));
      k.add(box(W * 0.78, 0.6, D * 0.4, 0, y0 + 0.12, -D * 0.2), red);
      k.add(box(W * 0.79, 0.05, D * 0.41, 0, y0 + 0.62, -D * 0.2), white, false);
      for (const [x, r] of [[-W * 0.24, 0.24], [0, 0.32], [W * 0.24, 0.24]]) {
        k.add(cyl(r * 0.9, r * 0.9, 0.12, 14, x, y0 + 0.72, -D * 0.2), white);
        k.add(ball(r, x, y0 + 0.84 + r * 0.25, -D * 0.2, 1, 1.25, 1), white);
        k.add(cone(0.03, 0.18, 6, x, y0 + 0.84 + r * 1.4, -D * 0.2), GOLD, false);
      }
      k.add(box(W * 0.24, 0.72, 0.1, 0, y0 + 0.12, -D * 0.0 + 0.02), red);
      k.add(box(W * 0.12, 0.45, 0.02, 0, y0 + 0.12, 0.08), shade(red, -0.35), false);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = sx * W * 0.46, z = sz * D * 0.44;
        k.add(cyl(0.07, 0.09, 1.7, 8, x, y0, z), red);
        for (const h of [0.6, 1.2]) k.add(cyl(0.11, 0.11, 0.04, 8, x, y0 + h, z), white, false);
        k.add(cyl(0.1, 0.1, 0.12, 8, x, y0 + 1.7, z), white);
        k.add(dome(0.1, x, y0 + 1.82, z), white);
      }
      break;
    }
    case "fort": {
      const red = "#c46a4a", R = S * 0.42, h = 0.6;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        k.add(cyl(0.26, 0.3, h + 0.15, 12, sx * R, y0, sz * R), red);
        k.add(cyl(0.12, 0.12, 0.14, 8, sx * R, y0 + h + 0.15, sz * R), "#f2ede2");
        k.add(dome(0.13, sx * R, y0 + h + 0.29, sz * R), "#f2ede2");
      }
      for (const [x, z, w, d] of [[0, -R, 2 * R, 0.18], [0, R, 2 * R, 0.18], [-R, 0, 0.18, 2 * R], [R, 0, 0.18, 2 * R]]) {
        k.add(box(w, h, d, x, y0, z), red);
        for (let i = -3; i <= 3; i++) k.add(box(w > d ? 0.1 : 0.2, 0.08, w > d ? 0.2 : 0.1, x + (w > d ? (i * w) / 7.5 : 0), y0 + h, z + (w > d ? 0 : (i * d) / 7.5)), shade(red, 0.1), false);
      }
      for (const s of [-1, 1]) { k.add(cyl(0.16, 0.18, h + 0.35, 10, s * 0.32, y0, R + 0.05), red); k.add(dome(0.14, s * 0.32, y0 + h + 0.35, R + 0.05), "#f2ede2"); }
      k.add(box(0.3, 0.42, 0.04, 0, y0, R + 0.1), DOOR, false);
      k.add(box(1.0, 0.5, 0.7, 0, y0, -0.15), "#f4efe6");
      for (const x of [-0.3, 0, 0.3]) k.add(dome(0.14, x, y0 + 0.5, -0.15), "#f4efe6");
      break;
    }
    case "mausoleum": {
      const m = "#f4efe6";
      k.add(box(W, 0.2, D, 0, y0 - 0.04, 0), "#ece4d6");
      k.add(new THREE.CylinderGeometry(S * 0.3, S * 0.3, 0.75, 8).rotateY(Math.PI / 8).translate(0, y0 + 0.535, 0), m);
      k.add(box(0.22, 0.42, 0.02, 0, y0 + 0.2, S * 0.29), "#c9bfae", false);
      k.add(cyl(S * 0.2, S * 0.2, 0.16, 16, 0, y0 + 0.91, 0), m);
      k.add(ball(S * 0.22, 0, y0 + 1.07 + S * 0.08, 0, 1, 1.2, 1), m);
      k.add(cone(0.035, 0.24, 6, 0, y0 + 1.07 + S * 0.32, 0), GOLD, false);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        k.add(cyl(0.06, 0.06, 0.12, 8, sx * S * 0.2, y0 + 0.91, sz * S * 0.2), m);
        k.add(dome(0.07, sx * S * 0.2, y0 + 1.03, sz * S * 0.2), m);
        const x = sx * W * 0.45, z = sz * D * 0.45;
        k.add(cyl(0.05, 0.07, 1.35, 8, x, y0 + 0.16, z), m);
        k.add(cyl(0.08, 0.08, 0.03, 8, x, y0 + 0.9, z), m, false);
        k.add(dome(0.07, x, y0 + 1.51, z), m);
      }
      break;
    }
    case "minar": {
      const c = "#e8e4dc";
      k.add(new THREE.CylinderGeometry(S * 0.48, S * 0.5, 0.14, 10).translate(0, y0 + 0.03, 0), "#cfc6b4");
      for (let i = 0; i < 4; i++) k.add(new THREE.ConeGeometry(0.2, 0.55, 4).rotateZ(0.35).translate(0.16, 0.3, 0).rotateY((i * Math.PI) / 2).translate(0, y0 + 0.1, 0), c);
      k.add(cyl(0.09, 0.2, 2.6, 12, 0, y0 + 0.5, 0), c);
      for (const h of [1.5, 2.4]) k.add(cyl(0.2, 0.15, 0.08, 12, 0, y0 + 0.5 + h, 0), shade(c, -0.08), false);
      k.add(cyl(0.12, 0.1, 0.18, 12, 0, y0 + 3.1, 0), c);
      k.add(dome(0.12, 0, y0 + 3.28, 0), c);
      k.add(cone(0.02, 0.15, 6, 0, y0 + 3.4, 0), "#aaa", false);
      break;
    }
    default:
      k.add(box(W, 1, D, 0, y0, 0), STONE);
  }
  return k;
}

// --- trees ------------------------------------------------------------------------------------
/** Geometry and seasonal colours for one tree type. Canopy colours: spring, summer, autumn, winter. */
export function treeKit(type) {
  const T = { evergreen: true };
  const trunkH = { palm: 0.85, pine: 0.22, cypress: 0.18 }[type] ?? 0.38;
  T.trunk = prep(type === "palm" ? cyl(0.035, 0.06, trunkH, 6).rotateZ(0.08) : cyl(0.045, 0.065, trunkH, 6));
  const parts = [];
  if (type === "round") { parts.push(ball(0.32, 0, 0.62, 0)); T.evergreen = false; T.colors = ["#9cc96a", "#7fae5a", "#e09a3e", "#7fae5a"]; }
  if (type === "blossom") { parts.push(ball(0.24, 0, 0.6, 0), ball(0.18, 0.16, 0.5, 0.05), ball(0.18, -0.12, 0.52, -0.08)); T.evergreen = false; T.colors = ["#f3b6c8", "#86b55e", "#d9774a", "#86b55e"]; }
  if (type === "pine") { parts.push(cone(0.32, 0.45, 7, 0, 0.18), cone(0.24, 0.38, 7, 0, 0.48), cone(0.15, 0.28, 7, 0, 0.75)); T.colors = ["#4f7f55", "#4f7f55", "#4a7650", "#4a7650"]; }
  if (type === "palm") {
    for (let i = 0; i < 6; i++) parts.push(new THREE.ConeGeometry(0.07, 0.5, 4).translate(0, 0.25, 0).rotateZ(-1.9).rotateY((i * Math.PI) / 3).translate(0, 0.86, 0));
    parts.push(ball(0.06, 0.06, 0.82, 0));
    T.colors = ["#7aa84f", "#6f9f4a", "#7d9a48", "#6f9f4a"];
  }
  if (type === "jungle") { parts.push(ball(0.34, 0, 0.62, 0, 1, 0.7, 1), ball(0.24, 0.2, 0.75, 0.1, 1, 0.7, 1)); T.colors = ["#4f8f4a", "#4a8a45", "#5a8a44", "#4a8a45"]; }
  if (type === "banyan") { parts.push(ball(0.36, 0, 0.66, 0, 1.4, 0.6, 1.3), ball(0.24, 0.25, 0.78, 0.12, 1.2, 0.6, 1.1)); T.colors = ["#6f9f4a", "#5f8f44", "#6f8f40", "#5f8f44"]; }
  if (type === "cypress") { parts.push(ball(0.2, 0, 0.6, 0, 0.85, 2.4, 0.85)); T.colors = ["#4a7046", "#4a7046", "#4a6a44", "#4a6a44"]; }
  T.canopy = merge(parts.map(prep));
  T.canopyHull = hull(T.canopy);
  return T;
}

// --- people -------------------------------------------------------------------------------------
export function personGeos() {
  return {
    legs: merge([box(0.035, 0.11, 0.035, -0.035, 0, 0), box(0.035, 0.11, 0.035, 0.035, 0, 0)].map(prep)),
    body: prep(cyl(0.06, 0.09, 0.2, 8, 0, 0.1, 0)),
    head: prep(ball(0.1, 0, 0.4, 0, 1, 1, 1, 1)),
  };
}
/** Something on every head, by age: hair, a band, a helmet, a hood, a beret, a top hat, a cap. */
export function hatGeo(age) {
  const y = 0.46;
  switch (age) {
    case 0: return prep(dome(0.105, 0, 0.42, 0));
    case 1: return prep(cyl(0.105, 0.105, 0.04, 10, 0, 0.42, 0));
    case 2: return merge([prep(dome(0.112, 0, 0.42, 0)), prep(box(0.02, 0.06, 0.06, 0, 0.5, 0))]);
    case 3: return prep(cone(0.12, 0.22, 8, 0, 0.4, -0.01));
    case 4: return prep(ball(0.11, 0.02, y + 0.02, 0, 1.2, 0.35, 1.2));
    case 5: return merge([prep(cyl(0.16, 0.16, 0.02, 12, 0, y, 0)), prep(cyl(0.085, 0.09, 0.2, 12, 0, y, 0))]);
    case 6: return merge([prep(dome(0.104, 0, 0.43, 0)), prep(box(0.12, 0.015, 0.1, 0, 0.44, 0.08))]);
    default: return merge([prep(ball(0.135, 0, 0.4, 0, 1, 1, 1, 1)), prep(cyl(0.012, 0.012, 0.1, 4, 0.06, 0.5, 0))]);   // bubble helmet
  }
}

// --- boats and market stalls ----------------------------------------------------------------------
export function boat(age, rnd) {
  const k = new Kit();
  if (age >= 6) {
    k.add(box(1.1, 0.22, 0.4, 0, 0, 0), "#f4efe2");
    k.add(box(1.1, 0.05, 0.41, 0, 0.12, 0), "#4f7fae", false);
    k.add(box(0.55, 0.22, 0.32, -0.1, 0.22, 0), "#f4efe2");
    k.window(box(0.5, 0.06, 0.33, -0.1, 0.32, 0));
  } else if (age === 5) {
    k.add(box(1.0, 0.22, 0.38, 0, 0, 0), "#3a3a42");
    k.add(box(0.5, 0.2, 0.3, -0.05, 0.22, 0), "#c8b48a");
    k.add(cyl(0.06, 0.07, 0.38, 8, 0.1, 0.4, 0), "#c8402f");
    k.smoke.push([0.1, 0.8, 0]);
  } else {
    const sail = age >= 3 ? ["#f4efe2", "#c8553f"][Math.floor(rnd() * 2)] : "#e8dcc0";
    k.add(box(0.9, 0.18, 0.32, 0, 0, 0), age <= 1 ? "#c9a25a" : "#8a5a38");
    k.add(prism(0.32, 0.28, 0.18, 0.5, 0, 0, Math.PI / 2).rotateZ(0), age <= 1 ? "#c9a25a" : "#8a5a38");
    k.add(cyl(0.02, 0.02, 0.85, 5, 0, 0.18, 0), WOOD, false);
    k.add(box(0.03, 0.5, 0.5, 0, 0.42, 0), sail);
    if (age >= 4) k.add(box(0.03, 0.32, 0.36, 0.3, 0.3, 0), sail);
  }
  return k;
}
export function stall(rnd) {
  const k = new Kit();
  const c = ["#c8553f", "#e0b54a", "#6f9fb8", "#7f9b5a"][Math.floor(rnd() * 4)];
  for (const [x, z] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.1], [0.15, 0.1]]) k.add(cyl(0.012, 0.012, 0.3, 4, x, 0, z), WOOD, false);
  k.add(box(0.34, 0.12, 0.22, 0, 0, 0), WOOD);
  gable(k, 0.4, 0.28, 0.3, 0.12, c, c, true, 0.03);
  for (let i = 0; i < 3; i++) k.add(ball(0.035, -0.1 + i * 0.1, 0.15, 0.06, 1, 1, 1, 0), ["#e0b54a", "#c8553f", "#7f9b5a"][i], false);
  return k;
}
