// EMBER TIDE — util.js
// Seeded RNG, math helpers, spatial grid for collisions/queries, tiny event bus.
// Every random choice in the game flows from one seeded generator so a run is
// deterministic for a given seed.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    var next = mulberry32(seed);
    return {
      next: next,
      range: function (lo, hi) { return lo + next() * (hi - lo); },
      int: function (lo, hi) { return Math.floor(lo + next() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      chance: function (p) { return next() < p; },
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function angleLerp(a, b, t) {
    var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * clamp(t, 0, 1);
  }
  function sanitize(v, fallback) {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    return clamp(v, -1e6, 1e6);
  }
  function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtClock(minutes) {
    var h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
  }

  // Spatial hash grid: cell 16m. Stores {x,z,r,ref} entries for circle queries
  // and static AABBs. Rebuilt per frame for dynamics; statics kept separate.
  function SpatialGrid(cellSize) {
    this.cell = cellSize || 16;
    this.map = new Map();
  }
  SpatialGrid.prototype.key = function (cx, cz) { return cx + ':' + cz; };
  SpatialGrid.prototype.clear = function () { this.map.clear(); };
  SpatialGrid.prototype.insert = function (x, z, r, ref) {
    var c = this.cell;
    var x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    var z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (var ix = x0; ix <= x1; ix++) for (var iz = z0; iz <= z1; iz++) {
      var k = this.key(ix, iz), arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(ref);
    }
  };
  SpatialGrid.prototype.query = function (x, z, r, out) {
    out = out || [];
    var c = this.cell;
    var x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    var z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    var seen = new Set();
    for (var ix = x0; ix <= x1; ix++) for (var iz = z0; iz <= z1; iz++) {
      var arr = this.map.get(this.key(ix, iz));
      if (!arr) continue;
      for (var i = 0; i < arr.length; i++) {
        var ref = arr[i];
        if (seen.has(ref)) continue;
        seen.add(ref);
        out.push(ref);
      }
    }
    return out;
  };

  // Circle vs AABB resolve: pushes circle out, returns true on hit.
  function circleVsAABB(px, pz, r, b) {
    var cx = clamp(px, b.x0, b.x1), cz = clamp(pz, b.z0, b.z1);
    var dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    var d = Math.sqrt(d2) || 0.001;
    return { nx: dx / d, nz: dz / d, depth: r - d };
  }

  function makeBus() {
    var handlers = {};
    return {
      on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
      emit: function (ev, data) {
        var list = handlers[ev]; if (!list) return;
        for (var i = 0; i < list.length; i++) {
          try { list[i](data); } catch (err) { console.error('[bus]', ev, err); }
        }
      },
    };
  }

  E.mulberry32 = mulberry32;
  E.makeRng = makeRng;
  E.clamp = clamp;
  E.lerp = lerp;
  E.dist2 = dist2;
  E.angleLerp = angleLerp;
  E.sanitize = sanitize;
  E.fmtMoney = fmtMoney;
  E.fmtClock = fmtClock;
  E.fmtTime = fmtTime;
  E.SpatialGrid = SpatialGrid;
  E.circleVsAABB = circleVsAABB;
  E.makeBus = makeBus;
})();
