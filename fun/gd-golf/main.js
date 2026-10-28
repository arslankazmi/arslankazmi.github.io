/* ============================================================================
   main.js — Gradient Descent Golf: canvas render, UI, input, audio.
   All game rules live in engine.js (globalThis.GolfEngine).
   ============================================================================ */
(function () {
  "use strict";
  const E = globalThis.GolfEngine;
  const $ = (id) => document.getElementById(id);

  const canvas = $("course");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const toPx = (x, y) => [((x + 1) / 2) * W, ((1 - y) / 2) * W];
  const toWorld = (px, py) => [(px / W) * 2 - 1, 1 - (py / W) * 2];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };

  // --- state ------------------------------------------------------------------
  let course = null;
  let mapCanvas = null;          // pre-rendered landscape for the current hole
  let anim = null;               // { shot, start } while a stroke is rolling
  let hover = null;              // world point under the cursor
  let playing = false;           // title overlay dismissed
  const cfg = {
    opt: "gd",
    lr: { gd: 0.01, momentum: 0.01, adam: 0.03 },
    beta: 0.9,
  };

  // --- audio (synthesized; nothing to load) -------------------------------------
  let ac = null;
  let muted = store.get("gdgolf-mute") === "1";
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, dur, { type = "sine", gain = 0.05, to = null, delay = 0 } = {}) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const sfx = {
    tick(len) { tone(700 + Math.min(900, len * 9000), 0.03, { gain: 0.018 }); },
    holed() { tone(520, 0.18, { type: "triangle", gain: 0.09, to: 260 }); tone(784, 0.35, { type: "sine", gain: 0.06, delay: 0.12 }); tone(1046, 0.5, { gain: 0.05, delay: 0.24 }); },
    oob() { tone(120, 0.35, { type: "sawtooth", gain: 0.04, to: 60 }); },
    lip() { tone(660, 0.08, { type: "triangle", gain: 0.05 }); tone(440, 0.12, { type: "triangle", gain: 0.04, delay: 0.07 }); },
    rest() { tone(330, 0.1, { type: "triangle", gain: 0.035 }); },
  };

  // --- landscape rendering ---------------------------------------------------------
  const RAMP = [
    [0.0, [20, 80, 47]], [0.18, [43, 120, 64]], [0.38, [94, 161, 82]], [0.55, [156, 194, 101]],
    [0.7, [217, 207, 142]], [0.85, [185, 147, 99]], [1.0, [110, 81, 54]],
  ];
  function ramp(z) {
    for (let i = 1; i < RAMP.length; i++) {
      if (z <= RAMP[i][0]) {
        const [z0, c0] = RAMP[i - 1], [z1, c1] = RAMP[i];
        const f = (z - z0) / (z1 - z0);
        return [c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2])];
      }
    }
    return RAMP[RAMP.length - 1][1];
  }
  const BANDS = 16;
  function renderMap(h) {
    const off = document.createElement("canvas");
    off.width = off.height = W;
    const octx = off.getContext("2d");
    const img = octx.createImageData(W, W);
    const [lo, hi] = h.range, span = Math.max(1e-6, hi - lo);
    // Blend a linear-ish scale (keeps the cup well's rings) with the map's own
    // percentile (spreads bands evenly), so one deep well can't wash out the rest.
    const sample = [];
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) sample.push(E.loss(h, -1 + (2 * i) / 63, -1 + (2 * j) / 63));
    sample.sort((a, b) => a - b);
    const cdf = (L) => {
      let a = 0, b = sample.length;
      while (a < b) { const m = (a + b) >> 1; if (sample[m] < L) a = m + 1; else b = m; }
      return a / sample.length;
    };
    const band = new Uint8Array(W * W), shade = new Float32Array(W * W);
    const lx = -0.5, ly = 0.5, lz = 0.7, sc = 0.9 / span;   // light from the upper-left
    for (let py = 0; py < W; py++) {
      for (let px = 0; px < W; px++) {
        const [x, y] = toWorld(px + 0.5, py + 0.5);
        const [L, gx, gy] = E.lossGrad(h, x, y);
        const z = 0.45 * Math.sqrt(Math.max(0, Math.min(1, (L - lo) / span))) + 0.55 * cdf(L);
        const i = py * W + px;
        band[i] = Math.min(BANDS - 1, Math.floor(z * BANDS));
        const nx = -gx * sc, ny = -gy * sc, n = Math.hypot(nx, ny, 1);
        shade[i] = 0.78 + 0.32 * ((nx * lx + ny * ly + lz) / n);
      }
    }
    const colors = Array.from({ length: BANDS }, (_, b) => ramp((b + 0.5) / BANDS));
    for (let py = 0; py < W; py++) {
      for (let px = 0; px < W; px++) {
        const i = py * W + px, b = band[i];
        const edge = (px + 1 < W && band[i + 1] !== b) || (py + 1 < W && band[i + W] !== b);
        const k = shade[i] * (edge ? 0.72 : 1);
        const c = colors[b], o = i * 4;
        img.data[o] = Math.min(255, c[0] * k);
        img.data[o + 1] = Math.min(255, c[1] * k);
        img.data[o + 2] = Math.min(255, c[2] * k);
        img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return off;
  }

  // --- frame drawing ------------------------------------------------------------------
  const PX_PER_UNIT = W / 2;
  function drawFlag(h) {
    const [cx, cy] = toPx(h.cup[0], h.cup[1]);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(cx + 2, cy + 2, E.CUP_R * PX_PER_UNIT, E.CUP_R * PX_PER_UNIT * 0.9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#0d1a12";
    ctx.beginPath(); ctx.arc(cx, cy, E.CUP_R * PX_PER_UNIT, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, E.CUP_R * PX_PER_UNIT, 0, 7); ctx.stroke();
    ctx.strokeStyle = "#f4f1e8"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 46); ctx.stroke();
    ctx.fillStyle = "#e8553f";
    ctx.beginPath(); ctx.moveTo(cx, cy - 46); ctx.lineTo(cx + 24, cy - 38); ctx.lineTo(cx, cy - 30); ctx.closePath(); ctx.fill();
  }
  function drawTee(h) {
    const [tx, ty] = toPx(h.tee[0], h.tee[1]);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(tx - 14, ty + 11, 8, 4);
    ctx.fillRect(tx + 6, ty + 11, 8, 4);
  }
  function drawPath(path, n, style, dots) {
    if (n < 1) return;
    ctx.strokeStyle = style; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [px, py] = toPx(path[i][0], path[i][1]);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    if (!dots) return;
    ctx.fillStyle = style;
    for (let i = 1; i <= n; i++) {
      const [px, py] = toPx(path[i][0], path[i][1]);
      ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 7); ctx.fill();
    }
  }
  function drawBall(x, y, alpha = 1) {
    const [px, py] = toPx(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.arc(px + 2.5, py + 3, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#fbfbf6";
    ctx.beginPath(); ctx.arc(px, py, 7.5, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawArrow(h, x, y) {
    const [, gx, gy] = E.lossGrad(h, x, y);
    const g = Math.hypot(gx, gy);
    if (g < 1e-6) return;
    const [px, py] = toPx(x, y);
    const ux = -gx / g, uy = gy / g;          // −∇L, flipped into screen y
    const len = 34, ex = px + ux * len, ey = py + uy * len;
    ctx.strokeStyle = "#ffd84a"; ctx.fillStyle = "#ffd84a"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(px + ux * 10, py + uy * 10); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + ux * 7, ey + uy * 7);
    ctx.lineTo(ex - uy * 5, ey + ux * 5);
    ctx.lineTo(ex + uy * 5, ey - ux * 5);
    ctx.closePath(); ctx.fill();
  }
  function drawHover(h) {
    if (!hover || anim) return;
    const L = E.loss(h, hover[0], hover[1]);
    const txt = `loss ${fmt(L)}`;
    ctx.font = "13px ui-monospace, monospace";
    const w = ctx.measureText(txt).width + 14;
    ctx.fillStyle = "rgba(10,12,18,0.72)";
    ctx.fillRect(10, W - 34, w, 24);
    ctx.fillStyle = "#e6e9ef";
    ctx.fillText(txt, 17, W - 17);
  }

  const STEPS_PER_SEC = 30;
  let lastStep = -1;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!course || !mapCanvas) return;
    const h = course.hole;
    ctx.drawImage(mapCanvas, 0, 0);
    drawTee(h);
    // earlier strokes, faded
    const shots = course.shots;
    const live = anim ? anim.shot : null;
    for (const s of shots) if (s !== live) drawPath(s.res.path, s.res.path.length - 1, "rgba(255,255,255,0.28)", false);
    drawFlag(h);

    if (anim) {
      const path = anim.shot.res.path;
      // rAF's timestamp can predate the performance.now() taken when the shot fired.
      const f = Math.max(0, ((now - anim.start) / 1000) * STEPS_PER_SEC);
      const i = Math.min(path.length - 1, Math.floor(f));
      if (i !== lastStep && i > 0) {
        const a = path[i - 1], b = path[i];
        sfx.tick(Math.hypot(b[0] - a[0], b[1] - a[1]));
        lastStep = i;
      }
      drawPath(path, i, "rgba(255,255,255,0.9)", true);
      if (i >= path.length - 1) {
        const end = path[path.length - 1];
        if (anim.shot.res.outcome === "oob") {
          const fade = Math.max(0, 1 - (f - i) / 8);
          drawBall(end[0], end[1], fade);
          if (fade === 0) endStroke();
        } else {
          drawBall(end[0], end[1]);
          endStroke();
        }
      } else {
        const a = path[i], b = path[i + 1], t = f - i;
        drawBall(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      }
    } else if (!course.done) {
      drawArrow(h, course.ball[0], course.ball[1]);
      drawBall(course.ball[0], course.ball[1]);
    } else {
      const [cx, cy] = toPx(h.cup[0], h.cup[1]);
      if (!course.pickedUp) { ctx.fillStyle = "#fbfbf6"; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, 7); ctx.fill(); }
      else drawBall(course.ball[0], course.ball[1], 0.6);
    }
    drawHover(h);
  }

  // --- HUD ------------------------------------------------------------------------------
  function fmt(v) {
    const a = Math.abs(v);
    return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(3);
  }
  function relPar(d) { return d === 0 ? "E" : d > 0 ? `+${d}` : `${d}`; }
  function updateHud() {
    const h = course.hole;
    $("hole").textContent = `${course.holeIdx + 1}/${E.HOLES}`;
    $("par").textContent = h.par;
    $("strokes").textContent = course.strokes;
    const d = course.totalStrokes - course.totalPar;
    const tot = $("total");
    tot.textContent = relPar(d);
    tot.className = "v " + (d < 0 ? "under" : d > 0 ? "over" : "");
    const [L, gx, gy] = E.lossGrad(h, course.ball[0], course.ball[1]);
    $("lossV").textContent = fmt(L - h.cupLoss);
    $("gradV").textContent = fmt(Math.hypot(gx, gy));
    $("seed").textContent = course.seedStr;
    $("wind").textContent = h.wind ? `🌬 wind σ=${h.wind.toFixed(2)}` : "calm";
    $("shoot").disabled = !!anim || course.done || !playing;
  }
  function caddie(head, body) { $("caddieHead").textContent = head; $("caddieBody").textContent = body; }

  function syncControls() {
    for (const b of document.querySelectorAll(".opt")) b.setAttribute("aria-pressed", String(b.dataset.opt === cfg.opt));
    const lr = cfg.lr[cfg.opt];
    $("lr").value = String(Math.round(((Math.log10(lr) + 3) / 3) * 300));
    $("lrOut").textContent = lr < 0.01 ? lr.toFixed(4) : lr < 0.1 ? lr.toFixed(3) : lr.toFixed(2);
    $("beta").value = String(Math.round(cfg.beta * 100));
    $("betaOut").textContent = cfg.beta.toFixed(2);
    const betaOn = cfg.opt === "momentum";
    $("betaWrap").classList.toggle("off", !betaOn);
    $("beta").disabled = !betaOn;
  }
  function setLrFromSlider(v) {
    cfg.lr[cfg.opt] = 10 ** (-3 + (3 * Math.max(0, Math.min(300, v))) / 300);
    syncControls();
  }
  function setOpt(opt) { cfg.opt = opt; syncControls(); }

  // --- flow ------------------------------------------------------------------------------
  function loadHole() {
    anim = null;
    mapCanvas = renderMap(course.hole);
    const h = course.hole;
    const notes = [];
    if (h.kappa > 5) notes.push("a long, narrow ravine");
    if (h.wells.length > 2) notes.push(`${h.wells.length - 1} sand traps`);
    if (h.wind) notes.push("gusty wind");
    caddie(`Hole ${course.holeIdx + 1} · par ${h.par}`,
      notes.length ? `Watch out for ${notes.join(", ")}. Hover the map to read the loss anywhere.`
        : "A gentle one. Read the contours, set η, and descend.");
    updateHud();
  }
  function newCourse(seedStr) {
    course = new E.Course(seedStr);
    try { history.replaceState(null, "", `#seed=${seedStr}`); } catch { /* sandboxed */ }
    hideOverlays();
    loadHole();
  }
  function hideOverlays() { for (const id of ["holeOverlay", "endOverlay"]) $(id).classList.add("hidden"); }

  function shoot() {
    if (!playing || anim || course.done) return;
    audio();
    const shot = course.shoot({ opt: cfg.opt, lr: cfg.lr[cfg.opt], beta: cfg.opt === "momentum" ? cfg.beta : 0 });
    if (!shot) return;
    anim = { shot, start: performance.now() };
    lastStep = 0;
    updateHud();
  }
  function endStroke() {
    const shot = anim.shot;
    anim = null;
    const [head, body] = E.LESSONS[shot.kind];
    const o = shot.res.outcome;
    if (o === "holed") sfx.holed();
    else if (o === "oob") sfx.oob();
    else if (shot.res.lipped) sfx.lip();
    else sfx.rest();
    const tail = o === "oob" ? " (+1 penalty: the ball goes back where it was.)" : "";
    caddie(head, body + tail);
    updateHud();
    if (course.done) setTimeout(showHoleDone, o === "holed" ? 650 : 250);
  }
  function showHoleDone() {
    const h = course.hole;
    $("holeTitle").textContent = course.pickedUp ? "Picked up" : E.scoreName(course.strokes, h.par);
    $("holeSub").textContent = `${course.strokes} stroke${course.strokes === 1 ? "" : "s"} · par ${h.par}`;
    const [head, body] = E.LESSONS[course.holeLesson()];
    $("lessonHead").textContent = head;
    $("lessonBody").textContent = body;
    $("nextBtn").textContent = course.finished ? "Scorecard (Enter)" : "Next hole (Enter)";
    $("holeOverlay").classList.remove("hidden");
  }
  function next() {
    if (!course.done) return;
    if (course.finished) return showEnd();
    hideOverlays();
    course.nextHole();
    loadHole();
  }
  function showEnd() {
    $("holeOverlay").classList.add("hidden");
    const d = course.totalStrokes - course.totalPar;
    $("endSub").textContent = `${course.totalStrokes} strokes · par ${course.totalPar} · ${relPar(d)}`;
    const cells = (f) => course.holes.map((h, i) => f(h, i)).join("");
    $("scorecard").innerHTML =
      `<tr><th>hole</th>${cells((h, i) => `<th>${i + 1}</th>`)}<th>tot</th></tr>` +
      `<tr><th>par</th>${cells((h) => `<td>${h.par}</td>`)}<td>${course.totalPar}</td></tr>` +
      `<tr><th>you</th>${cells((h, i) => {
        const s = course.scores[i], c = s < h.par ? "u" : s > h.par ? "o" : "";
        return `<td class="${c}">${s}</td>`;
      })}<td>${course.totalStrokes}</td></tr>`;
    let best = null;
    try { best = JSON.parse(store.get("gdgolf-best") || "null"); } catch { best = null; }
    if (!best || d < best.diff) {
      store.set("gdgolf-best", JSON.stringify({ diff: d, seed: course.seedStr }));
      $("bestLine").textContent = best ? `New personal best (was ${relPar(best.diff)}).` : "First course in the books.";
    } else {
      $("bestLine").textContent = `Personal best: ${relPar(best.diff)} on course ${best.seed}.`;
    }
    $("endOverlay").classList.remove("hidden");
  }

  // --- input --------------------------------------------------------------------------------
  function start() {
    if (playing) return;
    playing = true;
    audio();
    $("titleOverlay").classList.add("hidden");
    updateHud();
  }
  $("startBtn").addEventListener("click", start);
  $("shoot").addEventListener("click", shoot);
  $("nextBtn").addEventListener("click", next);
  $("newBtn").addEventListener("click", () => newCourse(E.randomSeed()));
  $("replayBtn").addEventListener("click", () => newCourse(course.seedStr));
  $("newCourseBtn").addEventListener("click", () => newCourse(E.randomSeed()));
  $("restartBtn").addEventListener("click", restartHole);
  $("copyBtn").addEventListener("click", async () => {
    const url = location.href.split("#")[0] + `#seed=${course.seedStr}`;
    try { await navigator.clipboard.writeText(url); $("copyBtn").textContent = "copied ✓"; }
    catch { $("copyBtn").textContent = "copy failed"; }
    setTimeout(() => ($("copyBtn").textContent = "copy link"), 1400);
  });
  for (const b of document.querySelectorAll(".opt")) b.addEventListener("click", () => setOpt(b.dataset.opt));
  $("lr").addEventListener("input", (e) => setLrFromSlider(Number(e.target.value)));
  $("beta").addEventListener("input", (e) => { cfg.beta = Number(e.target.value) / 100; syncControls(); });
  const muteBtn = $("muteBtn");
  function syncMute() { muteBtn.textContent = muted ? "🔇" : "🔊"; muteBtn.setAttribute("aria-pressed", String(muted)); }
  muteBtn.addEventListener("click", () => { muted = !muted; store.set("gdgolf-mute", muted ? "1" : "0"); syncMute(); });

  function restartHole() {
    if (anim || !course || course.done) return;
    course.restartHole();
    loadHole();
  }

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    hover = toWorld(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * W);
  });
  canvas.addEventListener("pointerleave", () => (hover = null));

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!playing) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); start(); }
      return;
    }
    const tag = (e.target && e.target.tagName) || "";
    const onSlider = tag === "INPUT";
    switch (e.key) {
      case " ":
        e.preventDefault(); shoot(); break;
      case "Enter":
        if (!$("endOverlay").classList.contains("hidden")) newCourse(E.randomSeed());
        else if (course.done) { e.preventDefault(); next(); }
        break;
      case "1": setOpt("gd"); break;
      case "2": setOpt("momentum"); break;
      case "3": setOpt("adam"); break;
      case "ArrowLeft": case "ArrowRight": {
        if (onSlider) return;          // let the focused slider handle it
        e.preventDefault();
        const v = Number($("lr").value) + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 25 : 5);
        setLrFromSlider(v);
        break;
      }
      case "ArrowUp": case "ArrowDown": {
        if (onSlider || cfg.opt !== "momentum") return;
        e.preventDefault();
        cfg.beta = Math.max(0, Math.min(0.99, Math.round((cfg.beta + (e.key === "ArrowUp" ? 0.01 : -0.01)) * 100) / 100));
        syncControls();
        break;
      }
      case "r": case "R": restartHole(); break;
      case "n": case "N": newCourse(E.randomSeed()); break;
      case "m": case "M": muteBtn.click(); break;
    }
  });

  // --- boot -----------------------------------------------------------------------------------
  const m = /seed=([a-z0-9]{1,12})/i.exec(location.hash);
  syncMute();
  syncControls();
  newCourse(m ? m[1].toLowerCase() : E.randomSeed());
  requestAnimationFrame(frame);
})();
