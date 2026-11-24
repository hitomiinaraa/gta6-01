// EMBER TIDE — shots.js
// ScreenshotDirector: deterministic staged scenes for the 4 screenshots,
// driven by ?shot=1..4 in the URL. Each shot sets time, weather, wanted
// level, positions, traffic, police, helicopter, mission and dialogue so
// the frame shows several systems at once. Shot mode is only a staging
// shortcut — the game underneath is the real playable game.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  function ScreenshotDirector(game) {
    this.game = game;
    var params = new URLSearchParams(window.location.search);
    this.shot = parseInt(params.get('shot') || '0', 10) || 0;
    this.staged = false;
  }

  ScreenshotDirector.prototype.stage = function () {
    var game = this.game;
    if (!this.shot || this.staged) return;
    this.staged = true;
    game.startNewGame(true); // silent: skip title, no save prompts
    var p = game.player;
    if (this.shot === 1) {
      // COVER: golden-hour chase west down the beach boulevard, sun low
      // over the sea, ferris wheel ahead, 4 stars, heli + spotlight.
      game.clockMinutes = 18 * 60 + 47;
      game.setWeather('dusk');
      p.spawn(140, 306, Math.PI / 2);
      var car1 = game.spawnPlayerCar('sports', 140, 300, Math.PI / 2, 0xffb02a);
      car1.autoDrive = true;
      game.enterCar(car1);
      game.police.addHeat(62, 'staged chase');
      game.police.spawnUnitAt(105, 300);
      game.police.spawnUnitAt(60, 300);
      game.police.spawnUnitAt(30, 296);
      game.police.spawnUnitAt(190, 300);
      game.police.ensureHeli(0.1, p.pos);
      game.police.searchCenter.set(100, 0, 300);
      game.missions.startMission(2); // Tailspin chase mission (live tail cars)
      // Bring the tail cars into the frame, ahead on the boulevard.
      if (game.missions.tailCars[0]) { game.missions.tailCars[0].pos.set(100, 0, 296); game.missions.tailCars[0].yaw = Math.PI / 2; }
      if (game.missions.tailCars[1]) { game.missions.tailCars[1].pos.set(112, 0, 304); game.missions.tailCars[1].yaw = Math.PI / 2; }
      game.spawnTrafficBurst(100, 300, 12);
      game.spawnPedBurst(100, 300, 12);
      game.hud.bannerText('MISSION 3 — TAILSPIN');
      game.hud.showDialogue({ who: 'Dizzy Okafor', role: 'Getaway Driver', color: '#7ad0ff', text: 'Two of Hale\'s sedans on my tail, Rook. Run them off the road — make it look like an accident.' });
      game.player.camYaw = Math.PI / 2;
    } else if (this.shot === 2) {
      // On-foot firefight on the stadium lot (outside the bowl), mission
      // beam, 2 stars, enemies shooting, rifle aimed.
      game.clockMinutes = 19 * 60 + 20;
      game.setWeather('dusk');
      p.spawn(200, -60, Math.PI / 2);
      game.combat.switchWeapon('rifle');
      game.combat.ammo.rifle = 90;
      game.missions.startMission(3); // stadium shootout, 5 hostiles
      game.police.addHeat(30, 'staged firefight');
      for (var s2 = 0; s2 < 2; s2++) game.police.spawnUnit(p.pos);
      game.spawnTrafficBurst(220, -60, 8);
      game.spawnPedBurst(220, -60, 16);
      game.peds.clearNear(p.pos.x, p.pos.z, 14); // keep the camera line clear
      game.player.camYaw = -Math.PI / 2;
      game.player.aiming = true;
      game.hud.showDialogue({ who: 'Mara Sol', role: 'Hacker', color: '#8affc1', text: 'Hale\'s crew is holding the stadium lot. I jammed their radios — take the lot, Rook. No backup coming.' });
    } else if (this.shot === 3) {
      // 5-star heli / SWAT night moment + dialogue cutscene, letterbox.
      game.clockMinutes = 21 * 60 + 5;
      game.setWeather('night');
      p.spawn(-180, 190, Math.PI / 2);
      var car3 = game.spawnPlayerCar('sports', -180, 196, Math.PI / 2, 0xffb02a);
      car3.autoDrive = true;
      game.enterCar(car3);
      game.missions.startMission(6); // Ember Run — escape the 5-star net
      game.police.addHeat(95, 'staged five-star');
      for (var s3 = 0; s3 < 5; s3++) game.police.spawnUnit(p.pos);
      game.police.ensureHeli(0.1, p.pos);
      game.police.setRoadblock(p.pos);
      // Pull the roadblock into the frame, 35m ahead across the road.
      game.police.roadblocks.forEach(function (c, i) {
        c.pos.set(p.pos.x - 35, 0, p.pos.z + (i - 1) * 6);
        c.mesh.position.copy(c.pos);
      });
      game.spawnTrafficBurst(-180, 190, 10);
      game.spawnPedBurst(-180, 190, 10);
      game.missions.showCutscene([
        { who: 'Vesper Kane', role: 'Fixer', color: '#e58ab8', text: 'Five stars, Rook. One helicopter, and the whole Cove between you and the tunnel. Lose them. All of them.' },
      ], function () {});
      game.hud.showDialogue({ who: 'Vesper Kane', role: 'Fixer', color: '#e58ab8', text: 'Five stars, Rook. One helicopter, and the whole Cove between you and the tunnel. Lose them. All of them.' });
      game.hud.setLetterbox(true);
      game.player.camYaw = Math.PI / 2;
    } else if (this.shot === 4) {
      // Full map with GPS route + mission list.
      game.clockMinutes = 18 * 60 + 47;
      game.setWeather('dusk');
      p.spawn(0, 0, Math.PI);
      game.missions.startMission(0);
      game.setWaypoint(-180, 180);
      game.hud.toggleMap();
      game.state = 'map';
    }
    // Shots 1-3: keep the world live (police, traffic, heli move) while the
    // staged dialogue card stays on screen; shotMode stops the main loop
    // from hiding the dialogue / letterbox each frame.
    if (this.shot !== 4) {
      game.state = 'playing';
      game.shotMode = true;
      game.missions.cutscene = null;
    }
  };

  E.ScreenshotDirector = ScreenshotDirector;
})();
