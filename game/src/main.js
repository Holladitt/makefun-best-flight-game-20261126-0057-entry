// MERIDIAN RUN — main.js (bagian 1/3)
// Loop game, state (title/flying/paused/debrief/gameover), 3 kamera,
// deteksi ring, skor, preset screenshot (?shot=...).
(function () {
  'use strict';

  var CFG = window.MR_CONFIG;
  var clamp = window.MR_PLANE.clamp;

  var renderer, scene, camera, world, planeMesh, st;
  var camMode = 0;              // 0 chase, 1 cockpit, 2 tower
  var camYawOff = 0, camPitchOff = 0;
  var state = 'title';          // title | flying | paused | debrief | gameover
  var prevState = 'flying';
  var ringsPassed = 0, nextRingIdx = 0;
  var score = 0;
  var elapsedSec = 0, timerStarted = false;
  var shotMode = null;          // 'cover' | 'cockpit' | 'course' | 'landing'
  var lastTime = 0;
  var fxCanvas = null, fxCtx = null;

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function init() {
    shotMode = qs('shot');
    var canvas = document.getElementById('game');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new THREE.Scene();
    window.MR_SCENE = scene; // debug: inspeksi objek scene dari console/probe
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 30000);
    world = window.MR_WORLD.buildWorld(scene);

    planeMesh = window.MR_PLANE.buildPlaneMesh();
    scene.add(planeMesh.group);

    st = window.MR_PLANE.createState();
    window.MR_PLANE.applyToMesh(st, planeMesh);

    window.MR_INPUT.init(canvas);
    window.MR_HUD.init();
    fxCanvas = document.getElementById('fx');
    if (fxCanvas) {
      fxCanvas.width = window.innerWidth;
      fxCanvas.height = window.innerHeight;
      fxCtx = fxCanvas.getContext('2d');
    }

    window.addEventListener('resize', onResize);
    bindButtons();
    window.MR_HUD.drawCourseMap(document.getElementById('coursemap'), CFG.RINGS, CFG.WORLD.runway);
    updateBestLabel();

    if (shotMode) {
      applyShotPreset(shotMode);
      state = 'flying';
      showOverlay(null); // tampilkan HUD + panel instrumen
      document.getElementById('hud').style.display = 'block';
    } else {
      showOverlay('title');
    }

    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (fxCanvas) {
      fxCanvas.width = window.innerWidth;
      fxCanvas.height = window.innerHeight;
    }
  }

  function bindButtons() {
    var startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.addEventListener('click', startFlight);
    var againBtn = document.getElementById('btn-again');
    if (againBtn) againBtn.addEventListener('click', resetToTitle);
    var retryBtn = document.getElementById('btn-retry');
    if (retryBtn) retryBtn.addEventListener('click', resetToTitle);
  }

  function updateBestLabel() {
    var el = document.getElementById('best-score');
    if (!el) return;
    var best = 0;
    try { best = parseInt(window.localStorage.getItem('meridian-run-best') || '0', 10) || 0; } catch (e) {}
    el.textContent = best > 0 ? ('Skor terbaik: ' + best) : 'Belum ada skor — jadilah yang pertama!';
  }

  function saveBest() {
    try {
      var best = parseInt(window.localStorage.getItem('meridian-run-best') || '0', 10) || 0;
      if (score > best) window.localStorage.setItem('meridian-run-best', String(score));
    } catch (e) {}
  }

  function showOverlay(id) {
    ['title', 'debrief', 'gameover', 'paused'].forEach(function (o) {
      var el = document.getElementById('overlay-' + o);
      if (el) el.style.display = (o === id) ? 'flex' : 'none';
    });
    var hud = document.getElementById('hud');
    if (hud) hud.style.display = (id === 'title') ? 'none' : 'block';
    var panel = document.getElementById('panel');
    if (panel) panel.style.display = (id === 'title') ? 'none' : 'block';
  }

  function hideOverlay(id) {
    var el = document.getElementById('overlay-' + id);
    if (el) el.style.display = 'none';
  }

  function startFlight() {
    window.MR_AUDIO.ensureContext();
    resetFlight();
    state = 'flying';
    showOverlay(null);
  }

  function resetFlight() {
    st = window.MR_PLANE.createState();
    world.ringMeshes.forEach(function (rm) {
      rm.passed = false;
      rm.mat.color.setHex(0xff8c1a);
      rm.mat.opacity = 0.9;
    });
    ringsPassed = 0; nextRingIdx = 0;
    score = 0; elapsedSec = 0; timerStarted = false;
    camMode = 0; camYawOff = 0; camPitchOff = 0;
    window.MR_PLANE.applyToMesh(st, planeMesh);
  }

  function resetToTitle() {
    resetFlight();
    state = 'title';
    showOverlay('title');
    updateBestLabel();
  }

  // --- Preset screenshot: posisi pesawat + kamera + HUD beku di state tertentu ---
  function applyShotPreset(shot) {
    resetFlight();
    var R = CFG.RINGS;
    if (shot === 'cover') {
      // Chase view menembus ring 1 di atas Coral Bay.
      camMode = 0;
      st.pos.set(2250, 490, 2450);
      st.heading = Math.atan2(R[0].x - st.pos.x, -(R[0].z - st.pos.z));
      st.pitch = 0.02; st.speedMs = 67; st.throttle = 0.7;
      st.onGround = false; st.gearDown = true;
      ringsPassed = 0; nextRingIdx = 0;
    } else if (shot === 'cockpit') {
      // Cockpit view, final approach, lampu runway di depan.
      // Koridor pendekatan sudah diratakan (terrain ~12 m), jadi 180 m aman.
      camMode = 1;
      st.pos.set(-1200, 180, 0);
      st.heading = Math.PI / 2;
      st.pitch = -0.05; st.speedMs = 62; st.throttle = 0.45;
      st.onGround = false; st.gearDown = true;
      ringsPassed = 12; nextRingIdx = 12;
      score = 1200;
    } else if (shot === 'course') {
      // Dari ketinggian di atas North Ridge, lampu kota terlihat.
      // Posisi 2850 m: ~640 m di atas terrain lokal (~2210 m), ring 6
      // (2800 m) terlihat di depan sedikit di bawah garis pandang.
      camMode = 0;
      st.pos.set(-1900, 2850, -500);
      st.heading = Math.atan2(R[5].x - st.pos.x, -(R[5].z - st.pos.z));
      st.pitch = 0.0; st.speedMs = 72; st.throttle = 0.66;
      st.onGround = false; st.gearDown = false;
      ringsPassed = 5; nextRingIdx = 5;
      score = 500;
    } else if (shot === 'landing') {
      // Final approach rendah, gear turun, lampu runway 09.
      camMode = 0;
      st.pos.set(-900, 60, 6);
      st.heading = Math.PI / 2;
      st.pitch = -0.06; st.speedMs = 55; st.throttle = 0.35;
      st.onGround = false; st.gearDown = true;
      ringsPassed = 12; nextRingIdx = 12;
      score = 1200;
    }
    elapsedSec = shot === 'cover' ? 62 : shot === 'course' ? 240 : 385;
    timerStarted = true;
    st.fuel = shot === 'landing' || shot === 'cockpit' ? 61 : 84;
    window.MR_PLANE.applyToMesh(st, planeMesh);
    // Tandai ring yang sudah dilewati di preset (hijau).
    world.ringMeshes.forEach(function (rm, i) {
      if (i < ringsPassed) { rm.passed = true; rm.mat.color.setHex(0x2eff7a); rm.mat.opacity = 0.55; }
    });
    // Panel instrumen: besar di cockpit, strip di chase.
    var panel = document.getElementById('panel');
    if (panel) panel.classList.toggle('big', camMode === 1);
  }

  // --- Loop utama ---
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    handleEdges();
    if (state === 'flying' && !shotMode) {
      updateFlight(dt);
    } else if (state === 'flying' && shotMode) {
      // Mode screenshot: dunia beku, hanya render (stabil untuk screenshot).
      st.propAngle += 20 * dt;
      window.MR_PLANE.applyToMesh(st, planeMesh);
    }
    updateWorldAmbient(dt, now);
    updateCamera(dt);
    renderer.render(scene, camera);
    drawSpeedFx();
    if (state === 'flying' || state === 'paused') {
      window.MR_HUD.updateHUD(st, currentGameView());
      var big = camMode === 1;
      var gc = document.getElementById('gauges');
      if (gc) {
        gc.width = big ? 900 : 720;
        gc.height = big ? 170 : 120;
      }
      window.MR_HUD.drawGauges(st, currentGameView(), big);
    }
  }

  function currentGameView() {
    var next = null;
    if (nextRingIdx < CFG.RINGS.length) {
      var ring = CFG.RINGS[nextRingIdx];
      var dx = ring.x - st.pos.x, dz = ring.z - st.pos.z, dy = ring.y - st.pos.y;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) % 360 + 360) % 360;
      var rel = ((bearing - window.MR_HUD.hdgDeg(st.heading)) % 360 + 360) % 360;
      var arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
      var arrow = arrows[Math.round(rel / 45) % 8];
      next = { distM: dist, name: ring.name + ' #' + (nextRingIdx + 1), arrow: arrow };
    }
    return { ringsPassed: ringsPassed, elapsedSec: elapsedSec, score: score, nextRing: next };
  }

  function handleEdges() {
    var edges = window.MR_INPUT.consumeEdges();
    var drag = window.MR_INPUT.consumeDrag();
    camYawOff += drag.dx * 0.003;
    camPitchOff = clamp(camPitchOff - drag.dy * 0.002, -0.5, 0.5);
    camYawOff = clamp(camYawOff, -1.2, 1.2);
    // Drag meluruh.
    camYawOff *= 0.995;
    camPitchOff *= 0.995;

    for (var i = 0; i < edges.length; i++) {
      var code = edges[i];
      if (code === 'KeyP' && (state === 'flying' || state === 'paused') && !shotMode) {
        if (state === 'flying') { prevState = 'flying'; state = 'paused'; showOverlay('paused'); }
        else { state = 'flying'; showOverlay(null); }
      } else if (code === 'KeyR' && state !== 'title' && !shotMode) {
        resetFlight();
        state = 'flying';
        showOverlay(null);
      } else if (code === 'Digit1') { setCam(0); }
      else if (code === 'Digit2') { setCam(1); }
      else if (code === 'Digit3') { setCam(2); }
      else if (code === 'KeyM') {
        window.MR_AUDIO.ensureContext();
        window.MR_AUDIO.setMuted(!window.MR_AUDIO.isMuted());
      }
    }
  }

  function setCam(mode) {
    camMode = mode;
    var panel = document.getElementById('panel');
    if (panel) panel.classList.toggle('big', mode === 1);
  }

  // --- Update saat terbang: input -> fisika -> ring -> skor ---
  function updateFlight(dt) {
    var K = CFG.KEYS;
    var input = {
      pitch: (window.MR_INPUT.isDown(K.pitchUp) ? 1 : 0) - (window.MR_INPUT.isDown(K.pitchDown) ? 1 : 0),
      roll: (window.MR_INPUT.isDown(K.rollRight) ? 1 : 0) - (window.MR_INPUT.isDown(K.rollLeft) ? 1 : 0),
      rudder: (window.MR_INPUT.isDown(K.rudderRight) ? 1 : 0) - (window.MR_INPUT.isDown(K.rudderLeft) ? 1 : 0),
      throttleUp: window.MR_INPUT.isDown(K.throttleUp),
      throttleDown: window.MR_INPUT.isDown(K.throttleDown),
      airbrake: window.MR_INPUT.isDown(K.airbrake)
    };
    // Gear otomatis: turun saat lambat & rendah di dekat runway.
    var nearRwy = Math.abs(st.pos.x) < 1500 && Math.abs(st.pos.z) < 400 && st.pos.y < 300;
    if (nearRwy && st.speedMs < 75) st.gearDown = true;
    else if (st.speedMs > 85 && !st.onGround) st.gearDown = false;

    var ev = window.MR_PLANE.stepPhysics(st, input, dt, world.terrainHeight);
    window.MR_PLANE.applyToMesh(st, planeMesh);

    if (!timerStarted && st.speedMs > 20) timerStarted = true;
    if (timerStarted) elapsedSec += dt;

    // Deteksi ring berikutnya.
    if (nextRingIdx < CFG.RINGS.length) {
      var ring = CFG.RINGS[nextRingIdx];
      var d = Math.sqrt(
        Math.pow(ring.x - st.pos.x, 2) +
        Math.pow(ring.y - st.pos.y, 2) +
        Math.pow(ring.z - st.pos.z, 2)
      );
      if (d < ring.r + 6) {
        var rm = world.ringMeshes[nextRingIdx];
        rm.passed = true;
        rm.mat.color.setHex(0x2eff7a);
        rm.mat.opacity = 0.55;
        ringsPassed++;
        nextRingIdx++;
        score += CFG.SCORE.ringPoints;
        window.MR_AUDIO.ringDing();
        flashMessage('RING ' + ringsPassed + '/12  +100');
      }
    }

    window.MR_AUDIO.update(st.throttle, st.speedMs, st.onGround);

    if (ev === 'crash') {
      state = 'gameover';
      saveBest();
      var go = document.getElementById('gameover-detail');
      if (go) go.textContent = 'Pesawat rusak setelah ' + ringsPassed + '/12 ring. Skor: ' + score + '.';
      showOverlay('gameover');
    } else if (ev === 'landed') {
      finishRun();
    }
  }

  // Selesai: hitung skor akhir + tampilkan debrief.
  function finishRun() {
    var timeBonus = 0;
    if (ringsPassed >= 12) {
      timeBonus = Math.max(0, Math.round((CFG.SCORE.parTimeSec - elapsedSec) * CFG.SCORE.timeBonusPerSec));
    }
    var fuelBonus = Math.round(st.fuel * CFG.SCORE.fuelBonusPerPct);
    var landingScore = st.touchdown ? st.touchdown.score : 0;
    var ringScore = ringsPassed * CFG.SCORE.ringPoints;
    score = ringScore + timeBonus + landingScore + fuelBonus;
    state = 'debrief';
    saveBest();
    var d = document.getElementById('debrief-detail');
    if (d) {
      d.innerHTML =
        'Ring: ' + ringsPassed + '/12 × 100 = <b>' + ringScore + '</b><br>' +
        'Bonus waktu (' + window.MR_HUD.fmtTime(elapsedSec) + ' vs par 7:00): <b>+' + timeBonus + '</b><br>' +
        'Kualitas pendaratan (touchdown ' + (st.touchdown ? st.touchdown.speedKt : '-') + ' kt, selisih heading ' +
        (st.touchdown ? st.touchdown.alignErrDeg : '-') + '°, offset tengah ' +
        (st.touchdown ? st.touchdown.centerErrM : '-') + ' m): <b>+' + landingScore + '</b><br>' +
        'Sisa bahan bakar ' + Math.round(st.fuel) + '%: <b>+' + fuelBonus + '</b><br>' +
        '<span class="total">TOTAL: ' + score + '</span>';
    }
    showOverlay('debrief');
  }

  // Pesan kilat di tengah layar.
  var flashTimer = null;
  function flashMessage(text) {
    var el = document.getElementById('flash');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.style.display = 'none'; }, 1800);
  }

  // --- Kamera ---
  function updateCamera(dt) {
    var fwd = new THREE.Vector3(Math.sin(st.heading), 0, -Math.cos(st.heading));
    if (camMode === 0) {
      planeMesh.canopy.visible = true;
      // Chase: di belakang + atas pesawat, ikut heading + offset drag.
      var back = fwd.clone().multiplyScalar(-19);
      var yaw = camYawOff;
      var bx = back.x * Math.cos(yaw) - back.z * Math.sin(yaw);
      var bz = back.x * Math.sin(yaw) + back.z * Math.cos(yaw);
      camera.position.set(st.pos.x + bx, st.pos.y + 5.5 + camPitchOff * 8, st.pos.z + bz);
      var look = st.pos.clone().add(fwd.clone().multiplyScalar(45));
      look.y += 2 + camPitchOff * 10;
      camera.lookAt(look);
    } else if (camMode === 1) {
      // Cockpit: di atas kanopi, pandang ke depan + offset drag.
      // Kanopi disembunyikan supaya tidak menutupi pandangan.
      // Mata pilot di (0, 1.5, 0.9) lokal: di belakang baling-baling (+4.9),
      // di atas hidung, supaya prop hanya terlihat kecil di depan.
      planeMesh.canopy.visible = false;
      var eye = st.pos.clone().add(new THREE.Vector3(0, 1.5, 0)).add(fwd.clone().multiplyScalar(0.9));
      camera.position.copy(eye);
      var look2 = st.pos.clone().add(fwd.clone().multiplyScalar(120));
      look2.y += st.pitch * 60 + camPitchOff * 30;
      look2.x += Math.sin(st.heading + camYawOff) * 30 - Math.sin(st.heading) * 30;
      camera.lookAt(look2);
      camera.rotation.z += -st.roll * 0.35;
    } else {
      // Tower: kamera diam di menara, memandang pesawat.
      planeMesh.canopy.visible = true;
      camera.position.set(420, 95, 420);
      camera.lookAt(st.pos.x, st.pos.y, st.pos.z);
    }
  }

  // --- Ambient: sorot lighthouse berputar, denyut ring berikut, awan hanyut ---
  function updateWorldAmbient(dt, now) {
    if (world.beamPivot) world.beamPivot.rotation.y += dt * 0.5;
    if (nextRingIdx < CFG.RINGS.length && state === 'flying') {
      var rm = world.ringMeshes[nextRingIdx];
      if (rm && !rm.passed) {
        var s = 1 + 0.08 * Math.sin(now / 240);
        rm.mesh.scale.set(s, s, s);
      }
    }
    if (world.clouds) {
      for (var i = 0; i < world.clouds.length; i++) {
        var c = world.clouds[i];
        c.position.x += dt * 2.2;
        if (c.position.x > 6500) c.position.x = -6500;
      }
    }
  }

  // Garis kecepatan saat laju tinggi (streak radial tipis).
  function drawSpeedFx() {
    if (!fxCtx) return;
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    if (state !== 'flying') return;
    var spd = st.speedMs;
    if (spd < 95) return;
    var n = Math.round((spd - 95) / 4);
    var cx = fxCanvas.width / 2, cy = fxCanvas.height / 2;
    fxCtx.strokeStyle = 'rgba(255,255,255,0.25)';
    fxCtx.lineWidth = 1.5;
    var rng = Math.sin(performance.now() / 90) * 1000;
    for (var i = 0; i < n; i++) {
      var a = ((i * 137.5 + rng) % 360) * Math.PI / 180;
      var r0 = Math.min(cx, cy) * 0.55, r1 = r0 + 26 + (i % 5) * 9;
      fxCtx.beginPath();
      fxCtx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      fxCtx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      fxCtx.stroke();
    }
  }

  window.addEventListener('DOMContentLoaded', init);
  window.MR_MAIN = {
    getState: function () { return { state: state, ringsPassed: ringsPassed, score: score }; },
    // Hook uji: baca state terbang (dipakai script verifikasi, bukan gameplay).
    getFlight: function () {
      return {
        state: state, x: Math.round(st.pos.x), y: Math.round(st.pos.y), z: Math.round(st.pos.z),
        headingDeg: Math.round(window.MR_HUD.hdgDeg(st.heading)),
        pitch: Math.round(st.pitch * 100) / 100, roll: Math.round(st.roll * 100) / 100,
        speedMs: Math.round(st.speedMs), speedKt: Math.round(st.speedMs * 1.94384),
        throttle: Math.round(st.throttle * 100) / 100, fuel: Math.round(st.fuel),
        onGround: st.onGround, gearDown: st.gearDown, crashed: st.crashed, landed: st.landed,
        ringsPassed: ringsPassed, nextRingIdx: nextRingIdx,
        elapsedSec: Math.round(elapsedSec), score: score
      };
    }
  };
})();
