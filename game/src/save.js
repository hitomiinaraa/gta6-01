// EMBER TIDE — save.js
// Versioned localStorage saves with try/catch, graceful fallback and
// corrupt-save handling. Settings (volume, sensitivity, quality, invert Y)
// live in the same store.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;

  var SAVE_KEY = 'ember-tide-save-v1';
  var SETTINGS_KEY = 'ember-tide-settings-v1';
  var SAVE_VERSION = 1;

  function SaveSystem() {}

  SaveSystem.prototype.save = function (game) {
    try {
      var data = {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        money: game.player.money,
        health: game.player.health,
        armor: game.player.armor,
        missionIndex: game.missions.current,
        respect: game.missions.respect,
        tokensCollected: game.missions.tokensCollected,
        tokensTaken: game.missions.tokens.map(function (t) { return t.taken; }),
        playerPos: { x: game.player.pos.x, z: game.player.pos.z },
        clockMinutes: game.clockMinutes,
        station: game.audio.station,
        ammo: game.combat.ammo,
        currentWeapon: game.combat.currentWeapon,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('[save] failed', err);
      return false;
    }
  };

  SaveSystem.prototype.load = function () {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) return null;
      if (typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
      return data;
    } catch (err) {
      console.error('[save] corrupt save ignored', err);
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      return null;
    }
  };

  SaveSystem.prototype.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (err) { return false; }
  };

  SaveSystem.prototype.apply = function (game, data) {
    game.player.money = data.money;
    game.player.health = data.health;
    game.player.armor = data.armor || 0;
    game.missions.current = data.missionIndex;
    game.missions.respect = data.respect || 0;
    game.missions.tokensCollected = data.tokensCollected || 0;
    if (data.tokensTaken) {
      for (var i = 0; i < data.tokensTaken.length && i < game.missions.tokens.length; i++) {
        if (data.tokensTaken[i]) { game.missions.tokens[i].taken = true; game.missions.tokens[i].mesh.visible = false; }
      }
    }
    game.player.spawn(data.playerPos.x, data.playerPos.z, Math.PI);
    game.clockMinutes = data.clockMinutes || E.CFG.startMinutes;
    if (typeof data.station === 'number') game.audio.station = data.station % 4;
    if (data.ammo) game.combat.ammo = data.ammo;
    if (data.currentWeapon) game.combat.currentWeapon = data.currentWeapon;
  };

  SaveSystem.prototype.loadSettings = function () {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { volume: 0.7, sensitivity: 1.0, quality: 'Medium', invertY: false };
      var s = JSON.parse(raw);
      return {
        volume: typeof s.volume === 'number' ? s.volume : 0.7,
        sensitivity: typeof s.sensitivity === 'number' ? s.sensitivity : 1.0,
        quality: s.quality || 'Medium',
        invertY: !!s.invertY,
      };
    } catch (err) { return { volume: 0.7, sensitivity: 1.0, quality: 'Medium', invertY: false }; }
  };

  SaveSystem.prototype.saveSettings = function (settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (err) {}
  };

  E.SaveSystem = SaveSystem;
})();
