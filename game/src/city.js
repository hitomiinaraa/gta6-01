// EMBER TIDE — city.js
// Deterministic procedural Cinder Cove: road grid, districts, skyscraper
// downtown, marina, beach boulevard, harbor, park, stadium, ferris wheel,
// tower, bridge over the marina channel. Instanced meshes for buildings,
// palms, lamps and markings; one directional shadow light follows the player.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};
  var E = window.EMBER;
  var THREE = window.THREE;

  function makeCanvasTexture(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    return t;
  }

  function CityBuilder(scene, seed) {
    this.scene = scene;
    this.rng = E.makeRng(seed);
    this.colliders = [];   // {x0,z0,x1,z1}
    this.grid = new E.SpatialGrid(16);
    this.roadLines = [];
    var CFG = E.CFG, n = CFG.gridN;
    for (var i = 0; i < n; i++) this.roadLines.push((i - (n - 1) / 2) * CFG.pitch);
    this.intersections = [];
    for (var ix = 0; ix < n; ix++) for (var iz = 0; iz < n; iz++)
      this.intersections.push({ x: this.roadLines[ix], z: this.roadLines[iz], ix: ix, iz: iz });
    this.trafficLights = [];
    this.ferrisWheel = null;
    this.waterMat = null;
    this.beacon = null;
    this.buildingMesh = null;
  }

  CityBuilder.prototype.roadAt = function (v) {
    // nearest road line coordinate
    var best = this.roadLines[0], bd = 1e9;
    for (var i = 0; i < this.roadLines.length; i++) {
      var d = Math.abs(v - this.roadLines[i]);
      if (d < bd) { bd = d; best = this.roadLines[i]; }
    }
    return best;
  };
  CityBuilder.prototype.isOnRoad = function (x, z) {
    var r = E.CFG.roadHalf;
    return Math.abs(x - this.roadAt(x)) <= r || Math.abs(z - this.roadAt(z)) <= r;
  };
  CityBuilder.prototype.inWater = function (x, z) {
    // South sea + west harbor basin, except the bridge deck.
    if (z > 318 && !(x > 55 && x < 145 && z < 325)) return true;
    if (x < -330 && z > 120) return true;
    if (x > 55 && x < 145 && z > 300 && z <= 318) return false; // channel mouth is bridge
    return false;
  };
  CityBuilder.prototype.groundHeight = function (x, z) {
    // Bridge deck over the marina channel (boulevard z ~300, x 55..145).
    if (x > 55 && x < 145) {
      if (z > 296 && z < 322) return 0.8;
      if (z >= 288 && z <= 296) return 0.8 * (z - 288) / 8;
      if (z >= 322 && z <= 330) return 0.8 * (330 - z) / 8;
    }
    return 0;
  };
  CityBuilder.prototype.districtAt = function (x, z) {
    var best = 'Downtown', bd = 1e9, k;
    for (k in E.DISTRICTS) {
      var d = E.DISTRICTS[k], dx = x - d.center[0], dz = z - d.center[1];
      var dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = d.name; }
    }
    return best;
  };
  CityBuilder.prototype.addCollider = function (x0, z0, x1, z1) {
    var b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
    this.colliders.push(b);
    this.grid.insert((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 1, b);
    return b;
  };
  CityBuilder.prototype.collides = function (x, z, r) {
    if (this.inWater(x, z)) return true;
    if (Math.abs(x) > E.CFG.worldHalf + 30 || Math.abs(z) > E.CFG.worldHalf + 40) return true;
    var near = this.grid.query(x, z, r + 4);
    for (var i = 0; i < near.length; i++) {
      if (E.circleVsAABB(x, z, r, near[i])) return true;
    }
    return false;
  };
  CityBuilder.prototype.resolveCircle = function (pos, r) {
    // Push a circle (pos.x, pos.z) out of all nearby colliders. Returns hits.
    var hits = 0;
    var near = this.grid.query(pos.x, pos.z, r + 4);
    for (var i = 0; i < near.length; i++) {
      var res = E.circleVsAABB(pos.x, pos.z, r, near[i]);
      if (res) { pos.x += res.nx * res.depth; pos.z += res.nz * res.depth; hits++; }
    }
    if (this.inWater(pos.x, pos.z)) {
      // push back toward land (north) or toward bridge deck
      if (pos.z > 318) pos.z = 318;
      if (pos.x < -330) pos.x = -330;
    }
    pos.x = E.clamp(pos.x, -E.CFG.worldHalf - 20, E.CFG.worldHalf + 20);
    pos.z = E.clamp(pos.z, -E.CFG.worldHalf - 20, E.CFG.worldHalf + 30);
    return hits;
  };
  CityBuilder.prototype.nearestRoadPoint = function (x, z) {
    var rx = this.roadAt(x), rz = this.roadAt(z);
    if (Math.abs(x - rx) < Math.abs(z - rz)) return { x: rx, z: z };
    return { x: x, z: rz };
  };

  CityBuilder.prototype.build = function () {
    var scene = this.scene, rng = this.rng, CFG = E.CFG;
    // Sky: big gradient dome (shader-free: vertex-colored sphere, BackSide).
    var skyGeo = new THREE.SphereGeometry(900, 24, 12);
    var skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
    var colors = [];
    var top = new THREE.Color(0x2a1a4a), mid = new THREE.Color(0xff7a3c), low = new THREE.Color(0xffc46a);
    var pos = skyGeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 900;
      var c = y > 0.25 ? top.clone().lerp(mid, 1 - (y - 0.25) / 0.75) : mid.clone().lerp(low, 1 - (y + 0.2) / 0.45);
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    skyMat.vertexColors = true;
    var sky = new THREE.Mesh(skyGeo, skyMat);
    sky.name = 'skyDome';
    scene.add(sky);
    this.skyMat = skyMat;
    // Sun disc + moon. Sun sits low over the sea to the south-west so a
    // west/south chase frames it.
    var sun = new THREE.Mesh(new THREE.CircleGeometry(55, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff0b8, fog: false }));
    sun.position.set(-350, 210, 420); sun.lookAt(0, 40, 0); scene.add(sun);
    this.sunMesh = sun;
    var moon = new THREE.Mesh(new THREE.CircleGeometry(14, 20),
      new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
    moon.position.set(520, 260, -480); moon.lookAt(0, 40, 0); scene.add(moon);
    this.moonMesh = moon;

    // Ground base (concrete) + beach sand strip.
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 760),
      new THREE.MeshStandardMaterial({ color: 0x5a5a52, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0);
    ground.receiveShadow = true; scene.add(ground);
    var sand = new THREE.Mesh(new THREE.PlaneGeometry(760, 26),
      new THREE.MeshStandardMaterial({ color: 0xd8b078, roughness: 1 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, 322); scene.add(sand);
    // Sea.
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x1a4a6a, roughness: 0.25, metalness: 0.4, transparent: true, opacity: 0.92 });
    var sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 160), this.waterMat);
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.3, 415); scene.add(sea);
    var harbor = new THREE.Mesh(new THREE.PlaneGeometry(120, 260), this.waterMat);
    harbor.rotation.x = -Math.PI / 2; harbor.position.set(-390, -0.3, 220); scene.add(harbor);

    // Roads: dark asphalt strips along every grid line + sidewalks.
    var roadMat = new THREE.MeshStandardMaterial({ color: 0x3d3d44, roughness: 0.85 });
    var walkMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 1 });
    var span = 660;
    for (var li = 0; li < this.roadLines.length; li++) {
      var v = this.roadLines[li];
      var rx = new THREE.Mesh(new THREE.PlaneGeometry(span, CFG.roadHalf * 2), roadMat);
      rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, v); rx.receiveShadow = true; scene.add(rx);
      var rz = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roadHalf * 2, span), roadMat);
      rz.rotation.x = -Math.PI / 2; rz.position.set(v, 0.02, 0); rz.receiveShadow = true; scene.add(rz);
      var wx = new THREE.Mesh(new THREE.PlaneGeometry(span, 5), walkMat);
      wx.rotation.x = -Math.PI / 2; wx.position.set(0, 0.05, v + CFG.roadHalf + 2.5); scene.add(wx);
      var wx2 = wx.clone(); wx2.position.z = v - CFG.roadHalf - 2.5; scene.add(wx2);
    }
    // Lane dashes (instanced small planes).
    var dashGeo = new THREE.PlaneGeometry(3.2, 0.35);
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
    var dashes = [];
    for (var d = 0; d < this.roadLines.length; d++) {
      var lv = this.roadLines[d];
      for (var s = -300; s <= 300; s += 12) {
        dashes.push({ x: s, z: lv, ry: 0 });
        dashes.push({ x: lv, z: s, ry: Math.PI / 2 });
      }
    }
    var dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (var di = 0; di < dashes.length; di++) {
      e.set(-Math.PI / 2, 0, dashes[di].ry); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(dashes[di].x, 0.06, dashes[di].z), q, new THREE.Vector3(1, 1, 1));
      dashMesh.setMatrixAt(di, m4);
    }
    scene.add(dashMesh);
    // Crosswalks at downtown intersections.
    var crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
    var crossGeo = new THREE.PlaneGeometry(1.4, 9);
    var crossList = [];
    for (var ci = 0; ci < this.intersections.length; ci++) {
      var it = this.intersections[ci];
      if (Math.abs(it.x) > 150 || Math.abs(it.z) > 150) continue;
      for (var stripe = -4; stripe <= 4; stripe += 2) crossList.push({ x: it.x + stripe, z: it.z + 9 });
    }
    var crossMesh = new THREE.InstancedMesh(crossGeo, crossMat, crossList.length);
    for (var ci2 = 0; ci2 < crossList.length; ci2++) {
      e.set(-Math.PI / 2, 0, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(crossList[ci2].x, 0.07, crossList[ci2].z), q, new THREE.Vector3(1, 1, 1));
      crossMesh.setMatrixAt(ci2, m4);
    }
    scene.add(crossMesh);

    this.buildBuildings();
    this.buildProps();
    this.buildLandmarks();
    this.buildTrafficLights();
    this.buildBridge();
  };

  CityBuilder.prototype.buildBuildings = function () {
    var scene = this.scene, rng = this.rng, CFG = E.CFG;
    // Window texture: lit golden windows on a dark facade.
    var winTex = makeCanvasTexture(128, 256, function (ctx, w, h) {
      ctx.fillStyle = '#3a3540'; ctx.fillRect(0, 0, w, h);
      for (var y = 8; y < h - 8; y += 18) for (var x = 8; x < w - 8; x += 16) {
        var lit = rng.chance(0.55);
        ctx.fillStyle = lit ? (rng.chance(0.7) ? '#ffd98a' : '#9ad0ff') : '#1c1a22';
        ctx.fillRect(x, y, 9, 11);
      }
    });
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    var mat = new THREE.MeshStandardMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55, roughness: 0.9 });
    var placements = [];
    var palette = [0x9a6a5a, 0x6a7a9a, 0x8a5a6a, 0x5a6a5a, 0x7a6a8a, 0xb08a5a, 0x4a5a6a, 0xa08a7a];
    for (var bx = 0; bx < CFG.gridN - 1; bx++) for (var bz = 0; bz < CFG.gridN - 1; bz++) {
      var cx = (this.roadLines[bx] + this.roadLines[bx + 1]) / 2;
      var cz = (this.roadLines[bz] + this.roadLines[bz + 1]) / 2;
      // Skip park, stadium, beach front, harbor water, marina channel.
      if (cx > -120 && cx < 0 && cz > -270 && cz < -150) continue; // park
      if (cx > 180 && cz > -180 && cz < -60) continue; // stadium lot
      if (cz > 270) continue; // beach
      if (cx < -270) continue; // harbor
      var distC = Math.sqrt(cx * cx + cz * cz);
      var tall = distC < 150;
      var count = tall ? 1 : (rng.chance(0.5) ? 2 : 1);
      for (var k = 0; k < count; k++) {
        var w = rng.range(16, 30), d = rng.range(16, 30);
        var h = tall ? rng.range(35, 105) : rng.range(8, 26);
        var ox = count === 1 ? 0 : (k === 0 ? -11 : 11);
        var oz = count === 1 ? 0 : (k === 0 ? -11 : 11);
        var px = cx + ox, pz = cz + oz;
        placements.push({ x: px, z: pz, w: w, d: d, h: h, color: rng.pick(palette) });
        this.addCollider(px - w / 2, pz - d / 2, px + w / 2, pz + d / 2);
      }
    }
    var mesh = new THREE.InstancedMesh(boxGeo, mat, placements.length);
    var m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      m4.makeScale(p.w, p.h, p.d);
      m4.setPosition(p.x, 0, p.z);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.setHex(p.color));
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    this.buildingMesh = mesh;
    // Rooftop AC boxes (a few, instanced).
    var acGeo = new THREE.BoxGeometry(2.5, 1.2, 2.5);
    var acMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 1 });
    var acCount = Math.min(120, placements.length);
    var acMesh = new THREE.InstancedMesh(acGeo, acMat, acCount);
    for (var ai = 0; ai < acCount; ai++) {
      var pp = placements[ai];
      m4.makeTranslation(pp.x + rng.range(-6, 6), pp.h, pp.z + rng.range(-6, 6));
      acMesh.setMatrixAt(ai, m4);
    }
    scene.add(acMesh);
  };

  CityBuilder.prototype.buildProps = function () {
    var scene = this.scene, rng = this.rng;
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    // Palm trees along the beach boulevard and park.
    var trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
    trunkGeo.translate(0, 3.5, 0);
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
    var leafGeo = new THREE.ConeGeometry(3.2, 1.6, 6);
    leafGeo.translate(0, 7.4, 0);
    var leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 1 });
    var palmSpots = [];
    for (var x = -300; x <= 300; x += 24) { palmSpots.push({ x: x, z: 288 }); palmSpots.push({ x: x, z: 312 }); }
    for (var p = 0; p < 14; p++) palmSpots.push({ x: rng.range(-110, -10), z: rng.range(-260, -160) });
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    var leaves = new THREE.InstancedMesh(leafGeo, leafMat, palmSpots.length);
    for (var pi = 0; pi < palmSpots.length; pi++) {
      var ps = palmSpots[pi];
      e.set(0, rng.range(0, 6), 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(ps.x, 0, ps.z), q, new THREE.Vector3(1, 1, 1));
      trunks.setMatrixAt(pi, m4); leaves.setMatrixAt(pi, m4);
      this.addCollider(ps.x - 0.5, ps.z - 0.5, ps.x + 0.5, ps.z + 0.5);
    }
    trunks.castShadow = true; scene.add(trunks); scene.add(leaves);
    // Street lamps along roads.
    var poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
    poleGeo.translate(0, 3.25, 0);
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 });
    var bulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
    var bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb84a, emissiveIntensity: 2.2 });
    var lampSpots = [];
    for (var li = 0; li < this.roadLines.length; li++) {
      var lv = this.roadLines[li];
      for (var s = -270; s <= 270; s += 60) {
        lampSpots.push({ x: lv + 8.5, z: s });
        lampSpots.push({ x: s, z: lv + 8.5 });
      }
    }
    var poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
    var bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
    for (var li2 = 0; li2 < lampSpots.length; li2++) {
      var ls = lampSpots[li2];
      e.set(0, 0, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(ls.x, 0, ls.z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(li2, m4);
      m4.compose(new THREE.Vector3(ls.x, 6.4, ls.z), q, new THREE.Vector3(1, 1, 1));
      bulbs.setMatrixAt(li2, m4);
    }
    scene.add(poles); scene.add(bulbs);
    // Park trees (round canopies).
    var treeGeo = new THREE.ConeGeometry(3, 7, 7);
    treeGeo.translate(0, 5.5, 0);
    var treeMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 });
    var treeSpots = [];
    for (var t = 0; t < 26; t++) treeSpots.push({ x: rng.range(-115, -5), z: rng.range(-265, -155) });
    var trees = new THREE.InstancedMesh(treeGeo, treeMat, treeSpots.length);
    for (var ti = 0; ti < treeSpots.length; ti++) {
      var ts = treeSpots[ti];
      e.set(0, rng.range(0, 6), 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(ts.x, 0, ts.z), q, new THREE.Vector3(1, 1, 1));
      trees.setMatrixAt(ti, m4);
      this.addCollider(ts.x - 0.6, ts.z - 0.6, ts.x + 0.6, ts.z + 0.6);
    }
    trees.castShadow = true; scene.add(trees);
    // Harbor containers.
    var contGeo = new THREE.BoxGeometry(6, 2.6, 2.6);
    contGeo.translate(0, 1.3, 0);
    var contMat = new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 0.9 });
    var contSpots = [];
    for (var c = 0; c < 24; c++) contSpots.push({ x: rng.range(-320, -280), z: rng.range(-160, 60) });
    var conts = new THREE.InstancedMesh(contGeo, contMat, contSpots.length);
    var col = new THREE.Color();
    var contColors = [0x8a4a3a, 0x3a6a8a, 0x6a8a3a, 0xd8a03a];
    for (var c2 = 0; c2 < contSpots.length; c2++) {
      var cs = contSpots[c2];
      e.set(0, rng.chance(0.5) ? 0 : Math.PI / 2, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(cs.x, 0, cs.z), q, new THREE.Vector3(1, 1, 1));
      conts.setMatrixAt(c2, m4);
      conts.setColorAt(c2, col.setHex(contColors[c2 % 4]));
      this.addCollider(cs.x - 3.2, cs.z - 3.2, cs.x + 3.2, cs.z + 3.2);
    }
    conts.castShadow = true; scene.add(conts);
    // Park benches + fountain (visual).
    var benchGeo = new THREE.BoxGeometry(2.2, 0.5, 0.8);
    var benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
    for (var b = 0; b < 8; b++) {
      var bench = new THREE.Mesh(benchGeo, benchMat);
      bench.position.set(rng.range(-110, -10), 0.4, rng.range(-260, -160));
      scene.add(bench);
    }
    var fountain = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 1, 16),
      new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.8 }));
    fountain.position.set(-60, 0.5, -210); scene.add(fountain);
    var fwater = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.3, 16), this.waterMat);
    fwater.position.set(-60, 1.05, -210); scene.add(fwater);
  };

  CityBuilder.prototype.buildLandmarks = function () {
    var scene = this.scene, rng = this.rng;
    // Cinder Tower: downtown spire with beacon.
    var tower = new THREE.Group();
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 95, 12),
      new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.6, metalness: 0.3, emissive: 0x1a2a3a, emissiveIntensity: 0.4 }));
    shaft.position.y = 47.5; shaft.castShadow = true; tower.add(shaft);
    var crown = new THREE.Mesh(new THREE.CylinderGeometry(3, 7, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff6a1a, emissiveIntensity: 1.2 }));
    crown.position.y = 100; tower.add(crown);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3a3a }));
    this.beacon.position.y = 108; tower.add(this.beacon);
    var glow = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.25 }));
    glow.position.y = 108; tower.add(glow);
    tower.position.set(30, 0, -30);
    scene.add(tower);
    this.addCollider(18, -42, 42, -18);
    // Stadium: ring + field + floodlights.
    var stadium = new THREE.Group();
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(34, 36, 12, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9, side: THREE.DoubleSide }));
    bowl.position.y = 6; stadium.add(bowl);
    var field = new THREE.Mesh(new THREE.CircleGeometry(30, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 }));
    field.rotation.x = -Math.PI / 2; field.position.y = 0.2; stadium.add(field);
    var roof = new THREE.Mesh(new THREE.TorusGeometry(34, 1.6, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, emissive: 0xffd98a, emissiveIntensity: 0.5 }));
    roof.rotation.x = Math.PI / 2; roof.position.y = 12; stadium.add(roof);
    stadium.position.set(240, 0, -120);
    scene.add(stadium);
    this.addCollider(204, -156, 276, -84);
    // Ferris wheel on the beach.
    var wheel = new THREE.Group();
    var rim = new THREE.Mesh(new THREE.TorusGeometry(22, 0.8, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xff5a8a, emissive: 0xff5a8a, emissiveIntensity: 0.7 }));
    wheel.add(rim);
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
    hub.rotation.x = Math.PI / 2; wheel.add(hub);
    for (var s = 0; s < 8; s++) {
      var spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 44, 6),
        new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }));
      spoke.rotation.z = s * Math.PI / 8; wheel.add(spoke);
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, 3),
        new THREE.MeshStandardMaterial({ color: [0xffd23a, 0x3ad0ff, 0xff5a5a, 0x7aff8a][s % 4], emissive: 0x332200, emissiveIntensity: 0.6 }));
      var a = s * Math.PI / 4;
      cabin.position.set(Math.cos(a) * 22, Math.sin(a) * 22, 0);
      cabin.userData.isCabin = true; cabin.userData.angle = a;
      wheel.add(cabin);
    }
    var legL = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 26, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a4a4a }));
    legL.position.set(-9, -13, 0); legL.rotation.z = 0.35; wheel.add(legL);
    var legR = legL.clone(); legR.position.x = 9; legR.rotation.z = -0.35; wheel.add(legR);
    wheel.position.set(-180, 26, 306);
    wheel.rotation.y = Math.PI / 2; // face the boulevard so the full wheel reads from the road
    scene.add(wheel);
    this.ferrisWheel = wheel;
    this.addCollider(-196, 296, -164, 316);
    // Dusk Diner (mission hub): low building with neon sign.
    var diner = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 14),
      new THREE.MeshStandardMaterial({ color: 0xc86a8a, roughness: 0.8, emissive: 0x40202a, emissiveIntensity: 0.5 }));
    diner.position.set(-150, 3.5, 150); diner.castShadow = true; scene.add(diner);
    this.addCollider(-162, 143, -138, 157);
    var sign = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xff5aa8, emissiveIntensity: 2.4 }));
    sign.position.set(-150, 7.6, 143.2); scene.add(sign);
    // Harbor Bank.
    var bank = new THREE.Mesh(new THREE.BoxGeometry(26, 14, 18),
      new THREE.MeshStandardMaterial({ color: 0x9a9a8a, roughness: 0.7, emissive: 0x1a1a1a, emissiveIntensity: 0.3 }));
    bank.position.set(-240, 7, -60); bank.castShadow = true; scene.add(bank);
    this.addCollider(-253, -69, -227, -51);
  };

  CityBuilder.prototype.buildTrafficLights = function () {
    var scene = this.scene;
    var poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.5, 6);
    poleGeo.translate(0, 2.75, 0);
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    var lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
    var count = 0;
    for (var i = 0; i < this.intersections.length; i++) {
      var it = this.intersections[i];
      if (Math.abs(it.x) > 180 || Math.abs(it.z) > 180) continue;
      count++;
    }
    var poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
    var m4 = new THREE.Matrix4();
    var idx = 0;
    for (var j = 0; j < this.intersections.length; j++) {
      var it2 = this.intersections[j];
      if (Math.abs(it2.x) > 180 || Math.abs(it2.z) > 180) continue;
      m4.makeTranslation(it2.x + 8.6, 0, it2.z + 8.6);
      poles.setMatrixAt(idx, m4);
      var lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x22ff44, emissiveIntensity: 2 });
      var lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(it2.x + 8.6, 5.6, it2.z + 8.6);
      scene.add(lamp);
      this.trafficLights.push({ x: it2.x, z: it2.z, lamp: lamp, mat: lampMat, phase: (j % 2) });
      idx++;
    }
    scene.add(poles);
  };

  CityBuilder.prototype.buildBridge = function () {
    var scene = this.scene;
    // Causeway deck over the marina channel on the boulevard.
    var deck = new THREE.Mesh(new THREE.BoxGeometry(90, 0.8, 26),
      new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.8 }));
    deck.position.set(100, 0.4, 309); deck.receiveShadow = true; scene.add(deck);
    var railMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });
    for (var s = -1; s <= 1; s += 2) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(90, 1.1, 0.5), railMat);
      rail.position.set(100, 1.3, 309 + s * 12.5); scene.add(rail);
    }
    // Bridge lamps.
    var bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb84a, emissiveIntensity: 2 });
    for (var b = -40; b <= 40; b += 20) {
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), bulbMat);
      bulb.position.set(100 + b, 2.2, 296.5); scene.add(bulb);
    }
  };

  CityBuilder.prototype.setTimeOfDay = function (hour) {
    // Darken the sky dome at night, hide the sun, show the moon.
    var night = hour >= 20.5 || hour < 6;
    if (this.skyMat) {
      var k = night ? 0.22 : (hour >= 17.5 ? 1.0 : 1.15);
      this.skyMat.color.setScalar(k);
    }
    if (this.sunMesh) this.sunMesh.visible = !night;
    if (this.moonMesh) this.moonMesh.visible = night;
  };

  CityBuilder.prototype.update = function (dt, timeSec) {
    if (this.ferrisWheel) {
      this.ferrisWheel.rotation.z += dt * 0.12;
      // keep cabins upright
      for (var i = 0; i < this.ferrisWheel.children.length; i++) {
        var c = this.ferrisWheel.children[i];
        if (c.userData.isCabin) c.rotation.z = -this.ferrisWheel.rotation.z;
      }
    }
    if (this.beacon) {
      var s = 0.6 + 0.4 * Math.sin(timeSec * 3);
      this.beacon.material.color.setHex(s > 0.8 ? 0xff3a3a : 0x881111);
    }
    if (this.waterMat) {
      this.waterMat.color.setHSL(0.58, 0.55, 0.22 + 0.03 * Math.sin(timeSec * 0.5));
    }
    // Traffic light cycle: 6s green, 1.5s amber, 6s red (offset by phase).
    for (var j = 0; j < this.trafficLights.length; j++) {
      var tl = this.trafficLights[j];
      var cycle = (timeSec + tl.phase * 6.75) % 13.5;
      var col = cycle < 6 ? 0x22ff44 : (cycle < 7.5 ? 0xffaa22 : 0xff2222);
      tl.mat.emissive.setHex(col);
    }
  };
  CityBuilder.prototype.lightStateAt = function (x, z, timeSec) {
    // Returns 'green'/'red' for the nearest light, 'green' if none nearby.
    var best = null, bd = 1e9;
    for (var i = 0; i < this.trafficLights.length; i++) {
      var tl = this.trafficLights[i];
      var d = E.dist2(x, z, tl.x, tl.z);
      if (d < bd) { bd = d; best = tl; }
    }
    if (!best || bd > 30 * 30) return 'green';
    var cycle = (timeSec + best.phase * 6.75) % 13.5;
    return cycle < 6 ? 'green' : 'red';
  };

  E.CityBuilder = CityBuilder;
})();
