/* ============================================================================
   engine.js — Ninja Ascent core logic (see DESIGN.md).

   Pure logic only — no DOM, no canvas, no audio. Screen-space coordinates on a
   360×640 portrait field, y down; the ninja holds a fixed height while the
   world scrolls past. Advance with step(dt) at a fixed rate (DT). Classic
   script: sets globalThis.NinjaEngine for the browser and the Node test.
   ============================================================================ */
(function () {
  "use strict";

  // --- config ---------------------------------------------------------------
  const W = 360, H = 640;
  const WALL_L = 56, WALL_R = 304;         // inner faces of the two buildings
  const NINJA_Y = 480;                     // fixed screen height of the ninja
  const NW = 22, NH = 34;                  // ninja size
  const JUMP_T = 0.3, HOP = 26;            // wall-jump time and arc height
  const SLASH_T = 0.16, SLASH_CD = 0.32;
  const INVULN = 1.2, MAX_HEARTS = 3;
  const SPEED0 = 230, SPEED_GAIN = 290, SPEED_D = 9000;   // px/s, ramp with distance
  const OPP_GAP = 0.55;                    // s between avoidables on opposite walls
  const CENTER_GAP = 0.4;                  // s between a centre drop and a wall avoidable
  const SPAWN_Y = -30;
  const DT = 1 / 120;
  const PX_PER_M = 10;

  const TYPES = {
    coin:    { kind: "collect", w: 16, h: 16 },
    onigiri: { kind: "collect", w: 22, h: 20 },
    spikes:  { kind: "avoid", w: 22, h: 30 },
    ac:      { kind: "avoid", w: 30, h: 26 },
    pot:     { kind: "avoid", w: 20, h: 22 },
    block:   { kind: "avoid", w: 24, h: 20 },
    plank:   { kind: "cut", w: 46, h: 12 },
    lantern: { kind: "cut", w: 20, h: 28 },
    crate:   { kind: "cut", w: 26, h: 26 },
    melon:   { kind: "cut", w: 24, h: 22 },
  };

  function mulberry32(a) {
    a >>>= 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ninjaX = (side) => (side === "L" ? WALL_L + NW / 2 : WALL_R - NW / 2);
  const other = (side) => (side === "L" ? "R" : "L");
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const rectOf = (o) => ({ x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h });

  class Game {
    constructor(seed = 1, { log = false } = {}) {
      this.rand = mulberry32(seed);
      this.t = 0;
      this.dist = 0;
      this.speed = SPEED0;
      this.objects = [];
      this.nextId = 1;
      this.ninja = { side: "L", jumping: false, jt: 0, x: ninjaX("L"), y: NINJA_Y };
      this.hearts = MAX_HEARTS;
      this.inv = 0;
      this.slashT = 0;
      this.slashCD = 0;
      this.coins = 0;
      this.cuts = 0;
      this.over = false;
      this.events = [];        // drained by the renderer: jump, slash, cut, coin, heal, hit, over
      this.threats = [];       // {t, side} predicted avoidable arrivals at the ninja's line
      this.rowTimer = 1.2;     // a short calm start
      this.log = log ? [] : null;   // actual avoidable crossings, for the fairness test
    }

    get meters() { return Math.floor(this.dist / PX_PER_M); }
    get score() { return this.meters + 10 * this.coins + 25 * this.cuts; }
    get difficulty() { return Math.min(1, this.dist / 12000); }

    // --- input --------------------------------------------------------------
    jump() {
      const n = this.ninja;
      if (this.over || n.jumping) return false;
      n.jumping = true;
      n.jt = 0;
      n.from = n.side;
      this.events.push({ type: "jump", x: n.x, y: n.y, from: n.side });
      return true;
    }
    slash() {
      if (this.over || this.slashCD > 0) return false;
      this.slashT = SLASH_T;
      this.slashCD = SLASH_CD;
      this.events.push({ type: "slash", x: this.ninja.x, y: this.ninja.y, side: this.ninja.jumping ? "air" : this.ninja.side });
      return true;
    }

    // --- geometry -----------------------------------------------------------
    ninjaBox() {
      const n = this.ninja;
      return { x: n.x - 10, y: n.y - 15, w: 20, h: 30 };
    }
    slashZone() {
      const n = this.ninja;
      if (n.jumping) return { x: n.x - 55, y: n.y - 85, w: 110, h: 100 };
      return n.side === "L"
        ? { x: WALL_L, y: NINJA_Y - 95, w: 92, h: 110 }
        : { x: WALL_R - 92, y: NINJA_Y - 95, w: 92, h: 110 };
    }

    // --- simulation -----------------------------------------------------------
    step(dt = DT) {
      if (this.over) return;
      this.t += dt;
      this.speed = SPEED0 + SPEED_GAIN * (1 - Math.exp(-this.dist / SPEED_D));
      this.dist += this.speed * dt;
      this.inv = Math.max(0, this.inv - dt);
      this.slashT = Math.max(0, this.slashT - dt);
      this.slashCD = Math.max(0, this.slashCD - dt);

      const n = this.ninja;
      if (n.jumping) {
        n.jt += dt;
        const p = Math.min(1, n.jt / JUMP_T);
        n.x = ninjaX(n.from) + (ninjaX(other(n.from)) - ninjaX(n.from)) * ease(p);
        n.y = NINJA_Y - HOP * Math.sin(Math.PI * p);
        if (p >= 1) {
          n.jumping = false;
          n.side = other(n.from);
          n.x = ninjaX(n.side);
          n.y = NINJA_Y;
          this.events.push({ type: "land", x: n.x, y: n.y, side: n.side });
        }
      }

      for (const o of this.objects) {
        const prev = o.y;
        o.y += (this.speed + o.vy) * dt;
        if (this.log && o.kind === "avoid" && prev < NINJA_Y && o.y >= NINJA_Y) this.log.push({ t: this.t, side: o.side });
      }

      if (this.slashT > 0) {
        const zone = this.slashZone();
        for (const o of this.objects) {
          if (o.alive && o.kind === "cut" && overlap(zone, rectOf(o))) {
            o.alive = false;
            this.cuts++;
            this.events.push({ type: "cut", x: o.x, y: o.y, obj: o.type });
          }
        }
      }

      const box = this.ninjaBox();
      for (const o of this.objects) {
        if (!o.alive || !overlap(box, rectOf(o))) continue;
        if (o.kind === "collect") {
          o.alive = false;
          if (o.type === "onigiri") {
            this.hearts = Math.min(MAX_HEARTS, this.hearts + 1);
            this.events.push({ type: "heal", x: o.x, y: o.y });
          } else {
            this.coins++;
            this.events.push({ type: "coin", x: o.x, y: o.y });
          }
        } else if (this.inv <= 0) {
          o.alive = false;
          this.hearts--;
          this.inv = INVULN;
          this.events.push({ type: "hit", x: o.x, y: o.y, obj: o.type });
          if (this.hearts <= 0) {
            this.over = true;
            this.events.push({ type: "over", x: n.x, y: n.y });
            return;
          }
        }
      }

      this.objects = this.objects.filter((o) => o.alive && o.y < H + 60);
      this.threats = this.threats.filter((th) => th.t > this.t - 1);

      this.rowTimer -= dt;
      if (this.rowTimer <= 0) {
        this.spawnRow();
        const d = this.difficulty;
        this.rowTimer += 0.95 - 0.4 * d;
      }
    }

    // --- spawning -------------------------------------------------------------
    pick(list) { return list[Math.floor(this.rand() * list.length)]; }
    side() { return this.rand() < 0.5 ? "L" : "R"; }

    /** A row is one pattern: a list of object specs {type, lane, side, x, y, vy}. */
    pattern(name) {
      const r = this.rand, s = this.side();
      const wall = (type, side, dy = 0) => ({ type, lane: side, side, x: wallX(type, side), y: SPAWN_Y - dy, vy: 0 });
      const drop = (type) => {
        const where = this.pick(["L", "R", "C"]);
        const x = where === "L" ? WALL_L + 14 : where === "R" ? WALL_R - 14 : W / 2 + (r() - 0.5) * 70;
        return { type, lane: "air", side: where, x, y: SPAWN_Y, vy: 110 + 110 * r() };
      };
      switch (name) {
        case "wallHazard": return [wall(this.pick(["spikes", "ac"]), s)];
        case "wallCut": return [wall(this.pick(["plank", "lantern"]), s)];
        case "coinsWall": {
          const k = 3 + Math.floor(r() * 3);
          return Array.from({ length: k }, (_, i) => ({ type: "coin", lane: s, side: s, x: ninjaX(s), y: SPAWN_Y - i * 30, vy: 0 }));
        }
        case "coinsArc": {
          // Coins along the path of a jump that starts as the first one arrives.
          const travel = this.speed * JUMP_T;
          return Array.from({ length: 5 }, (_, i) => {
            const p = i / 4;
            const x = ninjaX(s) + (ninjaX(other(s)) - ninjaX(s)) * ease(p);
            return { type: "coin", lane: "air", side: "C", x, y: SPAWN_Y - travel * p - HOP * Math.sin(Math.PI * p), vy: 0 };
          });
        }
        case "dropHazard": return [drop(this.pick(["pot", "block"]))];
        case "dropCut": return [drop(this.pick(["crate", "melon"]))];
        case "combo": return [wall(this.pick(["spikes", "ac"]), s), wall(this.pick(["plank", "lantern"]), other(s))];
        case "onigiri": return [{ type: "onigiri", lane: "air", side: "C", x: W / 2, y: SPAWN_Y, vy: 60 }];
      }
      return [];
    }

    weights() {
      const d = this.difficulty;
      return [
        ["wallHazard", 3],
        ["wallCut", 2 + d],
        ["coinsWall", 2],
        ["coinsArc", 1.2],
        ["dropHazard", this.dist > 1500 ? 0.3 + 1.7 * d : 0],
        ["dropCut", 0.6 + d],
        ["combo", d > 0.35 ? 2 * d : 0],
        ["onigiri", this.hearts < MAX_HEARTS ? 0.18 : 0],
      ];
    }
    choose() {
      const ws = this.weights();
      let total = ws.reduce((a, [, w]) => a + w, 0), x = this.rand() * total;
      for (const [name, w] of ws) { if ((x -= w) < 0) return name; }
      return "coinsWall";
    }

    arrival(spec) { return this.t + (NINJA_Y - spec.y) / (this.speed + spec.vy); }
    /** Would this avoidable's arrival break a fairness rule (DESIGN.md §4)? */
    conflicts(side, t, extra = []) {
      for (const th of this.threats.concat(extra)) {
        const dt = Math.abs(th.t - t);
        if (side === "C" ? th.side !== "C" && dt < CENTER_GAP
          : (th.side === other(side) && dt < OPP_GAP) || (th.side === "C" && dt < CENTER_GAP)) return true;
      }
      return false;
    }

    spawnRow() {
      for (let tries = 0; tries < 6; tries++) {
        const specs = this.pattern(this.choose());
        const added = [];
        let ok = true;
        for (const sp of specs) {
          if (TYPES[sp.type].kind !== "avoid") continue;
          const t = this.arrival(sp);
          if (this.conflicts(sp.side, t, added)) { ok = false; break; }
          added.push({ t, side: sp.side });
        }
        if (!ok) continue;
        this.threats.push(...added);
        for (const sp of specs) this.add(sp);
        return;
      }
      for (const sp of this.pattern("coinsWall")) this.add(sp);
    }

    add(sp) {
      const T = TYPES[sp.type];
      this.objects.push({
        id: this.nextId++, type: sp.type, kind: T.kind, w: T.w, h: T.h,
        lane: sp.lane, side: sp.side, x: sp.x, y: sp.y, vy: sp.vy, alive: true,
        phase: this.rand() * Math.PI * 2,
      });
    }
  }

  /** Wall objects sit flush against their building's face. */
  function wallX(type, side) {
    const w = TYPES[type].w;
    return side === "L" ? WALL_L + w / 2 : WALL_R - w / 2;
  }

  globalThis.NinjaEngine = {
    W, H, WALL_L, WALL_R, NINJA_Y, NW, NH, JUMP_T, HOP, SLASH_T, SLASH_CD, INVULN, MAX_HEARTS,
    SPEED0, SPEED_GAIN, OPP_GAP, CENTER_GAP, DT, PX_PER_M, TYPES,
    mulberry32, ninjaX, overlap, rectOf, Game,
  };
})();
