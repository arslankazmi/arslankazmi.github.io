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

  // --- the ninja ------------------------------------------------------------------------------
  /**
   * Upright pose centred on the body: facing +x (the gap), the wall at x ≈ −11.
   * Running = feet alternately planted on the wall while climbing; tuck = mid-jump.
   */
  function ninjaPose(run, tuck, slashing) {
    const s = Math.sin(run), c = Math.cos(run);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // headband tails stream down behind a climber
    const wave = Math.sin(clock * 18) * 2;
    ctx.strokeStyle = "#e0392d"; ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-4, -15); ctx.quadraticCurveTo(-10 + wave, -6, -8 - wave, 6);
    ctx.moveTo(-4, -14); ctx.quadraticCurveTo(-5 - wave, -4, -2 + wave, 4);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = "rgba(150,180,255,0.95)"; ctx.shadowBlur = 5;   // rim light against the night
    // sword across the back, hilt over the shoulder
    if (!slashing) {
      ctx.strokeStyle = "#6b7190"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(-2, -14); ctx.stroke();
      ctx.strokeStyle = "#c39a4f"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-2, -14); ctx.lineTo(-1, -19); ctx.stroke();
    }
    ctx.strokeStyle = "#0b0b10"; ctx.fillStyle = "#0b0b10";
    // legs: hip (−1, 4)
    ctx.lineWidth = 4.4;
    if (tuck) {
      ctx.beginPath(); ctx.moveTo(-1, 4); ctx.lineTo(6, 7); ctx.lineTo(2, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-1, 4); ctx.lineTo(4, 2); ctx.lineTo(0, 9); ctx.stroke();
    } else {
      for (const k of [1, -1]) {
        const fy = 8 + 8 * s * k, planted = s * k > 0;
        const fx = planted ? -11 : -6;
        ctx.beginPath(); ctx.moveTo(-1, 4); ctx.lineTo(3, 6 + 5 * s * k); ctx.lineTo(fx, fy); ctx.stroke();
      }
    }
    // torso
    ctx.lineWidth = 8.5;
    ctx.beginPath(); ctx.moveTo(-1, 4); ctx.lineTo(1, -8); ctx.stroke();
    // arms: shoulder (1, −6)
    ctx.lineWidth = 3.4;
    if (slashing) {
      ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(8, -12); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#eef3ff"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(26, -30); ctx.stroke();
      ctx.save();
    } else if (tuck) {
      ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(7, -2); ctx.lineTo(4, 3); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(6, -2 + 5 * c); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(-4, -2 - 5 * c); ctx.stroke();
    }
    // head, band, eye slit toward the gap
    ctx.fillStyle = "#0b0b10";
    ctx.beginPath(); ctx.arc(2, -14, 6.4, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#e0392d"; ctx.fillRect(-4.5, -17, 13, 3);
    ctx.fillStyle = "#f4e7d6"; ctx.fillRect(3.5, -14, 5, 1.7);
  }

  function drawNinja(g) {
    const n = g.ninja;
    if (g.inv > 0 && Math.floor(clock / 0.08) % 2 === 0 && mode === "play") ctx.globalAlpha = 0.35;
    const slashing = g.slashT > 0, run = clock * g.speed * 0.045;
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.scale(1.15, 1.15);
    if (n.jumping) {
      const p = Math.min(1, n.jt / E.JUMP_T), dir = n.from === "L" ? 1 : -1;
      ctx.scale(dir, 1);
      ctx.rotate(p * Math.PI * 2);
      ninjaPose(0, true, slashing);
    } else {
      if (n.side === "R") ctx.scale(-1, 1);
      ninjaPose(run, false, slashing);
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
  const dashCut = (w, h) => {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-w / 2 - 2, h / 2 + 2); ctx.lineTo(w / 2 + 2, -h / 2 - 2); ctx.stroke();
    ctx.restore();
  };
  const warn = (path) => {
    ctx.save();
    ctx.shadowColor = "rgba(255,60,50,0.9)";
    ctx.shadowBlur = 8 + 4 * Math.sin(clock * 8);
    ctx.strokeStyle = "rgba(255,90,80,0.95)"; ctx.lineWidth = 1.6;
    path(); ctx.stroke();
    ctx.restore();
  };
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  const DRAW = {
    coin(o) {
      const sq = Math.abs(Math.cos(clock * 3 + o.phase));
      ctx.save();
      ctx.shadowColor = "rgba(255,200,60,0.8)"; ctx.shadowBlur = 10;
      ctx.fillStyle = "#f5c242";
      ctx.beginPath(); ctx.ellipse(0, 0, 8 * (0.35 + 0.65 * sq), 8, 0, 0, 7); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "#b9861d"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 5 * (0.35 + 0.65 * sq), 5, 0, 0, 7); ctx.stroke();
    },
    onigiri() {
      ctx.save();
      ctx.shadowColor = "rgba(255,230,140,0.9)"; ctx.shadowBlur = 12;
      ctx.fillStyle = "#fbfaf4";
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(13, 8, 9, 10); ctx.lineTo(-9, 10); ctx.quadraticCurveTo(-13, 8, 0, -11); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#1d3b2a"; ctx.fillRect(-5, 2, 10, 8);
    },
    spikes(o, dir) {
      ctx.fillStyle = "#6b7184"; ctx.fillRect(-11 * dir, -15, 5 * dir, 30);
      const path = () => {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const y = -15 + i * 10;
          ctx.moveTo(-6 * dir, y); ctx.lineTo(11 * dir, y + 5); ctx.lineTo(-6 * dir, y + 10);
        }
      };
      ctx.fillStyle = "#c3c9d6"; path(); ctx.fill();
      warn(path);
    },
    ac(o, dir) {
      ctx.fillStyle = "#8d93a3"; rr(-15, -13, 30, 26, 3); ctx.fill();
      ctx.fillStyle = "#4b5061";
      ctx.beginPath(); ctx.arc(2 * dir, 0, 8.5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#9aa0b0"; ctx.lineWidth = 1.2;
      const a = clock * 20;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(2 * dir, 0); ctx.lineTo(2 * dir + Math.cos(a + i * 2.1) * 7, Math.sin(a + i * 2.1) * 7); ctx.stroke(); }
      warn(() => rr(-15, -13, 30, 26, 3));
    },
    pot() {
      ctx.fillStyle = "#3f8f4e";
      ctx.beginPath(); ctx.ellipse(-4, -10, 5, 7, -0.5, 0, 7); ctx.ellipse(4, -11, 5, 7, 0.5, 0, 7); ctx.fill();
      const path = () => { ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(10, -4); ctx.lineTo(7, 11); ctx.lineTo(-7, 11); ctx.closePath(); };
      ctx.fillStyle = "#c0643a"; path(); ctx.fill();
      ctx.fillStyle = "#a24f2b"; ctx.fillRect(-10, -4, 20, 4);
      warn(path);
    },
    block() {
      ctx.fillStyle = "#8a8f99"; rr(-12, -10, 24, 20, 2); ctx.fill();
      ctx.fillStyle = "#5e636d"; ctx.fillRect(-8, -5, 6, 10); ctx.fillRect(2, -5, 6, 10);
      warn(() => rr(-12, -10, 24, 20, 2));
    },
    plank(o, dir) {
      ctx.fillStyle = "#a8743f"; ctx.fillRect(-23, -6, 46, 12);
      ctx.strokeStyle = "#7c5229"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-20, -2); ctx.lineTo(18, -2); ctx.moveTo(-16, 2.5); ctx.lineTo(20, 2.5); ctx.stroke();
      ctx.fillStyle = "#565b66"; ctx.fillRect(-23 * dir - (dir > 0 ? 0 : 3), -7, 3, 14);
      dashCut(46, 12);
    },
    lantern() {
      ctx.strokeStyle = "#2c2c33"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -13); ctx.stroke();
      ctx.save(); ctx.shadowColor = "rgba(255,90,60,0.7)"; ctx.shadowBlur = 10;
      ctx.fillStyle = "#d8402f"; ctx.beginPath(); ctx.ellipse(0, 1, 10, 13, 0, 0, 7); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,200,150,0.6)"; ctx.lineWidth = 1;
      for (const y of [-7, 1, 9]) { ctx.beginPath(); ctx.ellipse(0, y, 9.5, 2, 0, 0, Math.PI); ctx.stroke(); }
      ctx.fillStyle = "#2c2c33"; ctx.fillRect(-5, -14, 10, 3); ctx.fillRect(-5, 13, 10, 3);
      dashCut(20, 28);
    },
    crate() {
      ctx.fillStyle = "#b4834a"; ctx.fillRect(-13, -13, 26, 26);
      ctx.strokeStyle = "#7c5229"; ctx.lineWidth = 2.2;
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(12, 12); ctx.stroke();
      dashCut(26, 26);
    },
    melon() {
      ctx.fillStyle = "#2f7d3c"; ctx.beginPath(); ctx.ellipse(0, 0, 12, 11, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#174d22"; ctx.lineWidth = 2;
      for (const k of [-6, 0, 6]) { ctx.beginPath(); ctx.ellipse(k, 0, 2.5, 10.5, 0, 0, 7); ctx.stroke(); }
      dashCut(24, 22);
    },
  };
  function drawObject(o) {
    ctx.save();
    const bob = o.kind === "collect" ? Math.sin(clock * 4 + o.phase) * 2 : 0;
    const spin = o.lane === "air" && o.kind !== "collect" ? Math.sin(clock * 3 + o.phase) * 0.25 : 0;
    ctx.translate(o.x, o.y + bob);
    if (spin) ctx.rotate(spin);
    DRAW[o.type](o, o.side === "R" ? -1 : 1);
    ctx.restore();
  }

  // --- particles ---------------------------------------------------------------------------------
  const PALETTE = {
    plank: ["#a8743f", "#7c5229", "#d9a46a"], crate: ["#b4834a", "#7c5229", "#e0b47a"],
    lantern: ["#d8402f", "#ffb38a", "#2c2c33"], melon: ["#e2434b", "#2f7d3c", "#ffd3d6"],
  };
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
    ctx.fillStyle = full ? "#ff5a4f" : "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.bezierCurveTo(x - 9, y - 2, x - 5, y - 9, x, y - 4);
    ctx.bezierCurveTo(x + 5, y - 9, x + 9, y - 2, x, y + 5);
    ctx.fill();
  }
  function drawHud(g) {
    const grd = ctx.createLinearGradient(0, 0, 0, 70);
    grd.addColorStop(0, "rgba(5,7,16,0.75)"); grd.addColorStop(1, "rgba(5,7,16,0)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, 70);
    for (let i = 0; i < E.MAX_HEARTS; i++) heart(18 + i * 20, 24, i < g.hearts);
    ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`${g.meters} m`, W / 2, 32);
    ctx.font = "11px ui-monospace, monospace"; ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(`score ${g.score}`, W / 2, 48);
    ctx.textAlign = "right"; ctx.fillStyle = "#f5c242";
    ctx.font = "700 15px ui-monospace, monospace";
    ctx.fillText(`${g.coins}`, W - 14, 29);
    ctx.beginPath(); ctx.arc(W - 14 - ctx.measureText(`${g.coins}`).width - 10, 24, 6, 0, 7); ctx.fill();
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

  // --- legend thumbnails on the title card (drawn with the same art) --------------------------------------------
  for (const cv of document.querySelectorAll("canvas[data-legend]")) {
    const lc = cv.getContext("2d"), kind = cv.dataset.legend;
    const sets = { collect: [["coin", 26], ["onigiri", 58]], avoid: [["spikes", 22], ["pot", 60]], cut: [["lantern", 26], ["melon", 60]] };
    lc.scale(2, 2);
    for (const [type, x] of sets[kind]) {
      lc.save(); lc.translate(x, 22);
      // borrow the main renderer's drawing code by pointing it at this context
      const o = { type, side: "L", phase: 0, kind: E.TYPES[type].kind };
      drawWith(lc, () => DRAW[type](o, 1));
      lc.restore();
    }
  }
  function drawWith(c, fn) { ctx = c; try { fn(); } finally { ctx = mainCtx; } }

  syncMute();
  syncBest();
  requestAnimationFrame(loop);
})();
