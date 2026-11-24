// EMBER TIDE — police.js
// Wanted level 0-5 stars. Crimes raise it; CCPD patrols spot the player,
// chase, PIT/ram, set roadblocks, send foot cops, a SWAT van and the
// CONDOR-1 helicopter with a searchlight at high levels. Evade by leaving
// the search area and staying hidden until the stars flash and clear.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  function PoliceDispatch(scene, city, game) {
    this.scene = scene; this.city = city; this.game = game;
    this.wanted = 0;
    this.heat = 0;            // 0..100 crime heat feeding star changes
    this.evadeTimer = 0;      // time hidden while wanted
    this.flashTimer = 0;
    this.hidden = false;
    this.units = [];          // police Vehicle refs
    this.footCops = [];
    this.heli = null;
    this.heliLight = null;
    this.heliCone = null;
    this.searchCenter = new THREE.Vector3();
    this.searchRadius = 0;
    this.roadblocks = [];
    this.rng = E.makeRng(E.CFG.seed + 55);
    this.spawnTimer = 0;
    this.dispatchLog = [];    // {unit, action, dist} for the HUD panel
    this.swatVan = null;
  }

  PoliceDispatch.prototype.addHeat = function (amount, reason) {
    if (this.game.state === 'title' || this.game.state === 'loading') return;
    this.heat = E.clamp(this.heat + amount, 0, 100);
    var newWanted = this.heat <= 4 ? 0 : this.heat <= 18 ? 1 : this.heat <= 38 ? 2 : this.heat <= 58 ? 3 : this.heat <= 80 ? 4 : 5;
    if (newWanted > this.wanted) {
      this.wanted = newWanted;
      this.evadeTimer = 0;
      this.flashTimer = 0;
      if (this.game.audio) this.game.audio.starUp();
      this.game.notify('WANTED LEVEL ' + this.wanted + ' — ' + reason, 'bad');
      this.searchCenter.copy(this.game.player.pos);
      this.searchRadius = 60 + this.wanted * 30;
    }
  };

  PoliceDispatch.prototype.wantedUnits = function () {
    return [0, 2, 3, 4, 6, 8][this.wanted];
  };

  PoliceDispatch.prototype.update = function (dt, playerPos, playerInCar, playerDead) {
    var game = this.game;
    // Decay: if hidden from all units, evade timer runs; stars flash then clear.
    var nearest = 1e9;
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.wreck) continue;
      var d = Math.sqrt(E.dist2(u.pos.x, u.pos.z, playerPos.x, playerPos.z));
      if (d < nearest) nearest = d;
    }
    this.hidden = this.wanted > 0 && nearest > 55 && !this.heliVisible(playerPos);
    if (this.wanted > 0 && !playerDead) {
      if (this.hidden) {
        this.evadeTimer += dt;
        this.flashTimer += dt;
        if (this.evadeTimer > E.CFG.wantedDecaySec) {
          this.wanted = Math.max(0, this.wanted - 1);
          this.heat = [0, 5, 19, 39, 59, 81][this.wanted] || 0;
          this.evadeTimer = 0; this.flashTimer = 0;
          game.notify(this.wanted === 0 ? 'You lost them. The Cove forgets fast.' : 'Wanted level dropped to ' + this.wanted, 'good');
        }
      } else {
        this.evadeTimer = 0; this.flashTimer = 0;
        this.searchCenter.copy(playerPos);
        this.searchRadius = 60 + this.wanted * 30;
      }
    }
    // Spawn / despawn chase units.
    this.spawnTimer -= dt;
    if (this.wanted > 0 && !playerDead && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      var want = this.wantedUnits();
      var alive = this.units.filter(function (u) { return !u.wreck; }).length;
      if (alive < want) this.spawnUnit(playerPos);
    }
    // Chase units drive at the player.
    for (var j = 0; j < this.units.length; j++) {
      var unit = this.units[j];
      if (unit.wreck || unit.holdPosition) continue;
      unit.updateChase(dt, game, playerPos);
      // Ram damage on contact with the player's car.
      if (playerInCar && game.currentCar) {
        var d2 = E.dist2(unit.pos.x, unit.pos.z, game.currentCar.pos.x, game.currentCar.pos.z);
        if (d2 < 16) {
          game.currentCar.damage(0.4, game);
          unit.damage(0.15, game);
        }
      }
      // Despawn far-behind units.
      var dd = Math.sqrt(E.dist2(unit.pos.x, unit.pos.z, playerPos.x, playerPos.z));
      if (dd > 320) { unit.dispose(); this.units.splice(j, 1); j--; }
    }
    // Foot cops at 2+ stars.
    if (this.wanted >= 2 && !playerDead) {
      if (this.footCops.length < this.wanted - 1) this.spawnFootCop(playerPos);
      for (var f = 0; f < this.footCops.length; f++) {
        var cop = this.footCops[f];
        if (cop.dead) continue;
        var cd = Math.sqrt(E.dist2(cop.pos.x, cop.pos.z, playerPos.x, playerPos.z));
        if (cd > 3 && !playerInCar) {
          var cy = Math.atan2(playerPos.x - cop.pos.x, playerPos.z - cop.pos.z);
          cop.yaw = cy;
          cop.pos.x += Math.sin(cy) * 4.5 * dt;
          cop.pos.z += Math.cos(cy) * 4.5 * dt;
          this.city.resolveCircle(cop.pos, 0.5);
          cop.pos.y = this.city.groundHeight(cop.pos.x, cop.pos.z);
          cop.group.position.copy(cop.pos);
          cop.group.rotation.y = cop.yaw;
          var sw = Math.sin(performance.now() * 0.01 + f) * 0.6;
          cop.body.legL.rotation.x = -sw; cop.body.legR.rotation.x = sw;
        } else if (!playerInCar && cd <= 3) {
          // Busted on foot at close range.
          game.busted();
        }
      }
    }
    // Helicopter at 3+ stars.
    if (this.wanted >= 3 && !playerDead) this.ensureHeli(dt, playerPos);
    else this.removeHeli();
    // Roadblocks at 4+ stars: a line of police cars ahead of the player.
    if (this.wanted >= 4 && this.roadblocks.length === 0) this.setRoadblock(playerPos);
    if (this.wanted < 4 && this.roadblocks.length > 0) this.clearRoadblocks();
    this.updateDispatchLog(playerPos);
  };

  PoliceDispatch.prototype.heliVisible = function (playerPos) {
    if (!this.heli) return false;
    var d = Math.sqrt(E.dist2(this.heli.position.x, this.heli.position.z, playerPos.x, playerPos.z));
    return d < 90;
  };

  PoliceDispatch.prototype.spawnUnit = function (playerPos) {
    var angle = this.rng.range(0, Math.PI * 2);
    var dist = this.rng.range(60, 110);
    var x = playerPos.x + Math.cos(angle) * dist;
    var z = playerPos.z + Math.sin(angle) * dist;
    return this.spawnUnitAt(x, z);
  };
  PoliceDispatch.prototype.spawnUnitAt = function (x, z) {
    var rp = this.city.nearestRoadPoint(x, z);
    var car = new E.Vehicle(this.scene, this.city, 'police', rp.x, rp.z, this.rng.range(0, Math.PI * 2));
    car.driver = 'police';
    this.units.push(car);
    var names = ['UNIT 12', 'UNIT 27', 'UNIT 04', 'UNIT 31', 'UNIT 08', 'UNIT 19', 'UNIT 55', 'UNIT 63'];
    var dist = Math.round(Math.sqrt(E.dist2(rp.x, rp.z, this.game.player.pos.x, this.game.player.pos.z)));
    this.dispatchLog.unshift({ unit: names[this.units.length % names.length], action: 'PURSUE', dist: dist });
    if (this.dispatchLog.length > 6) this.dispatchLog.pop();
    if (this.game.audio) this.game.audio.setSiren(true);
    return car;
  };

  PoliceDispatch.prototype.spawnFootCop = function (playerPos) {
    var angle = this.rng.range(0, Math.PI * 2);
    var x = playerPos.x + Math.cos(angle) * 25, z = playerPos.z + Math.sin(angle) * 25;
    var look = E.buildHumanoid({ skin: 0xc89a6a, shirt: 0x1a2a5a, pants: 0x1a1a1a, hair: 0x111111 });
    this.scene.add(look.group);
    var cop = { body: look, group: look.group, pos: new THREE.Vector3(x, this.city.groundHeight(x, z), z), yaw: 0, dead: false };
    cop.group.position.copy(cop.pos);
    this.footCops.push(cop);
  };

  PoliceDispatch.prototype.ensureHeli = function (dt, playerPos) {
    if (!this.heli) {
      var g = new THREE.Group();
      var bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.5, metalness: 0.4 });
      var body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.8, 2.2), bodyMat);
      g.add(body);
      var tail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.7, 0.7), bodyMat);
      tail.position.set(4, 0.3, 0); g.add(tail);
      var rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      rotor.position.y = 1.2; g.add(rotor);
      g.userData.rotor = rotor;
      var coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false });
      var coneGeo = new THREE.ConeGeometry(6, 30, 16, 1, true);
      coneGeo.translate(0, -15, 0);
      var cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = -0.8; g.add(cone);
      var light = new THREE.SpotLight(0xffe9a8, 60, 60, 0.35, 0.5, 1.2);
      light.position.set(0, -1, 0);
      g.add(light);
      g.userData.spot = light;
      var target = new THREE.Object3D();
      g.add(target);
      light.target = target;
      g.userData.spotTarget = target;
      this.scene.add(g);
      this.heli = g; this.heliCone = cone; this.heliLight = light;
      var hd = 54; // heli hovers ~54m ahead of the player
      this.dispatchLog.unshift({ unit: 'CONDOR-1', action: 'SPOTLIGHT', dist: hd });
    }
    var t = this.game.timeSec;
    // Hover ahead of the player's heading so the searchlight stays in
    // front of the chase camera (and in the player's view).
    var yaw = this.game.player.yaw;
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    var hx = playerPos.x + fx * 60 - fz * 20;
    var hz = playerPos.z + fz * 60 + fx * 20;
    this.heli.position.set(hx, 22 + Math.sin(t * 0.7) * 1.5, hz);
    this.heli.userData.rotor.rotation.y += dt * 22;
    this.heli.lookAt(playerPos.x, 0, playerPos.z);
    this.heli.userData.spotTarget.position.set(playerPos.x - hx, -42, playerPos.z - hz);
    this.heli.userData.spotTarget.updateMatrixWorld();
  };

  PoliceDispatch.prototype.removeHeli = function () {
    if (this.heli) { this.scene.remove(this.heli); this.heli = null; this.heliCone = null; this.heliLight = null; }
  };

  PoliceDispatch.prototype.setRoadblock = function (playerPos) {
    // Two police cars + barriers across the road ahead of the player's heading.
    var yaw = this.game.player.yaw;
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    var cx = playerPos.x + fx * 55, cz = playerPos.z + fz * 55;
    var rp = this.city.nearestRoadPoint(cx, cz);
    for (var i = -1; i <= 1; i++) {
      var px = rp.x + Math.cos(yaw) * i * 6, pz = rp.z - Math.sin(yaw) * i * 6;
      var car = new E.Vehicle(this.scene, this.city, 'police', px, pz, yaw + Math.PI / 2);
      car.driver = 'police';
      car.holdPosition = true; // roadblock cars hold the line, they do not chase
      this.units.push(car);
      this.roadblocks.push(car);
    }
    this.dispatchLog.unshift({ unit: 'DISPATCH', action: 'ROADBLOCK', dist: 55 });
  };

  PoliceDispatch.prototype.clearRoadblocks = function () {
    for (var i = 0; i < this.roadblocks.length; i++) {
      var idx = this.units.indexOf(this.roadblocks[i]);
      if (idx >= 0) this.units.splice(idx, 1);
      this.roadblocks[i].dispose();
    }
    this.roadblocks = [];
  };

  PoliceDispatch.prototype.updateDispatchLog = function (playerPos) {
    var actions = ['PURSUE', 'RAMMING', 'FLANKING', 'SPOTLIGHT', 'ROADBLOCK', 'CORDON'];
    for (var i = 0; i < this.dispatchLog.length; i++) {
      var e = this.dispatchLog[i];
      if (e.action === 'SPOTLIGHT') continue;
      e.dist = Math.max(4, Math.round(Math.sqrt(E.dist2(playerPos.x, playerPos.z, this.searchCenter.x, this.searchCenter.z)) + i * 17));
      if (Math.random() < 0.01) e.action = actions[Math.floor(Math.random() * actions.length)];
    }
  };

  PoliceDispatch.prototype.reset = function (keepWanted) {
    for (var i = 0; i < this.units.length; i++) this.units[i].dispose();
    this.units = [];
    for (var f = 0; f < this.footCops.length; f++) this.scene.remove(this.footCops[f].group);
    this.footCops = [];
    this.clearRoadblocks();
    this.removeHeli();
    if (!keepWanted) { this.wanted = 0; this.heat = 0; }
    this.evadeTimer = 0; this.flashTimer = 0;
    this.dispatchLog = [];
    if (this.game.audio) this.game.audio.setSiren(false);
  };

  PoliceDispatch.prototype.flashStars = function () {
    return this.wanted > 0 && this.hidden && Math.floor(this.flashTimer * 2) % 2 === 0;
  };

  E.PoliceDispatch = PoliceDispatch;
})();
