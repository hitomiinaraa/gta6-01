// EMBER TIDE — player.js
// Third-person on-foot character: procedural humanoid with animated limbs,
// WASD + sprint + jump, mouse-look orbit camera with collision, over-the-
// shoulder aim. Camera never clips walls: ray-sphere pull-in against
// building colliders.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  function buildHumanoid(colors) {
    // Procedural low-poly person. Returns {group, parts:{...}}.
    var g = new THREE.Group();
    var mat = function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }); };
    var skin = mat(colors.skin), shirt = mat(colors.shirt), pants = mat(colors.pants), hair = mat(colors.hair);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
    torso.position.y = 1.18; torso.castShadow = true; g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), skin);
    head.position.y = 1.78; head.castShadow = true; g.add(head);
    var hairM = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.36), hair);
    hairM.position.y = 1.99; g.add(hairM);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.42), mat(colors.cap || 0x222222));
    cap.position.y = 2.02; g.add(cap);
    function limb(w, h, d, m, x, y) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.geometry.translate(0, -h / 2, 0);
      mesh.position.set(x, y, 0); mesh.castShadow = true;
      g.add(mesh); return mesh;
    }
    var armL = limb(0.18, 0.62, 0.2, shirt, -0.42, 1.48);
    var armR = limb(0.18, 0.62, 0.2, shirt, 0.42, 1.48);
    var legL = limb(0.24, 0.72, 0.26, pants, -0.17, 0.82);
    var legR = limb(0.24, 0.72, 0.26, pants, 0.17, 0.82);
    // Simple gun in right hand (shown when armed).
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), mat(0x1a1a1a));
    gun.position.set(0.42, 1.05, 0.28); gun.visible = false; g.add(gun);
    return { group: g, torso: torso, head: head, armL: armL, armR: armR, legL: legL, legR: legR, gun: gun };
  }

  function PlayerCharacter(scene, city) {
    this.scene = scene;
    this.city = city;
    var look = buildHumanoid({ skin: 0xc89a6a, shirt: 0xffcf5c, pants: 0x2a3a5a, hair: 0x1a1a1a });
    this.body = look;
    this.group = look.group;
    scene.add(this.group);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;       // facing direction
    this.camYaw = Math.PI;    // camera orbit yaw
    this.camPitch = 0.32;
    this.camDist = 5.2;
    this.onGround = true;
    this.vy = 0;
    this.health = E.CFG.playerHealth;
    this.armor = 0;
    this.money = 250;
    this.animTime = 0;
    this.moving = false;
    this.aiming = false;
    this.speed = 0;
    this.dead = false;
    this.footstepTimer = 0;
  }

  PlayerCharacter.prototype.spawn = function (x, z, yaw) {
    this.pos.set(x, this.city.groundHeight(x, z), z);
    this.yaw = yaw || Math.PI; this.camYaw = this.yaw;
    this.vel.set(0, 0, 0); this.vy = 0;
    this.health = E.CFG.playerHealth; this.dead = false;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  };

  PlayerCharacter.prototype.takeDamage = function (amount) {
    if (this.dead) return;
    var absorbed = Math.min(this.armor, amount * 0.6);
    this.armor -= absorbed;
    this.health -= (amount - absorbed);
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  };

  PlayerCharacter.prototype.update = function (dt, input, inCar, game) {
    var CFG = E.CFG;
    if (inCar || this.dead) { this.group.visible = inCar ? false : true; }
    else this.group.visible = true;
    if (inCar || this.dead) {
      if (this.dead) {
        // Fall over.
        this.group.rotation.x = E.lerp(this.group.rotation.x, -Math.PI / 2, dt * 4);
      }
      return;
    }
    this.group.rotation.x = 0;
    var mouse = input.consumeMouse();
    this.camYaw -= mouse.dx;
    this.camPitch = E.clamp(this.camPitch + mouse.dy, -0.15, 1.1);
    var fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    var rightX = -fwdZ, rightZ = fwdX;
    var mx = 0, mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) { mx += fwdX; mz += fwdZ; }
    if (input.down('KeyS') || input.down('ArrowDown')) { mx -= fwdX; mz -= fwdZ; }
    if (input.down('KeyA')) { mx -= rightX; mz -= rightZ; }
    if (input.down('KeyD')) { mx += rightX; mz += rightZ; }
    var len = Math.sqrt(mx * mx + mz * mz);
    this.moving = len > 0.01;
    var sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    var speed = sprint ? CFG.sprintSpeed : (input.down('KeyC') ? CFG.walkSpeed * 0.6 : CFG.runSpeed);
    if (this.aiming) speed *= 0.55;
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.yaw = Math.atan2(mx, mz);
      this.speed = speed;
    } else this.speed = 0;
    // Jump.
    if (input.hit('Space') && this.onGround) { this.vy = CFG.jumpSpeed; this.onGround = false; }
    this.vy -= 22 * dt;
    this.pos.y += this.vy * dt;
    var ground = this.city.groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.onGround = true; }
    // Collisions with buildings/props/water.
    this.city.resolveCircle(this.pos, CFG.playerRadius);
    this.pos.y = this.city.groundHeight(this.pos.x, this.pos.z) + (this.onGround ? 0 : this.pos.y - ground);
    if (this.onGround) this.pos.y = this.city.groundHeight(this.pos.x, this.pos.z);
    // Footsteps.
    if (this.moving && this.onGround) {
      this.footstepTimer -= dt * this.speed;
      if (this.footstepTimer <= 0) { this.footstepTimer = 2.2; if (game && game.audio) game.audio.footstep(); }
    }
    // Animation.
    this.animTime += dt * (this.moving ? this.speed : 2);
    var swing = this.moving ? Math.sin(this.animTime * 1.6) * 0.75 : Math.sin(this.animTime * 0.5) * 0.05;
    var b = this.body;
    if (this.aiming) {
      b.armR.rotation.x = -Math.PI / 2; b.armL.rotation.x = -Math.PI / 2 + 0.3;
      b.legL.rotation.x = 0; b.legR.rotation.x = 0;
    } else {
      b.armL.rotation.x = swing; b.armR.rotation.x = -swing;
      b.legL.rotation.x = -swing; b.legR.rotation.x = swing;
    }
    b.torso.position.y = 1.18 + (this.moving ? Math.abs(Math.sin(this.animTime * 1.6)) * 0.05 : 0);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    b.gun.visible = !!game && !!game.combat && game.combat.currentWeapon !== 'fists';
  };

  // Third-person camera: orbit behind player, pulled in by building colliders.
  PlayerCharacter.prototype.updateCamera = function (camera, dt, inCar, carPos, carYaw) {
    if (inCar && carPos) {
      var back = 9.5, height = 3.6;
      var bx = carPos.x + Math.sin(carYaw) * back;
      var bz = carPos.z + Math.cos(carYaw) * back;
      var by = carPos.y + height;
      // Pull camera out of buildings.
      var steps = 8, cx = bx, cz = bz;
      for (var i = 0; i < steps; i++) {
        var t = i / steps;
        var px = E.lerp(carPos.x, bx, t), pz = E.lerp(carPos.z, bz, t);
        if (this.city.collides(px, pz, 0.6)) { cx = E.lerp(carPos.x, bx, Math.max(0, t - 0.15)); cz = E.lerp(carPos.z, bz, Math.max(0, t - 0.15)); break; }
        cx = px; cz = pz;
      }
      camera.position.set(cx, Math.max(by, 1.2), cz);
      camera.lookAt(carPos.x, carPos.y + 1.6, carPos.z);
      return;
    }
    var dist = this.aiming ? 4.2 : this.camDist;
    var cx2 = this.pos.x + Math.sin(this.camYaw) * dist;
    var cz2 = this.pos.z + Math.cos(this.camYaw) * dist;
    var cy = this.pos.y + 1.6 + Math.sin(this.camPitch) * dist * 0.9;
    // Camera collision: walk the ray back until clear.
    for (var s = 1; s >= 0.2; s -= 0.2) {
      var px2 = this.pos.x + Math.sin(this.camYaw) * dist * s;
      var pz2 = this.pos.z + Math.cos(this.camYaw) * dist * s;
      if (!this.city.collides(px2, pz2, 0.5)) {
        cx2 = px2; cz2 = pz2;
        cy = this.pos.y + 1.6 + Math.sin(this.camPitch) * dist * s * 0.9;
        break;
      }
    }
    cy = Math.max(cy, this.city.groundHeight(cx2, cz2) + 0.6);
    camera.position.set(cx2, cy, cz2);
    var lookY = this.pos.y + 1.5 - Math.sin(this.camPitch) * 1.2;
    camera.lookAt(this.pos.x - Math.sin(this.camYaw) * 2, lookY, this.pos.z - Math.cos(this.camYaw) * 2);
  };

  E.buildHumanoid = buildHumanoid;
  E.PlayerCharacter = PlayerCharacter;
})();
