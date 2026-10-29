/* ============================================================================
   main.js — Ninja Ascent: canvas render, input, audio, overlays.
   All game rules live in engine.js (globalThis.NinjaEngine).
   ============================================================================ */
(function () {
  "use strict";
  const E = globalThis.NinjaEngine;
  const { W, H, WALL_L, WALL_R, NINJA_Y, DT } = E;
  const $ = (id) => document.getElementById(id);

  const canvas = $("play");
  const mainCtx = canvas.getContext("2d");
  let ctx = mainCtx;            // swapped briefly to draw the title-card legend
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * DPR;
  canvas.height = H * DPR;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };

  // --- state ------------------------------------------------------------------
  let game = new E.Game(Date.now() >>> 0);
  let mode = "title";          // title | play | paused | over
  let particles = [];
  let shake = 0;
  let slashFx = null;          // { t, side, x, y }
  let clock = 0;               // render time, s
  let best = Number(store.get("ninja-best") || 0) || 0;

  // --- audio (synthesized) ----------------------------------------------------------
  let ac = null, noiseBuf = null;
  let muted = store.get("ninja-mute") === "1";
  function audio() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; }
      if (ac) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
    }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, dur, { type = "sine", gain = 0.05, to = null, delay = 0 } = {}) {
    const a = !muted && audio();
    if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { from = 800, to = 2000, q = 1.2, gain = 0.08, type = "bandpass" } = {}) {
    const a = !muted && audio();
    if (!a) return;
    const t = a.currentTime, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }
  const sfx = {
    jump() { noise(0.16, { from: 400, to: 1400, gain: 0.07 }); },
    slash() { noise(0.12, { from: 2500, to: 7000, q: 0.8, gain: 0.09, type: "highpass" }); },
    cut() { tone(190, 0.12, { type: "triangle", gain: 0.1, to: 90 }); noise(0.06, { from: 3000, to: 1500, gain: 0.06 }); },
    coin() { tone(1320, 0.07, { gain: 0.05 }); tone(1760, 0.12, { gain: 0.05, delay: 0.06 }); },
    heal() { [660, 880, 1100].forEach((f, i) => tone(f, 0.14, { type: "triangle", gain: 0.05, delay: i * 0.07 })); },
    hit() { tone(95, 0.25, { type: "sawtooth", gain: 0.07, to: 45 }); noise(0.18, { from: 600, to: 200, gain: 0.1 }); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, { type: "triangle", gain: 0.06, delay: i * 0.14 })); },
  };

  // --- deterministic decoration -------------------------------------------------------
  function hash3(a, b, c) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const STARS = Array.from({ length: 60 }, (_, i) => [hash3(i, 1, 9) * W, hash3(i, 2, 9) * H * 0.7, 0.4 + hash3(i, 3, 9) * 1.1]);
  const FAR = [
    { f: 0.12, color: "#141a35", win: "rgba(255, 214, 140, 0.35)", towers: [[62, 46], [118, 38], [170, 52], [232, 44], [272, 34]] },
    { f: 0.3, color: "#1b2142", win: "rgba(255, 214, 140, 0.55)", towers: [[80, 32], [134, 26], [272, 30]] },
  ];

  // --- background --------------------------------------------------------------------------
  function drawSky(dist) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#070a1a");
    g.addColorStop(1, "#1d2346");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, r] of STARS) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(clock * 1.3 + x)})`;
      ctx.fillRect(x, y, r, r);
    }
    FAR.forEach((L, li) => {
      if (li === 1) drawMoon();
      const off = dist * L.f;
      for (const [x, w] of L.towers) {
        ctx.fillStyle = L.color;
        ctx.fillRect(x - w / 2, 0, w, H);
        const step = 14, r0 = Math.floor((off - H) / step), r1 = Math.ceil((off + 20) / step);
        ctx.fillStyle = L.win;
        for (let r = r0; r <= r1; r++) {
          const y = off - r * step;
          for (let c = 0; c < Math.floor(w / 9); c++) {
            if (hash3(r, c, x) < 0.22) ctx.fillRect(x - w / 2 + 4 + c * 9, y, 3, 4);
          }
        }
      }
    });
    // haze between the near towers
    const hz = ctx.createLinearGradient(0, 0, 0, H);
    hz.addColorStop(0, "rgba(40,50,100,0)");
    hz.addColorStop(1, "rgba(40,50,100,0.35)");
    ctx.fillStyle = hz;
    ctx.fillRect(WALL_L, 0, WALL_R - WALL_L, H);
  }

  function drawMoon() {
    const mg = ctx.createRadialGradient(200, 96, 10, 200, 96, 80);
    mg.addColorStop(0, "rgba(255,240,210,0.35)");
    mg.addColorStop(1, "rgba(255,240,210,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(110, 10, 180, 180);
    ctx.fillStyle = "#f6ecd2";
    ctx.beginPath(); ctx.arc(200, 96, 26, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(200,190,160,0.35)";
    ctx.beginPath(); ctx.arc(192, 90, 5, 0, 7); ctx.arc(208, 104, 3.5, 0, 7); ctx.fill();

  }

  function drawBuilding(side, dist) {
    const x0 = side === "L" ? 0 : WALL_R, w = side === "L" ? WALL_L : W - WALL_R;
    ctx.fillStyle = "#1a1e30";
    ctx.fillRect(x0, 0, w, H);
    const step = 40, r0 = Math.floor((dist - H) / step) - 1, r1 = Math.ceil((dist + 40) / step);
    const sid = side === "L" ? 1 : 2;
    for (let r = r0; r <= r1; r++) {
      const y = dist - r * step;
      // floor ledge on the inner face
      ctx.fillStyle = "#2b3048";
      ctx.fillRect(side === "L" ? WALL_L - 8 : WALL_R, y + 34, 8, 3);
      for (let c = 0; c < 2; c++) {
        const wx = x0 + 9 + c * 21, lit = hash3(r, c, sid) < 0.32;
        ctx.fillStyle = lit ? "#f2c66d" : "#262b42";
        ctx.fillRect(wx, y + 8, 13, 20);
        if (lit) { ctx.fillStyle = "rgba(255,210,120,0.18)"; ctx.fillRect(wx - 3, y + 5, 19, 26); }
      }
    }
    // the face the ninja runs on: a lit edge
    const fx = side === "L" ? WALL_L - 3 : WALL_R;
    ctx.fillStyle = "#4a5276";
    ctx.fillRect(fx, 0, 3, H);
  }

  // --- sprites ------------------------------------------------------------------------------
  // Ninja: "Ninja [Animated]" by Morgan McGuire & DezrasDragons (CC0), 32×32 cells, by column.
  // Objects: Kenney "Pixel Platformer" tiles (CC0), 18×18, packed into one strip.
  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const NINJA = img("assets/ninja-morgan3d.png");
  const TILES = img("assets/kenney-objects.png");
  const ready = (i) => i.complete && i.naturalWidth > 0;
  const TILE = { coin: 0, coinEdge: 1, heart: 2, heartEmpty: 3, spikes: 4, pipe: 5, brick: 6, metal: 7, plank: 8, sign: 9, crate: 10, box: 11 };
  const SWORD_ROW = 4;                          // the sheet's sword third starts at row 4
  const COL = { jump: 2, attack: 3, climb: 6 };
  const FRAMES = { jump: 3, attack: 4, climb: 4 };

  /** Draw ninja cell (col, row) at 2×, top-left (x, y), optionally mirrored. */
  function ninjaCell(col, row, x, y, flip) {
    if (!ready(NINJA)) return;
    ctx.save();
    if (flip) { ctx.translate(x + 64, y); ctx.scale(-1, 1); } else ctx.translate(x, y);
    ctx.drawImage(NINJA, col * 32, (SWORD_ROW + row) * 32, 32, 32, 0, 0, 64, 64);
    ctx.restore();
  }

  function drawNinja(g) {
    const n = g.ninja;
    if (g.inv > 0 && Math.floor(clock / 0.08) % 2 === 0 && mode === "play") ctx.globalAlpha = 0.35;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = "rgba(150,180,255,0.8)"; ctx.shadowBlur = 6;   // rim light against the night
    if (n.jumping) {
      const p = Math.min(1, n.jt / E.JUMP_T);
      const f = Math.min(FRAMES.jump - 1, Math.floor(p * FRAMES.jump));
      ninjaCell(COL.jump, f, n.x - 32, n.y - 36, n.from === "R");   // faces the way it's flying
    } else if (g.slashT > 0) {
      const f = Math.min(FRAMES.attack - 1, Math.floor((1 - g.slashT / E.SLASH_T) * FRAMES.attack));
      // standing attack frames face right; body edge (cell x≈8) against the wall
      if (n.side === "L") ninjaCell(COL.attack, f, WALL_L - 16, NINJA_Y - 34, false);
      else ninjaCell(COL.attack, f, WALL_R - 48, NINJA_Y - 34, true);
    } else {
      // climb frames cling to a wall on the right of the cell (x≈26); mirror for the left wall
      const f = Math.floor(clock * (6 + g.speed / 45)) % FRAMES.climb;
      if (n.side === "R") ninjaCell(COL.climb, f, WALL_R - 52, NINJA_Y - 30, false);
      else ninjaCell(COL.climb, f, WALL_L - 12, NINJA_Y - 30, true);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawSlashFx() {
    if (!slashFx) return;
    const a = 1 - slashFx.t / 0.22;
    if (a <= 0) { slashFx = null; return; }
    ctx.save();
    ctx.lineCap = "round";
    const n = game.ninja;
    if (slashFx.side === "air") {
      ctx.strokeStyle = `rgba(235,242,255,${0.8 * a})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(n.x, n.y - 10, 44, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke();
    } else {
      const left = slashFx.side === "L", cx = left ? WALL_L + 10 : WALL_R - 10, cy = NINJA_Y - 30;
      const a0 = left ? -Math.PI * 0.62 : -Math.PI * 0.38, a1 = left ? Math.PI * 0.12 : Math.PI * 0.88;
      for (const [r, wdt, al] of [[62, 7, 0.25], [58, 4, 0.85], [52, 2, 0.6]]) {
        ctx.strokeStyle = `rgba(235,242,255,${al * a})`; ctx.lineWidth = wdt;
        ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, !left); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- objects ----------------------------------------------------------------------------------
  /** Draw a tile at 2×, centred on the current origin. */
  function tile(name, { rot = 0, flip = false, dx = 0, dy = 0 } = {}) {
    if (!ready(TILES)) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(dx, dy);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(TILES, TILE[name] * 18, 0, 18, 18, -18, -18, 36, 36);
    ctx.restore();
  }
  const dashCut = (w, h) => {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-w / 2 - 2, h / 2 + 2); ctx.lineTo(w / 2 + 2, -h / 2 - 2); ctx.stroke();
    ctx.restore();
  };
  /** Glow: gold for collectables, pulsing red for avoidables. */
  function glow(kind) {
    if (kind === "collect") { ctx.shadowColor = "rgba(255,200,60,0.85)"; ctx.shadowBlur = 10; }
    else if (kind === "avoid") { ctx.shadowColor = "rgba(255,60,50,0.95)"; ctx.shadowBlur = 8 + 4 * Math.sin(clock * 8); }
  }

  const DRAW = {
    coin(o) { tile(Math.floor(clock * 7 + o.phase * 3) % 2 ? "coinEdge" : "coin"); },
    heart() { tile("heart"); },
    // spikes are floor spikes: turn them so the base sits on the wall and the points face the gap
    spikes(o, dir) { tile("spikes", { rot: dir * Math.PI / 2, dx: 9 * dir }); },
    pipe(o, dir) { tile("pipe", { flip: dir < 0 }); },
    brick() { tile("brick"); },
    metal() { tile("metal"); },
    plank() { tile("plank", { dy: 8 }); dashCut(36, 18); },
    sign(o, dir) { tile("sign", { rot: dir * Math.PI / 2 }); dashCut(30, 34); },
    crate() { tile("crate"); dashCut(32, 32); },
    box() { tile("box"); dashCut(32, 32); },
  };
  function drawObject(o) {
    ctx.save();
    const bob = o.kind === "collect" ? Math.sin(clock * 4 + o.phase) * 2 : 0;
    const spin = o.lane === "air" && o.kind !== "collect" ? Math.sin(clock * 3 + o.phase) * 0.25 : 0;
    ctx.translate(o.x, o.y + bob);
    if (spin) ctx.rotate(spin);
    glow(o.kind);
    DRAW[o.type](o, o.side === "R" ? -1 : 1);
    ctx.restore();
  }

  // --- particles ---------------------------------------------------------------------------------
  const WOOD = ["#c8834a", "#8a5530", "#e8b07a"];
  const PALETTE = { plank: WOOD, sign: WOOD, crate: WOOD, box: WOOD };
  function burst(x, y, colors, n, speed = 160, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life, max: life, c: colors[i % colors.length], s: 2 + Math.random() * 3 });
    }
  }
  function updateParticles(dt) {
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += (p.vy += 520 * dt) * dt + (mode === "play" ? game.speed * dt * 0.6 : 0); }
    particles = particles.filter((p) => p.life > 0);
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  // --- HUD -------------------------------------------------------------------------------------------
  function heart(x, y, full) {
    ctx.save(); ctx.translate(x, y); ctx.scale(0.6, 0.6); tile(full ? "heart" : "heartEmpty"); ctx.restore();
  }
  function drawHud(g) {
    const grd = ctx.createLinearGradient(0, 0, 0, 70);
    grd.addColorStop(0, "rgba(5,7,16,0.75)"); grd.addColorStop(1, "rgba(5,7,16,0)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, 70);
    for (let i = 0; i < E.MAX_HEARTS; i++) heart(20 + i * 22, 24, i < g.hearts);
    ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`${g.meters} m`, W / 2, 32);
    ctx.font = "11px ui-monospace, monospace"; ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(`score ${g.score}`, W / 2, 48);
    ctx.textAlign = "right"; ctx.fillStyle = "#f5c242";
    ctx.font = "700 15px ui-monospace, monospace";
    ctx.fillText(`${g.coins}`, W - 14, 29);
    ctx.save(); ctx.translate(W - 14 - ctx.measureText(`${g.coins}`).width - 12, 24); ctx.scale(0.55, 0.55); tile("coin"); ctx.restore();
    ctx.textAlign = "left";
  }

  // --- frame -------------------------------------------------------------------------------------------
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    let sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - 0.5) * 10 * shake; sy = (Math.random() - 0.5) * 10 * shake; }
    ctx.translate(sx, sy);
    drawSky(game.dist);
    drawBuilding("L", game.dist);
    drawBuilding("R", game.dist);
    for (const o of game.objects) drawObject(o);
    drawSlashFx();
    drawNinja(game);
    drawParticles();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (mode !== "title") drawHud(game);
  }

  function handleEvents() {
    for (const e of game.events) {
      switch (e.type) {
        case "jump": sfx.jump(); burst(e.x, e.y + 8, ["#9aa3c7", "#c9cfe6"], 5, 70, 0.35); break;
        case "slash": sfx.slash(); slashFx = { t: 0, side: e.side }; break;
        case "cut": sfx.cut(); burst(e.x, e.y, PALETTE[e.obj] || ["#fff"], 14, 190, 0.7); break;
        case "coin": sfx.coin(); burst(e.x, e.y, ["#f5c242", "#fff3c4"], 6, 90, 0.4); break;
        case "heal": sfx.heal(); burst(e.x, e.y, ["#ff5a4f", "#ffffff"], 10, 110, 0.6); break;
        case "hit": sfx.hit(); shake = 1; burst(e.x, e.y, ["#ff5a4f", "#8a8f99", "#c3c9d6"], 12, 170, 0.6); break;
        case "over": sfx.over(); endRun(); break;
      }
    }
    game.events.length = 0;
  }

  let last = performance.now(), acc = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    if (mode === "play") {
      acc += dt;
      while (acc >= DT) { game.step(DT); acc -= DT; if (game.over) break; }
      handleEvents();
    } else if (mode === "title") {
      // idle attract: the world drifts by under the title
      game.dist += 60 * dt;
    }
    if (mode !== "paused") {
      if (slashFx) slashFx.t += dt;
      shake = Math.max(0, shake - dt * 4);
      updateParticles(dt);
    }
    render();
  }

  // --- flow ------------------------------------------------------------------------------------------------
  function start() {
    audio();
    game = new E.Game(Date.now() >>> 0);
    particles = []; slashFx = null; acc = 0;
    mode = "play";
    for (const id of ["titleOverlay", "overOverlay", "pauseOverlay"]) $(id).classList.add("hidden");
  }
  function endRun() {
    mode = "over";
    const s = game.score, isBest = s > best;
    if (isBest) { best = s; store.set("ninja-best", String(best)); }
    $("oMeters").textContent = `${game.meters} m`;
    $("oCoins").textContent = game.coins;
    $("oCuts").textContent = game.cuts;
    $("oScore").textContent = s;
    $("oBest").textContent = isBest ? "New best!" : `Best: ${best}`;
    syncBest();
    setTimeout(() => { if (mode === "over") $("overOverlay").classList.remove("hidden"); }, 650);
  }
  function pause(on) {
    if (on && mode === "play") { mode = "paused"; $("pauseOverlay").classList.remove("hidden"); }
    else if (!on && mode === "paused") { mode = "play"; last = performance.now(); $("pauseOverlay").classList.add("hidden"); }
  }
  function syncBest() { $("sideBest").textContent = best ? `${best} points` : "—"; }

  // --- input ------------------------------------------------------------------------------------------------
  function doJump() {
    if (mode === "play") game.jump();
    else if (mode === "title" || (mode === "over" && !$("overOverlay").classList.contains("hidden"))) start();
    else if (mode === "paused") pause(false);
  }
  function doSlash() { if (mode === "play") game.slash(); else if (mode === "paused") pause(false); }

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "arrowup" || k === "w") { e.preventDefault(); doJump(); }
    else if (k === "j" || k === "k" || k === "x") doSlash();
    else if (k === "p") pause(mode === "play");
    else if (k === "m") muteBtn.click();
  });
  function pad(el, fn) {
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.classList.add("down"); fn(); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, () => el.classList.remove("down"));
  }
  pad($("jumpPad"), doJump);
  pad($("slashPad"), doSlash);
  $("startBtn").addEventListener("click", start);
  $("againBtn").addEventListener("click", start);
  $("pauseOverlay").addEventListener("pointerdown", () => pause(false));
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(true); });
  window.addEventListener("blur", () => pause(true));

  const muteBtn = $("muteBtn");
  function syncMute() { muteBtn.textContent = muted ? "🔇" : "🔊"; muteBtn.setAttribute("aria-pressed", String(muted)); }
  muteBtn.addEventListener("click", () => { muted = !muted; store.set("ninja-mute", muted ? "1" : "0"); syncMute(); });

  // --- legend thumbnails on the title card (drawn with the same sprites) ------------------------------------------
  function drawLegends() {
    for (const cv of document.querySelectorAll("canvas[data-legend]")) {
      const lc = cv.getContext("2d"), kind = cv.dataset.legend;
      const sets = { collect: [["coin", 24], ["heart", 60]], avoid: [["spikes", 22], ["metal", 60]], cut: [["crate", 24], ["sign", 62]] };
      lc.setTransform(2, 0, 0, 2, 0, 0);
      lc.clearRect(0, 0, 84, 44);
      for (const [type, x] of sets[kind]) {
        lc.save(); lc.translate(x, 22); lc.scale(0.85, 0.85);
        const o = { type, side: "L", phase: 0, kind: E.TYPES[type].kind };
        drawWith(lc, () => { glow(o.kind); DRAW[type](o, 1); });
        lc.restore();
      }
    }
  }
  function drawWith(c, fn) { ctx = c; try { fn(); } finally { ctx = mainCtx; } }
  if (ready(TILES)) drawLegends(); else TILES.addEventListener("load", drawLegends);

  syncMute();
  syncBest();
  requestAnimationFrame(loop);
})();
