/* ============================================================================
   main.js — browser frontend for Tritris: canvas renderer (animated rotating-T
   + zoomed single-arm view + minimap), keyboard + touch input, WebAudio chiptune,
   and the game loop. Depends on engine.js (window.TritrisEngine).

   Rendering: the board is drawn in the canonical frame inside one canvas transform
   (translate to the junction-center pivot, rotate by the animated display angle,
   scale to cells). The active piece + ghost are drawn at the *target* angle so they
   hold their screen position in the down-well while the board sweeps during a turn.
   Canvas rotation theta = -displayAngle (rad): see engine.rotate_cell for why.
   ============================================================================ */
(function () {
  "use strict";
  const E = window.TritrisEngine;
  const { C, G, PIECE_COLORS, COLOR, ROTATIONS } = E;
  const DEG = Math.PI / 180;
  const [CX, CY] = C.CENTER;

  // --- elements -------------------------------------------------------------
  const canvas = document.getElementById("play");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("next");
  const nextCtx = nextCanvas.getContext("2d");
  const elScore = document.getElementById("score");
  const elLevel = document.getElementById("level");
  const elLines = document.getElementById("lines");
  const elTitle = document.getElementById("titleOverlay");
  const elOver = document.getElementById("overOverlay");
  const elFinal = document.getElementById("finalScore");
  const elPause = document.getElementById("pauseOverlay");
  const elMute = document.getElementById("muteBtn");
  const elView = document.getElementById("viewBtn");

  const VIEW = { FULL: "full", ZOOMED: "zoomed" };

  const game = new E.Game();
  let scene = "title";                 // "title" -> "play"
  let view = VIEW.FULL;
  let showMinimap = false;
  let softHeld = false;

  const boardbox = document.querySelector(".boardbox");
  // The two views want different canvas shapes: FULL needs a square (the rotating T
  // spans ~52 cells each way); ZOOMED wants a tall portrait so one 10x30 arm fills the
  // frame edge-to-edge at ~pygame's 24px cell instead of sitting as a narrow strip.
  function applyViewLayout() {
    if (view === VIEW.ZOOMED) {
      canvas.width = 264; canvas.height = 720;      // 11:30 — the arm fills the width
      boardbox.classList.add("zoomed");
    } else {
      canvas.width = 720; canvas.height = 720;
      boardbox.classList.remove("zoomed");
    }
  }

  // --- rotation animation (port of main.py RotationAnim) --------------------
  function shortestDelta(from, to) {
    let d = to - from;
    while (d <= -180) d += 360;
    while (d > 180) d -= 360;
    return d;
  }
  const anim = {
    angle: 0, _start: 0, _delta: 0, _t0: 0, _active: false,
    startTo(target, now) {
      this._start = this.angle;
      this._delta = shortestDelta(this.angle, target);
      this._t0 = now;
      this._active = this._delta !== 0;
    },
    update(now) {
      if (!this._active) return;
      let t = (now - this._t0) / C.ROTATE_ANIM_MS;
      if (t >= 1) { this.angle = this._start + this._delta; this._active = false; }
      else { t = t * t * (3 - 2 * t); this.angle = this._start + this._delta * t; }  // smoothstep
    },
  };
  function syncAnim() { anim.startTo(G.DISPLAY_ANGLE[game.board.orientation], performance.now()); }

  // --- sound (WebAudio port of engine's SFX table) --------------------------
  const WAVE = { sq: "square", tri: "triangle", sin: "sine" };
  const SFX = {
    move: [[440, 22, "sq", 0.22]],
    rotate: [[620, 22, "sq", 0.22]],
    lock: [[150, 55, "sq", 0.33]],
    turn: [[300, 45, "tri", 0.28], [600, 55, "tri", 0.28]],
    clear: [[523, 55, "sq", 0.30], [659, 55, "sq", 0.30], [784, 80, "sq", 0.30]],
    tetris: [[523, 55, "sq", 0.33], [659, 55, "sq", 0.33], [784, 55, "sq", 0.33], [1047, 130, "sq", 0.33]],
    levelup: [[659, 55, "sq", 0.30], [988, 55, "sq", 0.30], [1319, 130, "sq", 0.30]],
    gameover: [[392, 130, "tri", 0.32], [311, 130, "tri", 0.32], [233, 320, "tri", 0.32]],
  };
  const sound = {
    ctx: null, master: null, muted: false,
    ensure() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    },
    play(name) {
      if (this.muted) return;
      this.ensure();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const segs = SFX[name];
      if (!segs) return;
      let t = this.ctx.currentTime + 0.001;
      for (const [freq, ms, wave, vol] of segs) {
        const dur = ms / 1000;
        if (freq > 0) {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = WAVE[wave] || "square";
          osc.frequency.value = freq;
          g.gain.setValueAtTime(vol, t);
          g.gain.linearRampToValueAtTime(0.0001, t + dur);   // linear decay, like the Python envelope
          osc.connect(g); g.connect(this.master);
          osc.start(t); osc.stop(t + dur);
        }
        t += dur;
      }
    },
    toggleMute() {
      this.muted = !this.muted;
      elMute.textContent = this.muted ? "🔇" : "🔊";
      elMute.setAttribute("aria-pressed", String(this.muted));
      return this.muted;
    },
  };

  // --- drawing helpers ------------------------------------------------------
  function roundRectPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Establish the canonical->screen transform for a given view + angle.
  // After this, 1 unit == 1 cell and canonical cell (x,y) draws at rect(x,y,1,1).
  function setBoardTransform(g, angleDeg, s, pivotX, pivotY) {
    g.translate(pivotX, pivotY);
    g.rotate(-angleDeg * DEG);
    g.scale(s, s);
    g.translate(-CX, -CY);
  }

  function drawCell(g, x, y, color) {
    g.fillStyle = color;
    g.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.fillRect(x + 0.04, y + 0.04, 0.92, 0.22);           // top highlight
  }

  function drawWellsAndLocked(g) {
    const rects = [
      [C.RECT_LEFT, COLOR.well], [C.RECT_RIGHT, COLOR.well],
      [C.RECT_STEM, COLOR.well], [C.RECT_JUNCTION, COLOR.junction],
    ];
    for (const [r, col] of rects) {
      g.fillStyle = col;
      g.fillRect(r[0], r[2], r[1] - r[0], r[3] - r[2]);
    }
    // grid lines
    g.strokeStyle = COLOR.grid;
    g.lineWidth = 0.03;
    for (const r of [C.RECT_LEFT, C.RECT_RIGHT, C.RECT_STEM, C.RECT_JUNCTION]) {
      for (let x = r[0]; x <= r[1]; x++) { g.beginPath(); g.moveTo(x, r[2]); g.lineTo(x, r[3]); g.stroke(); }
      for (let y = r[2]; y <= r[3]; y++) { g.beginPath(); g.moveTo(r[0], y); g.lineTo(r[1], y); g.stroke(); }
    }
    for (const [k, color] of game.board.locked) {
      const [x, y] = k.split(",").map(Number);
      drawCell(g, x, y, color);
    }
  }

  function drawPieceLayer(g) {
    if (!game.piece) return;
    const color = PIECE_COLORS[game.piece.name];
    // ghost
    const dist = game.board.drop_distance(game.piece);
    const [gdx, gdy] = game.board.gravity_delta();
    if (dist > 0) {
      g.strokeStyle = COLOR.ghost;
      g.lineWidth = 0.08;
      for (const [x, y] of game.piece.cells()) {
        g.strokeRect(x + gdx * dist + 0.1, y + gdy * dist + 0.1, 0.8, 0.8);
      }
    }
    for (const [x, y] of game.piece.cells()) drawCell(g, x, y, color);
  }

  // Outer corners of the T silhouette (bar rect 0..50 x 0..10, stem rect 20..30 x 10..30),
  // in canonical cell coords — used to frame the full view tightly per orientation.
  const T_CORNERS = [[0, 0], [50, 0], [50, 10], [0, 10], [20, 10], [30, 10], [30, 30], [20, 30]];

  // Render one board instance into a screen rectangle with an optional clip.
  function renderInstance(mode, rx, ry, rw, rh) {
    let s, pivotX, pivotY;
    if (mode === VIEW.FULL) {
      // Fit the T's *rotated* bounding box into the box so it fills the frame in whatever
      // orientation it's in (instead of a small shape floating in a big square, centered on
      // the junction). Recomputed from the animated angle each frame, so it stays framed
      // as the field turns. Board + piece share this frame, so the piece holds position.
      const th = -anim.angle * DEG, cos = Math.cos(th), sin = Math.sin(th);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [px, py] of T_CORNERS) {
        const dx = px - CX, dy = py - CY;
        const ux = dx * cos - dy * sin, uy = dx * sin + dy * cos;
        if (ux < minX) minX = ux; if (ux > maxX) maxX = ux;
        if (uy < minY) minY = uy; if (uy > maxY) maxY = uy;
      }
      const pad = Math.min(rw, rh) * 0.02;
      s = Math.min((rw - 2 * pad) / (maxX - minX), (rh - 2 * pad) / (maxY - minY));
      pivotX = rx + rw / 2 - ((minX + maxX) / 2) * s;
      pivotY = ry + rh / 2 - ((minY + maxY) / 2) * s;
    } else {                                     // ZOOMED: the down-well (10x30) fills the frame at ~pygame's 24px cell
      s = Math.min(rw / 10.3, rh / 30.4);
      pivotX = rx + rw / 2; pivotY = ry + 5.2 * s;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    // board (sweeps at the animated angle)
    ctx.save();
    setBoardTransform(ctx, anim.angle, s, pivotX, pivotY);
    drawWellsAndLocked(ctx);
    ctx.restore();
    // active piece + ghost (held at the target angle so they stay in the well)
    ctx.save();
    setBoardTransform(ctx, G.DISPLAY_ANGLE[game.board.orientation], s, pivotX, pivotY);
    drawPieceLayer(ctx);
    ctx.restore();
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height;
    renderInstance(view, 0, 0, W, H);
    if (view === VIEW.ZOOMED && showMinimap) {
      const m = Math.round(Math.min(W, H) * 0.26);
      const pad = 10;
      ctx.save();
      ctx.fillStyle = "rgba(8,10,14,0.82)";
      roundRectPath(ctx, W - m - pad, pad, m, m, 8);
      ctx.fill();
      ctx.strokeStyle = COLOR.frame; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      renderInstance(VIEW.FULL, W - m - pad, pad, m, m);
    }
  }

  // Next-piece preview.
  function renderNext() {
    const g = nextCtx, w = nextCanvas.width, h = nextCanvas.height;
    g.fillStyle = COLOR.well;
    g.clearRect(0, 0, w, h);
    roundRectPath(g, 0, 0, w, h, 8); g.fillStyle = COLOR.well; g.fill();
    const name = game.next_name;
    if (!name) return;
    const [n, states] = ROTATIONS[name];
    const cells = states[0];
    const s = Math.min(w, h) / 5;
    const minx = Math.min(...cells.map(c => c[0])), maxx = Math.max(...cells.map(c => c[0]));
    const miny = Math.min(...cells.map(c => c[1])), maxy = Math.max(...cells.map(c => c[1]));
    const ox = (w - (maxx - minx + 1) * s) / 2 - minx * s;
    const oy = (h - (maxy - miny + 1) * s) / 2 - miny * s;
    g.save(); g.translate(ox, oy); g.scale(s, s);
    for (const [cx, cy] of cells) drawCell(g, cx, cy, PIECE_COLORS[name]);
    g.restore();
  }

  function updateHUD() {
    elScore.textContent = game.score;
    elLevel.textContent = game.level;
    elLines.textContent = game.lines;
    renderNext();
  }

  // --- input ----------------------------------------------------------------
  function shiftHeld(e) { return e.shiftKey; }

  function doTurn(step) {
    const before = game.board.orientation;
    game.rotate_field(step);
    if (game.board.orientation !== before) anim.startTo(G.DISPLAY_ANGLE[game.board.orientation], performance.now());
  }

  const KEY_ACTION = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "rotate", KeyW: "rotate",
    ArrowDown: "soft", KeyS: "soft",
    Space: "hard",
    KeyV: "view", Tab: "minimap", KeyM: "mute", KeyP: "pause", KeyR: "restart",
  };

  function startGame() {
    scene = "play";
    elTitle.classList.add("hidden");
    game.reset();
    syncAnim();
    softHeld = false;
  }

  function restart() {
    game.reset();
    elOver.classList.add("hidden");
    scene = "play";
    syncAnim();
  }

  function onKeyDown(e) {
    sound.ensure();
    if (scene === "title") {
      if (e.code === "Escape") return;
      e.preventDefault();
      startGame();
      return;
    }
    const action = KEY_ACTION[e.code];
    if (!action) return;
    e.preventDefault();

    if ((action === "left" || action === "right") && shiftHeld(e)) {
      doTurn(action === "left" ? -1 : +1);
      return;
    }
    switch (action) {
      case "left": game.move_left(); break;
      case "right": game.move_right(); break;
      case "rotate": game.rotate_piece(); break;
      case "soft": softHeld = true; game.soft_drop(); break;
      case "hard": game.hard_drop(); break;
      case "view": toggleView(); break;
      case "minimap": showMinimap = !showMinimap; break;
      case "mute": sound.toggleMute(); break;
      case "pause": game.toggle_pause(); elPause.classList.toggle("hidden", !game.paused); break;
      case "restart": restart(); break;
    }
  }
  function onKeyUp(e) {
    if (KEY_ACTION[e.code] === "soft") softHeld = false;
  }

  function toggleView() {
    view = view === VIEW.FULL ? VIEW.ZOOMED : VIEW.FULL;
    elView.textContent = view === VIEW.ZOOMED ? "◱ zoomed" : "▦ full";
    applyViewLayout();
  }

  // On-screen touch controls (also clickable with a mouse).
  function bindHold(id, downFn, upFn) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => { e.preventDefault(); sound.ensure(); if (scene === "title") { startGame(); return; } downFn(); };
    const up = (e) => { if (e) e.preventDefault(); if (upFn) upFn(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
  }
  function bindTap(id, fn) { bindHold(id, fn, null); }

  bindTap("btn-left", () => game.move_left());
  bindTap("btn-right", () => game.move_right());
  bindTap("btn-rotate", () => game.rotate_piece());
  bindTap("btn-hard", () => game.hard_drop());
  bindTap("btn-turnL", () => doTurn(-1));
  bindTap("btn-turnR", () => doTurn(+1));
  bindHold("btn-soft", () => { softHeld = true; game.soft_drop(); }, () => { softHeld = false; });

  elMute.addEventListener("click", () => { sound.ensure(); sound.toggleMute(); });
  elView.addEventListener("click", toggleView);
  document.getElementById("restartBtn").addEventListener("click", restart);
  elTitle.addEventListener("pointerdown", (e) => { e.preventDefault(); sound.ensure(); startGame(); });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // --- loop -----------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  let wasOver = false;
  function frame(now) {
    anim.update(now);
    if (scene === "play" && !game.paused && !game.over) {
      const dt = now - last;
      acc += dt;
      const interval = softHeld ? C.SOFT_FALL_MS : game.fall_interval();
      let guard = 0;
      while (acc >= interval && guard < 8) {
        if (softHeld) game.soft_drop(); else game.tick_gravity();
        acc -= interval;
        guard++;
        if (game.over) break;
      }
    } else {
      acc = 0;
    }
    last = now;

    for (const name of game.events) sound.play(name);
    game.events.length = 0;

    if (game.over && !wasOver) {
      wasOver = true;
      elFinal.textContent = game.score;
      elOver.classList.remove("hidden");
    }
    if (!game.over) wasOver = false;

    render();
    updateHUD();
    requestAnimationFrame(frame);
  }

  // init HUD/labels and go
  elView.textContent = "▦ full";
  elMute.textContent = "🔊";
  applyViewLayout();
  updateHUD();
  render();
  requestAnimationFrame(frame);
})();
