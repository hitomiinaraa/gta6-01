// EMBER TIDE — combat.js
// Weapons (pistol, SMG, shotgun, rifle, grenade, fists), hitscan shooting
// with tracers, muzzle flash, recoil, reload, ammo, pickups, and enemy gang
// AI that seeks cover, shoots, and dies with a stylized fall. No gore:
// hits show sparks and a flash only.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  function CombatSystem(scene, city, game) {
    this.scene = scene; this.city = city; this.game = game;
    this.currentWeapon = 'pistol';
    this.ammo = {};
    for (var k in E.WEAPONS) this.ammo[k] = E.WEAPONS[k].ammo === Infinity ? Infinity : Math.floor(E.WEAPONS[k].ammo / 2);
    this.ammo.pistol = 48; this.ammo.smg = 120; this.ammo.shotgun = 18; this.ammo.rifle = 90; this.ammo.grenade = 3;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.recoil = 0;
    this.enemies = [];
    this.tracers = [];
    this.flashes = [];
    this.muzzle = null;
    this.rng = E.makeRng(E.CFG.seed + 31);
    // Muzzle flash sprite.
    var flashMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0 });
    this.muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), flashMat);
    this.muzzle.visible = false;
    scene.add(this.muzzle);
  }

  CombatSystem.prototype.switchWeapon = function (key) {
    if (E.WEAPONS[key]) { this.currentWeapon = key; this.reloadTimer = 0; }
  };

  CombatSystem.prototype.canFire = function () {
    var w = E.WEAPONS[this.currentWeapon];
    if (this.reloadTimer > 0 || this.fireTimer > 0) return false;
    if (this.currentWeapon === 'fists') return true;
    return this.ammo[this.currentWeapon] > 0;
  };

  CombatSystem.prototype.fire = function (origin, dir, shooterIsPlayer) {
    var w = E.WEAPONS[this.currentWeapon];
    if (!this.canFire()) {
      if (this.ammo[this.currentWeapon] === 0) this.startReload();
      return false;
    }
    this.fireTimer = 1 / w.rate;
    if (this.currentWeapon !== 'fists') this.ammo[this.currentWeapon]--;
    this.recoil = 1;
    if (shooterIsPlayer && this.game.audio) this.game.audio.shot(this.currentWeapon);
    if (this.currentWeapon === 'grenade') {
      this.game.spawnGrenade(origin, dir);
      return true;
    }
    var pellets = w.pellets || 1;
    for (var p = 0; p < pellets; p++) {
      var spread = 0.03 + (w.pellets ? 0.05 : 0);
      var d = dir.clone();
      d.x += (Math.random() - 0.5) * spread; d.y += (Math.random() - 0.5) * spread; d.z += (Math.random() - 0.5) * spread;
      d.normalize();
      this.shootRay(origin, d, w, shooterIsPlayer);
    }
    // Muzzle flash at origin.
    this.muzzle.position.copy(origin).add(dir.clone().multiplyScalar(0.9));
    this.muzzle.lookAt(this.game.camera.position);
    this.muzzle.visible = true;
    this.muzzle.material.opacity = 0.95;
    return true;
  };

  CombatSystem.prototype.shootRay = function (origin, dir, w, shooterIsPlayer) {
    var end = origin.clone().add(dir.clone().multiplyScalar(w.range));
    var hitDist = w.range, hitPoint = end, hitWhat = null;
    // Enemies.
    for (var i = 0; i < this.enemies.length; i++) {
      var en = this.enemies[i];
      if (en.dead) continue;
      var to = en.pos.clone().sub(origin);
      var along = to.dot(dir);
      if (along < 0 || along > w.range) continue;
      var perp = to.clone().add(dir.clone().multiplyScalar(-along));
      if (perp.length() < 0.9 && along < hitDist) {
        hitDist = along; hitPoint = origin.clone().add(dir.clone().multiplyScalar(along)); hitWhat = en;
      }
    }
    // Player (enemy fire).
    if (!shooterIsPlayer && this.game.player) {
      var p = this.game.player;
      if (!p.dead) {
        var tp = p.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(origin);
        var al = tp.dot(dir);
        if (al > 0 && al < w.range) {
          var pp = tp.clone().add(dir.clone().multiplyScalar(-al));
          if (pp.length() < 1.0 && al < hitDist) {
            hitDist = al; hitPoint = origin.clone().add(dir.clone().multiplyScalar(al));
            hitWhat = 'player';
          }
        }
      }
    }
    // Vehicles.
    var vehs = this.game.vehicles || [];
    for (var v = 0; v < vehs.length; v++) {
      var veh = vehs[v];
      if (veh.wreck) continue;
      var tv = veh.pos.clone().sub(origin);
      var av = tv.dot(dir);
      if (av < 0 || av > w.range) continue;
      var pv = tv.clone().add(dir.clone().multiplyScalar(-av));
      if (pv.length() < veh.radius && av < hitDist) {
        hitDist = av; hitPoint = origin.clone().add(dir.clone().multiplyScalar(av)); hitWhat = veh;
      }
    }
    // Buildings block shots: ray vs nearest collider (cheap 2D check along ray).
    var steps = Math.floor(hitDist / 2);
    for (var s2 = 1; s2 <= steps; s2++) {
      var px = origin.x + dir.x * s2 * 2, pz = origin.z + dir.z * s2 * 2;
      if (this.city.collides(px, pz, 0.3)) {
        var bd = s2 * 2;
        if (bd < hitDist) { hitDist = bd; hitPoint = origin.clone().add(dir.clone().multiplyScalar(bd)); hitWhat = 'wall'; }
        break;
      }
    }
    this.spawnTracer(origin, hitPoint, w.color);
    if (hitWhat === 'player') {
      this.game.player.takeDamage(w.damage);
      this.game.spawnSparks(hitPoint.x, hitPoint.y, hitPoint.z);
      this.game.shake(0.3);
    } else if (hitWhat && hitWhat !== 'wall' && hitWhat.body) {
      // Enemy gang member.
      this.enemyTakeDamage(hitWhat, w.damage);
      this.game.spawnSparks(hitPoint.x, hitPoint.y, hitPoint.z);
    } else if (hitWhat && hitWhat !== 'wall' && hitWhat.damage) {
      hitWhat.damage(w.damage, this.game);
      this.game.spawnSparks(hitPoint.x, hitPoint.y, hitPoint.z);
    } else {
      this.game.spawnSparks(hitPoint.x, hitPoint.y, hitPoint.z);
    }
    return hitWhat;
  };

  CombatSystem.prototype.spawnTracer = function (a, b, color) {
    var geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line: line, life: 0.25 });
  };

  CombatSystem.prototype.startReload = function () {
    var w = E.WEAPONS[this.currentWeapon];
    if (this.currentWeapon === 'fists' || this.ammo[this.currentWeapon] <= 0) return;
    if (this.reloadTimer > 0) return;
    this.reloadTimer = 1.1;
    if (this.game.audio) this.game.audio.reload();
  };

  CombatSystem.prototype.spawnEnemy = function (x, z, opts) {
    opts = opts || {};
    var look = E.buildHumanoid({ skin: 0xc89a6a, shirt: opts.shirt || 0x8a2a2a, pants: 0x2a2a2a, hair: 0x111111 });
    this.scene.add(look.group);
    var en = {
      body: look, group: look.group,
      pos: new THREE.Vector3(x, this.city.groundHeight(x, z), z),
      yaw: 0, hp: opts.hp || 60, dead: false, deadTimer: 0,
      fireTimer: this.rng.range(0.5, 2), state: 'guard',
      home: { x: x, z: z }, speed: 3.2, boss: !!opts.boss,
      name: opts.name || 'Hale Crew',
    };
    if (en.boss) { en.hp = 220; en.speed = 3.6; }
    this.enemies.push(en);
    return en;
  };

  CombatSystem.prototype.updateEnemies = function (dt, playerPos, playerDead) {
    for (var i = 0; i < this.enemies.length; i++) {
      var en = this.enemies[i];
      if (en.dead) {
        en.deadTimer += dt;
        en.group.rotation.x = E.lerp(en.group.rotation.x, -Math.PI / 2, dt * 5);
        if (en.deadTimer > 12) { this.scene.remove(en.group); this.enemies.splice(i, 1); i--; }
        continue;
      }
      var d = Math.sqrt(E.dist2(en.pos.x, en.pos.z, playerPos.x, playerPos.z));
      var toPlayer = new THREE.Vector3(playerPos.x - en.pos.x, 0, playerPos.z - en.pos.z);
      if (!playerDead && d < 45) {
        en.state = 'attack';
        en.yaw = Math.atan2(toPlayer.x, toPlayer.z);
        // Move toward player until 12m, then hold and shoot.
        if (d > 12) {
          en.pos.x += Math.sin(en.yaw) * en.speed * dt;
          en.pos.z += Math.cos(en.yaw) * en.speed * dt;
          this.city.resolveCircle(en.pos, 0.5);
          en.pos.y = this.city.groundHeight(en.pos.x, en.pos.z);
        }
        en.fireTimer -= dt;
        if (en.fireTimer <= 0 && d < 40) {
          en.fireTimer = this.rng.range(0.9, 2.0);
          var origin = en.pos.clone(); origin.y += 1.4;
          var dir = new THREE.Vector3(playerPos.x - origin.x, 1.2 - origin.y, playerPos.z - origin.z).normalize();
          dir.x += (Math.random() - 0.5) * 0.12; dir.z += (Math.random() - 0.5) * 0.12;
          dir.normalize();
          var w = E.WEAPONS[en.boss ? 'rifle' : 'smg'];
          this.shootRay(origin, dir, w, false);
          if (this.game.audio) this.game.audio.shot('smg');
          this.game.peds.panicNear(en.pos.x, en.pos.z, 25);
        }
        // Walk animation.
        var swing = Math.sin(performance.now() * 0.008 + i) * (d > 12 ? 0.6 : 0.1);
        en.body.armL.rotation.x = swing; en.body.armR.rotation.x = -Math.PI / 2;
        en.body.legL.rotation.x = -swing; en.body.legR.rotation.x = swing;
      } else {
        en.state = 'guard';
        var hd = Math.sqrt(E.dist2(en.pos.x, en.pos.z, en.home.x, en.home.z));
        if (hd > 2) {
          var hy = Math.atan2(en.home.x - en.pos.x, en.home.z - en.pos.z);
          en.yaw = E.angleLerp(en.yaw, hy, dt * 4);
          en.pos.x += Math.sin(en.yaw) * 1.5 * dt;
          en.pos.z += Math.cos(en.yaw) * 1.5 * dt;
          en.pos.y = this.city.groundHeight(en.pos.x, en.pos.z);
        }
        en.body.armL.rotation.x = 0; en.body.armR.rotation.x = 0;
        en.body.legL.rotation.x = 0; en.body.legR.rotation.x = 0;
      }
      en.group.position.copy(en.pos);
      en.group.rotation.y = en.yaw;
      en.body.gun.visible = true;
    }
  };

  CombatSystem.prototype.update = function (dt, player) {
    this.fireTimer -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        var w = E.WEAPONS[this.currentWeapon];
        var reserve = 999; // arcade: reload tops up from a big reserve
        void reserve;
        this.ammo[this.currentWeapon] = w.ammo;
      }
    }
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
    if (this.muzzle.visible) {
      this.muzzle.material.opacity -= dt * 8;
      if (this.muzzle.material.opacity <= 0) this.muzzle.visible = false;
    }
    for (var i = this.tracers.length - 1; i >= 0; i--) {
      var t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    if (player) this.updateEnemies(dt, player.pos, player.dead);
  };

  CombatSystem.prototype.clearEnemies = function () {
    for (var i = 0; i < this.enemies.length; i++) this.scene.remove(this.enemies[i].group);
    this.enemies = [];
  };

  // Enemy damage entry point (used by shootRay via takeDamage).
  CombatSystem.prototype.enemyTakeDamage = function (en, amount) {
    en.hp -= amount;
    if (en.hp <= 0 && !en.dead) {
      en.dead = true; en.deadTimer = 0;
      this.game.onEnemyKilled(en);
    }
  };

  E.CombatSystem = CombatSystem;
})();
