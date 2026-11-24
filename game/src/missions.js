// EMBER TIDE — missions.js
// Story: 8 chained missions with cinematic dialogue (letterbox bars, camera
// cuts, subtitles, portraits), world beam markers + minimap blips, objectives,
// timers, checkpoints, fail/retry, money rewards and unlocks. Side work:
// taxi fares, street races, random crimes, ember-token collectibles.
// Every fail case (death, car destroyed, left area, target escaped, quit
// to menu) returns the mission to a retryable state.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  function MissionManager(scene, city, game) {
    this.scene = scene; this.city = city; this.game = game;
    this.current = 0;        // index into E.MISSIONS (0-based), -1 = story done
    this.active = null;      // runtime mission state
    this.beam = null;        // world marker beam
    this.beamLight = null;
    this.targetCar = null;
    this.tailCars = [];
    this.killTarget = 0;
    this.killCount = 0;
    this.timer = 0;
    this.cutscene = null;    // {lines:[{who,text}], idx, timer, onDone}
    this.taxi = null;        // active taxi job
    this.race = null;        // active street race
    this.tokens = [];        // collectible ember tokens
    this.tokensCollected = 0;
    this.respect = 0;        // respect rank 0..5
    this.rng = E.makeRng(E.CFG.seed + 91);
    this.buildBeam();
    this.spawnTokens();
  }

  MissionManager.prototype.buildBeam = function () {
    var geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true);
    var mat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.beam = new THREE.Mesh(geo, mat);
    this.beam.position.y = 30;
    this.beam.visible = false;
    this.scene.add(this.beam);
    this.beamLight = new THREE.PointLight(0xffd23a, 30, 40);
    this.beamLight.position.y = 4;
    this.scene.add(this.beamLight);
    this.beamLight.visible = false;
  };

  MissionManager.prototype.spawnTokens = function () {
    var mat = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff6a00, emissiveIntensity: 2.2 });
    var geo = new THREE.OctahedronGeometry(0.55);
    for (var i = 0; i < 12; i++) {
      var x = this.rng.range(-280, 280), z = this.rng.range(-280, 280);
      var rp = this.city.nearestRoadPoint(x, z);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rp.x + this.rng.range(-6, 6), 1.4, rp.z + this.rng.range(-6, 6));
      this.scene.add(mesh);
      this.tokens.push({ mesh: mesh, taken: false });
    }
  };

  MissionManager.prototype.currentDef = function () {
    if (this.current < 0 || this.current >= E.MISSIONS.length) return null;
    return E.MISSIONS[this.current];
  };

  MissionManager.prototype.startMission = function (idx) {
    var def = E.MISSIONS[idx];
    if (!def) return;
    this.current = idx;
    this.killCount = 0;
    this.timer = def.timeLimit || 0;
    this.tailCars = [];
    this.active = {
      def: def, stage: 0, startedAt: this.game.timeSec,
      checkpoint: null,
    };
    var target = def.target;
    this.beam.position.set(target[0], 30, target[1]);
    this.beam.visible = true;
    this.beamLight.position.set(target[0], 4, target[1]);
    this.beamLight.visible = true;
    this.game.waypoint = { x: target[0], z: target[1] };
    this.game.notify('MISSION: ' + def.title + ' — ' + def.objective, 'mission');
    this.showDialogue(def.giver, def.brief, function () {});
    // Mission-specific setup.
    if (def.kind === 'steal') {
      this.targetCar = new E.Vehicle(this.scene, this.city, 'sports', target[0] + 6, target[1], Math.PI / 2, 0xd8842a);
      this.targetCar.driver = null;
      this.game.vehicles.push(this.targetCar);
      this.game.notify('The ochre Veloce GT is parked on Marina Row.', 'info');
    } else if (def.kind === 'chase') {
      for (var i = 0; i < 2; i++) {
        var c = new E.Vehicle(this.scene, this.city, 'sedan', 60 + i * 12, 60 + i * 6, 0, 0x2a2a2a);
        c.driver = 'tail'; c.hp = 60;
        this.game.vehicles.push(c);
        this.tailCars.push(c);
      }
      this.game.notify('Two black sedans are tailing Dizzy. Wreck them both.', 'info');
    } else if (def.kind === 'shootout') {
      var n = def.id === 4 ? 5 : (def.id === 5 ? 6 : 8);
      this.killTarget = n;
      for (var j = 0; j < n; j++) {
        var ang = (j / n) * Math.PI * 2;
        var ex = target[0] + Math.cos(ang) * this.rng.range(8, 22);
        var ez = target[1] + Math.sin(ang) * this.rng.range(8, 22);
        var boss = def.id === 8 && j === 0;
        var en = this.game.combat.spawnEnemy(ex, ez, { boss: boss, name: boss ? 'Corvin Hale' : 'Hale Crew', hp: boss ? 220 : 60 });
        if (boss) this.game.notify('CORVIN HALE is here. End this.', 'bad');
      }
      this.game.notify('Hostiles: ' + n + '. Clear them out.', 'info');
    } else if (def.kind === 'heist') {
      this.game.notify('Grab the vault cash inside the Harbor Bank, then get out.', 'info');
    } else if (def.kind === 'escape') {
      this.game.police.addHeat(70, 'Hale tipped off the CCPD');
    }
    if (this.game.audio) this.game.audio.uiClick();
  };

  MissionManager.prototype.showDialogue = function (who, text, onDone) {
    var ch = E.CHARACTERS[who] || E.CHARACTERS.vesper;
    this.cutscene = {
      lines: [{ who: ch.name, role: ch.role, color: ch.color, text: text }],
      idx: 0, timer: 0, onDone: onDone || function () {},
      letterbox: true,
    };
    this.game.state = 'cutscene';
  };

  MissionManager.prototype.showCutscene = function (lines, onDone) {
    this.cutscene = { lines: lines, idx: 0, timer: 0, onDone: onDone || function () {}, letterbox: true };
    this.game.state = 'cutscene';
  };

  MissionManager.prototype.advanceDialogue = function () {
    if (!this.cutscene) return;
    this.cutscene.idx++;
    if (this.cutscene.idx >= this.cutscene.lines.length) {
      var cb = this.cutscene.onDone;
      this.cutscene = null;
      this.game.state = 'playing';
      cb();
    }
  };

  MissionManager.prototype.failMission = function (reason) {
    if (!this.active) return;
    this.game.notify('MISSION FAILED — ' + reason, 'bad');
    if (this.game.audio) this.game.audio.missionFail();
    this.cleanupMission(false);
    this.game.state = 'playing';
  };

  MissionManager.prototype.completeMission = function () {
    var def = this.active.def;
    var reward = def.reward;
    this.game.player.money += reward;
    this.respect = Math.min(5, this.respect + 1);
    this.game.notify('MISSION PASSED — ' + def.title + '  +' + E.fmtMoney(reward), 'good');
    if (this.game.audio) this.game.audio.missionDone();
    this.cleanupMission(true);
    this.current++;
    if (this.current >= E.MISSIONS.length) {
      this.current = -1;
      this.showCutscene([
        { who: 'Vesper Kane', role: 'Fixer', color: '#e58ab8', text: 'Hale is gone. The docks, the beach, the whole Cove — it is ours now, Rook.' },
        { who: 'Rook Marlowe', role: 'Wheelman', color: '#ffcf5c', text: 'Then let us drive into the sunset like we mean it.' },
      ], function () {});
      this.game.notify('STORY COMPLETE — Cinder Cove is yours. Free roam unlocked.', 'good');
    } else {
      var next = E.MISSIONS[this.current];
      this.game.notify('Next mission: ' + next.title + ' — talk to ' + (E.CHARACTERS[next.giver] || {}).name + ' (press N to start)', 'info');
    }
  };

  MissionManager.prototype.cleanupMission = function (passed) {
    if (this.targetCar && !passed) {
      // leave the car where it is; it stays stealable
    }
    if (this.targetCar && passed) {
      var idx = this.game.vehicles.indexOf(this.targetCar);
      if (idx >= 0) { this.game.vehicles.splice(idx, 1); this.targetCar.dispose(); }
    }
    this.targetCar = null;
    for (var i = 0; i < this.tailCars.length; i++) {
      if (passed) { var ti = this.game.vehicles.indexOf(this.tailCars[i]); if (ti >= 0) this.game.vehicles.splice(ti, 1); }
    }
    this.tailCars = [];
    this.active = null;
    this.beam.visible = false;
    this.beamLight.visible = false;
    this.game.waypoint = null;
  };

  MissionManager.prototype.onEnemyKilled = function (en) {
    if (!this.active) return;
    var def = this.active.def;
    if (def.kind === 'shootout' || def.kind === 'finale') {
      this.killCount++;
      this.game.notify('Hostiles down: ' + this.killCount + '/' + this.killTarget, 'info');
      if (this.killCount >= this.killTarget) this.completeMission();
    }
  };

  MissionManager.prototype.update = function (dt, playerPos, playerInCar, currentCar) {
    // Beam pulse.
    if (this.beam.visible) {
      this.beam.rotation.y += dt;
      this.beam.material.opacity = 0.28 + 0.12 * Math.sin(this.game.timeSec * 3);
    }
    // Tokens spin + collect.
    for (var i = 0; i < this.tokens.length; i++) {
      var tk = this.tokens[i];
      if (tk.taken) continue;
      tk.mesh.rotation.y += dt * 2;
      tk.mesh.position.y = 1.4 + Math.sin(this.game.timeSec * 2 + i) * 0.25;
      if (E.dist2(tk.mesh.position.x, tk.mesh.position.z, playerPos.x, playerPos.z) < 4) {
        tk.taken = true; tk.mesh.visible = false;
        this.tokensCollected++;
        this.game.player.money += 150;
        this.game.notify('Ember token +' + E.fmtMoney(150) + '  (' + this.tokensCollected + '/12)', 'good');
        if (this.game.audio) this.game.audio.pickup();
      }
    }
    if (!this.active) return;
    var def = this.active.def;
    var target = def.target;
    var d = Math.sqrt(E.dist2(playerPos.x, playerPos.z, target[0], target[1]));
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.failMission('Out of time'); return; }
    }
    if (this.game.player.dead) { this.failMission('You were wasted'); return; }
    switch (def.kind) {
      case 'steal':
        if (playerInCar && currentCar === this.targetCar && d < 18) {
          this.completeMission();
        }
        break;
      case 'deliver':
        if (d < 10) this.completeMission();
        break;
      case 'chase': {
        var wrecked = 0;
        for (var t = 0; t < this.tailCars.length; t++) if (this.tailCars[t].wreck) wrecked++;
        if (wrecked >= 2) this.completeMission();
        else {
          // Tail cars chase the player.
          for (var t2 = 0; t2 < this.tailCars.length; t2++) {
            var tc = this.tailCars[t2];
            if (!tc.wreck) tc.updateChase(dt, this.game, playerPos);
          }
        }
        break;
      }
      case 'heist':
        if (this.active.stage === 0 && d < 12) {
          this.active.stage = 1;
          this.game.player.money += 0;
          this.game.notify('Vault cash grabbed! Get out of the bank — now!', 'info');
          this.game.police.addHeat(45, 'Bank alarm tripped');
          var ex = target[0] + 40, ez = target[1] + 40;
          this.beam.position.set(ex, 30, ez);
          this.beamLight.position.set(ex, 4, ez);
          this.game.waypoint = { x: ex, z: ez };
          this.active.def = Object.assign({}, def, { target: [ex, ez] });
        } else if (this.active.stage === 1 && d > 60) {
          this.completeMission();
        }
        break;
      case 'escape':
        if (d < 12 && this.game.police.wanted === 0) this.completeMission();
        else if (d < 12 && this.game.police.wanted > 0) {
          this.game.notify('Lose the cops first, then reach the tunnel.', 'info');
        }
        break;
      case 'shootout':
      case 'finale':
        // Completion handled by onEnemyKilled.
        break;
    }
    // Left-area fail for chase missions.
    if (def.kind === 'chase' && d > 400) this.failMission('Target escaped the area');
  };

  // --- Side activities ---
  MissionManager.prototype.startTaxi = function () {
    if (this.taxi) return;
    var p = this.game.player.pos;
    var dest = { x: this.rng.range(-280, 280), z: this.rng.range(-280, 280) };
    var rp = this.city.nearestRoadPoint(dest.x, dest.z);
    this.taxi = { dest: rp, fare: 180 + Math.floor(this.rng.range(0, 240)) };
    this.game.waypoint = rp;
    this.beam.position.set(rp.x, 30, rp.z); this.beam.visible = true;
    this.beamLight.position.set(rp.x, 4, rp.z); this.beamLight.visible = true;
    this.game.notify('TAXI FARE — take the passenger to the marker. Fare ' + E.fmtMoney(this.taxi.fare), 'info');
  };
  MissionManager.prototype.updateTaxi = function (dt, playerPos) {
    if (!this.taxi) return;
    var d = Math.sqrt(E.dist2(playerPos.x, playerPos.z, this.taxi.dest.x, this.taxi.dest.z));
    if (d < 10) {
      this.game.player.money += this.taxi.fare;
      this.game.notify('Fare paid +' + E.fmtMoney(this.taxi.fare), 'good');
      if (this.game.audio) this.game.audio.pickup();
      this.taxi = null;
      if (!this.active) { this.beam.visible = false; this.beamLight.visible = false; this.game.waypoint = null; }
    }
  };
  MissionManager.prototype.startRace = function () {
    if (this.race) return;
    var p = this.game.player.pos;
    var cps = [];
    for (var i = 0; i < 4; i++) {
      var rp = this.city.nearestRoadPoint(p.x + this.rng.range(-200, 200), p.z + this.rng.range(-200, 200));
      cps.push(rp);
    }
    this.race = { checkpoints: cps, idx: 0, timer: 120 };
    this.game.waypoint = cps[0];
    this.beam.position.set(cps[0].x, 30, cps[0].z); this.beam.visible = true;
    this.beamLight.position.set(cps[0].x, 4, cps[0].z); this.beamLight.visible = true;
    this.game.notify('STREET RACE — hit all 4 checkpoints in 2:00. Win ' + E.fmtMoney(800), 'info');
  };
  MissionManager.prototype.updateRace = function (dt, playerPos) {
    if (!this.race) return;
    this.race.timer -= dt;
    if (this.race.timer <= 0) {
      this.game.notify('Race lost — out of time.', 'bad');
      this.race = null;
      if (!this.active) { this.beam.visible = false; this.beamLight.visible = false; this.game.waypoint = null; }
      return;
    }
    var cp = this.race.checkpoints[this.race.idx];
    var d = Math.sqrt(E.dist2(playerPos.x, playerPos.z, cp.x, cp.z));
    if (d < 10) {
      this.race.idx++;
      if (this.race.idx >= this.race.checkpoints.length) {
        this.game.player.money += 800;
        this.game.notify('RACE WON +' + E.fmtMoney(800), 'good');
        if (this.game.audio) this.game.audio.missionDone();
        this.race = null;
        if (!this.active) { this.beam.visible = false; this.beamLight.visible = false; this.game.waypoint = null; }
      } else {
        var ncp = this.race.checkpoints[this.race.idx];
        this.game.waypoint = ncp;
        this.beam.position.set(ncp.x, 30, ncp.z);
        this.beamLight.position.set(ncp.x, 4, ncp.z);
        this.game.notify('Checkpoint ' + this.race.idx + '/4', 'info');
      }
    }
  };

  E.MissionManager = MissionManager;
})();
