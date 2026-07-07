/* ascii-asterisk.js — a spinning 3D spiky-starburst, rendered as text characters only.

   No canvas, no WebGL, no Three.js: a random number of cylindrical "shafts" (15-30, a fresh count
   and layout each page load) are modeled as points in 3D space (with analytic surface normals),
   shooting out from the center in random directions across all axes — not confined to one plane.
   Each shaft has a constant radius (tapering only right at its tip to a point) and pulses its own
   length independently over time, so the whole thing looks like it's breathing. Every frame the
   current point cloud is rebuilt for that instant, rotated, perspective-projected, and rasterized
   onto a fixed character grid with a z-buffer for occlusion — the classic "ASCII donut" shading
   technique (luminance ramp driven by normal·light), applied to a starburst instead of a torus.
   Output is plain textContent on a <pre>, never innerHTML.

   Loaded once globally (like shared/sidenotes.js) rather than as an inline <script> in the post
   body: the SPA article view injects post HTML via dangerouslySetInnerHTML, which never executes
   embedded <script> tags, but does create real DOM nodes for plain markup. So this script watches
   for its container (via MutationObserver on #root, same trick as sidenotes.js) and mounts into
   whatever <div data-ascii-asterisk> shows up, however it arrived in the DOM.
*/
(function () {
  var COLS = 64, ROWS = 32;
  var RAMP = " .:-=+*#%@";
  var FRAME_MS = 1000 / 24;
  var U_STEPS = 22, V_STEPS = 8;
  var SHAFT_WIDTH = 0.09;   // constant shaft radius (thin, cylindrical rather than a tapered lens)
  var TIP_TAPER = 0.18;     // fraction of the shaft's current length that tapers down to a point

  function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  function normalizeVec(v) { var m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1; return { x: v.x / m, y: v.y / m, z: v.z / m }; }

  // A random number of shafts (15-30), each shooting out from the center in a random direction
  // across all 3 axes (uniformly sampled on the unit sphere, not just one plane). Each gets its own
  // random pulse speed/phase/length range so they breathe in and out independently, out of sync.
  function buildArms() {
    var arms = [];
    var count = 15 + Math.floor(Math.random() * 16); // 15..30 inclusive
    for (var a = 0; a < count; a++) {
      // uniformly random direction on the unit sphere (avoids pole-clustering from naive angles)
      var zc = 1 - 2 * Math.random();
      var r = Math.sqrt(Math.max(0, 1 - zc * zc));
      var phi0 = Math.random() * Math.PI * 2;
      var dir = { x: r * Math.cos(phi0), y: r * Math.sin(phi0), z: zc };
      // orthonormal basis for this shaft's tube cross-section, since it can point anywhere in 3D
      var upHint = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      var perp1 = normalizeVec(cross(dir, upHint));
      var perp2 = cross(dir, perp1); // already unit length: cross of two orthonormal unit vectors
      arms.push({
        dir: dir, perp1: perp1, perp2: perp2,
        phase: Math.random() * Math.PI * 2,
        freq: 0.4 + Math.random() * 0.5,     // per-arm pulse speed
        minLen: 0.45 + Math.random() * 0.2,  // shortest reach of the pulse
        maxLen: 0.9 + Math.random() * 0.3    // longest reach of the pulse
      });
    }
    return arms;
  }
  var ARMS = buildArms();

  // Rebuild the point cloud for a given instant `t`: each shaft's length oscillates on its own
  // sine wave, then gets sampled hub-to-tip at a constant radius with a short tapered tip.
  function buildPoints(t) {
    var pts = [];
    for (var a = 0; a < ARMS.length; a++) {
      var arm = ARMS[a];
      var pulse = (Math.sin(t * arm.freq + arm.phase) + 1) / 2; // 0..1
      var armLen = arm.minLen + (arm.maxLen - arm.minLen) * pulse;
      var taperStart = 1 - TIP_TAPER;
      for (var i = 0; i <= U_STEPS; i++) {
        var u = i / U_STEPS;            // 0 (hub) .. 1 (tip), along the shaft's current length
        var len = u * armLen;
        var width = u <= taperStart ? SHAFT_WIDTH : SHAFT_WIDTH * (1 - u) / TIP_TAPER;
        if (width < 0.004 && u > taperStart) continue; // let the tip actually come to a point
        for (var j = 0; j < V_STEPS; j++) {
          var phi = (j / V_STEPS) * Math.PI * 2;
          var rx = Math.cos(phi) * width;
          var rz = Math.sin(phi) * width;
          var x = arm.dir.x * len + arm.perp1.x * rx + arm.perp2.x * rz;
          var y = arm.dir.y * len + arm.perp1.y * rx + arm.perp2.y * rz;
          var z = arm.dir.z * len + arm.perp1.z * rx + arm.perp2.z * rz;
          var nx = arm.perp1.x * Math.cos(phi) + arm.perp2.x * Math.sin(phi);
          var ny = arm.perp1.y * Math.cos(phi) + arm.perp2.y * Math.sin(phi);
          var nz = arm.perp1.z * Math.cos(phi) + arm.perp2.z * Math.sin(phi);
          pts.push({ x: x, y: y, z: z, nx: nx, ny: ny, nz: nz });
        }
      }
    }
    return pts;
  }

  function rotated(pts, ax, ay) {
    var cosY = Math.cos(ay), sinY = Math.sin(ay);
    var cosX = Math.cos(ax), sinX = Math.sin(ax);
    var out = new Array(pts.length);
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      // rotate around Y
      var x1 = p.x * cosY + p.z * sinY, z1 = -p.x * sinY + p.z * cosY, y1 = p.y;
      var nx1 = p.nx * cosY + p.nz * sinY, nz1 = -p.nx * sinY + p.nz * cosY, ny1 = p.ny;
      // then around X
      var y2 = y1 * cosX - z1 * sinX, z2 = y1 * sinX + z1 * cosX, x2 = x1;
      var ny2 = ny1 * cosX - nz1 * sinX, nz2 = ny1 * sinX + nz1 * cosX, nx2 = nx1;
      out[i] = { x: x2, y: y2, z: z2, nx: nx2, ny: ny2, nz: nz2 };
    }
    return out;
  }

  var LIGHT = normalize(-0.4, 0.5, 1);
  function normalize(x, y, z) { var m = Math.sqrt(x * x + y * y + z * z) || 1; return { x: x / m, y: y / m, z: z / m }; }

  function renderFrame(ax, ay, t) {
    var pts = rotated(buildPoints(t), ax, ay);
    var buf = new Array(COLS * ROWS).fill(" ");
    var zbuf = new Array(COLS * ROWS).fill(-Infinity);
    var K = 3.4;         // camera distance
    var scale = 46;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var invz = 1 / (p.z + K);
      var sx = Math.round(COLS / 2 + p.x * scale * invz * 2.1);
      var sy = Math.round(ROWS / 2 - p.y * scale * invz);
      if (sx < 0 || sx >= COLS || sy < 0 || sy >= ROWS) continue;
      var idx = sy * COLS + sx;
      if (invz <= zbuf[idx]) continue;
      var lum = p.nx * LIGHT.x + p.ny * LIGHT.y + p.nz * LIGHT.z;
      lum = Math.max(0, lum);
      var ci = Math.min(RAMP.length - 1, Math.floor(lum * (RAMP.length - 1) * 1.15));
      zbuf[idx] = invz;
      buf[idx] = RAMP[ci] === " " ? RAMP[1] : RAMP[ci]; // keep visible silhouette even in shadow
    }
    var lines = [];
    for (var r = 0; r < ROWS; r++) lines.push(buf.slice(r * COLS, r * COLS + COLS).join(""));
    return lines.join("\n");
  }

  function staticFrame() {
    return renderFrame(0.28, 0.4, 0);
  }

  var mounted = new WeakSet();

  function mount(container) {
    if (mounted.has(container)) return;
    mounted.add(container);
    var pre = container.querySelector("pre");
    if (!pre) { pre = document.createElement("pre"); container.appendChild(pre); }

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) { pre.textContent = staticFrame(); return; }

    var t0 = null, raf = null, last = 0;
    function tick(t) {
      if (!container.isConnected) { cancelAnimationFrame(raf); mounted.delete(container); return; }
      if (t0 === null) t0 = t;
      if (t - last >= FRAME_MS) {
        last = t;
        var elapsed = (t - t0) / 1000;
        pre.textContent = renderFrame(0.35 * Math.sin(elapsed * 0.5), elapsed * 0.6, elapsed);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  function scan() {
    document.querySelectorAll("[data-ascii-asterisk]").forEach(mount);
  }

  var root = document.getElementById("root");
  var observer = root ? new MutationObserver(scan) : null;
  if (observer) observer.observe(root, { childList: true, subtree: true });

  window.addEventListener("load", scan);
  if (document.readyState !== "loading") scan();
  else document.addEventListener("DOMContentLoaded", scan);

  window.AKAsciiAsterisk = { refresh: scan };
})();
