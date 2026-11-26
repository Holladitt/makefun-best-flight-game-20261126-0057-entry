// MERIDIAN RUN — plane.js (bagian 1/2)
// Model terbang arcade-sim + mesh pesawat dari primitif three.js.
(function () {
  'use strict';

  var CFG = window.MR_CONFIG;
  var P = CFG.PLANE;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // --- State pesawat ---
  function createState() {
    return {
      pos: new THREE.Vector3(0, CFG.WORLD.runway.elevation + 3, 0),
      heading: Math.PI / 2,      // menghadap timur (runway 09)
      pitch: 0,
      roll: 0,
      speedMs: 0,
      throttle: 0,
      fuel: 100,
      gearDown: true,
      onGround: true,
      crashed: false,
      landed: false,
      stallWarning: false,
      propAngle: 0,
      vsMs: 0,                   // vertical speed
      touchdown: null            // hasil evaluasi pendaratan
    };
  }

  // --- Mesh pesawat: fuselage, sayap, ekor, prop blur, gear ---
  function buildPlaneMesh() {
    var group = new THREE.Group();
    var bodyMat = new THREE.MeshPhongMaterial({ color: 0xd8432e, shininess: 60 });
    var wingMat = new THREE.MeshPhongMaterial({ color: 0xf2ede2, shininess: 40 });
    var darkMat = new THREE.MeshPhongMaterial({ color: 0x22242a, shininess: 80 });
    var glassMat = new THREE.MeshPhongMaterial({ color: 0x1a2f4a, shininess: 120, specular: 0x99ccff });

    // Fuselage (sumbu Z = depan).
    var fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.55, 6.4, 12), bodyMat);
    fus.rotation.x = Math.PI / 2;
    group.add(fus);
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 12), darkMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 4.0;
    group.add(nose);
    // Kanopi kokpit.
    var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), glassMat);
    canopy.scale.set(0.9, 0.75, 1.7);
    canopy.position.set(0, 0.75, 1.1);
    group.add(canopy);
    // Sayap utama.
    var wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.18, 1.9), wingMat);
    wing.position.set(0, -0.1, 0.6);
    group.add(wing);
    // Ujung sayap merah (nav light kiri merah, kanan hijau).
    var tipL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    tipL.position.set(-5.75, -0.1, 0.6);
    group.add(tipL);
    var tipR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
    tipR.position.set(5.75, -0.1, 0.6);
    group.add(tipR);
    // Horizontal stabilizer + fin vertikal.
    var stab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.1), wingMat);
    stab.position.set(0, 0.15, -2.9);
    group.add(stab);
    var fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 1.4), bodyMat);
    fin.position.set(0, 0.9, -2.9);
    group.add(fin);
    // Propeller: 2 bilah + cakram blur transparan.
    var prop = new THREE.Group();
    var bladeMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
    var b1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.08), bladeMat);
    prop.add(b1);
    var b2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 0.08), bladeMat);
    prop.add(b2);
    var spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 10), bodyMat);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.2;
    prop.add(spinner);
    prop.position.z = 4.9;
    group.add(prop);
    var blur = new THREE.Mesh(
      new THREE.CircleGeometry(1.85, 24),
      new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    );
    blur.position.z = 4.85;
    group.add(blur);
    // Landing gear (3 kaki + roda).
    var gear = new THREE.Group();
    var legMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    var wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    [[-1.1, 0.4], [1.1, 0.4], [0, -2.6]].forEach(function (p) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), legMat);
      leg.position.set(p[0], -0.9, p[1]);
      gear.add(leg);
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0], -1.45, p[1]);
      gear.add(wheel);
    });
    group.add(gear);

    return { group: group, prop: prop, blur: blur, gear: gear, canopy: canopy };
  }

  // --- Update fisika satu langkah dt (detik). Kembalikan event: 'crash' | 'landed' | null ---
  // input: { pitch: -1..1 (1 = tarik ke atas), roll: -1..1, rudder: -1..1,
  //          throttleUp, throttleDown, airbrake } — semua dari MR_INPUT.
  function stepPhysics(st, input, dt, terrainHeight) {
    if (st.crashed || st.landed) return null;

    // Throttle.
    if (input.throttleUp) st.throttle = clamp(st.throttle + dt * 0.55, 0, 1);
    if (input.throttleDown) st.throttle = clamp(st.throttle - dt * 0.55, 0, 1);
    var throttle = st.fuel <= 0 ? 0 : st.throttle;

    // Kecepatan target dari throttle; airbrake mengerem kuat.
    // Akselerasi linear (m/s^2) supaya takeoff terasa: 0 -> 135 m/s dalam ~15 dtk.
    var targetSpeed = P.minSpeedMs + throttle * (P.maxSpeedMs - P.minSpeedMs);
    if (input.airbrake) {
      st.speedMs = Math.max(P.minSpeedMs, st.speedMs - P.dragBrake * dt);
    } else {
      var diff = targetSpeed - st.speedMs;
      var step = clamp(diff, -P.accelRate * dt, P.accelRate * dt);
      st.speedMs += step;
    }

    // Stall: di bawah 90 knot otoritas pitch jatuh + pesawat tenggelam.
    var speedFactor = clamp(st.speedMs / P.stallSpeedMs, 0, 1);
    st.stallWarning = st.speedMs < P.stallSpeedMs && !st.onGround;

    // Pitch / roll dengan asistensi arcade (kembali lurus bila dilepas).
    var pitchAuthority = 0.35 + 0.65 * speedFactor;
    var targetPitch = clamp(input.pitch * P.maxPitch * pitchAuthority, -P.maxPitch, P.maxPitch);
    var targetRoll = clamp(input.roll * P.maxRoll, -P.maxRoll, P.maxRoll);
    st.pitch = lerp(st.pitch, targetPitch, clamp(P.pitchRate * 2.2 * dt, 0, 1));
    st.roll = lerp(st.roll, targetRoll, clamp(P.rollRate * 1.6 * dt, 0, 1));
    if (Math.abs(input.roll) < 0.05) st.roll = lerp(st.roll, 0, clamp(1.2 * dt, 0, 1));

    // Heading: belok dari roll (coordinated) + rudder.
    // Roll kanan (D, roll>0) = belok kanan = heading naik (kompas searah jarum jam).
    var turnRate = st.roll * P.turnFactor * (0.4 + 0.6 * speedFactor) + input.rudder * P.rudderRate * speedFactor;
    st.heading += turnRate * dt;

    // Gerak: arah dari heading + pitch.
    var dirX = Math.sin(st.heading) * Math.cos(st.pitch);
    var dirZ = -Math.cos(st.heading) * Math.cos(st.pitch);
    var dirY = Math.sin(st.pitch);
    var vx = dirX * st.speedMs, vy = dirY * st.speedMs, vz = dirZ * st.speedMs;

    // Lift: di bawah stall, pesawat kehilangan ketinggian.
    if (st.speedMs < P.stallSpeedMs && !st.onGround) {
      vy -= (P.stallSpeedMs - st.speedMs) * 0.35;
    }
    // Gravitasi saat throttle rendah di tanah: tetap di landasan.
    st.vsMs = vy;
    st.pos.x += vx * dt;
    st.pos.y += vy * dt;
    st.pos.z += vz * dt;

    // Bahan bakar.
    if (throttle > 0 && !st.onGround) {
      st.fuel = Math.max(0, st.fuel - throttle * P.fuelBurnPerSec * dt);
    }

    // Propeller.
    st.propAngle += (2 + throttle * 38) * dt;

    // Tanah / runway.
    var ground = terrainHeight(st.pos.x, st.pos.z);
    var gearHeight = 1.5;
    if (st.pos.y <= ground + gearHeight) {
      st.pos.y = ground + gearHeight;
      var onRunway = isOnRunway(st.pos.x, st.pos.z);
      var sink = -vy;
      if (st.onGround) {
        // Takeoff roll: roda lepas di atas kecepatan takeoff.
        if (st.speedMs > P.takeoffSpeedMs && st.pitch > 0.08) {
          st.onGround = false;
        }
      } else {
        // Mendarat / menabrak tanah.
        if (onRunway && st.gearDown && sink <= P.maxSinkMs && st.speedMs <= P.gearSpeedLimitMs) {
          st.landed = true;
          st.touchdown = evaluateLanding(st, sink, onRunway);
          st.speedMs *= 0.55;
          return 'landed';
        }
        st.crashed = true;
        return 'crash';
      }
    } else if (st.onGround && st.speedMs > P.takeoffSpeedMs && st.pitch > 0.08) {
      st.onGround = false;
    }
    // Batas dunia: jangan terbang keluar pulau terlalu jauh.
    var rr = Math.hypot(st.pos.x, st.pos.z);
    if (rr > 9000) {
      st.heading += Math.PI; // putar balik lembut (asistensi)
      st.pos.x = clamp(st.pos.x, -8800, 8800);
      st.pos.z = clamp(st.pos.z, -8800, 8800);
    }
    return null;
  }

  function isOnRunway(x, z) {
    var r = CFG.WORLD.runway;
    // Runway sepanjang sumbu X (heading 090), lebar 45 m, toleransi 30 m.
    return Math.abs(x - r.center.x) <= r.length / 2 + 10 && Math.abs(z - r.center.z) <= r.width / 2 + 30;
  }

  // Nilai pendaratan 0..300: kecepatan touchdown, kelurusan, posisi tengah runway.
  function evaluateLanding(st, sink, onRunway) {
    var speedKt = st.speedMs * 1.94384;
    var speedScore = clamp(1 - Math.abs(speedKt - 95) / 60, 0, 1);
    // Kelurusan: heading mendekati 090 (timur) atau 270.
    var hDeg = ((st.heading * 180 / Math.PI) % 360 + 360) % 360;
    var alignErr = Math.min(Math.abs(hDeg - 90), Math.abs(hDeg - 270));
    var alignScore = clamp(1 - alignErr / 30, 0, 1);
    var centerErr = Math.abs(st.pos.z - CFG.WORLD.runway.center.z);
    var centerScore = clamp(1 - centerErr / 40, 0, 1);
    var sinkScore = clamp(1 - sink / P.maxSinkMs, 0, 1);
    var total = Math.round((speedScore * 0.35 + alignScore * 0.25 + centerScore * 0.2 + sinkScore * 0.2) * SCORE_MAX);
    return {
      speedKt: Math.round(speedKt),
      sinkMs: Math.round(sink * 10) / 10,
      alignErrDeg: Math.round(alignErr),
      centerErrM: Math.round(centerErr),
      score: total
    };
  }
  var SCORE_MAX = 300;

  // Terapkan state ke mesh: posisi + orientasi (heading, pitch, roll).
  // Hidung pesawat = sumbu +Z lokal; rotation.y = PI - heading supaya +Z
  // menunjuk ke arah gerak (sin h, 0, -cos h).
  function applyToMesh(st, mesh) {
    mesh.group.position.copy(st.pos);
    mesh.group.rotation.order = 'YXZ';
    mesh.group.rotation.y = Math.PI - st.heading;
    mesh.group.rotation.x = -st.pitch;
    mesh.group.rotation.z = -st.roll;
    mesh.prop.rotation.z = st.propAngle;
    mesh.blur.material.opacity = st.onGround ? 0.05 : clamp(0.10 + st.throttle * 0.12, 0, 0.22);
    mesh.gear.visible = st.gearDown;
  }

  window.MR_PLANE = {
    createState: createState,
    buildPlaneMesh: buildPlaneMesh,
    stepPhysics: stepPhysics,
    applyToMesh: applyToMesh,
    isOnRunway: isOnRunway,
    clamp: clamp,
    lerp: lerp
  };
})();
