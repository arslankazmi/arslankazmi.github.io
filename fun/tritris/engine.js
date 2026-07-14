/* ============================================================================
   engine.js — Tritris core logic, a faithful port of the Python reference game
   (arslankazmi/tritris: config.py / pieces.py / geometry.py / board.py / game.py).

   Pure logic only — no DOM, no canvas, no audio. The board lives in a fixed
   *canonical* frame (stem pointing down); "rotating the field" is a render/input
   transform. This file is a classic script: it sets globalThis.TritrisEngine so
   it works both as a browser <script> and via dynamic import() in the Node test.
   ============================================================================ */
(function () {
  "use strict";

  // --- config ---------------------------------------------------------------
  const ARM_W = 10;      // arm width  (cross-axis) == a standard Tetris field
  const ARM_L = 20;      // arm length (depth)      == a standard Tetris height
  const JUNCTION = 10;   // shared central square, JUNCTION x JUNCTION
  const WORLD_COLS = ARM_L + JUNCTION + ARM_L;   // 50
  const WORLD_ROWS = ARM_W + ARM_L;              // 30

  // Region rectangles as half-open [x0, x1, y0, y1].
  const RECT_JUNCTION = [ARM_L, ARM_L + JUNCTION, 0, ARM_W];           // [20,30,0,10]
  const RECT_STEM     = [ARM_L, ARM_L + JUNCTION, ARM_W, WORLD_ROWS];  // [20,30,10,30]
  const RECT_LEFT     = [0, ARM_L, 0, ARM_W];                          // [0,20,0,10]
  const RECT_RIGHT    = [ARM_L + JUNCTION, WORLD_COLS, 0, ARM_W];      // [30,50,0,10]

  const CENTER = [ARM_L + Math.floor(JUNCTION / 2), Math.floor(ARM_W / 2)]; // [25,5]

  const PIECE_COLORS = {
    I: "#38bed2", O: "#e8c848", T: "#a860d6", S: "#60c870",
    Z: "#de5460", J: "#4e76e0", L: "#e88c3c",
  };

  // Playfield palette (kept dark — the game's own identity, distinct from the page).
  const COLOR = {
    bg: "#101218", well: "#1e222c", junction: "#2c2838", grid: "#282c38",
    text: "#e1e4eb", textDim: "#8c929e", ghost: "#464c5c", gameover: "#eb5050",
    frame: "#464c5c",
  };

  const ROTATE_ANIM_MS = 200;
  const BASE_FALL_MS = 800, SOFT_FALL_MS = 45, MIN_FALL_MS = 60;
  const FALL_MS_PER_LEVEL = 65, LINES_PER_LEVEL = 10;
  const LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };
  const SOFT_DROP_POINTS = 1, HARD_DROP_POINTS = 2;

  function fall_interval_ms(level) {
    return Math.max(MIN_FALL_MS, BASE_FALL_MS - (level - 1) * FALL_MS_PER_LEVEL);
  }

  const C = {
    ARM_W, ARM_L, JUNCTION, WORLD_COLS, WORLD_ROWS,
    RECT_JUNCTION, RECT_STEM, RECT_LEFT, RECT_RIGHT, CENTER,
    PIECE_COLORS, COLOR, ROTATE_ANIM_MS, BASE_FALL_MS, SOFT_FALL_MS,
    MIN_FALL_MS, FALL_MS_PER_LEVEL, LINES_PER_LEVEL, LINE_SCORES,
    SOFT_DROP_POINTS, HARD_DROP_POINTS, fall_interval_ms,
  };

  // --- pieces ---------------------------------------------------------------
  // Spawn-state cells as [col, row] within an NxN box, with the box size N.
  const _SPAWN = {
    I: [4, [[0, 1], [1, 1], [2, 1], [3, 1]]],
    O: [2, [[0, 0], [1, 0], [0, 1], [1, 1]]],
    T: [3, [[1, 0], [0, 1], [1, 1], [2, 1]]],
    S: [3, [[1, 0], [2, 0], [0, 1], [1, 1]]],
    Z: [3, [[0, 0], [1, 0], [1, 1], [2, 1]]],
    J: [3, [[0, 0], [0, 1], [1, 1], [2, 1]]],
    L: [3, [[2, 0], [0, 1], [1, 1], [2, 1]]],
  };
  const SHAPES = Object.keys(_SPAWN);

  function _rotate_cw(cells, n) {          // 90deg clockwise within an NxN box
    return cells.map(([x, y]) => [n - 1 - y, x]);
  }
  function _sortCells(cells) {              // sort by (col, row) like Python sorted()
    return cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  function _build_rotations(cells, n) {    // the 4 rotation states
    const states = [];
    let cur = cells;
    for (let i = 0; i < 4; i++) { states.push(_sortCells(cur)); cur = _rotate_cw(cur, n); }
    return states;
  }
  // name -> [box_size, [rot0, rot1, rot2, rot3]]
  const ROTATIONS = {};
  for (const name of SHAPES) {
    const [n, cells] = _SPAWN[name];
    ROTATIONS[name] = [n, _build_rotations(cells, n)];
  }

  class Piece {
    constructor(name, x, y, rot = 0) {
      this.name = name; this.x = x; this.y = y; this.rot = rot;
      this.n = ROTATIONS[name][0];
    }
    cells(rot, x, y) {
      rot = (rot === undefined || rot === null) ? this.rot : rot;
      x = (x === undefined || x === null) ? this.x : x;
      y = (y === undefined || y === null) ? this.y : y;
      const box = ROTATIONS[this.name][1][((rot % 4) + 4) % 4];
      return box.map(([cx, cy]) => [x + cx, y + cy]);
    }
    moved(dx, dy) { return new Piece(this.name, this.x + dx, this.y + dy, this.rot); }
    rotated() { return new Piece(this.name, this.x, this.y, (this.rot + 1) % 4); }
  }

  // mulberry32 — small seeded PRNG so runs are reproducible for the parity test.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class SevenBag {
    // Standard 7-bag: emits a shuffled permutation of all 7 shapes per bag.
    constructor(rand) { this._rand = rand || Math.random; this._bag = []; }
    _refill() {
      this._bag = SHAPES.slice();
      for (let i = this._bag.length - 1; i > 0; i--) {   // Fisher-Yates
        const j = Math.floor(this._rand() * (i + 1));
        const t = this._bag[i]; this._bag[i] = this._bag[j]; this._bag[j] = t;
      }
    }
    next() { if (this._bag.length === 0) this._refill(); return this._bag.pop(); }
  }

  // --- geometry -------------------------------------------------------------
  const STEM_DOWN = "STEM_DOWN", RIGHT_DOWN = "RIGHT_DOWN", LEFT_DOWN = "LEFT_DOWN";
  const ORIENTATIONS = [STEM_DOWN, RIGHT_DOWN, LEFT_DOWN];
  const DOWN_ARM = { [STEM_DOWN]: "STEM", [RIGHT_DOWN]: "RIGHT", [LEFT_DOWN]: "LEFT" };
  const GRAVITY = { [STEM_DOWN]: [0, 1], [RIGHT_DOWN]: [1, 0], [LEFT_DOWN]: [-1, 0] };
  const SLIDE_LEFT = { [STEM_DOWN]: [-1, 0], [RIGHT_DOWN]: [0, 1], [LEFT_DOWN]: [0, -1] };
  const DISPLAY_ANGLE = { [STEM_DOWN]: 0, [RIGHT_DOWN]: -90, [LEFT_DOWN]: 90 };
  const ARM_RECT = { STEM: RECT_STEM, LEFT: RECT_LEFT, RIGHT: RECT_RIGHT };

  function cycle(orientation, step) {
    const i = ORIENTATIONS.indexOf(orientation);
    return ORIENTATIONS[(((i + step) % 3) + 3) % 3];
  }
  // Field rotation follows a *linear* path LEFT — STEM — RIGHT (clamped, not cyclic):
  // you can turn either way from the middle (stem) arm, but only back from an end arm.
  // This avoids the jarring 180° flip straight between the two end arms.
  const LINEAR_POS = { [LEFT_DOWN]: -1, [STEM_DOWN]: 0, [RIGHT_DOWN]: 1 };
  const LINEAR_ORI = { "-1": LEFT_DOWN, "0": STEM_DOWN, "1": RIGHT_DOWN };
  function step_orientation(orientation, step) {
    const pos = Math.max(-1, Math.min(1, LINEAR_POS[orientation] + step));
    return LINEAR_ORI[String(pos)];
  }
  function in_rect(x, y, rect) {
    return rect[0] <= x && x < rect[1] && rect[2] <= y && y < rect[3];
  }
  function in_well(x, y, orientation) {
    return in_rect(x, y, RECT_JUNCTION) || in_rect(x, y, ARM_RECT[DOWN_ARM[orientation]]);
  }
  function spawn_xy(name, orientation, n) {
    const pad = Math.floor((ARM_W - n) / 2);      // center across the arm width
    if (orientation === STEM_DOWN) return [ARM_L + pad, 0];
    if (orientation === RIGHT_DOWN) return [ARM_L, pad];
    return [ARM_L + JUNCTION - n, pad];            // LEFT_DOWN
  }
  function rotate_cell(x, y, orientation) {        // canonical cell -> on-screen grid
    const [cx, cy] = CENTER, dx = x - cx, dy = y - cy;
    let rx, ry;
    if (orientation === STEM_DOWN) { rx = dx; ry = dy; }
    else if (orientation === RIGHT_DOWN) { rx = -dy; ry = dx; }   // 90deg CW
    else { rx = dy; ry = -dx; }                                    // LEFT_DOWN, 90deg CCW
    return [cx + rx, cy + ry];
  }
  function rotate_about_center(x, y, angle) {      // rotate a cell by 90*k deg about junction center
    const [cx, cy] = CENTER;
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    const a = ((angle % 360) + 360) % 360;
    let rx, ry;
    if (a === 0) { rx = px; ry = py; }
    else if (a === 90) { rx = py; ry = -px; }
    else if (a === 180) { rx = -px; ry = -py; }
    else { rx = -py; ry = px; }                    // 270
    return [Math.round(cx + rx - 0.5), Math.round(cy + ry - 0.5)];
  }
  function to_local(x, y, arm) {
    if (arm === "STEM") return [x - ARM_L, y - ARM_W];
    if (arm === "RIGHT") return [y, x - (ARM_L + JUNCTION)];
    return [y, (ARM_L - 1) - x];                   // LEFT
  }
  function to_world(u, v, arm) {
    if (arm === "STEM") return [ARM_L + u, ARM_W + v];
    if (arm === "RIGHT") return [ARM_L + JUNCTION + v, u];
    return [(ARM_L - 1) - v, u];                    // LEFT
  }

  const G = {
    STEM_DOWN, RIGHT_DOWN, LEFT_DOWN, ORIENTATIONS, DOWN_ARM, GRAVITY,
    SLIDE_LEFT, DISPLAY_ANGLE, ARM_RECT, cycle, step_orientation, in_rect, in_well, spawn_xy,
    rotate_cell, rotate_about_center, to_local, to_world,
  };

  // --- board ----------------------------------------------------------------
  const key = (x, y) => x + "," + y;

  function _fit_piece(name, world_cells) {
    // Reconstruct a Piece from a set of world cells that is a rigid 90deg rotation
    // of the named tetromino. Returns null if no rotation state fits.
    const target = new Set(world_cells.map(([x, y]) => key(x, y)));
    const minx = Math.min(...world_cells.map(c => c[0]));
    const miny = Math.min(...world_cells.map(c => c[1]));
    const states = ROTATIONS[name][1];
    for (let rot = 0; rot < 4; rot++) {
      const box = states[rot];
      const ox = minx - Math.min(...box.map(c => c[0]));
      const oy = miny - Math.min(...box.map(c => c[1]));
      const cand = new Set(box.map(([cx, cy]) => key(ox + cx, oy + cy)));
      if (cand.size === target.size && [...cand].every(k => target.has(k))) {
        return new Piece(name, ox, oy, rot);
      }
    }
    return null;
  }

  class Board {
    constructor() {
      this.locked = new Map();          // "x,y" -> color
      this.orientation = STEM_DOWN;
    }
    valid(piece, rot, x, y) {
      for (const [cx, cy] of piece.cells(rot, x, y)) {
        if (!in_well(cx, cy, this.orientation)) return false;
        if (this.locked.has(key(cx, cy))) return false;
      }
      return true;
    }
    gravity_delta() { return GRAVITY[this.orientation]; }
    drop_distance(piece) {
      const [dx, dy] = this.gravity_delta();
      let d = 0;
      while (this.valid(piece, undefined, piece.x + dx * (d + 1), piece.y + dy * (d + 1))) d++;
      return d;
    }
    lock(piece, color) {
      for (const [cx, cy] of piece.cells()) this.locked.set(key(cx, cy), color);
    }
    clear_lines() {
      // Clear full cross-lines in the active down-arm; collapse toward the floor.
      const arm = DOWN_ARM[this.orientation];
      const rows = [];                  // rows[v] = Map u -> color
      for (let v = 0; v < ARM_L; v++) rows.push(new Map());
      const armCells = [];
      for (const [k, color] of this.locked) {
        const [x, y] = k.split(",").map(Number);
        if (in_rect(x, y, ARM_RECT[arm])) {
          const [u, v] = to_local(x, y, arm);
          rows[v].set(u, color);
          armCells.push(k);
        }
      }
      const full = [];
      for (let v = 0; v < ARM_L; v++) if (rows[v].size === ARM_W) full.push(v);
      if (full.length === 0) return 0;

      for (const k of armCells) this.locked.delete(k);
      const kept = [];
      for (let v = 0; v < ARM_L; v++) if (!full.includes(v)) kept.push(rows[v]);
      const numCleared = ARM_L - kept.length;
      const newRows = [];
      for (let i = 0; i < numCleared; i++) newRows.push(new Map());  // empty rows at junction side
      for (const r of kept) newRows.push(r);
      for (let v = 0; v < newRows.length; v++) {
        for (const [u, color] of newRows[v]) {
          const [wx, wy] = to_world(u, v, arm);
          this.locked.set(key(wx, wy), color);
        }
      }
      return numCleared;
    }
    rotate_field(step, piece) {
      // Turn the field one step, carrying the active piece into the new down-arm
      // while preserving its on-screen position and depth. Returns [new_o, new_piece].
      const new_o = step_orientation(this.orientation, step);
      if (new_o === this.orientation) return [this.orientation, piece];   // clamped at an end arm — no turn
      if (piece === null || piece === undefined) { this.orientation = new_o; return [new_o, null]; }
      const delta = DISPLAY_ANGLE[this.orientation] - DISPLAY_ANGLE[new_o];
      const newCells = piece.cells().map(([x, y]) => rotate_about_center(x, y, delta));
      const candidate = _fit_piece(piece.name, newCells);
      const saved = this.orientation;
      this.orientation = new_o;
      if (candidate !== null && this.valid(candidate)) return [new_o, candidate];
      this.orientation = saved;         // reject (like a failed wall-kick)
      return [saved, piece];
    }
    spawn(name) {
      const n = ROTATIONS[name][0];
      const [sx, sy] = spawn_xy(name, this.orientation, n);
      const piece = new Piece(name, sx, sy, 0);
      return this.valid(piece) ? piece : null;
    }
  }

  // --- game -----------------------------------------------------------------
  class Game {
    constructor(seed) {
      this._rand = (seed === undefined || seed === null) ? Math.random : mulberry32(seed);
      this.reset();
    }
    reset() {
      this.board = new Board();
      this.bag = new SevenBag(this._rand);
      this.score = 0; this.lines = 0; this.level = 1;
      this.paused = false; this.over = false;
      this.events = [];                 // sound-effect events, drained by the caller
      this.next_name = this.bag.next();
      this.piece = null;
      this._spawn_next();
    }
    _emit(name) { this.events.push(name); }
    get color() { return this.piece ? PIECE_COLORS[this.piece.name] : null; }
    fall_interval() { return fall_interval_ms(this.level); }

    _spawn_next() {
      const name = this.next_name;
      this.next_name = this.bag.next();
      const piece = this.board.spawn(name);
      if (piece === null) { this.piece = null; this.over = true; }
      else this.piece = piece;
    }
    _lock_and_advance() {
      this.board.lock(this.piece, PIECE_COLORS[this.piece.name]);
      this._emit("lock");
      const cleared = this.board.clear_lines();
      if (cleared) {
        this.lines += cleared;
        this.score += (LINE_SCORES[cleared] || 800) * this.level;
        const prevLevel = this.level;
        this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
        this._emit(cleared >= 4 ? "tetris" : "clear");
        if (this.level > prevLevel) this._emit("levelup");
      }
      this._spawn_next();
      if (this.over) this._emit("gameover");
    }
    move_left() { this._slide(SLIDE_LEFT[this.board.orientation]); }
    move_right() {
      const [lx, ly] = SLIDE_LEFT[this.board.orientation];
      this._slide([-lx, -ly]);
    }
    _slide(delta) {
      if (!this._active()) return;
      const [dx, dy] = delta;
      const moved = this.piece.moved(dx, dy);
      if (this.board.valid(moved)) { this.piece = moved; this._emit("move"); }
    }
    rotate_piece() {
      if (!this._active()) return;
      const rotated = this.piece.rotated();
      for (const kick of [0, -1, 1, -2, 2]) {   // simple wall kicks along the cross-axis
        const [lx, ly] = SLIDE_LEFT[this.board.orientation];
        const cand = new Piece(rotated.name, rotated.x + lx * kick, rotated.y + ly * kick, rotated.rot);
        if (this.board.valid(cand)) { this.piece = cand; this._emit("rotate"); return; }
      }
    }
    rotate_field(step) {
      if (!this._active()) return;
      const before = this.board.orientation;
      const [, newPiece] = this.board.rotate_field(step, this.piece);
      this.piece = newPiece;
      if (this.board.orientation !== before) this._emit("turn");
    }
    soft_drop() {
      if (!this._active()) return;
      if (this._step_down()) this.score += SOFT_DROP_POINTS;
    }
    hard_drop() {
      if (!this._active()) return;
      const dist = this.board.drop_distance(this.piece);
      const [dx, dy] = this.board.gravity_delta();
      this.piece = this.piece.moved(dx * dist, dy * dist);
      this.score += HARD_DROP_POINTS * dist;
      this._lock_and_advance();
    }
    tick_gravity() { if (this._active()) this._step_down(); }
    toggle_pause() { if (!this.over) this.paused = !this.paused; }

    _active() { return this.piece !== null && !this.over && !this.paused; }
    _step_down() {
      const [dx, dy] = this.board.gravity_delta();
      const moved = this.piece.moved(dx, dy);
      if (this.board.valid(moved)) { this.piece = moved; return true; }
      this._lock_and_advance();
      return false;
    }
  }

  const TritrisEngine = {
    C, PIECE_COLORS, COLOR, fall_interval_ms,
    SHAPES, ROTATIONS, Piece, SevenBag, mulberry32,
    G, Board, _fit_piece, Game, key,
  };
  if (typeof globalThis !== "undefined") globalThis.TritrisEngine = TritrisEngine;
})();
