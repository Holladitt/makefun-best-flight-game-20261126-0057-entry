// MERIDIAN RUN — world.js (bagian 1/2)
// Pulau Meridian prosedural: heightmap ber-seed tetap, laut, langit golden-hour,
// Harbor City, Old Lighthouse, runway 09/27, dan 12 ring course.
// Semua geometri dibuat dari primitif three.js + noise sendiri — tanpa aset luar.
(function () {
  'use strict';

  var CFG = window.MR_CONFIG;
  var W = CFG.WORLD;

  // --- RNG + noise ber-seed tetap (mulberry32 + value noise 2D) ---
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var _hashCache = {};
  function hash2(ix, iz, seed) {
    var key = ix + ',' + iz + ',' + seed;
    var v = _hashCache[key];
    if (v === undefined) {
      var h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      v = (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
      _hashCache[key] = v;
    }
    return v;
  }

  // Smoothstep TERJEPIT [0,1] — versi tanpa clamp meledak di luar rentang
  // (t=-2.8 -> 67x) dan sempat membuat spike raksasa di tepi terrain.
  function smooth(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  function valueNoise(x, z, seed) {
    var ix = Math.floor(x), iz = Math.floor(z);
    var fx = x - ix, fz = z - iz;
    var a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
    var c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
    var u = smooth(fx), v = smooth(fz);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  function fbm(x, z, seed) {
    var sum = 0, amp = 1, freq = 1, norm = 0;
    for (var o = 0; o < 4; o++) {
      sum += valueNoise(x * freq, z * freq, seed + o * 101) * amp;
      norm += amp; amp *= 0.5; freq *= 2.1;
    }
    return sum / norm;
  }

  // --- Tinggi terrain (meter). Deterministik, seed tetap. ---
  function terrainHeight(x, z) {
    var r = Math.sqrt(x * x + z * z);
    // Bentuk pulau: dataran tinggi di tengah, jatuh ke laut di tepi.
    var coast = smooth((W.islandRadius - r) / 900); // 1 di dalam, 0 di luar
    if (coast <= 0) return -25; // dasar laut dangkal
    var n = fbm(x / 1400 + 7.3, z / 1400 + 2.9, CFG.SEED);
    var base = 60 + n * 320;
    // Gunung Meridian (puncak 2400 m).
    var dx = x - W.peakPos.x, dz = z - W.peakPos.z;
    var dPeak = Math.sqrt(dx * dx + dz * dz);
    var peak = W.peakHeight * Math.exp(-(dPeak * dPeak) / (2 * 950 * 950));
    // North Ridge: punggungan memanjang utara.
    var dxr = x - W.ridgePos.x, dzr = z - W.ridgePos.z;
    var dRidge = Math.sqrt(dxr * dxr + dzr * dzr);
    var ridge = 900 * Math.exp(-(dRidge * dRidge) / (2 * 700 * 700));
    // Bukit barat (tebing Coral Bay).
    var dxb = x - (-2200), dzb = z - 2400;
    var dBay = Math.sqrt(dxb * dxb + dzb * dzb);
    var bluff = 260 * Math.exp(-(dBay * dBay) / (2 * 800 * 800));
    var h = (base + peak + ridge + bluff) * coast;
    // Ratakan area kota + runway supaya bisa mendarat.
    var dc = Math.sqrt((x - W.cityPos.x) * (x - W.cityPos.x) + (z - W.cityPos.z) * (z - W.cityPos.z));
    var cityFlat = smooth((W.cityRadius - dc) / 200);
    h = h * (1 - cityFlat) + 26 * cityFlat;
    var dr = Math.sqrt(x * x + z * z);
    var rwyFlat = smooth((900 - dr) / 300);
    h = h * (1 - rwyFlat) + W.runway.elevation * rwyFlat;
    // Koridor pendekatan runway 09: ratakan strip di sepanjang sumbu X
    // (z≈0, x -3000..600) supaya final approach tidak menabrak bukit barat.
    var corridorZ = smooth((350 - Math.abs(z)) / 150);
    var corridorX = smooth((x + 3000) / 500) * (1 - smooth((x - 500) / 300));
    var corridor = corridorZ * corridorX;
    h = h * (1 - corridor) + W.runway.elevation * corridor;
    return h;
  }

  function terrainColor(h, x, z, rng) {
    // Warna menurut elevasi: pasir, rumput, hutan, batu, salju.
    if (h < 6) return [0.86, 0.78, 0.55];          // pasir pantai
    if (h < 90) return [0.42, 0.58, 0.30];        // padang rumput
    if (h < 420) return [0.23, 0.42, 0.22];       // hutan
    if (h < 1200) return [0.45, 0.38, 0.30];      // batu
    if (h < 1900) return [0.55, 0.50, 0.46];      // batu terang
    return [0.93, 0.92, 0.90];                    // salju puncak
  }

  // Tekstur kanvas: jendela kota menyala (emas saat senja).
  function makeWindowTexture() {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#3a3f4a'; g.fillRect(0, 0, 128, 256);
    var rng = mulberry32(77);
    for (var y = 8; y < 248; y += 16) {
      for (var x = 8; x < 120; x += 14) {
        if (rng() < 0.55) {
          g.fillStyle = rng() < 0.7 ? '#ffd27a' : '#9fd8ff';
          g.fillRect(x, y, 9, 11);
        } else {
          g.fillStyle = '#22242c'; g.fillRect(x, y, 9, 11);
        }
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Tekstur awan lembut.
  function makeCloudTexture() {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    var g = c.getContext('2d');
    var rng = mulberry32(31);
    for (var i = 0; i < 26; i++) {
      var x = 30 + rng() * 196, y = 45 + rng() * 45, r = 18 + rng() * 34;
      var grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,235,215,0.55)');
      grad.addColorStop(1, 'rgba(255,235,215,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // --- Bangun dunia, kembalikan handle untuk update (ring, lampu, awan). ---
  // Param debug (?noclouds=1 / ?nosky=1) hanya untuk diagnosis visual saat dev.
  function buildWorld(scene) {
    var rng = mulberry32(CFG.SEED);
    var S = CFG.SUN;
    var dbgNoClouds = /[?&]noclouds=1/.test(window.location.search);
    var dbgNoSky = /[?&]nosky=1/.test(window.location.search);

    // Langit: kubah gradasi senja (shader sederhana, tanpa aset).
    var skyGeo = new THREE.SphereGeometry(16000, 24, 12);
    var skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(S.skyTop) },
        mid: { value: new THREE.Color(S.skyMid) },
        low: { value: new THREE.Color(S.skyLow) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;' +
        'void main(){ float h = normalize(vP).y;' +
        ' vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h));' +
        ' gl_FragColor = vec4(c, 1.0); }'
    });
    var sky = new THREE.Mesh(skyGeo, skyMat);
    if (!dbgNoSky) scene.add(sky);

    // Matahari rendah: cakram + halo.
    var sunDir = new THREE.Vector3(
      Math.cos(S.elevationDeg * Math.PI / 180) * Math.cos(S.azimuthDeg * Math.PI / 180),
      Math.sin(S.elevationDeg * Math.PI / 180),
      Math.cos(S.elevationDeg * Math.PI / 180) * Math.sin(S.azimuthDeg * Math.PI / 180)
    );
    var sunLight = new THREE.DirectionalLight(S.color, S.intensity);
    sunLight.position.copy(sunDir).multiplyScalar(8000);
    scene.add(sunLight);
    // Fill dari timur supaya lereng yang membelakangi matahari tetap terbaca.
    var fillLight = new THREE.DirectionalLight(0xffd9a0, 0.65);
    fillLight.position.set(8000, 2600, 1500);
    scene.add(fillLight);
    scene.add(new THREE.AmbientLight(0x8a6a8a, 0.85));
    var hemi = new THREE.HemisphereLight(0xffc890, 0x2a3a55, 0.85);
    scene.add(hemi);

    var sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(420, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false, transparent: true, opacity: 0.95 })
    );
    sunDisc.position.copy(sunDir).multiplyScalar(14500);
    sunDisc.lookAt(0, 0, 0);
    if (!dbgNoSky) scene.add(sunDisc);

    scene.fog = new THREE.Fog(S.fogColor, S.fogNear, S.fogFar);

    // Laut: bidang besar berkilau (specular matahari).
    var sea = new THREE.Mesh(
      new THREE.PlaneGeometry(34000, 34000, 1, 1),
      new THREE.MeshPhongMaterial({ color: 0x2a6a9e, emissive: 0x0a2233, shininess: 120, specular: 0xffc27a })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0;
    scene.add(sea);

    // Terrain: grid 192x192 di atas 9500x9500 m, warna per-vertex.
    var SEG = 192, SIZE = 9500;
    var tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    tGeo.rotateX(-Math.PI / 2);
    var pos = tGeo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var h = terrainHeight(x, z);
      pos.setY(i, h);
      var col = terrainColor(h, x, z, rng);
      var jitter = 0.94 + rng() * 0.12;
      colors[i * 3] = col[0] * jitter;
      colors[i * 3 + 1] = col[1] * jitter;
      colors[i * 3 + 2] = col[2] * jitter;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tGeo.computeVertexNormals();
    var terrain = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(terrain);

    // Hutan: pohon kerucut instanced di zona hutan.
    var treeGeo = new THREE.ConeGeometry(9, 26, 5);
    var treeMat = new THREE.MeshLambertMaterial({ color: 0x1e4d24 });
    var treeCount = 700;
    var trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
    var dummy = new THREE.Object3D();
    var placed = 0, guard = 0;
    while (placed < treeCount && guard < 20000) {
      guard++;
      var tx = (rng() * 2 - 1) * 3800, tz = (rng() * 2 - 1) * 3800;
      var th = terrainHeight(tx, tz);
      if (th < 90 || th > 420) continue;
      var dc2 = Math.hypot(tx - W.cityPos.x, tz - W.cityPos.z);
      if (dc2 < W.cityRadius + 60) continue;
      if (Math.hypot(tx, tz) < 950) continue;
      var s = 0.7 + rng() * 0.9;
      dummy.position.set(tx, th + 12 * s, tz);
      dummy.scale.set(s, s, s);
      dummy.rotation.y = rng() * Math.PI * 2;
      dummy.updateMatrix();
      trees.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    trees.count = placed;
    scene.add(trees);

    // Harbor City: gedung kotak dengan jendela menyala.
    var winTex = makeWindowTexture();
    var cityGroup = new THREE.Group();
    var bGeo = new THREE.BoxGeometry(1, 1, 1);
    var bMat = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffc978, emissiveMap: winTex, emissiveIntensity: 0.9 });
    for (var b = 0; b < 130; b++) {
      var ang = rng() * Math.PI * 2;
      var rad = Math.sqrt(rng()) * W.cityRadius * 0.92;
      var bx = W.cityPos.x + Math.cos(ang) * rad;
      var bz = W.cityPos.z + Math.sin(ang) * rad;
      var bw = 22 + rng() * 30, bd = 22 + rng() * 30, bh = 40 + rng() * rng() * 190;
      var mesh = new THREE.Mesh(bGeo, bMat);
      mesh.scale.set(bw, bh, bd);
      mesh.position.set(bx, 26 + bh / 2, bz);
      mesh.rotation.y = rng() * Math.PI;
      cityGroup.add(mesh);
    }
    scene.add(cityGroup);

    // Old Lighthouse: menara putih-merah + sorot berputar.
    var lhGroup = new THREE.Group();
    var towerMat = new THREE.MeshLambertMaterial({ color: 0xf2ede2 });
    var stripeMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    var tower = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 70, 12), towerMat);
    tower.position.y = 35;
    lhGroup.add(tower);
    for (var s = 0; s < 3; s++) {
      var stripe = new THREE.Mesh(new THREE.CylinderGeometry(7.6 - s * 0.4, 8.2 - s * 0.4, 8, 12), stripeMat);
      stripe.position.y = 16 + s * 20;
      lhGroup.add(stripe);
    }
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    lamp.position.y = 73;
    lhGroup.add(lamp);
    var beamGeo = new THREE.ConeGeometry(14, 260, 12, 1, true);
    var beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    var beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(130, 73, 0);
    var beamPivot = new THREE.Group();
    beamPivot.position.y = 73;
    beamPivot.add(beam);
    lhGroup.add(beamPivot);
    var lhGround = terrainHeight(W.lighthousePos.x, W.lighthousePos.z);
    lhGroup.position.set(W.lighthousePos.x, lhGround, W.lighthousePos.z);
    scene.add(lhGroup);

    // Runway 09/27: aspal + garis tengah + lampu approach + threshold.
    var rwyGroup = new THREE.Group();
    var rwy = W.runway;
    var strip = new THREE.Mesh(
      new THREE.BoxGeometry(rwy.length, 2, rwy.width),
      new THREE.MeshLambertMaterial({ color: 0x2b2e33 })
    );
    strip.position.set(rwy.center.x, rwy.elevation - 1, rwy.center.z);
    rwyGroup.add(strip);
    var lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
    for (var li = -5; li <= 5; li++) {
      var dash = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 2.5), lineMat);
      dash.position.set(li * 100, rwy.elevation + 0.2, 0);
      rwyGroup.add(dash);
    }
    // Nomor runway "09" dari kotak putih sederhana (dua strip).
    var numMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
    [[-560, -12], [-560, 12]].forEach(function (p) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 6), numMat);
      bar.position.set(p[0], rwy.elevation + 0.2, p[1]);
      rwyGroup.add(bar);
    });
    // Lampu tepi + approach (emas), threshold (hijau).
    var edgeGeo = new THREE.SphereGeometry(1.6, 8, 6);
    var edgeMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    var thrMat = new THREE.MeshBasicMaterial({ color: 0x2eff7a });
    for (var e = -6; e <= 6; e++) {
      [-1, 1].forEach(function (side) {
        var lampM = new THREE.Mesh(edgeGeo, edgeMat);
        lampM.position.set(e * 100, rwy.elevation + 1, side * (rwy.width / 2 + 3));
        rwyGroup.add(lampM);
      });
    }
    for (var a = 1; a <= 6; a++) {
      [-1, 1].forEach(function (side) {
        var ap = new THREE.Mesh(edgeGeo, edgeMat);
        ap.position.set(-rwy.length / 2 - a * 60, rwy.elevation + 1, side * 8);
        rwyGroup.add(ap);
      });
    }
    [-1, 1].forEach(function (side) {
      var th = new THREE.Mesh(edgeGeo, thrMat);
      th.position.set(-rwy.length / 2, rwy.elevation + 1, side * 14);
      rwyGroup.add(th);
    });
    scene.add(rwyGroup);

    // 12 ring course: torus bercahaya, ring berikut berdenyut.
    var ringGroup = new THREE.Group();
    var ringMeshes = [];
    CFG.RINGS.forEach(function (ring, idx) {
      var mat = new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.9 });
      var torus = new THREE.Mesh(new THREE.TorusGeometry(ring.r, 2.2, 10, 40), mat);
      torus.position.set(ring.x, ring.y, ring.z);
      // Hadapkan torus ke arah ring berikutnya (atau runway untuk ring terakhir).
      var next = CFG.RINGS[(idx + 1) % CFG.RINGS.length];
      torus.lookAt(next.x, next.y, next.z);
      ringGroup.add(torus);
      ringMeshes.push({ mesh: torus, mat: mat, def: ring, passed: false });
      // Tiang penanda kecil di bawah ring (membantu melihat dari jauh).
      var pole = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 60, 6),
        new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.35 })
      );
      var groundY = terrainHeight(ring.x, ring.z);
      pole.position.set(ring.x, groundY + 30, ring.z);
      ringGroup.add(pole);
    });
    scene.add(ringGroup);

    // Awan: sprite lembut melayang di 700–1400 m.
    var cloudTex = makeCloudTexture();
    var clouds = [];
    if (!dbgNoClouds) {
    for (var ci = 0; ci < 42; ci++) {
      var smat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.55 + rng() * 0.3, depthWrite: false });
      var spr = new THREE.Sprite(smat);
      var ca = rng() * Math.PI * 2, cr = 800 + rng() * 5200;
      spr.position.set(Math.cos(ca) * cr, 750 + rng() * 650, Math.sin(ca) * cr);
      var cs = 500 + rng() * 700;
      spr.scale.set(cs, cs * 0.42, 1);
      scene.add(spr);
      clouds.push(spr);
    }
    }

    return {
      sunLight: sunLight,
      sunDisc: sunDisc,
      ringMeshes: ringMeshes,
      beamPivot: beamPivot,
      clouds: clouds,
      terrainHeight: terrainHeight
    };
  }

  window.MR_WORLD = {
    buildWorld: buildWorld,
    terrainHeight: terrainHeight,
    mulberry32: mulberry32
  };
})();
