// MERIDIAN RUN — hud.js (bagian 1/2)
// HUD teks + 6 instrumen kokpit digambar di canvas 2D (jarum + kaca).
// Instrumen: airspeed, altimeter, vertical speed, kompas, artificial horizon, fuel+RPM.
(function () {
  'use strict';

  var clamp = window.MR_PLANE.clamp;

  var els = {};       // elemen DOM HUD
  var gaugeCanvas = null, gaugeCtx = null;

  function init() {
    els.alt = document.getElementById('hud-alt');
    els.spd = document.getElementById('hud-spd');
    els.hdg = document.getElementById('hud-hdg');
    els.vs = document.getElementById('hud-vs');
    els.fuel = document.getElementById('hud-fuel');
    els.ring = document.getElementById('hud-ring');
    els.timer = document.getElementById('hud-timer');
    els.next = document.getElementById('hud-next');
    els.warn = document.getElementById('hud-warn');
    els.score = document.getElementById('hud-score');
    gaugeCanvas = document.getElementById('gauges');
    if (gaugeCanvas) gaugeCtx = gaugeCanvas.getContext('2d');
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function hdgDeg(headingRad) {
    return ((headingRad * 180 / Math.PI) % 360 + 360) % 360;
  }

  // Update teks HUD. nextRing: {distM, bearingDeg, name} atau null.
  function updateHUD(st, game) {
    if (!els.alt) return;
    var altFt = Math.round(st.pos.y * 3.28084);
    var spdKt = Math.round(st.speedMs * 1.94384);
    var vsFpm = Math.round(st.vsMs * 196.85);
    els.alt.textContent = 'ALT ' + altFt.toLocaleString('en-US') + ' FT';
    els.spd.textContent = 'SPD ' + spdKt + ' KT';
    els.hdg.textContent = 'HDG ' + String(Math.round(hdgDeg(st.heading))).padStart(3, '0') + '°';
    els.vs.textContent = 'V/S ' + (vsFpm >= 0 ? '+' : '') + vsFpm + ' FPM';
    els.fuel.textContent = 'FUEL ' + Math.round(st.fuel) + '%';
    els.ring.textContent = 'RING ' + game.ringsPassed + '/12';
    els.timer.textContent = fmtTime(game.elapsedSec);
    els.score.textContent = 'SCORE ' + game.score;
    if (game.nextRing) {
      var d = Math.round(game.nextRing.distM);
      var arrow = game.nextRing.arrow;
      els.next.textContent = 'NEXT ' + game.nextRing.name + ' ' + d + ' m ' + arrow;
    } else {
      els.next.textContent = 'NEXT: LAND RWY 09';
    }
    var warn = '';
    if (st.stallWarning) warn = '⚠ STALL — TURUNKAN HIDUNG, TAMBAH THROTTLE';
    else if (st.fuel <= 0) warn = '⚠ FUEL HABIS — GLIDE KE RUNWAY';
    else if (st.fuel < 20) warn = '⚠ FUEL RENDAH';
    els.warn.textContent = warn;
    els.warn.style.display = warn ? 'block' : 'none';
  }

  // --- Gambar 6 gauge di canvas ---
  function drawGauges(st, game, big) {
    if (!gaugeCtx) return;
    var g = gaugeCtx;
    var W = gaugeCanvas.width, H = gaugeCanvas.height;
    g.clearRect(0, 0, W, H);
    var n = 6;
    var gw = W / n, gh = H;
    var cx0 = gw / 2, cy = gh / 2, r = Math.min(gw, gh) / 2 - 6;
    drawGaugeASI(g, cx0 + gw * 0, cy, r, st.speedMs * 1.94384);
    drawGaugeALT(g, cx0 + gw * 1, cy, r, st.pos.y * 3.28084);
    drawGaugeVSI(g, cx0 + gw * 2, cy, r, st.vsMs * 196.85);
    drawGaugeHDG(g, cx0 + gw * 3, cy, r, hdgDeg(st.heading));
    drawGaugeATT(g, cx0 + gw * 4, cy, r, st.pitch, st.roll);
    drawGaugeFuel(g, cx0 + gw * 5, cy, r, st.fuel, st.throttle);
    // Label bawah tiap gauge.
    g.fillStyle = '#cfe3ff';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    var labels = ['AIRSPEED KT', 'ALT FT', 'V/S FPM', 'HEADING', 'ATTITUDE', 'FUEL / RPM'];
    for (var i = 0; i < n; i++) {
      g.fillText(labels[i], cx0 + gw * i, H - 4);
    }
  }

  function gaugeFace(g, cx, cy, r) {
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = '#0b1220'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#5a6b85'; g.stroke();
    // Kaca: kilau diagonal.
    g.beginPath(); g.arc(cx, cy, r - 2, 0, Math.PI * 2);
    g.clip();
    var grad = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, 'rgba(255,255,255,0.14)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.restore();
  }

  function needle(g, cx, cy, r, angleRad, color, width) {
    g.save();
    g.translate(cx, cy);
    g.rotate(angleRad);
    g.strokeStyle = color || '#ffcf5a';
    g.lineWidth = width || 2.5;
    g.beginPath(); g.moveTo(0, r * 0.18); g.lineTo(0, -r * 0.82); g.stroke();
    g.fillStyle = '#dfe8ff';
    g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function ticks(g, cx, cy, r, minV, maxV, step, angleMin, angleMax, labelEvery) {
    g.save();
    g.fillStyle = '#dfe8ff';
    g.font = '10px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var v = minV; v <= maxV; v += step) {
      var a = angleMin + (v - minV) / (maxV - minV) * (angleMax - angleMin);
      var x1 = cx + Math.sin(a) * r * 0.82, y1 = cy - Math.cos(a) * r * 0.82;
      var x2 = cx + Math.sin(a) * r * 0.94, y2 = cy - Math.cos(a) * r * 0.94;
      g.strokeStyle = '#8fa3c0'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      if (v % labelEvery === 0) {
        var lx = cx + Math.sin(a) * r * 0.62, ly = cy - Math.cos(a) * r * 0.62;
        g.fillText(String(v), lx, ly);
      }
    }
    g.restore();
  }

  // --- Enam gauge individual ---
  function drawGaugeASI(g, cx, cy, r, kt) {
    gaugeFace(g, cx, cy, r);
    ticks(g, cx, cy, r, 0, 280, 20, -Math.PI * 0.75, Math.PI * 0.75, 40);
    var a = -Math.PI * 0.75 + clamp(kt, 0, 280) / 280 * Math.PI * 1.5;
    needle(g, cx, cy, r, a);
    // Zona stall merah.
    g.save();
    g.strokeStyle = '#ff4444'; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, r * 0.88, -Math.PI / 2 - Math.PI * 0.75, -Math.PI / 2 - Math.PI * 0.75 + (90 / 280) * Math.PI * 1.5); g.stroke();
    g.restore();
  }

  function drawGaugeALT(g, cx, cy, r, ft) {
    gaugeFace(g, cx, cy, r);
    ticks(g, cx, cy, r, 0, 100, 10, -Math.PI * 0.75, Math.PI * 0.75, 10);
    var hundreds = (ft / 100) % 10;
    var a = -Math.PI * 0.75 + hundreds / 10 * Math.PI * 1.5;
    needle(g, cx, cy, r, a);
    g.fillStyle = '#ffcf5a';
    g.font = 'bold 12px monospace';
    g.textAlign = 'center';
    g.fillText(Math.round(ft / 100) + '', cx, cy + r * 0.45);
  }

  function drawGaugeVSI(g, cx, cy, r, fpm) {
    gaugeFace(g, cx, cy, r);
    ticks(g, cx, cy, r, -2000, 2000, 500, -Math.PI * 0.75, Math.PI * 0.75, 1000);
    var a = -Math.PI * 0.75 + clamp((fpm + 2000) / 4000, 0, 1) * Math.PI * 1.5;
    needle(g, cx, cy, r, a, fpm < -1500 ? '#ff4444' : '#ffcf5a');
  }

  function drawGaugeHDG(g, cx, cy, r, deg) {
    gaugeFace(g, cx, cy, r);
    g.save();
    g.translate(cx, cy);
    g.rotate(-deg * Math.PI / 180);
    g.fillStyle = '#dfe8ff';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var marks = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    marks.forEach(function (m) {
      var a = m[0] * Math.PI / 180;
      g.fillText(m[1], Math.sin(a) * r * 0.62, -Math.cos(a) * r * 0.62);
    });
    g.strokeStyle = '#8fa3c0';
    for (var d = 0; d < 360; d += 10) {
      var a2 = d * Math.PI / 180;
      var l = d % 30 === 0 ? r * 0.94 : r * 0.88;
      g.beginPath();
      g.moveTo(Math.sin(a2) * r * 0.82, -Math.cos(a2) * r * 0.82);
      g.lineTo(Math.sin(a2) * l, -Math.cos(a2) * l);
      g.stroke();
    }
    g.restore();
    // Penanda atas (heading saat ini).
    g.fillStyle = '#ffcf5a';
    g.beginPath(); g.moveTo(cx - 6, cy - r - 1); g.lineTo(cx + 6, cy - r - 1); g.lineTo(cx, cy - r + 9); g.closePath(); g.fill();
    g.fillStyle = '#ffcf5a';
    g.font = 'bold 12px monospace';
    g.textAlign = 'center';
    g.fillText(String(Math.round(deg)).padStart(3, '0'), cx, cy + r * 0.45);
  }

  function drawGaugeATT(g, cx, cy, r, pitch, roll) {
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.translate(cx, cy);
    g.rotate(roll);
    var horizonY = -pitch * r * 1.4;
    g.fillStyle = '#3a6fd8'; g.fillRect(-r, -r + horizonY, r * 2, r - horizonY + r);
    g.fillStyle = '#7a5230'; g.fillRect(-r, horizonY, r * 2, r * 2);
    g.fillStyle = '#dfe8ff';
    g.fillRect(-r, horizonY - 1, r * 2, 2);
    g.restore();
    gaugeFace(g, cx, cy, r);
    // Sayap tetap (referensi pesawat).
    g.strokeStyle = '#ffcf5a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - r * 0.55, cy); g.lineTo(cx - r * 0.15, cy); g.moveTo(cx + r * 0.15, cy); g.lineTo(cx + r * 0.55, cy); g.stroke();
    g.fillStyle = '#ffcf5a';
    g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
  }

  function drawGaugeFuel(g, cx, cy, r, fuelPct, throttle) {
    gaugeFace(g, cx, cy, r);
    ticks(g, cx, cy, r, 0, 100, 10, -Math.PI * 0.75, Math.PI * 0.75, 25);
    var a = -Math.PI * 0.75 + clamp(fuelPct, 0, 100) / 100 * Math.PI * 1.5;
    needle(g, cx, cy, r, a, fuelPct < 20 ? '#ff4444' : '#7dff8a');
    // RPM sebagai busur luar (throttle).
    g.save();
    g.strokeStyle = '#ff9a3c'; g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, r * 0.97, -Math.PI / 2 - Math.PI * 0.75, -Math.PI / 2 - Math.PI * 0.75 + clamp(throttle, 0, 1) * Math.PI * 1.5);
    g.stroke();
    g.restore();
    g.fillStyle = '#cfe3ff';
    g.font = 'bold 11px monospace';
    g.textAlign = 'center';
    g.fillText(Math.round(fuelPct) + '%', cx, cy + r * 0.45);
  }

  // --- Peta course kecil untuk title screen ---
  function drawCourseMap(canvas, rings, runway) {
    if (!canvas) return;
    var g = canvas.getContext('2d');
    var W2 = canvas.width, H2 = canvas.height;
    g.clearRect(0, 0, W2, H2);
    // Laut + pulau (sketsa).
    g.fillStyle = '#16324f'; g.fillRect(0, 0, W2, H2);
    g.fillStyle = '#3f6b3a';
    g.beginPath(); g.ellipse(W2 / 2, H2 / 2, W2 * 0.36, H2 * 0.34, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9b078';
    g.beginPath(); g.ellipse(W2 / 2, H2 / 2, W2 * 0.38, H2 * 0.36, 0.3, 0, Math.PI * 2); g.stroke();
    function px(x) { return W2 / 2 + x / 4200 * W2 * 0.36; }
    function py(z) { return H2 / 2 + z / 4200 * H2 * 0.34; }
    // Garis course.
    g.strokeStyle = '#ff8c1a'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px(0), py(0));
    rings.forEach(function (ring) { g.lineTo(px(ring.x), py(ring.z)); });
    g.lineTo(px(0), py(0));
    g.stroke();
    // Ring bernomor.
    g.font = 'bold 11px sans-serif';
    rings.forEach(function (ring, i) {
      g.fillStyle = '#ff8c1a';
      g.beginPath(); g.arc(px(ring.x), py(ring.z), 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), px(ring.x), py(ring.z));
    });
    // Runway.
    g.fillStyle = '#f5f5f5';
    g.fillRect(px(0) - 22, py(0) - 2, 44, 4);
    g.fillStyle = '#cfe3ff';
    g.font = '11px sans-serif';
    g.textAlign = 'left';
    g.fillText('MERIDIAN FIELD RWY 09', px(0) + 26, py(0) - 4);
    g.fillText('GUNUNG MERIDIAN', px(-1400) - 130, py(-900) - 14);
    g.fillText('2.400 m', px(-1400) - 130, py(-900) - 2);
    g.fillText('HARBOR CITY', px(1500) - 30, py(1200) + 16);
    g.fillText('OLD LIGHTHOUSE', px(-2600) - 40, py(1800) + 16);
  }

  window.MR_HUD = {
    init: init,
    updateHUD: updateHUD,
    drawGauges: drawGauges,
    drawCourseMap: drawCourseMap,
    hdgDeg: hdgDeg,
    fmtTime: fmtTime
  };
})();
