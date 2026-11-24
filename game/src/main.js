// EMBER TIDE — main.js
// Game: state machine (loading, title, playing, paused, cutscene, dead,
// busted, map), fixed-timestep loop (60 Hz accumulator, delta clamp),
// renderer + day/night lighting + weather, effects (explosions, smoke,
// sparks, skid marks, tracers), traffic spawning, car enter/exit/carjack,
// death/arrest, autosave, F3 debug, resize/blur handling. Every subsystem
// update is wrapped in try/catch so one error never freezes the loop.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  function Game() {
    this.state = 'loading';
    this.prevState = 'playing';
    this.timeSec = 0;
    this.clockMinutes = E.CFG.startMinutes;
    this.weather = 'dusk';
    this.rain = 0;
    this.fps = 60;
    this.debugOn = false;
    this.errors = [];
    this.waypoint = null;
    this.currentCar = null;
    this.vehicles = [];
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.cameraFovKick = 0;
    this.autosaveTimer = 60;
    this.deathTimer = 0;
    this.shotMode = false;
    this.enterTimer = 0;
    this.flipTimer = 0;
    this.effects = [];
    this.skids = [];
    this.grenades = [];
    this.settings = { volume: 0.7, sensitivity: 1.0, quality: 'Medium', invertY: false };
    this.rng = E.makeRng(E.CFG.seed + 7);
  }

  Game.prototype.init = function () {
    var self = this;
    var canvas = document.getElementById('game-canvas');
    this.canvas = canvas;
    if (!window.WebGLRenderingContext) { this.webglError('WebGL is not available in this browser.'); return; }
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (err) { this.webglError('WebGL could not start: ' + err.message); return; }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, E.CFG.pixelRatioCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x2a1a3a, 120, 620);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 40, 120);
    // Lights: one shadowed directional sun + hemisphere.
    this.sun = new THREE.DirectionalLight(0xffb070, 2.2);
    this.sun.position.set(-180, 140, 220);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(E.CFG.shadowSize, E.CFG.shadowSize);
    this.sun.shadow.camera.left = -90; this.sun.shadow.camera.right = 90;
    this.sun.shadow.camera.top = 90; this.sun.shadow.camera.bottom = -90;
    this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.hemi = new THREE.HemisphereLight(0xff9a6a, 0x2a2a4a, 0.9);
    this.scene.add(this.hemi);
    // Systems.
    this.audio = new E.AudioEngine();
    this.input = new E.Input(canvas);
    this.city = new E.CityBuilder(this.scene, E.CFG.seed);
    this.city.build();
    this.player = new E.PlayerCharacter(this.scene, this.city);
    this.player.spawn(0, 60, Math.PI);
    this.combat = new E.CombatSystem(this.scene, this.city, this);
    this.peds = new E.PedestrianManager(this.scene, this.city, this);
    this.police = new E.PoliceDispatch(this.scene, this.city, this);
    this.missions = new E.MissionManager(this.scene, this.city, this);
    this.save = new E.SaveSystem();
    this.hud = new E.HUD(this);
    this.shots = new E.ScreenshotDirector(this);
    this.settings = this.save.loadSettings();
    this.applySettings();
    this.spawnWorldTraffic();
    this.spawnParkedCars();
    this.wireUI();
    window.addEventListener('resize', function () { self.onResize(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && self.state === 'playing') self.pauseGame();
    });
    window.addEventListener('blur', function () {
      if (self.state === 'playing') self.pauseGame();
    });
    // Loading screen with tips, then title.
    this.hud.loadingTip.textContent = 'TIP: ' + E.TIPS[Math.floor(Math.random() * E.TIPS.length)];
    this.hud.loadingFill.style.width = '100%';
    setTimeout(function () {
      self.hud.loading.style.display = 'none';
      self.state = 'title';
      self.hud.showTitle(self.save.hasSave());
      self.shots.stage();
      if (self.shots.shot && self.shots.shot !== 4) self.state = 'playing';
    }, 600);
    // Fixed-timestep loop.
    var last = performance.now();
    var acc = 0, STEP = 1000 / 60;
    var self2 = this;
    function frame(now) {
      requestAnimationFrame(frame);
      var dtMs = Math.min(now - last, 100);
      last = now;
      self2.fps = self2.fps * 0.95 + (1000 / Math.max(dtMs, 1)) * 0.05;
      acc += dtMs;
      var steps = 0;
      while (acc >= STEP && steps < 4) {
        try { self2.update(STEP / 1000); } catch (err) { self2.reportError(err); }
        acc -= STEP; steps++;
      }
      if (steps === 4) acc = 0;
      try { self2.render(); } catch (err) { self2.reportError(err); }
      self2.input.endFrame();
    }
    requestAnimationFrame(frame);
  };

  Game.prototype.webglError = function (msg) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font:16px sans-serif;z-index:99;padding:40px;text-align:center;';
    d.textContent = msg;
    document.body.appendChild(d);
  };

  Game.prototype.reportError = function (err) {
    if (this.errors.length < 20) this.errors.push(String(err && err.message || err));
    console.error('[game]', err);
  };

  Game.prototype.applySettings = function () {
    this.audio.setVolume(this.settings.volume);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    var q = this.settings.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'Low' ? 1 : E.CFG.pixelRatioCap));
    this.renderer.shadowMap.enabled = q !== 'Low';
    this.sun.castShadow = q !== 'Low';
  };

  Game.prototype.onResize = function () {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  // --- UI wiring ---
  Game.prototype.wireUI = function () {
    var self = this;
    this.hud.btnNew.addEventListener('click', function () {
      self.audio.unlock(); self.audio.uiClick();
      self.startNewGame(false);
    });
    this.hud.btnContinue.addEventListener('click', function () {
      self.audio.unlock(); self.audio.uiClick();
      self.continueGame();
    });
    this.hud.btnControls.addEventListener('click', function () {
      self.hud.controlsPanel.style.display = 'block';
    });
    this.hud.btnSettings.addEventListener('click', function () {
      self.hud.settingsPanel.style.display = 'block';
    });
    document.getElementById('controls-close').addEventListener('click', function () {
      self.hud.controlsPanel.style.display = 'none';
    });
    document.getElementById('settings-close').addEventListener('click', function () {
      self.hud.settingsPanel.style.display = 'none';
      self.readSettingsFromUI();
    });
    document.getElementById('pause-resume').addEventListener('click', function () { self.resumeGame(); });
    document.getElementById('pause-save').addEventListener('click', function () {
      if (self.save.save(self)) self.hud.notify('Game saved.', 'good');
      else self.hud.notify('Save failed — storage unavailable.', 'bad');
    });
    document.getElementById('pause-quit').addEventListener('click', function () {
      self.hud.pauseMenu.style.display = 'none';
      self.state = 'title';
      self.hud.showTitle(self.save.hasSave());
    });
    this.canvas.addEventListener('click', function () { self.audio.unlock(); });
    document.addEventListener('click', function () {
      if (self.state === 'cutscene' && self.missions.cutscene) self.missions.advanceDialogue();
    });
  };

  Game.prototype.readSettingsFromUI = function () {
    var vol = document.getElementById('set-volume');
    var sens = document.getElementById('set-sens');
    var qual = document.getElementById('set-quality');
    var inv = document.getElementById('set-invert');
    if (!vol) return;
    this.settings = {
      volume: vol.value / 100,
      sensitivity: sens.value / 100,
      quality: qual.value,
      invertY: inv.checked,
    };
    this.save.saveSettings(this.settings);
    this.applySettings();
  };

  // --- Game flow ---
  Game.prototype.startNewGame = function (silent) {
    this.player.spawn(0, 60, Math.PI);
    this.player.money = 250; this.player.health = E.CFG.playerHealth; this.player.armor = 0;
    this.clockMinutes = E.CFG.startMinutes;
    this.missions.current = 0;
    this.missions.respect = 0;
    this.missions.tokensCollected = 0;
    this.police.reset(false);
    this.combat.clearEnemies();
    this.combat.currentWeapon = 'pistol';
    this.hud.hideTitle();
    this.hud.hideDeath();
    this.state = 'playing';
    if (!silent) {
      this.hud.notify('Welcome to Cinder Cove. Vesper is waiting at the Dusk Diner — press N to start Mission 1.', 'info');
      this.hud.bannerText('EMBER TIDE — CINDER COVE');
    }
  };

  Game.prototype.continueGame = function () {
    var data = this.save.load();
    if (!data) { this.startNewGame(false); return; }
    this.startNewGame(true);
    this.save.apply(this, data);
    this.hud.notify('Save loaded. Welcome back, Rook.', 'good');
  };

  Game.prototype.pauseGame = function () {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.pauseMenu.style.display = 'block';
    if (document.pointerLockElement) document.exitPointerLock();
  };
  Game.prototype.resumeGame = function () {
    this.hud.pauseMenu.style.display = 'none';
    this.state = 'playing';
    this.audio.unlock();
  };

  Game.prototype.wasted = function () {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathTimer = 0;
    this.hud.showDeath('WASTED', 'The Cove keeps what it takes. Hospital bill: $100.');
    this.audio.setSiren(false);
    if (document.pointerLockElement) document.exitPointerLock();
  };
  Game.prototype.busted = function () {
    if (this.state === 'busted') return;
    this.state = 'busted';
    this.deathTimer = 0;
    this.hud.showDeath('BUSTED', 'CCPD took you in. Bail: $150. The car is impounded.');
    this.audio.setSiren(false);
    if (document.pointerLockElement) document.exitPointerLock();
  };
  Game.prototype.respawnAfterDeath = function (busted) {
    var fee = busted ? 150 : 100;
    this.player.money = Math.max(0, this.player.money - fee);
    this.police.reset(false);
    this.combat.clearEnemies();
    if (this.missions.active) this.missions.failMission(busted ? 'Busted by the CCPD' : 'You were wasted');
    if (this.currentCar) { this.currentCar.driver = null; this.currentCar = null; }
    var hx = busted ? 120 : -60, hz = busted ? 0 : 240;
    this.player.spawn(hx, hz, Math.PI);
    this.player.health = E.CFG.playerHealth;
    this.player.armor = 0;
    this.hud.hideDeath();
    this.state = 'playing';
    this.hud.notify(busted ? 'Released from the CCPD station. Bail paid.' : 'Discharged from Cinder General. The city waits.', 'info');
  };

  // --- World population ---
  Game.prototype.spawnWorldTraffic = function () {
    var types = ['sedan', 'sedan', 'taxi', 'suv', 'truck', 'sports'];
    for (var i = 0; i < 16; i++) {
      var type = types[i % types.length];
      var rp = this.city.nearestRoadPoint(this.rng.range(-280, 280), this.rng.range(-280, 280));
      var car = new E.Vehicle(this.scene, this.city, type, rp.x, rp.z, this.rng.range(0, Math.PI * 2));
      car.driver = 'traffic';
      car.setRoute(this.buildRandomRoute(rp.x, rp.z));
      this.vehicles.push(car);
    }
  };
  Game.prototype.spawnParkedCars = function () {
    var types = ['sedan', 'sports', 'suv', 'bike', 'taxi'];
    for (var i = 0; i < 10; i++) {
      var type = types[i % types.length];
      var rp = this.city.nearestRoadPoint(this.rng.range(-280, 280), this.rng.range(-280, 280));
      var side = this.rng.chance(0.5) ? 5.5 : -5.5;
      var car = new E.Vehicle(this.scene, this.city, type, rp.x + side, rp.z, this.rng.range(0, Math.PI * 2));
      car.driver = null;
      this.vehicles.push(car);
    }
  };
  Game.prototype.buildRandomRoute = function (x, z) {
    var route = [];
    var cur = this.city.nearestRoadPoint(x, z);
    route.push(cur);
    for (var i = 0; i < 6; i++) {
      var next = this.city.nearestRoadPoint(
        cur.x + this.rng.range(-180, 180), cur.z + this.rng.range(-180, 180));
      route.push(next);
      cur = next;
    }
    return route;
  };
  Game.prototype.spawnTrafficBurst = function (x, z, n) {
    var types = ['sedan', 'taxi', 'suv', 'sports'];
    for (var i = 0; i < n; i++) {
      var rp = this.city.nearestRoadPoint(x + this.rng.range(-90, 90), z + this.rng.range(-90, 90));
      var car = new E.Vehicle(this.scene, this.city, types[i % types.length], rp.x, rp.z, this.rng.range(0, Math.PI * 2));
      car.driver = 'traffic';
      car.setRoute(this.buildRandomRoute(rp.x, rp.z));
      this.vehicles.push(car);
    }
  };
  Game.prototype.spawnPedBurst = function (x, z, n) {
    for (var i = 0; i < n; i++) {
      var rp = this.city.nearestRoadPoint(x + this.rng.range(-60, 60), z + this.rng.range(-60, 60));
      this.peds.spawnPed(rp.x + (this.rng.chance(0.5) ? 9.5 : -9.5), rp.z);
    }
  };
  Game.prototype.spawnPlayerCar = function (type, x, z, yaw, color) {
    var car = new E.Vehicle(this.scene, this.city, type, x, z, yaw, color);
    car.driver = null;
    this.vehicles.push(car);
    return car;
  };

  // --- Car enter / exit / carjack ---
  Game.prototype.nearestCar = function (x, z, maxD) {
    var best = null, bd = maxD * maxD;
    for (var i = 0; i < this.vehicles.length; i++) {
      var v = this.vehicles[i];
      if (v.wreck) continue;
      var d = E.dist2(x, z, v.pos.x, v.pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };
  Game.prototype.enterCar = function (car) {
    if (!car || car.wreck) return;
    if (car.driver === 'traffic') {
      // Carjack: driver flees on foot.
      car.driver = null;
      var d = new THREE.Vector3(car.pos.x + 3, car.pos.y, car.pos.z + 3);
      this.peds.spawnPed(d.x, d.z);
      var np = this.peds.peds[this.peds.peds.length - 1];
      if (np) np.panic(car.pos.x, car.pos.z);
      this.hud.notify('Carjacked the ' + car.name + '!', 'bad');
      // Theft in view of police raises wanted.
      var nearCop = false;
      for (var i = 0; i < this.police.units.length; i++) {
        if (E.dist2(car.pos.x, car.pos.z, this.police.units[i].pos.x, this.police.units[i].pos.z) < 50 * 50) { nearCop = true; break; }
      }
      this.police.addHeat(nearCop ? 22 : 10, nearCop ? 'Grand theft auto — witnessed' : 'Grand theft auto');
      if (this.audio) this.audio.horn();
    }
    this.currentCar = car;
    car.driver = 'player';
    this.player.group.visible = false;
    if (this.audio) this.audio.uiClick();
  };
  Game.prototype.exitCar = function () {
    if (!this.currentCar) return;
    var car = this.currentCar;
    car.driver = null;
    var sx = car.pos.x + Math.cos(car.yaw) * 3, sz = car.pos.z - Math.sin(car.yaw) * 3;
    if (this.city.collides(sx, sz, 0.6)) { sx = car.pos.x - Math.cos(car.yaw) * 3; sz = car.pos.z + Math.sin(car.yaw) * 3; }
    this.player.spawn(sx, sz, car.yaw);
    this.player.group.visible = true;
    this.currentCar = null;
  };

  // --- Effects ---
  Game.prototype.spawnExplosion = function (x, y, z, size) {
    size = size || 5;
    var geo = new THREE.SphereGeometry(size, 12, 10);
    var mat = new THREE.MeshBasicMaterial({ color: 0xffa02a, transparent: true, opacity: 0.9 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    var light = new THREE.PointLight(0xff8a2a, 120, 40);
    light.position.set(x, y + 2, z);
    this.scene.add(light);
    this.effects.push({ kind: 'explosion', mesh: mesh, light: light, life: 0.7, max: 0.7, size: size });
    this.shake(0.6);
    if (this.audio) this.audio.explosion();
    this.peds.panicNear(x, z, 40);
    // AoE damage.
    for (var i = 0; i < this.vehicles.length; i++) {
      var v = this.vehicles[i];
      if (E.dist2(x, z, v.pos.x, v.pos.z) < size * size * 4 && v !== this.currentCar) v.damage(60, this);
    }
    if (E.dist2(x, z, this.player.pos.x, this.player.pos.z) < size * size * 4) this.player.takeDamage(40);
  };
  Game.prototype.spawnSmoke = function (x, y, z) {
    var geo = new THREE.SphereGeometry(0.7, 8, 6);
    var mat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
    this.scene.add(mesh);
    this.effects.push({ kind: 'smoke', mesh: mesh, life: 1.4, max: 1.4 });
  };
  Game.prototype.spawnSparks = function (x, y, z) {
    var geo = new THREE.SphereGeometry(0.16, 6, 5);
    var mat = new THREE.MeshBasicMaterial({ color: 0xffe97a, transparent: true, opacity: 1 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.effects.push({ kind: 'spark', mesh: mesh, life: 0.25, max: 0.25 });
  };
  Game.prototype.spawnSkid = function (x, z, yaw) {
    if (this.skids.length > 60) {
      var old = this.skids.shift();
      this.scene.remove(old);
    }
    var geo = new THREE.PlaneGeometry(0.5, 2.2);
    var mat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = yaw;
    mesh.position.set(x, 0.08, z);
    this.scene.add(mesh);
    this.skids.push(mesh);
  };
  Game.prototype.spawnGrenade = function (origin, dir) {
    var geo = new THREE.SphereGeometry(0.22, 8, 6);
    var mat = new THREE.MeshStandardMaterial({ color: 0x2a4a2a });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({ mesh: mesh, vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5, 0)), timer: 1.4 });
  };
  Game.prototype.shake = function (mag) {
    this.shakeTime = Math.max(this.shakeTime, 0.35);
    this.shakeMag = Math.max(this.shakeMag, mag);
  };
  Game.prototype.notify = function (text, kind) { this.hud.notify(text, kind); };
  Game.prototype.onEnemyKilled = function (en) {
    this.missions.onEnemyKilled(en);
    this.player.money += 25;
  };
  Game.prototype.setWaypoint = function (x, z) {
    this.waypoint = { x: E.clamp(x, -330, 330), z: E.clamp(z, -330, 330) };
    this.hud.notify('Waypoint set — follow the gold GPS line.', 'info');
    if (this.hud.mapOpen) this.hud.drawFullMap();
  };
  Game.prototype.setWeather = function (kind) {
    this.weather = kind;
    if (kind === 'rain') this.rain = 1;
    else this.rain = 0;
    if (this.audio) this.audio.setRain(this.rain);
  };

  // --- Per-frame update ---
  Game.prototype.update = function (dt) {
    this.timeSec += dt;
    // Clock: 1 game minute per 2 real seconds.
    if (this.state === 'playing' || this.state === 'cutscene') {
      this.clockMinutes += dt * 0.5;
      if (this.clockMinutes >= 1440) this.clockMinutes -= 1440;
    }
    // Title flyover camera.
    if (this.state === 'title' || this.state === 'loading') {
      var t = this.timeSec * 0.03;
      this.camera.position.set(Math.sin(t) * 260, 90 + Math.sin(t * 0.7) * 20, Math.cos(t) * 260);
      this.camera.lookAt(0, 20, 0);
      this.city.update(dt, this.timeSec);
      return;
    }
    if (this.state === 'paused' || this.state === 'map') {
      this.city.update(dt, this.timeSec);
      return;
    }
    if (this.state === 'dead' || this.state === 'busted') {
      this.deathTimer += dt;
      this.city.update(dt, this.timeSec);
      if (this.deathTimer > 2.6) this.respawnAfterDeath(this.state === 'busted');
      return;
    }
    // Cutscene: freeze world sim, keep city anim + dialogue.
    if (this.state === 'cutscene') {
      this.city.update(dt, this.timeSec);
      this.updateEffects(dt);
      if (this.input.hit('KeyE')) this.missions.advanceDialogue();
      this.hud.setLetterbox(true);
      if (this.missions.cutscene) {
        var line = this.missions.cutscene.lines[this.missions.cutscene.idx];
        this.hud.showDialogue(line);
      }
      return;
    }
    // ---- playing ----
    if (!this.shotMode) { this.hud.setLetterbox(false); this.hud.hideDialogue(); }
    var input = this.input;
    // Global keys.
    if (input.hit('Escape')) { this.pauseGame(); return; }
    if (input.hit('F3')) this.debugOn = !this.debugOn;
    if (input.hit('KeyM')) { this.state = 'map'; this.hud.toggleMap(); return; }
    if (input.hit('KeyQ')) {
      var st = this.audio.nextStation();
      this.hud.notify('Radio: ' + st.name + ' — ' + st.track, 'info');
    }
    if (input.hit('KeyN') && !this.missions.active) {
      var def = this.missions.currentDef();
      if (def) this.missions.startMission(this.missions.current);
    }
    if (input.hit('KeyT')) this.missions.startTaxi();
    if (input.hit('KeyU')) this.missions.startRace();
    // Weapon switching.
    var wkeys = { Digit1: 'fists', Digit2: 'pistol', Digit3: 'smg', Digit4: 'shotgun', Digit5: 'rifle', Digit6: 'grenade' };
    for (var wk in wkeys) if (input.hit(wk)) this.combat.switchWeapon(wkeys[wk]);
    if (input.hit('KeyR') && !this.currentCar) this.combat.startReload();
    this.player.aiming = input.rightDown && !this.currentCar;
    // Enter / exit car.
    if (input.hit('KeyF')) {
      if (this.currentCar) this.exitCar();
      else {
        var car = this.nearestCar(this.player.pos.x, this.player.pos.z, 4.5);
        if (car) this.enterCar(car);
      }
    }
    // Horn.
    if (input.hit('KeyH') && this.currentCar && this.audio) this.audio.horn();
    // Flip recovery: hold R in a car.
    if (this.currentCar && input.down('KeyR')) {
      this.flipTimer += dt;
      if (this.flipTimer > 0.8) {
        var rp = this.city.nearestRoadPoint(this.currentCar.pos.x, this.currentCar.pos.z);
        this.currentCar.pos.set(rp.x, this.city.groundHeight(rp.x, rp.z), rp.z);
        this.currentCar.speed = 0;
        this.flipTimer = 0;
        this.hud.notify('Car recovered to the road.', 'info');
      }
    } else this.flipTimer = 0;
    // Player / car update.
    try { this.player.update(dt, input, !!this.currentCar, this); } catch (err) { this.reportError(err); }
    if (this.currentCar) {
      try { this.currentCar.updatePlayerDrive(dt, input, this); } catch (err) { this.reportError(err); }
      // Player position tracks the car while driving (minimap, GPS,
      // missions and police all read player.pos).
      this.player.pos.copy(this.currentCar.pos);
      this.player.yaw = this.currentCar.yaw;
      this.audio.setEngine(Math.abs(this.currentCar.speed) / this.currentCar.maxSpeed, true);
      // Crash into peds? (near-miss panic)
      for (var pi = 0; pi < this.peds.peds.length; pi++) {
        var pd = this.peds.peds[pi];
        var dd = E.dist2(pd.pos.x, pd.pos.z, this.currentCar.pos.x, this.currentCar.pos.z);
        if (dd < 9 && Math.abs(this.currentCar.speed) > 5) pd.panic(this.currentCar.pos.x, this.currentCar.pos.z);
      }
      // Player car wrecked?
      if (this.currentCar.wreck) {
        this.hud.notify('Your car is wrecked!', 'bad');
        this.exitCar();
      }
    } else {
      this.audio.setEngine(0, false);
    }
    // Shooting.
    if (input.mouseDown && !this.currentCar) {
      var origin = this.player.pos.clone(); origin.y += 1.5;
      var dir;
      if (this.player.aiming) {
        dir = new THREE.Vector3(-Math.sin(this.player.camYaw), -Math.sin(this.player.camPitch) * 0.4, -Math.cos(this.player.camYaw)).normalize();
      } else {
        dir = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw)).normalize();
      }
      try { this.combat.fire(origin, dir, true); } catch (err) { this.reportError(err); }
    }
    // Traffic.
    try {
      for (var vi = 0; vi < this.vehicles.length; vi++) {
        var v = this.vehicles[vi];
        if (v === this.currentCar || v.driver === 'player') continue;
        if (v.driver === 'traffic') v.updateTraffic(dt, this, this.vehicles);
        else if (v.driver === 'tail') { /* driven by mission logic */ }
        else if (v.driver === 'police') { /* driven by police dispatch */ }
        else if (v.burning && !v.wreck) { v.damage(0.5 * dt * 10, this); }
      }
      // Remove far traffic, keep population near player.
      var keep = [];
      for (var vj = 0; vj < this.vehicles.length; vj++) {
        var vv = this.vehicles[vj];
        var far = E.dist2(vv.pos.x, vv.pos.z, this.player.pos.x, this.player.pos.z) > 380 * 380;
        if (far && vv.driver === 'traffic') { vv.dispose(); continue; }
        keep.push(vv);
      }
      this.vehicles = keep;
      var trafficCount = this.vehicles.filter(function (x) { return x.driver === 'traffic'; }).length;
      if (trafficCount < 14) {
        var rp2 = this.city.nearestRoadPoint(this.player.pos.x + this.rng.range(-120, 120), this.player.pos.z + this.rng.range(-120, 120));
        var nc = new E.Vehicle(this.scene, this.city, this.rng.pick(['sedan', 'taxi', 'suv', 'sports']), rp2.x, rp2.z, this.rng.range(0, Math.PI * 2));
        nc.driver = 'traffic';
        nc.setRoute(this.buildRandomRoute(rp2.x, rp2.z));
        this.vehicles.push(nc);
      }
    } catch (err) { this.reportError(err); }
    // Peds, police, missions, combat.
    try { this.peds.update(dt, this.player.pos); } catch (err) { this.reportError(err); }
    try { this.police.update(dt, this.player.pos, !!this.currentCar, this.player.dead); } catch (err) { this.reportError(err); }
    try { this.missions.update(dt, this.player.pos, !!this.currentCar, this.currentCar); } catch (err) { this.reportError(err); }
    try { this.missions.updateTaxi(dt, this.player.pos); } catch (err) { this.reportError(err); }
    try { this.missions.updateRace(dt, this.player.pos); } catch (err) { this.reportError(err); }
    try { this.combat.update(dt, this.player); } catch (err) { this.reportError(err); }
    try { this.city.update(dt, this.timeSec); } catch (err) { this.reportError(err); }
    this.updateEffects(dt);
    this.updateGrenades(dt);
    // Death check.
    if (this.player.dead) { this.wasted(); return; }
    // Busted check: foot cop touch while wanted on foot handled in police.
    // Autosave.
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = 60;
      this.save.save(this);
    }
    // Prompt: near car.
    if (!this.currentCar) {
      var near = this.nearestCar(this.player.pos.x, this.player.pos.z, 4.5);
      this.hud.setPrompt(near ? (near.driver === 'traffic' ? '[F] CARJACK ' + near.name : '[F] ENTER ' + near.name) : '');
    } else {
      this.hud.setPrompt('[F] EXIT  ·  [H] HORN  ·  [SPACE] HANDBRAKE  ·  hold [R] RECOVER');
    }
    // Sun follows player for shadows; day/night lighting.
    this.updateLighting(dt);
    this.hud.update(this);
  };

  Game.prototype.updateLighting = function (dt) {
    var p = this.player.pos;
    this.sun.position.set(p.x - 180, 140, p.z - 220);
    this.sunTarget.position.set(p.x, 0, p.z);
    // Snap shadow camera to texel grid to stop flicker.
    var snap = 4;
    this.sun.position.x = Math.round(this.sun.position.x / snap) * snap;
    this.sun.position.z = Math.round(this.sun.position.z / snap) * snap;
    var hour = this.clockMinutes / 60;
    var night = hour >= 20.5 || hour < 6;
    var dusk = !night && hour >= 17.5;
    if (night) {
      this.sun.intensity = 0.9;
      this.sun.color.setHex(0x8a9ac0);
      this.hemi.intensity = 0.55;
      this.scene.fog.color.setHex(0x0e1226);
    } else if (dusk) {
      this.sun.intensity = 2.2;
      this.sun.color.setHex(0xffb070);
      this.hemi.intensity = 0.9;
      this.scene.fog.color.setHex(0x2a1a3a);
    } else {
      this.sun.intensity = 2.6;
      this.sun.color.setHex(0xffe0b0);
      this.hemi.intensity = 1.1;
      this.scene.fog.color.setHex(0x3a2a4a);
    }
    if (this.weather === 'rain') this.scene.fog.color.setHex(0x1a1a22);
    this.city.setTimeOfDay(hour);
  };

  Game.prototype.updateEffects = function (dt) {
    for (var i = this.effects.length - 1; i >= 0; i--) {
      var fx = this.effects[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        this.scene.remove(fx.mesh);
        if (fx.light) this.scene.remove(fx.light);
        this.effects.splice(i, 1);
        continue;
      }
      var k = fx.life / fx.max;
      if (fx.kind === 'explosion') {
        var s = fx.size * (1 + (1 - k) * 1.6);
        fx.mesh.scale.set(s / fx.size, s / fx.size, s / fx.size);
        fx.mesh.material.opacity = k * 0.9;
        if (fx.light) fx.light.intensity = 120 * k;
      } else if (fx.kind === 'smoke') {
        fx.mesh.position.y += dt * 1.5;
        fx.mesh.scale.multiplyScalar(1 + dt * 1.2);
        fx.mesh.material.opacity = k * 0.5;
      } else if (fx.kind === 'spark') {
        fx.mesh.material.opacity = k;
        fx.mesh.scale.setScalar(1 + (1 - k) * 2);
      }
    }
  };

  Game.prototype.updateGrenades = function (dt) {
    for (var i = this.grenades.length - 1; i >= 0; i--) {
      var g = this.grenades[i];
      g.timer -= dt;
      g.vel.y -= 18 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < this.city.groundHeight(g.mesh.position.x, g.mesh.position.z) + 0.2) {
        g.mesh.position.y = this.city.groundHeight(g.mesh.position.x, g.mesh.position.z) + 0.2;
        g.vel.multiplyScalar(0.5); g.vel.y = Math.abs(g.vel.y) * 0.3;
      }
      if (g.timer <= 0) {
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        this.spawnExplosion(g.mesh.position.x, g.mesh.position.y + 0.5, g.mesh.position.z, 5);
      }
    }
  };

  Game.prototype.render = function () {
    if (!this.renderer) return;
    // Camera.
    if (this.state === 'playing' || this.state === 'cutscene') {
      try {
        this.player.updateCamera(this.camera, 1 / 60, !!this.currentCar,
          this.currentCar ? this.currentCar.pos : null,
          this.currentCar ? this.currentCar.yaw : 0);
      } catch (err) { this.reportError(err); }
      // FOV kick at speed + recoil.
      var targetFov = 62;
      if (this.currentCar) targetFov += E.clamp(Math.abs(this.currentCar.speed) / this.currentCar.maxSpeed, 0, 1) * 10;
      if (this.player.aiming) targetFov -= 8;
      this.camera.fov = E.lerp(this.camera.fov, targetFov, 0.08);
      this.camera.updateProjectionMatrix();
      // Camera shake.
      if (this.shakeTime > 0) {
        this.shakeTime -= 1 / 60;
        this.shakeMag *= 0.88;
        this.camera.position.x += (Math.random() - 0.5) * this.shakeMag * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shakeMag * 0.3;
      }
    }
    this.renderer.render(this.scene, this.camera);
  };

  E.Game = Game;

  // Boot.
  window.addEventListener('DOMContentLoaded', function () {
    var game = new Game();
    window.__game = game;
    window.__emberReady = false;
    try {
      game.init();
      window.__emberReady = true;
    } catch (err) {
      console.error('[boot]', err);
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font:16px sans-serif;z-index:99;padding:40px;text-align:center;';
      d.textContent = 'EMBER TIDE could not start: ' + (err && err.message ? err.message : err);
      document.body.appendChild(d);
    }
  });
})();
