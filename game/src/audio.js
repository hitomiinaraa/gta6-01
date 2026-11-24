// EMBER TIDE — audio.js
// All sound is synthesized with WebAudio: no audio files, no network.
// Engine hum, sirens, gunshots, impacts, ambience and four procedural
// radio stations (sequenced loops, one per genre).
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = false;
    this.volume = 0.7;
    this.musicVolume = 0.5;
    this.station = 0;
    this.radioOn = true;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.step = 0;
    this.rainGain = null;
  }

  AudioEngine.prototype.unlock = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVolume * 0.5;
      this.musicGain.connect(this.master);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      var o2 = this.ctx.createOscillator();
      o2.type = 'sawtooth'; o2.frequency.value = 58;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 400;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter); o2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.sfxGain);
      this.engineOsc.start(); o2.start();
      this.engineOsc2 = o2;
      // Rain/wind ambience: looped filtered noise.
      var buf = this.noiseBuffer(2);
      var src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      var f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.4;
      this.rainGain = this.ctx.createGain(); this.rainGain.gain.value = 0;
      src.connect(f); f.connect(this.rainGain); this.rainGain.connect(this.sfxGain);
      src.start();
      this.enabled = true;
      this.startRadio();
    } catch (err) { console.error('[audio] unlock failed', err); }
  };

  AudioEngine.prototype.noiseBuffer = function (seconds) {
    var len = Math.floor(this.ctx.sampleRate * seconds);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };

  AudioEngine.prototype.setVolume = function (v) {
    this.volume = E.clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.volume;
  };

  AudioEngine.prototype.setEngine = function (speedNorm, on) {
    if (!this.ctx || !this.engineGain) return;
    var t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speedNorm * 0.09 : 0, t, 0.1);
    var f = 50 + speedNorm * 160;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.02 + 3, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speedNorm * 1400, t, 0.1);
  };

  AudioEngine.prototype.setRain = function (amount) {
    if (!this.ctx || !this.rainGain) return;
    this.rainGain.gain.setTargetAtTime(amount * 0.05, this.ctx.currentTime, 0.5);
  };

  AudioEngine.prototype.setSiren = function (on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      var o = this.ctx.createOscillator(); o.type = 'sine';
      var g = this.ctx.createGain(); g.gain.value = 0.0;
      o.connect(g); g.connect(this.sfxGain); o.start();
      this.sirenOsc = o; this.sirenGain = g;
      var self = this, up = true, t0 = this.ctx.currentTime;
      this.sirenLfo = setInterval(function () {
        if (!self.sirenOsc) return;
        var f = up ? 950 : 650; up = !up;
        self.sirenOsc.frequency.setTargetAtTime(f, self.ctx.currentTime, 0.12);
      }, 380);
      g.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.2);
      void t0;
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenLfo);
      var o2 = this.sirenOsc, g2 = this.sirenGain;
      g2.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      setTimeout(function () { try { o2.stop(); } catch (e) {} }, 400);
      this.sirenOsc = null; this.sirenGain = null;
    }
  };

  AudioEngine.prototype.blip = function (freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    try {
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator(); o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (err) { /* audio must never break the game */ }
  };

  AudioEngine.prototype.noiseBurst = function (dur, vol, filterFreq, type) {
    if (!this.ctx) return;
    try {
      var t = this.ctx.currentTime;
      var src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(dur + 0.05);
      var f = this.ctx.createBiquadFilter(); f.type = type || 'lowpass';
      f.frequency.value = filterFreq || 1200;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t); src.stop(t + dur + 0.05);
    } catch (err) {}
  };

  AudioEngine.prototype.shot = function (weaponKey) {
    if (!this.ctx) return;
    if (weaponKey === 'shotgun') { this.noiseBurst(0.22, 0.5, 900); this.blip(120, 0.15, 'square', 0.25, 40); }
    else if (weaponKey === 'smg' || weaponKey === 'rifle') { this.noiseBurst(0.09, 0.3, 1800); this.blip(220, 0.06, 'square', 0.15, 90); }
    else if (weaponKey === 'grenade') { this.noiseBurst(0.5, 0.4, 500); }
    else { this.noiseBurst(0.12, 0.35, 1500); this.blip(180, 0.08, 'square', 0.18, 60); }
  };
  AudioEngine.prototype.impact = function () { this.noiseBurst(0.12, 0.35, 700); this.blip(90, 0.12, 'sine', 0.3, 45); };
  AudioEngine.prototype.crash = function () { this.noiseBurst(0.4, 0.55, 500); this.blip(70, 0.3, 'sine', 0.4, 30); };
  AudioEngine.prototype.explosion = function () { this.noiseBurst(0.9, 0.8, 300); this.blip(60, 0.7, 'sine', 0.5, 25); };
  AudioEngine.prototype.horn = function () { this.blip(370, 0.25, 'square', 0.12); this.blip(466, 0.25, 'square', 0.1); };
  AudioEngine.prototype.uiClick = function () { this.blip(880, 0.06, 'sine', 0.12); };
  AudioEngine.prototype.pickup = function () { this.blip(660, 0.1, 'sine', 0.15); this.blip(990, 0.14, 'sine', 0.15); };
  AudioEngine.prototype.missionDone = function () {
    var self = this;
    [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { self.blip(f, 0.22, 'sine', 0.18); }, i * 110); });
  };
  AudioEngine.prototype.missionFail = function () { this.blip(220, 0.4, 'sawtooth', 0.15, 110); };
  AudioEngine.prototype.starUp = function () { this.blip(700, 0.12, 'square', 0.15); this.blip(1050, 0.18, 'square', 0.15); };
  AudioEngine.prototype.footstep = function () { this.noiseBurst(0.05, 0.06, 500); };
  AudioEngine.prototype.reload = function () { this.blip(300, 0.05, 'square', 0.1); setTimeout(function () {}, 0); this.blip(420, 0.05, 'square', 0.1); };

  // Procedural radio: a tiny step sequencer. Each station has a scale and a
  // bass pattern; notes are scheduled with setInterval (8th notes @ 112 BPM).
  AudioEngine.prototype.startRadio = function () {
    var self = this;
    if (this.musicTimer) return;
    var scales = [
      [0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 2, 3, 7, 8], [0, 5, 7, 10],
    ];
    var roots = [220, 196, 174, 146];
    this.musicTimer = setInterval(function () {
      if (!self.ctx || !self.radioOn || !self.musicGain) return;
      var st = self.station % 4;
      var scale = scales[st], root = roots[st];
      var step = self.step++;
      if (step % 2 === 0) {
        var deg = scale[(step * 7 + 3) % scale.length];
        var f = root * Math.pow(2, deg / 12) * (step % 16 === 0 ? 2 : 1);
        self.musicNote(f, 0.22, st === 0 ? 'triangle' : 'sawtooth', 0.10);
      }
      if (step % 4 === 0) self.musicNote(root / 2, 0.4, 'sine', 0.16);
      if (step % 8 === 4) self.musicNote(root / 2 * 1.5, 0.3, 'sine', 0.10);
      if (st === 1 && step % 2 === 1) self.musicNote(root * 2, 0.06, 'square', 0.03);
    }, 268);
  };
  AudioEngine.prototype.musicNote = function (freq, dur, type, vol) {
    try {
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (err) {}
  };
  AudioEngine.prototype.nextStation = function () {
    this.station = (this.station + 1) % 4;
    return E.RADIO[this.station];
  };
  AudioEngine.prototype.toggleRadio = function () { this.radioOn = !this.radioOn; return this.radioOn; };

  E.AudioEngine = AudioEngine;
})();
