// EMBER TIDE — hud.js
// DOM HUD: mission card, money + wanted stars + clock, CCPD dispatch panel,
// weapon slots, circular minimap (2D canvas drawn from live map data),
// health/armor bars, speedometer, radio line, district label, dialogue card
// with portrait, prompts, notifications, WASTED/BUSTED screens, title screen
// with flyover, pause menu, full-screen map with click waypoint + GPS route,
// F3 debug overlay. Built once; updated every frame from game state.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;

  function el(tag, cls, parent, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    if (parent) parent.appendChild(d);
    return d;
  }

  function HUD(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.mapOpen = false;
    this.mapCanvas = null;
    this.minimap = null;
    this.build();
  }

  HUD.prototype.build = function () {
    var r = this.root;
    // Top-left: mission card.
    this.missionCard = el('div', 'hud-card mission-card', r);
    this.missionTitle = el('div', 'mission-title', this.missionCard, 'EMBER TIDE');
    this.missionStage = el('div', 'mission-stage', this.missionCard, '');
    this.missionBar = el('div', 'mission-bar', this.missionCard);
    this.missionFill = el('div', 'mission-fill', this.missionBar);
    this.missionNext = el('div', 'mission-next', this.missionCard, '');
    // Top-right: money, stars, clock.
    var tr = el('div', 'hud-topright', r);
    this.moneyEl = el('div', 'money', tr, '$250');
    this.starsEl = el('div', 'stars', tr, '');
    this.clockEl = el('div', 'clock', tr, '18:42');
    this.respectEl = el('div', 'respect', tr, 'RESPECT 0');
    // Left: dispatch panel.
    this.dispatchPanel = el('div', 'hud-card dispatch-panel', r);
    el('div', 'dispatch-head', this.dispatchPanel, 'CCPD DISPATCH');
    this.dispatchList = el('div', 'dispatch-list', this.dispatchPanel);
    // Right: weapon slots.
    this.weaponPanel = el('div', 'hud-card weapon-panel', r);
    this.weaponSlots = {};
    var order = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'grenade'];
    for (var i = 0; i < order.length; i++) {
      var w = E.WEAPONS[order[i]];
      var slot = el('div', 'weapon-slot', this.weaponPanel);
      slot.innerHTML = '<b>' + w.slot + '</b> ' + w.name + ' <span class="ammo"></span>';
      this.weaponSlots[order[i]] = slot;
    }
    // Bottom-left: minimap + health/armor.
    var bl = el('div', 'hud-bottomleft', r);
    this.districtEl = el('div', 'district', bl, 'Downtown');
    this.minimap = document.createElement('canvas');
    this.minimap.width = 190; this.minimap.height = 190;
    this.minimap.className = 'minimap';
    bl.appendChild(this.minimap);
    var bars = el('div', 'bars', bl);
    this.healthFill = el('div', 'health-fill', el('div', 'bar health-bar', bars));
    this.armorFill = el('div', 'armor-fill', el('div', 'bar armor-bar', bars));
    el('div', 'bar-label', bars, 'HEALTH / ARMOR');
    // Bottom-right: speedometer + car name + condition.
    var br = el('div', 'hud-bottomright', r);
    this.speedo = el('div', 'speedo', br, '0');
    el('div', 'speedo-unit', br, 'km/h');
    this.carName = el('div', 'car-name', br, '');
    this.carCond = el('div', 'car-cond', br, '');
    this.radioEl = el('div', 'radio-line', br, '');
    // Bottom-center: dialogue card.
    this.dialogue = el('div', 'dialogue', r);
    this.dialogue.style.display = 'none';
    this.portrait = el('div', 'portrait', this.dialogue, 'V');
    var dbody = el('div', 'dialogue-body', this.dialogue);
    this.dialogueName = el('div', 'dialogue-name', dbody, '');
    this.dialogueText = el('div', 'dialogue-text', dbody, '');
    el('div', 'dialogue-hint', dbody, 'E / CLICK — continue');
    // Center: crosshair, prompts, notifications, objective banner.
    this.crosshair = el('div', 'crosshair', r, '+');
    this.prompt = el('div', 'prompt', r, '');
    this.notif = el('div', 'notif', r, '');
    this.banner = el('div', 'banner', r, '');
    // Letterbox bars for cutscenes.
    this.barTop = el('div', 'letterbox top', r);
    this.barBottom = el('div', 'letterbox bottom', r);
    // WASTED / BUSTED overlay.
    this.deathScreen = el('div', 'death-screen', r);
    this.deathTitle = el('div', 'death-title', this.deathScreen, 'WASTED');
    this.deathSub = el('div', 'death-sub', this.deathScreen, '');
    this.deathScreen.style.display = 'none';
    // Debug overlay (F3).
    this.debug = el('div', 'debug', r, '');
    this.debug.style.display = 'none';
    // Full-screen map.
    this.mapOverlay = el('div', 'map-overlay', r);
    this.mapOverlay.style.display = 'none';
    el('div', 'map-title', this.mapOverlay, 'CINDER COVE — click to set a waypoint (M / ESC to close)');
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 900; this.mapCanvas.height = 700;
    this.mapCanvas.className = 'map-canvas';
    this.mapOverlay.appendChild(this.mapCanvas);
    var self = this;
    this.mapCanvas.addEventListener('click', function (ev) {
      var rect = self.mapCanvas.getBoundingClientRect();
      var mx = (ev.clientX - rect.left) / rect.width, my = (ev.clientY - rect.top) / rect.height;
      var wx = (mx - 0.5) * 760, wz = (my - 0.5) * 760;
      self.game.setWaypoint(wx, wz);
    });
    // Title screen.
    this.title = el('div', 'title-screen', r);
    el('div', 'title-logo', this.title, 'EMBER TIDE');
    el('div', 'title-city', this.title, 'C I N D E R   C O V E');
    el('div', 'title-tag', this.title, 'A golden-hour crime story — steal, drive, survive.');
    var menu = el('div', 'title-menu', this.title);
    this.btnNew = el('button', 'title-btn', menu, 'NEW GAME');
    this.btnContinue = el('button', 'title-btn', menu, 'CONTINUE');
    this.btnControls = el('button', 'title-btn', menu, 'CONTROLS');
    this.btnSettings = el('button', 'title-btn', menu, 'SETTINGS');
    this.titleNote = el('div', 'title-note', this.title, '');
    // Controls panel.
    this.controlsPanel = el('div', 'panel controls-panel', r);
    this.controlsPanel.style.display = 'none';
    this.controlsPanel.innerHTML = '<h2>CONTROLS</h2>' +
      '<p>WASD move &nbsp;·&nbsp; SHIFT sprint &nbsp;·&nbsp; SPACE jump / handbrake</p>' +
      '<p>MOUSE look &nbsp;·&nbsp; CLICK lock mouse &nbsp;·&nbsp; RIGHT MOUSE aim</p>' +
      '<p>LEFT CLICK shoot &nbsp;·&nbsp; F enter / steal car &nbsp;·&nbsp; E interact / dialogue</p>' +
      '<p>1–6 weapons &nbsp;·&nbsp; R reload &nbsp;·&nbsp; H horn &nbsp;·&nbsp; R flip car (hold)</p>' +
      '<p>M map &nbsp;·&nbsp; N next mission &nbsp;·&nbsp; T taxi job &nbsp;·&nbsp; U street race</p>' +
      '<p>Q radio station &nbsp;·&nbsp; ESC pause &nbsp;·&nbsp; F3 debug overlay</p>' +
      '<button class="title-btn" id="controls-close">CLOSE</button>';
    // Settings panel.
    this.settingsPanel = el('div', 'panel settings-panel', r);
    this.settingsPanel.style.display = 'none';
    this.settingsPanel.innerHTML = '<h2>SETTINGS</h2>' +
      '<label>Volume <input type="range" id="set-volume" min="0" max="100" value="70"></label>' +
      '<label>Mouse sensitivity <input type="range" id="set-sens" min="20" max="200" value="100"></label>' +
      '<label>Graphics <select id="set-quality"><option>Low</option><option selected>Medium</option><option>High</option></select></label>' +
      '<label><input type="checkbox" id="set-invert"> Invert Y</label>' +
      '<button class="title-btn" id="settings-close">CLOSE</button>';
    // Pause menu.
    this.pauseMenu = el('div', 'panel pause-menu', r);
    this.pauseMenu.style.display = 'none';
    this.pauseMenu.innerHTML = '<h2>PAUSED</h2>' +
      '<button class="title-btn" id="pause-resume">RESUME</button>' +
      '<button class="title-btn" id="pause-save">SAVE GAME</button>' +
      '<button class="title-btn" id="pause-quit">QUIT TO TITLE</button>';
    // Loading screen.
    this.loading = el('div', 'loading-screen', r);
    this.loading.innerHTML = '<div class="loading-logo">EMBER TIDE</div><div class="loading-tip"></div><div class="loading-bar"><div class="loading-fill"></div></div>';
    this.loadingTip = this.loading.querySelector('.loading-tip');
    this.loadingFill = this.loading.querySelector('.loading-fill');
  };

  HUD.prototype.showTitle = function (hasSave) {
    this.title.style.display = 'flex';
    this.btnContinue.style.display = hasSave ? '' : 'none';
    this.titleNote.textContent = hasSave ? 'Save found — continue your story.' : 'No save yet. New Game starts the story.';
  };
  HUD.prototype.hideTitle = function () { this.title.style.display = 'none'; };

  HUD.prototype.notify = function (text, kind) {
    this.notif.textContent = text;
    this.notif.className = 'notif show ' + (kind || 'info');
    var self = this;
    clearTimeout(this._notifT);
    this._notifT = setTimeout(function () { self.notif.className = 'notif'; }, 4200);
  };
  HUD.prototype.bannerText = function (text) {
    var self = this;
    this.banner.textContent = text;
    this.banner.className = 'banner show';
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(function () { self.banner.className = 'banner'; }, 2600);
  };

  HUD.prototype.setPrompt = function (text) { this.prompt.textContent = text || ''; };

  HUD.prototype.showDeath = function (kind, sub) {
    this.deathTitle.textContent = kind;
    this.deathTitle.className = 'death-title ' + (kind === 'WASTED' ? 'wasted' : 'busted');
    this.deathSub.textContent = sub || '';
    this.deathScreen.style.display = 'flex';
  };
  HUD.prototype.hideDeath = function () { this.deathScreen.style.display = 'none'; };

  HUD.prototype.setLetterbox = function (on) {
    this.barTop.style.display = on ? 'block' : 'none';
    this.barBottom.style.display = on ? 'block' : 'none';
  };
  HUD.prototype.showDialogue = function (line) {
    this.dialogue.style.display = 'flex';
    this.portrait.textContent = (line.who || 'V')[0];
    this.portrait.style.background = line.color || '#e58ab8';
    this.dialogueName.textContent = line.who + (line.role ? ' — ' + line.role : '');
    this.dialogueText.textContent = line.text;
  };
  HUD.prototype.hideDialogue = function () { this.dialogue.style.display = 'none'; };

  HUD.prototype.toggleMap = function () {
    this.mapOpen = !this.mapOpen;
    this.mapOverlay.style.display = this.mapOpen ? 'flex' : 'none';
    if (this.mapOpen) this.drawFullMap();
  };

  // --- Minimap: 2D canvas from live map data ---
  HUD.prototype.drawMinimap = function (game) {
    var c = this.minimap, ctx = c.getContext('2d');
    var S = c.width, scale = S / 760;
    var px = game.player.pos.x, pz = game.player.pos.z;
    var camYaw = game.player.camYaw;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#20242a'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(camYaw + Math.PI);
    ctx.translate(-px * scale, -pz * scale);
    // Water (south + west harbor).
    ctx.fillStyle = '#1a4a6a';
    ctx.fillRect(-380 * scale, 318 * scale, 760 * scale, 80 * scale);
    ctx.fillRect(-460 * scale, 120 * scale, 130 * scale, 280 * scale);
    // Roads.
    ctx.strokeStyle = '#4a4a52'; ctx.lineWidth = 14 * scale;
    var lines = game.city.roadLines;
    for (var i = 0; i < lines.length; i++) {
      ctx.beginPath(); ctx.moveTo(-330 * scale, lines[i] * scale); ctx.lineTo(330 * scale, lines[i] * scale); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lines[i] * scale, -330 * scale); ctx.lineTo(lines[i] * scale, 330 * scale); ctx.stroke();
    }
    // Buildings (sampled from colliders, cheap: draw a subset).
    ctx.fillStyle = '#6a6a72';
    var cols = game.city.colliders;
    for (var b = 0; b < cols.length; b += 2) {
      var cb = cols[b];
      ctx.fillRect(cb.x0 * scale, cb.z0 * scale, (cb.x1 - cb.x0) * scale, (cb.z1 - cb.z0) * scale);
    }
    // Park + stadium.
    ctx.fillStyle = '#3a7a3a';
    ctx.fillRect(-120 * scale, -270 * scale, 120 * scale, 120 * scale);
    ctx.fillStyle = '#8a7a5a';
    ctx.beginPath(); ctx.arc(240 * scale, -120 * scale, 34 * scale, 0, Math.PI * 2); ctx.fill();
    // Mission beam / waypoint.
    if (game.waypoint) {
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.arc(game.waypoint.x * scale, game.waypoint.z * scale, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(game.waypoint.x * scale, game.waypoint.z * scale, 11, 0, Math.PI * 2); ctx.stroke();
    }
    // Police (red dots), traffic (white dots).
    ctx.fillStyle = '#ff3a3a';
    var units = game.police ? game.police.units : [];
    for (var u = 0; u < units.length; u++) {
      ctx.beginPath(); ctx.arc(units[u].pos.x * scale, units[u].pos.z * scale, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#e8e8e8';
    var vehs = game.vehicles || [];
    for (var v = 0; v < vehs.length; v++) {
      if (vehs[v].driver === 'traffic') {
        ctx.beginPath(); ctx.arc(vehs[v].pos.x * scale, vehs[v].pos.z * scale, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Search circle when wanted.
    if (game.police && game.police.wanted > 0) {
      ctx.strokeStyle = 'rgba(255,60,60,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(game.police.searchCenter.x * scale, game.police.searchCenter.z * scale, game.police.searchRadius * scale, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // Player arrow (screen-aligned, always up = facing).
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2 - 9); ctx.lineTo(S / 2 - 6, S / 2 + 7); ctx.lineTo(S / 2 + 6, S / 2 + 7);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    // North indicator.
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 14);
  };

  HUD.prototype.drawFullMap = function () {
    var game = this.game;
    var c = this.mapCanvas, ctx = c.getContext('2d');
    var W = c.width, H = c.height;
    // Square world (760m) centered in the canvas with a margin.
    var scale = Math.min(W, H) / 760;
    var ox = (W - 760 * scale) / 2, oy = (H - 760 * scale) / 2;
    ctx.fillStyle = '#14181d'; ctx.fillRect(0, 0, W, H);
    function X(x) { return ox + (x + 380) * scale; }
    function Z(z) { return oy + (z + 380) * scale; }
    // Water.
    ctx.fillStyle = '#1a4a6a';
    ctx.fillRect(0, Z(318), W, H - Z(318));
    ctx.fillRect(0, Z(120), X(-330), Z(400) - Z(120));
    // Roads.
    ctx.strokeStyle = '#55555e'; ctx.lineWidth = 11;
    var lines = game.city.roadLines;
    for (var i = 0; i < lines.length; i++) {
      ctx.beginPath(); ctx.moveTo(X(-330), Z(lines[i])); ctx.lineTo(X(330), Z(lines[i])); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(lines[i]), Z(-330)); ctx.lineTo(X(lines[i]), Z(330)); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#7a7a82';
    var cols = game.city.colliders;
    for (var b = 0; b < cols.length; b++) {
      var cb = cols[b];
      ctx.fillRect(X(cb.x0), Z(cb.z0), (cb.x1 - cb.x0) * scale, (cb.z1 - cb.z0) * scale);
    }
    // Park, stadium, beach.
    ctx.fillStyle = '#3a7a3a'; ctx.fillRect(X(-120), Z(-270), 120 * scale, 120 * scale);
    ctx.fillStyle = '#8a7a5a';
    ctx.beginPath(); ctx.arc(X(240), Z(-120), 34 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8b078'; ctx.fillRect(0, Z(312), W, 12 * scale);
    // District labels.
    ctx.fillStyle = '#cfd8e8'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    for (var k in E.DISTRICTS) {
      var d = E.DISTRICTS[k];
      ctx.fillText(d.name.toUpperCase(), X(d.center[0]) - 30, Z(d.center[1]));
    }
    // GPS route: Manhattan path along roads from player to waypoint.
    if (game.waypoint) {
      var p = game.player.pos, w = game.waypoint;
      var rp = game.city.nearestRoadPoint(p.x, p.z);
      var rw = game.city.nearestRoadPoint(w.x, w.z);
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4; ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(X(p.x), Z(p.z));
      ctx.lineTo(X(rp.x), Z(rp.z));
      ctx.lineTo(X(rw.x), Z(rp.z));
      ctx.lineTo(X(rw.x), Z(rw.z));
      ctx.lineTo(X(w.x), Z(w.z));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.arc(X(w.x), Z(w.z), 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('GPS', X(w.x), Z(w.z) + 4);
    }
    // Player arrow.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(X(game.player.pos.x), Z(game.player.pos.z) - 10);
    ctx.lineTo(X(game.player.pos.x) - 7, Z(game.player.pos.z) + 8);
    ctx.lineTo(X(game.player.pos.x) + 7, Z(game.player.pos.z) + 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23a'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('YOU — ' + game.city.districtAt(game.player.pos.x, game.player.pos.z), X(game.player.pos.x) + 16, Z(game.player.pos.z) - 26);
    // Mission list on map (bottom-right, clear of the GPS line).
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W - 332, H - 158, 320, 146);
    ctx.fillStyle = '#ffd23a'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('MISSIONS', W - 320, H - 136);
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif';
    for (var m = 0; m < E.MISSIONS.length; m++) {
      var done = m < game.missions.current || game.missions.current === -1;
      var cur = m === game.missions.current;
      ctx.fillStyle = cur ? '#ffd23a' : (done ? '#7aff8a' : '#aaa');
      ctx.fillText((done ? '✓ ' : (cur ? '▶ ' : '· ')) + (m + 1) + '. ' + E.MISSIONS[m].title, W - 320, H - 116 + m * 14);
    }
  };

  HUD.prototype.update = function (game) {
    var p = game.player;
    this.moneyEl.textContent = E.fmtMoney(p.money);
    // Stars.
    var stars = '';
    for (var s = 0; s < 5; s++) {
      var on = s < game.police.wanted;
      var flashing = game.police.flashStars() && on;
      stars += '<span class="star ' + (on ? (flashing ? 'star-flash' : 'star-on') : 'star-off') + '">★</span>';
    }
    this.starsEl.innerHTML = stars;
    this.clockEl.textContent = E.fmtClock(game.clockMinutes);
    this.respectEl.textContent = 'RESPECT ' + game.missions.respect + ' / 5';
    // Mission card.
    var def = game.missions.currentDef();
    if (game.missions.active) {
      var a = game.missions.active;
      this.missionTitle.textContent = a.def.title.toUpperCase();
      this.missionStage.textContent = 'MISSION ' + a.def.id + ' / 8';
      var prog = 0;
      if (a.def.kind === 'shootout' || a.def.kind === 'finale') prog = game.missions.killCount / game.missions.killTarget;
      else if (a.def.kind === 'chase') prog = game.missions.tailCars.filter(function (c) { return c.wreck; }).length / 2;
      else prog = 0.5;
      this.missionFill.style.width = Math.round(prog * 100) + '%';
      var next = a.def.objective;
      if (a.def.kind === 'shootout' || a.def.kind === 'finale') next = 'Hostiles down ' + game.missions.killCount + '/' + game.missions.killTarget;
      if (game.missions.timer > 0) next += '  ⏱ ' + E.fmtTime(game.missions.timer);
      this.missionNext.textContent = 'NEXT: ' + next;
    } else if (def) {
      this.missionTitle.textContent = def.title.toUpperCase();
      this.missionStage.textContent = 'MISSION ' + def.id + ' / 8 — READY';
      this.missionFill.style.width = '0%';
      this.missionNext.textContent = 'Press N to start — ' + def.objective;
    } else {
      this.missionTitle.textContent = 'STORY COMPLETE';
      this.missionStage.textContent = 'FREE ROAM';
      this.missionFill.style.width = '100%';
      this.missionNext.textContent = 'Taxi (T) · Race (U) · Tokens ' + game.missions.tokensCollected + '/12';
    }
    // Dispatch panel.
    var html = '';
    var log = game.police.dispatchLog;
    if (game.police.wanted === 0) html = '<div class="dispatch-row idle">No active pursuit. CCPD patrols the Cove.</div>';
    else {
      for (var i = 0; i < Math.min(6, log.length); i++) {
        html += '<div class="dispatch-row"><b>' + log[i].unit + '</b> ' + log[i].action + ' <span>' + log[i].dist + 'm</span></div>';
      }
      if (game.police.wanted >= 3) html += '<div class="dispatch-row heli">CONDOR-1 — AIR SUPPORT ACTIVE</div>';
      if (game.police.roadblocks.length > 0) html += '<div class="dispatch-row roadblock">ROADBLOCK AHEAD</div>';
    }
    this.dispatchList.innerHTML = html;
    // Weapons.
    for (var k in this.weaponSlots) {
      var w = E.WEAPONS[k];
      var slot = this.weaponSlots[k];
      slot.classList.toggle('active', game.combat.currentWeapon === k);
      var ammoTxt = game.combat.ammo[k] === Infinity ? '∞' : game.combat.ammo[k];
      slot.querySelector('.ammo').textContent = ammoTxt;
    }
    // Health/armor.
    this.healthFill.style.width = Math.max(0, p.health) + '%';
    this.armorFill.style.width = Math.max(0, p.armor) + '%';
    this.districtEl.textContent = game.city.districtAt(p.pos.x, p.pos.z);
    // Speedometer.
    if (game.currentCar) {
      var kmh = Math.round(Math.abs(game.currentCar.speed) * 3.6);
      this.speedo.textContent = kmh;
      this.carName.textContent = game.currentCar.name;
      var cond = game.currentCar.hp > 60 ? 'EXCELLENT' : (game.currentCar.hp > 30 ? 'DAMAGED' : 'CRITICAL');
      this.carCond.textContent = 'CONDITION ' + Math.round(game.currentCar.hp) + '% — ' + cond;
      this.carCond.className = 'car-cond ' + (game.currentCar.hp > 60 ? 'good' : (game.currentCar.hp > 30 ? 'warn' : 'bad'));
    } else {
      this.speedo.textContent = Math.round(p.speed * 3.6);
      this.carName.textContent = 'ON FOOT';
      this.carCond.textContent = p.aiming ? 'AIMING' : (p.moving ? 'RUNNING' : 'WALKING');
      this.carCond.className = 'car-cond';
    }
    var st = E.RADIO[game.audio.station];
    this.radioEl.textContent = '♪ ' + st.name + ' — ' + st.track;
    // Crosshair.
    this.crosshair.style.display = (game.state === 'playing' && !game.currentCar && game.combat.currentWeapon !== 'fists') ? 'block' : 'none';
    this.crosshair.style.transform = 'translate(-50%,-50%) scale(' + (1 + game.combat.recoil * 0.6) + ')';
    // Minimap + full map.
    if (game.state === 'playing' || game.state === 'cutscene') this.drawMinimap(game);
    if (this.mapOpen) this.drawFullMap();
    // Debug.
    if (game.debugOn) {
      this.debug.style.display = 'block';
      this.debug.textContent = 'FPS ' + game.fps.toFixed(0) +
        ' | draw ' + game.renderer.info.render.calls + ' tris ' + (game.renderer.info.render.triangles / 1000).toFixed(0) + 'k' +
        ' | veh ' + game.vehicles.length + ' peds ' + game.peds.peds.length +
        ' | cops ' + game.police.units.length + ' enemies ' + game.combat.enemies.length +
        ' | wanted ' + game.police.wanted + ' heat ' + Math.round(game.police.heat) +
        ' | ' + game.errors.length + ' errors';
    } else this.debug.style.display = 'none';
  };

  E.HUD = HUD;
})();
