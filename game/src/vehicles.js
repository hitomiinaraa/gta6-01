// EMBER TIDE — vehicles.js
// Procedural vehicle models, arcade driving physics (acceleration, braking,
// reverse, handbrake drift, speed steering, body roll, damage, smoke,
// explosion), enter/exit with carjack, and lane-following traffic AI with
// intersection yielding, traffic-light stops and collision avoidance.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  function buildVehicleMesh(type, colorHex) {
    var g = new THREE.Group();
    var mat = function (c, extra) {
      var m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.15 });
      if (extra) for (var k in extra) m[k] = extra[k];
      return m;
    };
    var bodyMat = mat(colorHex);
    var glassMat = new THREE.MeshStandardMaterial({ color: 0x4a6a7a, roughness: 0.25, metalness: 0.3 });
    var darkMat = mat(0x1a1a1a, { roughness: 0.9, metalness: 0 });
    var dims = { sedan: [1.9, 0.62, 4.4], sports: [1.85, 0.5, 4.1], suv: [2.0, 0.8, 4.6], truck: [2.1, 0.9, 5.2], bus: [2.5, 1.1, 8.5], police: [1.9, 0.62, 4.4], bike: [0.7, 0.5, 2.2], taxi: [1.9, 0.62, 4.4] }[type] || [1.9, 0.62, 4.4];
    var W = dims[0], H = dims[1], L = dims[2];
    var body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), bodyMat);
    body.position.y = 0.55 + H / 2; body.castShadow = true; g.add(body);
    if (type !== 'bike') {
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, 0.55, L * 0.45), glassMat);
      cabin.position.set(0, 0.55 + H + 0.22, -L * 0.06); cabin.castShadow = true; g.add(cabin);
    } else {
      var rider = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), mat(0x2a2a2a));
      rider.position.set(0, 1.25, -0.2); g.add(rider);
    }
    // Wheels.
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    var wheels = [];
    var wheelPos = type === 'bus' ?
      [[-W / 2, -L / 2 + 1.2], [W / 2, -L / 2 + 1.2], [-W / 2, L / 2 - 1.2], [W / 2, L / 2 - 1.2]] :
      type === 'bike' ? [[0, -L / 2 + 0.4], [0, L / 2 - 0.4]] :
      [[-W / 2, -L / 2 + 0.9], [W / 2, -L / 2 + 0.9], [-W / 2, L / 2 - 0.9], [W / 2, L / 2 - 0.9]];
    for (var w = 0; w < wheelPos.length; w++) {
      var wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.position.set(wheelPos[w][0], 0.36, wheelPos[w][1]);
      g.add(wheel); wheels.push(wheel);
    }
    // Headlights + taillights (emissive).
    var headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 1.6 });
    var tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xff2222, emissiveIntensity: 1.2 });
    var headGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
    var tailGeo = new THREE.BoxGeometry(0.34, 0.14, 0.08);
    var headL = new THREE.Mesh(headGeo, headMat); headL.position.set(-W / 2 + 0.3, 0.75, -L / 2 - 0.02); g.add(headL);
    var headR = new THREE.Mesh(headGeo, headMat); headR.position.set(W / 2 - 0.3, 0.75, -L / 2 - 0.02); g.add(headR);
    var tailL = new THREE.Mesh(tailGeo, tailMat); tailL.position.set(-W / 2 + 0.3, 0.75, L / 2 + 0.02); g.add(tailL);
    var tailR = new THREE.Mesh(tailGeo, tailMat); tailR.position.set(W / 2 - 0.3, 0.75, L / 2 + 0.02); g.add(tailR);
    // Headlight beams (visible cones at dusk).
    var beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false });
    var beamGeo = new THREE.ConeGeometry(1.1, 7, 8, 1, true);
    beamGeo.rotateX(-Math.PI / 2); beamGeo.translate(0, 0.6, -3.5);
    var beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = true; g.add(beam);
    if (type === 'police') {
      var barMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), barMat);
      bar.position.set(0, 0.55 + H + 0.55, -L * 0.06); g.add(bar);
      var redMat = new THREE.MeshStandardMaterial({ color: 0xff1111, emissive: 0xff1111, emissiveIntensity: 3 });
      var blueMat = new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 3 });
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), redMat);
      red.position.set(-0.28, 0.55 + H + 0.56, -L * 0.06); g.add(red);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), blueMat);
      blue.position.set(0.28, 0.55 + H + 0.56, -L * 0.06); g.add(blue);
      g.userData.sirenRed = red; g.userData.sirenBlue = blue;
      // CCPD livery stripe.
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.18, L * 0.9), mat(0xffffff));
      stripe.position.y = 0.75; g.add(stripe);
    }
    if (type === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc832, emissiveIntensity: 1.5 }));
      sign.position.set(0, 0.55 + H + 0.55, -L * 0.06); g.add(sign);
    }
    if (type === 'truck') {
      var cargo = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 1.1, L * 0.45), mat(0x5a5a5a, { roughness: 0.9 }));
      cargo.position.set(0, 0.55 + H + 0.5, L * 0.2); g.add(cargo);
    }
    g.userData.wheels = wheels;
    g.userData.headMat = headMat; g.userData.tailMat = tailMat;
    g.userData.bodyMat = bodyMat;
    return g;
  }

  function Vehicle(scene, city, type, x, z, yaw, colorHex) {
    this.scene = scene; this.city = city;
    this.type = type;
    this.def = E.VEHICLE_TYPES[type] || E.VEHICLE_TYPES.sedan;
    this.name = this.def.name;
    this.mesh = buildVehicleMesh(type, colorHex != null ? colorHex : this.def.color);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, city.groundHeight(x, z), z);
    this.yaw = yaw || 0;
    this.speed = 0;           // signed forward speed m/s
    this.steer = 0;
    this.hp = 100;
    this.maxSpeed = E.CFG.carMaxSpeed[type] || 34;
    this.driver = null;       // 'player' | 'traffic' | 'police' | null (parked)
    this.occupied = false;
    this.wreck = false;
    this.burning = false;
    this.burnTimer = 0;
    this.smokeTimer = 0;
    this.honkTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = this.pos.clone();
    this.length = type === 'bus' ? 8.5 : (type === 'truck' ? 5.2 : 4.4);
    this.width = type === 'bus' ? 2.5 : 2.0;
    this.radius = Math.max(this.length, this.width) * 0.55;
    this.route = null;        // traffic route: list of {x,z}
    this.routeIdx = 0;
    this.waitAtLight = 0;
    this.sirenPhase = Math.random() * 10;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  Vehicle.prototype.setRoute = function (route) { this.route = route; this.routeIdx = 0; };

  Vehicle.prototype.damage = function (amount, game) {
    if (this.wreck) return;
    this.hp -= amount;
    if (this.hp <= 50 && !this.burning) { this.burning = true; }
    if (this.hp <= 0) {
      this.hp = 0; this.wreck = true; this.burning = true; this.burnTimer = 2.5;
      if (game) game.spawnExplosion(this.pos.x, this.pos.y + 1, this.pos.z, 6);
    }
  };

  Vehicle.prototype.updatePlayerDrive = function (dt, input, game) {
    var accel = 22, brake = 34, reverseMax = 12;
    var fwd = (input.down('KeyW') || input.down('ArrowUp')) ? 1 : 0;
    if (this.autoDrive) fwd = 1; // staged chase / screenshot drive
    var back = (input.down('KeyS') || input.down('ArrowDown')) ? 1 : 0;
    var handbrake = input.down('Space');
    var steerIn = (input.down('KeyA') ? -1 : 0) + (input.down('KeyD') ? 1 : 0);
    // Steering: less at speed, reversed when reversing.
    var steerTarget = steerIn * E.clamp(1 - Math.abs(this.speed) / (this.maxSpeed * 1.6), 0.35, 1);
    this.steer = E.lerp(this.steer, steerTarget, dt * 8);
    if (fwd) this.speed += accel * dt * (1 - Math.abs(this.speed) / (this.maxSpeed * 1.25));
    if (back) {
      if (this.speed > 0.5) this.speed -= brake * dt;
      else this.speed -= accel * 0.6 * dt;
    }
    if (!fwd && !back) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 10 * dt);
    if (handbrake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
      this.steer *= 1.6;
      if (Math.abs(this.speed) > 8 && game) game.spawnSkid(this.pos.x, this.pos.z, this.yaw);
    }
    this.speed = E.clamp(this.speed, -reverseMax, this.maxSpeed);
    if (this.autoDrive) this.speed = E.clamp(this.speed, 0, 9);
    if (Math.abs(this.speed) > 0.05) {
      this.yaw += this.steer * (this.speed / this.maxSpeed) * 1.9 * dt * Math.sign(this.speed);
    }
    this.integrate(dt, game);
  };

  Vehicle.prototype.integrate = function (dt, game) {
    var nx = this.pos.x + Math.sin(this.yaw) * -this.speed * dt;
    var nz = this.pos.z + Math.cos(this.yaw) * -this.speed * dt;
    // Note: forward is -Z of mesh rotated by yaw; sin/cos mapping keeps
    // movement consistent with mesh forward (-sin yaw, -cos yaw).
    var testX = nx, testZ = nz;
    var blocked = this.city.collides(testX, testZ, this.radius * 0.7);
    if (blocked) {
      // Try sliding along each axis.
      if (!this.city.collides(this.pos.x, testZ, this.radius * 0.7)) { testX = this.pos.x; }
      else if (!this.city.collides(testX, this.pos.z, this.radius * 0.7)) { testZ = this.pos.z; }
      else { testX = this.pos.x; testZ = this.pos.z; }
      if (Math.abs(this.speed) > 6) {
        this.damage(Math.abs(this.speed) * 0.9, game);
        if (game) { game.audio.crash(); game.spawnSparks(this.pos.x, this.pos.y + 0.8, this.pos.z); game.shake(0.25); }
      }
      this.speed *= 0.35;
    }
    this.pos.x = testX; this.pos.z = testZ;
    this.pos.y = this.city.groundHeight(this.pos.x, this.pos.z);
    // Body roll/pitch + bounce.
    var roll = -this.steer * E.clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1) * 0.09;
    var pitch = E.clamp(-this.speed / this.maxSpeed, -1, 1) * 0.03 + Math.sin(performance.now() * 0.02) * 0.004 * Math.abs(this.speed) / 20;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(pitch, this.yaw, roll);
    // Wheel spin + front steer.
    var wheels = this.mesh.userData.wheels || [];
    for (var i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += this.speed * dt * 2.4;
      if (i < 2) wheels[i].rotation.y = this.steer * 0.4;
    }
    // Siren strobe.
    if (this.type === 'police' && this.mesh.userData.sirenRed) {
      this.sirenPhase += dt * 8;
      var on = Math.sin(this.sirenPhase) > 0;
      this.mesh.userData.sirenRed.material.emissiveIntensity = on ? 4 : 0.4;
      this.mesh.userData.sirenBlue.material.emissiveIntensity = on ? 0.4 : 4;
    }
    // Burning smoke.
    if (this.burning && !this.wreck) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.12;
        if (game) game.spawnSmoke(this.pos.x, this.pos.y + 1.2, this.pos.z);
      }
    }
    if (this.wreck) {
      this.burnTimer -= dt;
      if (this.burnTimer < -4) { /* stays as wreck */ }
    }
  };

  // --- Traffic AI ---
  Vehicle.prototype.updateTraffic = function (dt, game, others) {
    if (this.wreck) return;
    var target = null;
    if (this.route && this.routeIdx < this.route.length) target = this.route[this.routeIdx];
    if (!target) {
      this.route = game.buildRandomRoute(this.pos.x, this.pos.z);
      this.routeIdx = 0;
      return;
    }
    var dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 4) { this.routeIdx++; return; }
    var desiredYaw = Math.atan2(-dx, -dz);
    var dyaw = ((desiredYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    var steer = E.clamp(dyaw * 2.2, -1, 1);
    this.steer = E.lerp(this.steer, steer, dt * 6);
    // Traffic light ahead.
    var aheadX = this.pos.x - Math.sin(this.yaw) * 12, aheadZ = this.pos.z - Math.cos(this.yaw) * 12;
    var light = game.city.lightStateAt(aheadX, aheadZ, game.timeSec);
    // Car ahead: slow/stop.
    var blocked = false;
    for (var i = 0; i < others.length; i++) {
      var o = others[i];
      if (o === this || o.wreck) continue;
      var ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z;
      var fwd = -Math.sin(this.yaw) * ox + -Math.cos(this.yaw) * oz;
      var side = Math.abs(Math.cos(this.yaw) * ox - Math.sin(this.yaw) * oz);
      if (fwd > 0 && fwd < 10 && side < 3.2) { blocked = true; break; }
    }
    var cruise = this.maxSpeed * 0.55;
    if (light === 'red' && d < 40) cruise = 0;
    if (blocked) cruise = 0;
    if (this.speed < cruise) this.speed += 10 * dt;
    else if (this.speed > cruise) this.speed -= 18 * dt;
    if (Math.abs(this.speed) > 0.05) this.yaw += this.steer * (this.speed / this.maxSpeed) * 1.9 * dt;
    this.integrate(dt, game);
    // Stuck detection: teleport back onto a road if jammed > 6s.
    var moved = E.dist2(this.pos.x, this.pos.z, this.lastPos.x, this.lastPos.z);
    if (moved < 0.05) { this.stuckTimer += dt; } else { this.stuckTimer = 0; this.lastPos.copy(this.pos); }
    if (this.stuckTimer > 6) {
      var rp = game.city.nearestRoadPoint(this.pos.x, this.pos.z);
      this.pos.set(rp.x, game.city.groundHeight(rp.x, rp.z), rp.z);
      this.route = game.buildRandomRoute(rp.x, rp.z); this.routeIdx = 0;
      this.stuckTimer = 0;
    }
  };

  // --- Police chase AI ---
  Vehicle.prototype.updateChase = function (dt, game, targetPos) {
    if (this.wreck) return;
    var dx = targetPos.x - this.pos.x, dz = targetPos.z - this.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    var desiredYaw = Math.atan2(-dx, -dz);
    var dyaw = ((desiredYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.steer = E.lerp(this.steer, E.clamp(dyaw * 2.5, -1, 1), dt * 7);
    var cruise = this.maxSpeed * (d > 60 ? 1 : 0.92);
    // PIT: if close and alongside, aim slightly ahead of target.
    if (d < 12 && Math.abs(dyaw) > 0.4) cruise = this.maxSpeed;
    if (this.speed < cruise) this.speed += 16 * dt;
    else this.speed -= 10 * dt;
    if (Math.abs(this.speed) > 0.05) this.yaw += this.steer * (this.speed / this.maxSpeed) * 2.1 * dt;
    this.integrate(dt, game);
  };

  Vehicle.prototype.dispose = function () {
    this.scene.remove(this.mesh);
  };

  E.buildVehicleMesh = buildVehicleMesh;
  E.Vehicle = Vehicle;
})();
