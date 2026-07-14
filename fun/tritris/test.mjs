/* ============================================================================
   test.mjs — parity checks for the JS Tritris port against the Python reference
   (mirrors tritris/tests/test_logic.py). Run: `node fun/tritris/test.mjs`.
   This file is *.mjs so the site build prunes it from the published tree.
   ============================================================================ */
import "./engine.js";
const E = globalThis.TritrisEngine;
const { C, G, SHAPES, ROTATIONS, Piece, SevenBag, mulberry32, Board, Game, key } = E;

let passed = 0;
const fails = [];
function ok(cond, msg) { if (cond) passed++; else fails.push(msg); }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }

// --- pieces ------------------------------------------------------------------
{
  const bag = new SevenBag(mulberry32(0));
  const first = Array.from({ length: 7 }, () => bag.next()).sort();
  const second = Array.from({ length: 7 }, () => bag.next()).sort();
  ok(JSON.stringify(first) === JSON.stringify(SHAPES.slice().sort()), "7-bag first bag = all 7");
  ok(JSON.stringify(second) === JSON.stringify(SHAPES.slice().sort()), "7-bag second bag = all 7");
}
for (const name of SHAPES) {
  for (const cells of ROTATIONS[name][1]) eq(cells.length, 4, `${name} rotation has 4 cells`);
}

// --- geometry ----------------------------------------------------------------
eq(G.cycle(G.STEM_DOWN, 1), G.RIGHT_DOWN, "cycle STEM+1");
eq(G.cycle(G.RIGHT_DOWN, 1), G.LEFT_DOWN, "cycle RIGHT+1");
eq(G.cycle(G.LEFT_DOWN, 1), G.STEM_DOWN, "cycle LEFT+1");
eq(G.cycle(G.STEM_DOWN, -1), G.LEFT_DOWN, "cycle STEM-1");

for (const arm of ["STEM", "LEFT", "RIGHT"]) {
  const [x0, x1, y0, y1] = G.ARM_RECT[arm];
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) {
    const [u, v] = G.to_local(x, y, arm);
    ok(u >= 0 && u < C.ARM_W && v >= 0 && v < C.ARM_L, `to_local in range ${arm} ${x},${y}`);
    const [wx, wy] = G.to_world(u, v, arm);
    ok(wx === x && wy === y, `local/world round-trip ${arm} ${x},${y}`);
  }
}

// far end of each active arm points screen-south (largest screen-y).
for (const o of G.ORIENTATIONS) {
  const arm = G.DOWN_ARM[o];
  const floor = G.to_world(0, C.ARM_L - 1, arm);
  const jEnd = G.to_world(0, 0, arm);
  const fy = G.rotate_cell(floor[0], floor[1], o)[1];
  const jy = G.rotate_cell(jEnd[0], jEnd[1], o)[1];
  ok(fy > jy, `${o}: floor below junction end on screen`);
}

// field rotation maps old well onto new well (so a legal piece is never wrongly rejected).
function wellCells(o) {
  const cells = new Set();
  for (const rect of [C.RECT_JUNCTION, G.ARM_RECT[G.DOWN_ARM[o]]]) {
    const [x0, x1, y0, y1] = rect;
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) cells.add(key(x, y));
  }
  return cells;
}
for (const step of [1, -1]) for (const o of G.ORIENTATIONS) {
  const newO = G.cycle(o, step);
  const delta = G.DISPLAY_ANGLE[o] - G.DISPLAY_ANGLE[newO];
  const newWell = wellCells(newO);
  for (const k of wellCells(o)) {
    const [x, y] = k.split(",").map(Number);
    const [rx, ry] = G.rotate_about_center(x, y, delta);
    ok(newWell.has(key(rx, ry)), `well maps onto new well o=${o} step=${step} cell=${k}`);
  }
}

// --- board line clears -------------------------------------------------------
function fillRow(board, arm, v) {
  for (let u = 0; u < C.ARM_W; u++) {
    const [x, y] = G.to_world(u, v, arm);
    board.locked.set(key(x, y), "#fff");
  }
}
for (const o of G.ORIENTATIONS) {
  const board = new Board();
  board.orientation = o;
  const arm = G.DOWN_ARM[o];
  fillRow(board, arm, C.ARM_L - 1);
  const [mx, my] = G.to_world(2, C.ARM_L - 2, arm);
  board.locked.set(key(mx, my), "#999");
  const cleared = board.clear_lines();
  eq(cleared, 1, `${o}: one line cleared`);
  const [fx, fy] = G.to_world(2, C.ARM_L - 1, arm);
  ok(board.locked.has(key(fx, fy)) && board.locked.get(key(fx, fy)) === "#999",
     `${o}: marker fell to floor`);
}

// clearing the active arm must not touch a frozen arm.
{
  const board = new Board();
  board.orientation = G.STEM_DOWN;
  fillRow(board, "LEFT", C.ARM_L - 1);
  fillRow(board, "STEM", C.ARM_L - 1);
  board.clear_lines();
  const [lx, ly] = G.to_world(0, C.ARM_L - 1, "LEFT");
  ok(board.locked.has(key(lx, ly)), "frozen LEFT arm untouched by STEM clear");
}

