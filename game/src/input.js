// EMBER TIDE — input.js
// Keyboard + mouse + pointer lock. Releases all keys on blur/focus loss,
// prevents default on game keys, handles pointer-lock denial gracefully
// by falling back to drag-look (cursor mode).
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;

  function Input(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressed = {};   // edge-triggered, consumed by game each frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.rightDown = false;
    this.locked = false;
    this.lockDenied = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.sensitivity = 1.0;
    this.invertY = false;
    var self = this;
    var GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
      'KeyF', 'KeyE', 'KeyR', 'KeyM', 'KeyH', 'KeyC', 'KeyQ', 'Digit1', 'Digit2',
      'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown'];
    window.addEventListener('keydown', function (ev) {
      if (GAME_KEYS.indexOf(ev.code) >= 0) ev.preventDefault();
      if (!ev.repeat) self.pressed[ev.code] = true;
      self.keys[ev.code] = true;
    });
    window.addEventListener('keyup', function (ev) { self.keys[ev.code] = false; });
    window.addEventListener('blur', function () { self.releaseAll(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) self.releaseAll();
    });
    document.addEventListener('pointerlockchange', function () {
      self.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('pointerlockerror', function () {
      self.lockDenied = true; self.locked = false;
    });
    canvas.addEventListener('mousedown', function (ev) {
      if (ev.button === 0) self.mouseDown = true;
      if (ev.button === 2) self.rightDown = true;
      self.dragging = true; self.lastX = ev.clientX; self.lastY = ev.clientY;
    });
    window.addEventListener('mouseup', function (ev) {
      if (ev.button === 0) self.mouseDown = false;
      if (ev.button === 2) self.rightDown = false;
      self.dragging = false;
    });
    canvas.addEventListener('mousemove', function (ev) {
      if (self.locked) {
        self.mouseDX += ev.movementX || 0;
        self.mouseDY += ev.movementY || 0;
      } else if (self.dragging) {
        self.mouseDX += (ev.clientX - self.lastX) * 1.4;
        self.mouseDY += (ev.clientY - self.lastY) * 1.4;
        self.lastX = ev.clientX; self.lastY = ev.clientY;
      }
    });
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    canvas.addEventListener('click', function () { self.requestLock(); });
  }

  Input.prototype.requestLock = function () {
    if (this.lockDenied || this.locked) return;
    try {
      var p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(function () { /* denied: drag-look fallback */ });
    } catch (err) { /* denied */ }
  };
  Input.prototype.releaseAll = function () {
    this.keys = {};
    this.mouseDown = false; this.rightDown = false; this.dragging = false;
  };
  Input.prototype.down = function (code) { return !!this.keys[code]; };
  Input.prototype.hit = function (code) {
    if (this.pressed[code]) { this.pressed[code] = false; return true; }
    return false;
  };
  Input.prototype.consumeMouse = function () {
    var dx = this.mouseDX * 0.0022 * this.sensitivity;
    var dy = this.mouseDY * 0.0022 * this.sensitivity * (this.invertY ? -1 : 1);
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx: dx, dy: dy };
  };
  Input.prototype.endFrame = function () { this.pressed = {}; };

  E.Input = Input;
})();
