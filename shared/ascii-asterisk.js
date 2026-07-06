/* ascii-asterisk.js — a spinning 3D Claude-style asterisk, rendered as text characters only.

   No canvas, no WebGL, no Three.js: six tapered "spikes" are modeled as points in 3D space
   (with analytic surface normals), rotated every frame, perspective-projected, and rasterized
   onto a fixed character grid with a z-buffer for occlusion — the classic "ASCII donut" shading
   technique (luminance ramp driven by normal·light), applied to a six-point starburst instead
   of a torus. Output is plain textContent on a <pre>, never innerHTML.

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

  // Six spikes at 60° increments in the XY plane, each a tapered lens (thick at mid-shaft,
  // pointed at both the tip and the hub) so the whole thing reads as a six-point asterisk
  // face-on, then gains real depth as it tumbles in 3D.
  function buildPoints() {
    var pts = [];
    var arms = 6, uSteps = 22, vSteps = 8;
    for (var a = 0; a < arms; a++) {
      var theta = (a / arms) * Math.PI * 2;
      var ca = Math.cos(theta), sa = Math.sin(theta);
      for (var i = 0; i <= uSteps; i++) {
        var u = i / uSteps;             // 0 (hub) .. 1 (tip), along the arm
        var len = u * 1.0;
        // taper profile: narrow at the hub, widest a third of the way out, pointed at the tip
        var width = 0.16 * Math.sin(Math.pow(1 - u, 0.6) * Math.PI) * (1 - Math.pow(u, 3));
        if (width < 0.004 && u > 0.15) continue; // let the tip actually come to a point
        for (var j = 0; j < vSteps; j++) {
          var phi = (j / vSteps) * Math.PI * 2;
          var rx = Math.cos(phi) * width;
          var rz = Math.sin(phi) * width;
          // local frame: shaft runs along (ca, sa, 0); the tube cross-section is perpendicular
          var x = ca * len - sa * rx;
          var y = sa * len + ca * rx;
          var z = rz;
          var nx = -sa * Math.cos(phi), ny = ca * Math.cos(phi), nz = Math.sin(phi);
          pts.push({ x: x, y: y, z: z, nx: nx, ny: ny, nz: nz });
        }
      }
    }
    return pts;
  }
  var BASE_POINTS = buildPoints();

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

  function renderFrame(ax, ay) {
    var pts = rotated(BASE_POINTS, ax, ay);
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
    return renderFrame(0.28, 0.4);
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
        pre.textContent = renderFrame(0.35 * Math.sin(elapsed * 0.5), elapsed * 0.6);
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
