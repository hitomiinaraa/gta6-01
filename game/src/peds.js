// EMBER TIDE — peds.js
// Pedestrians: procedural varied looks, sidewalk walking on the road graph,
// crosswalk crossings, panic/flee on gunfire, near-misses or explosions,
// spawn/despawn outside the camera view, stuck detection.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  var PED_LOOKS = [
    { skin: 0xc89a6a, shirt: 0x3a7a9a, pants: 0x2a2a2a, hair: 0x1a1a1a },
    { skin: 0x8a5a3a, shirt: 0xd85a5a, pants: 0x3a3a5a, hair: 0x2a1a1a },
    { skin: 0xe8b88a, shirt: 0x5a9a5a, pants: 0x4a4a4a, hair: 0x6a4a2a },
    { skin: 0xa87a4a, shirt: 0x9a6a9a, pants: 0x2a3a3a, hair: 0x111111 },
    { skin: 0xd8a87a, shirt: 0xd8a03a, pants: 0x5a3a2a, hair: 0x8a8a8a },
    { skin: 0x6a4a2a, shirt: 0x3a5a6a, pants: 0x1a1a1a, hair: 0x000000 },
  ];

  function Pedestrian(scene, city, rng, x, z) {
    this.city = city;
    var look = E.buildHumanoid(rng.pick(PED_LOOKS));
    this.body = look;
    this.group = look.group;
    // Randomize scale slightly.
    var s = rng.range(0.92, 1.08);
    this.group.scale.set(s, s, s);
    scene.add(this.group);
    this.pos = new THREE.Vector3(x, city.groundHeight(x, z), z);
    this.yaw = rng.range(0, Math.PI * 2);
    this.speed = rng.range(1.2, 2.2);
    this.target = null;
    this.panicking = false;
    this.panicTimer = 0;
    this.animTime = rng.range(0, 10);
    this.stuckTimer = 0;
    this.lastPos = this.pos.clone();
    this.pickTarget(rng);
  }

  Pedestrian.prototype.pickTarget = function (rng) {
    rng = rng || E.makeRng((Math.random() * 1e9) | 0);
    // Walk along a road line to a random nearby intersection.
    var lines = this.city.roadLines;
    var vertical = rng.chance(0.5);
    var line = rng.pick(lines);
    var along = rng.range(-300, 300);
    if (vertical) this.target = { x: line + (rng.chance(0.5) ? 9.5 : -9.5), z: along };
    else this.target = { x: along, z: line + (rng.chance(0.5) ? 9.5 : -9.5) };
  };

  Pedestrian.prototype.panic = function (fromX, fromZ) {
    this.panicking = true;
    this.panicTimer = 4 + Math.random() * 3;
    var dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    this.target = { x: this.pos.x + (dx / d) * 60, z: this.pos.z + (dz / d) * 60 };
    this.speed = 5.5;
  };

  Pedestrian.prototype.update = function (dt, rng) {
    if (!this.target) this.pickTarget(rng);
    if (this.panicking) {
      this.panicTimer -= dt;
      if (this.panicTimer <= 0) { this.panicking = false; this.speed = 1.6; this.pickTarget(rng); }
    }
    var dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.5) { this.pickTarget(rng); return; }
    var desiredYaw = Math.atan2(dx, dz);
    this.yaw = E.angleLerp(this.yaw, desiredYaw, dt * 5);
    var step = this.speed * dt;
    var nx = this.pos.x + Math.sin(this.yaw) * step;
    var nz = this.pos.z + Math.cos(this.yaw) * step;
    if (!this.city.inWater(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else this.pickTarget(rng);
    this.city.resolveCircle(this.pos, 0.5);
    this.pos.y = this.city.groundHeight(this.pos.x, this.pos.z);
    this.animTime += dt * this.speed * 2.2;
    var swing = Math.sin(this.animTime) * 0.6;
    this.body.armL.rotation.x = swing;
    this.body.armR.rotation.x = -swing;
    this.body.legL.rotation.x = -swing;
    this.body.legR.rotation.x = swing;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    // Stuck detection.
    if (E.dist2(this.pos.x, this.pos.z, this.lastPos.x, this.lastPos.z) < 0.002) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 4) { this.pickTarget(rng); this.stuckTimer = 0; }
    } else { this.stuckTimer = 0; this.lastPos.copy(this.pos); }
  };

  Pedestrian.prototype.dispose = function (scene) { scene.remove(this.group); };

  function PedestrianManager(scene, city, game) {
    this.scene = scene; this.city = city; this.game = game;
    this.peds = [];
    this.rng = E.makeRng(E.CFG.seed + 77);
    this.spawnTimer = 0;
  }

  PedestrianManager.prototype.spawnPed = function (x, z) {
    if (this.peds.length >= E.CFG.maxPeds) return;
    var p = new Pedestrian(this.scene, this.city, this.rng, x, z);
    this.peds.push(p);
  };

  PedestrianManager.prototype.ensurePopulation = function (playerPos) {
    // Keep peds near the player: spawn on nearby sidewalks, remove far ones.
    for (var i = this.peds.length - 1; i >= 0; i--) {
      var p = this.peds[i];
      if (E.dist2(p.pos.x, p.pos.z, playerPos.x, playerPos.z) > 220 * 220) {
        p.dispose(this.scene); this.peds.splice(i, 1);
      }
    }
    this.spawnTimer -= 1 / 60;
    if (this.spawnTimer <= 0 && this.peds.length < E.CFG.maxPeds) {
      this.spawnTimer = 0.25;
      var angle = this.rng.range(0, Math.PI * 2);
      var dist = this.rng.range(40, 120);
      var x = playerPos.x + Math.cos(angle) * dist;
      var z = playerPos.z + Math.sin(angle) * dist;
      var rp = this.city.nearestRoadPoint(x, z);
      var side = this.rng.chance(0.5) ? 9.5 : -9.5;
      var vertical = Math.abs(rp.x - x) < Math.abs(rp.z - z);
      var sx = vertical ? rp.x + side : rp.x;
      var sz = vertical ? rp.z : rp.z + side;
      if (!this.city.inWater(sx, sz) && Math.abs(sx) < 330 && Math.abs(sz) < 330) this.spawnPed(sx, sz);
    }
  };

  PedestrianManager.prototype.clearNear = function (x, z, r) {
    // Remove peds inside radius r (keeps the camera line clear for shots).
    for (var i = this.peds.length - 1; i >= 0; i--) {
      var p = this.peds[i];
      if (E.dist2(p.pos.x, p.pos.z, x, z) < r * r) {
        p.dispose(this.scene); this.peds.splice(i, 1);
      }
    }
  };

  PedestrianManager.prototype.panicNear = function (x, z, radius) {
    for (var i = 0; i < this.peds.length; i++) {
      var p = this.peds[i];
      if (E.dist2(p.pos.x, p.pos.z, x, z) < radius * radius) p.panic(x, z);
    }
  };

  PedestrianManager.prototype.update = function (dt, playerPos) {
    this.ensurePopulation(playerPos);
    for (var i = 0; i < this.peds.length; i++) {
      try { this.peds[i].update(dt, this.rng); } catch (err) { console.error('[peds]', err); }
    }
  };

  E.PedestrianManager = PedestrianManager;
})();
