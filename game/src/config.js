// MERIDIAN RUN — config.js
// Semua konstanta game: dunia, course, pesawat, skor. Seed tetap = render deterministik.
(function () {
  'use strict';

  var SEED = 20261126;

  // --- Dunia: Pulau Meridian (meter; x timur, z selatan, y atas) ---
  var WORLD = {
    islandRadius: 4200,      // radius pulau (garis pantai)
    seaLevel: 0,
    peakHeight: 2400,        // Gunung Meridian
    peakPos: { x: -1400, z: -900 },
    ridgePos: { x: -600, z: -2600 }, // North Ridge
    cityPos: { x: 1500, z: 1200 },   // Harbor City
    cityRadius: 650,
    bayPos: { x: 2400, z: 2100 },    // Coral Bay
    lighthousePos: { x: -2600, z: 1800 }, // Old Lighthouse
    runway: {
      center: { x: 0, z: 0 },
      headingDeg: 90,        // runway 09/27, arah timur (090)
      length: 1200,
      width: 45,
      elevation: 12
    }
  };

  // --- Course: 12 ring berurutan ---
  // Setiap ring: posisi (m), radius (m), nama landmark.
  var RINGS = [
    { x: 2400,  y: 480,  z: 2100,  r: 30, name: 'Coral Bay' },
    { x: 1800,  y: 500,  z: 2600,  r: 30, name: 'Coral Bay Rise' },
    { x: 400,   y: 550,  z: 2900,  r: 30, name: 'South Shore' },
    { x: -900,  y: 700,  z: 2400,  r: 30, name: 'West Cliffs' },
    { x: -1600, y: 1100, z: 600,   r: 30, name: 'Ridge Gate' },
    { x: -1200, y: 2800, z: -1400, r: 30, name: 'North Ridge' },
    { x: -1400, y: 2850, z: -900,  r: 30, name: 'Meridian Peak' },
    { x: -600,  y: 2400, z: -2200, r: 30, name: 'Meridian Slalom' },
    { x: 600,   y: 750,  z: -1800, r: 30, name: 'High Valley' },
    { x: 1500,  y: 500,  z: -600,  r: 30, name: 'Harbor Approach' },
    { x: 1900,  y: 300,  z: 800,   r: 30, name: 'Harbor City' },
    { x: -600,  y: 450,  z: 1700,  r: 30, name: 'Old Lighthouse' }
  ];

  // --- Pesawat: arcade-sim ---
  var PLANE = {
    maxSpeedMs: 135,       // ~262 knot
    minSpeedMs: 26,        // ~50 knot (di bawah stall)
    stallSpeedMs: 46.3,    // 90 knot
    cruiseThrottle: 0.62,
    accelRate: 9,          // m/s^2 menuju target speed
    pitchRate: 0.55,       // rad/s
    rollRate: 1.9,         // rad/s
    maxPitch: 0.6,
    maxRoll: 1.1,
    turnFactor: 0.42,      // yaw dari roll
    rudderRate: 0.25,
    dragBrake: 22,         // airbrake: pengurangan m/s^2
    fuelCapacity: 100,     // persen
    fuelBurnPerSec: 0.045, // persen/detik pada throttle penuh
    gearSpeedLimitMs: 72,  // ~140 knot, gear rusak di atas ini saat touchdown
    maxSinkMs: 8,          // m/s, di atas ini touchdown = keras
    takeoffSpeedMs: 36     // ~70 knot, roda lepas landas
  };

  // --- Skor ---
  var SCORE = {
    ringPoints: 100,       // per ring x 12 = 1200
    parTimeSec: 420,       // 7 menit; bonus 2 poin/detik lebih cepat
    timeBonusPerSec: 2,
    landingMax: 300,
    fuelBonusPerPct: 2
  };

  // --- Golden hour: matahari rendah di barat atas laut ---
  var SUN = {
    azimuthDeg: 262,       // barat, sedikit ke selatan
    elevationDeg: 9,       // rendah di atas laut
    color: 0xffb36b,
    intensity: 2.4,
    skyTop: 0x2e4a7a,
    skyMid: 0xe8905a,
    skyLow: 0xffc98a,
    fogColor: 0xf2a56b,
    fogNear: 2500,
    fogFar: 14000
  };

  // --- Kamera ---
  var CAMERAS = ['chase', 'cockpit', 'tower'];

  // --- Kontrol (tombol) ---
  var KEYS = {
    pitchUp: ['KeyW', 'ArrowUp'],
    pitchDown: ['KeyS', 'ArrowDown'],
    rollLeft: ['KeyA', 'ArrowLeft'],
    rollRight: ['KeyD', 'ArrowRight'],
    rudderLeft: ['KeyQ'],
    rudderRight: ['KeyE'],
    throttleUp: ['ShiftLeft', 'ShiftRight'],
    throttleDown: ['ControlLeft', 'ControlRight'],
    airbrake: ['Space'],
    pause: ['KeyP'],
    restart: ['KeyR'],
    cam1: ['Digit1'],
    cam2: ['Digit2'],
    cam3: ['Digit3'],
    mute: ['KeyM']
  };

  window.MR_CONFIG = {
    SEED: SEED,
    WORLD: WORLD,
    RINGS: RINGS,
    PLANE: PLANE,
    SCORE: SCORE,
    SUN: SUN,
    CAMERAS: CAMERAS,
    KEYS: KEYS
  };
})();
