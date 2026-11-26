// MERIDIAN RUN — input.js
// Keyboard + mouse drag. Tanpa network, tanpa dependency.
(function () {
  'use strict';

  var pressed = {};       // code -> true
  var edgeQueue = [];     // kode tombol yang baru ditekan (sekali pakai)
  var drag = { active: false, dx: 0, dy: 0, yaw: 0, pitch: 0 };
  var callbacks = {};

  function onKeyDown(e) {
    if (e.repeat) return;
    pressed[e.code] = true;
    edgeQueue.push(e.code);
    if (callbacks.keydown) callbacks.keydown(e.code);
    // Cegah scroll halaman untuk tombol game.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    pressed[e.code] = false;
  }

  function init(canvas) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () { pressed = {}; });
    canvas.addEventListener('mousedown', function (e) {
      drag.active = true; drag.dx = 0; drag.dy = 0;
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag.active) return;
      drag.dx += e.movementX || 0;
      drag.dy += e.movementY || 0;
    });
    window.addEventListener('mouseup', function () { drag.active = false; });
    // Sentuh: drag satu jari untuk melihat sekeliling.
    canvas.addEventListener('touchstart', function (e) {
      drag.active = true; drag.dx = 0; drag.dy = 0;
      drag._tx = e.touches[0].clientX; drag._ty = e.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (!drag.active) return;
      var t = e.touches[0];
      drag.dx += t.clientX - drag._tx; drag.dy += t.clientY - drag._ty;
      drag._tx = t.clientX; drag._ty = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', function () { drag.active = false; }, { passive: true });
  }

  function isDown(codes) {
    for (var i = 0; i < codes.length; i++) {
      if (pressed[codes[i]]) return true;
    }
    return false;
  }

  // Ambil dan kosongkan antrian tombol sekali-tekan.
  function consumeEdges() {
    var q = edgeQueue;
    edgeQueue = [];
    return q;
  }

  // Offset kamera dari drag mouse, meluruh perlahan ke nol.
  function consumeDrag() {
    var d = { dx: drag.dx, dy: drag.dy };
    drag.dx = 0; drag.dy = 0;
    return d;
  }

  window.MR_INPUT = {
    init: init,
    isDown: isDown,
    consumeEdges: consumeEdges,
    consumeDrag: consumeDrag,
    on: function (name, fn) { callbacks[name] = fn; }
  };
})();
