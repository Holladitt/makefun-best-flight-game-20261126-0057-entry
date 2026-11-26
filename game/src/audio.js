// MERIDIAN RUN — audio.js (bagian 1/2)
// Dengung mesin prosedural via WebAudio (oscillator + noise), tanpa file suara.
// Mulai hanya setelah gestur pengguna; M = mute.
(function () {
  'use strict';

  var ctx = null, master = null, osc1 = null, osc2 = null, noiseGain = null;
  var muted = false;
  var started = false;

  function ensureContext() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.0;
      master.connect(ctx.destination);

      // Nada mesin: dua sawtooth sedikit detune.
      osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 55;
      osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 55.7;
      var low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 320;
      var og = ctx.createGain();
      og.gain.value = 0.5;
      osc1.connect(low); osc2.connect(low);
      low.connect(og); og.connect(master);

      // Desis angin: noise buffer + bandpass.
      var len = ctx.sampleRate * 2;
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      var noise = ctx.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
      noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.0;
      noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(master);
      noise.start();

      osc1.start(); osc2.start();
      started = true;
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  // Perbarui suara dari state pesawat: RPM dari throttle, angin dari kecepatan.
  function update(throttle, speedMs, onGround) {
    if (!started || muted || !ctx) return;
    var t = ctx.currentTime;
    var rpm = 42 + throttle * 58;
    osc1.frequency.setTargetAtTime(rpm, t, 0.08);
    osc2.frequency.setTargetAtTime(rpm * 1.012, t, 0.08);
    var vol = onGround ? 0.02 + throttle * 0.05 : 0.05 + throttle * 0.08;
    master.gain.setTargetAtTime(vol, t, 0.1);
    var wind = Math.min(0.12, Math.max(0, (speedMs - 30) / 135) * 0.12);
    noiseGain.gain.setTargetAtTime(wind, t, 0.15);
  }

  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.06, ctx.currentTime, 0.05);
  }

  function isMuted() { return muted; }

  // Bunyi singkat saat melewati ring (ding) — oscillator sekali pakai.
  function ringDing() {
    if (!started || muted || !ctx) return;
    try {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 880;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.18, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.55);
    } catch (e) { /* abaikan */ }
  }

  window.MR_AUDIO = {
    ensureContext: ensureContext,
    update: update,
    setMuted: setMuted,
    isMuted: isMuted,
    ringDing: ringDing
  };
})();