// --- spawn / game over -------------------------------------------------------
{
  const board = new Board();
  board.orientation = G.STEM_DOWN;
  const [x0, x1, y0, y1] = C.RECT_JUNCTION;
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) board.locked.set(key(x, y), "#fff");
  ok(board.spawn("O") === null, "spawn blocked when junction full");
}
{
  const board = new Board();
  const piece = board.spawn("T");
  ok(piece !== null, "T spawns");
  const [newO, newPiece] = board.rotate_field(1, piece);
  eq(newO, G.RIGHT_DOWN, "rotate_field(1) -> RIGHT_DOWN");
  ok(board.valid(newPiece), "rotated piece is valid in new arm");
}

// --- linear (clamped) field rotation: no 180° flip between end arms ----------
eq(G.step_orientation(G.STEM_DOWN, 1), G.RIGHT_DOWN, "middle +1 -> RIGHT");
eq(G.step_orientation(G.STEM_DOWN, -1), G.LEFT_DOWN, "middle -1 -> LEFT");
eq(G.step_orientation(G.RIGHT_DOWN, 1), G.RIGHT_DOWN, "RIGHT end +1 -> stays RIGHT (clamped)");
eq(G.step_orientation(G.RIGHT_DOWN, -1), G.STEM_DOWN, "RIGHT end -1 -> back to STEM");
eq(G.step_orientation(G.LEFT_DOWN, -1), G.LEFT_DOWN, "LEFT end -1 -> stays LEFT (clamped)");
eq(G.step_orientation(G.LEFT_DOWN, 1), G.STEM_DOWN, "LEFT end +1 -> back to STEM");
{
  // end arms can't cross directly: from RIGHT, a +1 turn must be a no-op
  const g = new Game(7);
  g.rotate_field(1);                                   // STEM -> RIGHT
  eq(g.board.orientation, G.RIGHT_DOWN, "turned to RIGHT end");
  const before = g.piece;
  g.events.length = 0;
  g.rotate_field(1);                                   // try to cross to the other end
  eq(g.board.orientation, G.RIGHT_DOWN, "stays at RIGHT (no cross-flip)");
  ok(!g.events.includes("turn"), "no turn event when clamped");
  ok(g.piece === before, "piece untouched when clamped");
}

// --- movement not inverted ---------------------------------------------------
{
  const g = new Game(3);
  eq(g.board.orientation, G.STEM_DOWN, "seed 3 starts STEM_DOWN");
  const x0 = g.piece.x;
  g.move_left();
  eq(g.piece.x, x0 - 1, "move_left is screen-left (-x) stem-down");
  g.move_right(); g.move_right();
  eq(g.piece.x, x0 + 1, "move_right is screen-right (+x) stem-down");
}

// --- field rotation preserves depth + round-trips ---------------------------
function pieceDepth(g) {
  const arm = G.DOWN_ARM[g.board.orientation];
  return Math.min(...g.piece.cells().map(([x, y]) => G.to_local(x, y, arm)[1]));
}
{
  const g = new Game(5);
  for (let i = 0; i < 12; i++) g.tick_gravity();
  const depth0 = pieceDepth(g);
  ok(depth0 > 0, "piece dropped into the stem");
  for (const step of [1, -1, 1, 1, -1, 1]) g.rotate_field(step);
  ok(pieceDepth(g) >= depth0, "rotation never lifts the piece (anti-hover)");
}
{
  const g = new Game(9);
  for (let i = 0; i < 6; i++) g.tick_gravity();
  const before = new Set(g.piece.cells().map(([x, y]) => key(x, y)));
  const o = g.board.orientation;
  g.rotate_field(1); g.rotate_field(-1);
  eq(g.board.orientation, o, "orientation restored after round-trip");
  const after = new Set(g.piece.cells().map(([x, y]) => key(x, y)));
  ok(before.size === after.size && [...before].every(k => after.has(k)),
     "piece cells restored after rotation round-trip");
}

// --- sound events ------------------------------------------------------------
{
  const g = new Game(3);
  g.events.length = 0; g.move_left(); ok(g.events.includes("move"), "move emits 'move'");
  g.events.length = 0; g.rotate_field(1); ok(g.events.includes("turn"), "rotate_field emits 'turn'");
  g.events.length = 0; g.rotate_piece(); ok(g.events.includes("rotate"), "rotate_piece emits 'rotate'");
  const g2 = new Game(1);
  g2.events.length = 0; g2.hard_drop(); ok(g2.events.includes("lock"), "hard_drop emits 'lock'");
}

// --- report ------------------------------------------------------------------
if (fails.length) {
  console.error(`\n✗ ${fails.length} FAILED (${passed} passed):`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
} else {
  console.log(`✓ all ${passed} parity assertions passed`);
}
