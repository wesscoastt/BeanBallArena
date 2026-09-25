/* BEAN BALL ARENA - client/js/arena.js
 * Visuals for "Bean Bowl Stadium": court, ramps/platforms, team spawn decks,
 * hoop towers, bounce/launch pads, bumpers, stands + crowd, jumbotrons,
 * palm trees and skyline. Collision lives in shared/arenaDef.js.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;
  var A = BBA.Arena;

  function canvas(w, h) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function lam(color, o) {
    var p = { color: color };
    if (o) for (var k in o) p[k] = o[k];
    return new THREE.MeshLambertMaterial(p);
  }
  function std(color, o) {
    var p = { color: color, roughness: 0.6 };
    if (o) for (var k in o) p[k] = o[k];
    return new THREE.MeshStandardMaterial(p);
  }
  function box(w, h, d, m, x, y, z) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); return b;
  }

  function ArenaView(scene, opts) {
    opts = opts || {};
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.teamCss = opts.teamCss || ['#2f7bff', '#ff3b4e'];
    this.team = [new THREE.Color(this.teamCss[0]), new THREE.Color(this.teamCss[1])];
    this.mobile = !!opts.mobile;
    this.t = 0;
    this.padFx = [];
    this.hoopFx = [0, 0];
    this.ot = false;
    this.neon = [];
    this._build();
  }

  ArenaView.prototype._build = function () {
    var g = this.group;
    this._sky();
    this._lights();
    this._floor();
    this._platforms();
    this._decks();
    this._walls();
    this._hoops();
    this._pads();
    this._bumpers();
    this._stands();
    this._scenery();
    this.mergedCount = BBA.MeshUtil.mergeMeshes(this.group);
  };

  /* ---------------- sky & lights ---------------- */
  ArenaView.prototype._sky = function () {
    var geo = new THREE.SphereGeometry(400, 24, 12);
    var cols = [], pos = geo.attributes.position, i;
    var top = new THREE.Color('#2f6fe0'), mid = new THREE.Color('#8fd0ff'), low = new THREE.Color('#ffd9a8');
    for (i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 400, c = new THREE.Color();
      if (y > 0.15) c.copy(mid).lerp(top, Math.min(1, (y - 0.15) / 0.6));
      else c.copy(low).lerp(mid, Math.max(0, (y + 0.05) / 0.2));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    var sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.group.add(sky);
    this.scene.fog = new THREE.Fog('#a9dcff', 120, 330);
    // puffy clouds
    var cm = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#aab8d0', emissiveIntensity: 0.4 });
    for (i = 0; i < 14; i++) {
      var cl = new THREE.Group(), a = i / 14 * Math.PI * 2 + 0.3, r = 190 + (i % 3) * 40;
      for (var j = 0; j < 4; j++) {
        var s = new THREE.Mesh(new THREE.SphereGeometry(9 + (j % 2) * 5, 8, 6), cm);
        s.position.set(j * 10 - 15, (j % 2) * 4, (j % 3) * 3); cl.add(s);
      }
      cl.position.set(Math.cos(a) * r, 70 + (i % 4) * 14, Math.sin(a) * r);
      cl.scale.y = 0.6;
      this.group.add(cl);
    }
  };

  ArenaView.prototype._lights = function () {
    var hemi = new THREE.HemisphereLight('#dff1ff', '#8a6aa0', 0.6);
    this.group.add(hemi);
    var sun = new THREE.DirectionalLight('#fff4e0', 0.75);
    sun.position.set(28, 55, 18);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    var sz = this.mobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    var sc = sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 42; sc.bottom = -42; sc.near = 10; sc.far = 130;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.group.add(sun); this.group.add(sun.target);
    this.sun = sun;
    var fill = new THREE.DirectionalLight('#c8b8ff', 0.15);
    fill.position.set(-20, 20, -30);
    this.group.add(fill);
  };

  /* ---------------- court floor ---------------- */
  ArenaView.prototype._floorTexture = function () {
    var W = 1024, H = 2048, cv = canvas(W, H), c = cv.getContext('2d');
    var sx = W / 40, sz = H / 68;
    c.setTransform(sx, 0, 0, sz, W / 2, H / 2);
    // base
    var grd = c.createLinearGradient(0, -34, 0, 34);
    grd.addColorStop(0, '#5572ff'); grd.addColorStop(0.2, '#8a86ff'); grd.addColorStop(0.36, '#f28d3c');
    grd.addColorStop(0.5, '#ffa04a'); grd.addColorStop(0.64, '#f28d3c'); grd.addColorStop(0.8, '#ff7f8f'); grd.addColorStop(1, '#ff5470');
    c.fillStyle = grd; c.fillRect(-20, -34, 40, 68);
    // tiles
    var x, z;
    for (x = -20; x < 20; x += 2) for (z = -34; z < 34; z += 2) {
      if (((x + z) / 2) % 2 === 0) { c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(x, z, 2, 2); }
    }
    c.strokeStyle = 'rgba(80,40,90,0.14)'; c.lineWidth = 0.06;
    for (x = -20; x <= 20; x += 2) { c.beginPath(); c.moveTo(x, -34); c.lineTo(x, 34); c.stroke(); }
    for (z = -34; z <= 34; z += 2) { c.beginPath(); c.moveTo(-20, z); c.lineTo(20, z); c.stroke(); }
    var tc = this.teamCss;
    // keys & 3pt arcs
    for (var t = 0; t < 2; t++) {
      var hz = A.hoops[t].z, sgn = hz > 0 ? -1 : 1;
      c.fillStyle = hexA(tc[t], 0.28);
      c.beginPath(); c.arc(0, hz, 12, 0, Math.PI * 2); c.fill();
      c.fillStyle = hexA(tc[t], 0.45);
      c.fillRect(-3.2, Math.min(hz, hz + sgn * 7), 6.4, 7);
      c.strokeStyle = '#ffffff'; c.lineWidth = 0.22;
      c.beginPath(); c.arc(0, hz, 12, 0, Math.PI * 2); c.stroke();
      c.strokeRect(-3.2, Math.min(hz, hz + sgn * 7), 6.4, 7);
      c.beginPath(); c.arc(0, hz + sgn * 7, 2.4, 0, Math.PI * 2); c.stroke();
      // chevrons pointing toward the enemy hoop (this team's attack direction)
      c.fillStyle = hexA(tc[t], 0.85);
      var dir = t === 0 ? 1 : -1;
      var k;
      for (k = 0; k < 3; k++) chevron(c, 0, -dir * (4.8 + k * 1.5), dir, 0);
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        for (k = 0; k < 3; k++) chevron(c, s2 * 7.8, -dir * (13 + k * 1.5), dir, 0.9);
      }
    }
    // midline + center circle
    c.strokeStyle = '#ffffff'; c.lineWidth = 0.25;
    c.beginPath(); c.moveTo(-20, 0); c.lineTo(20, 0); c.stroke();
    c.fillStyle = '#ffe7a8';
    c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill();
    c.stroke();
    c.fillStyle = '#ffc93c';
    c.beginPath(); c.arc(0, 0, 2.6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ff8a2a'; c.lineWidth = 0.18;
    c.beginPath(); c.arc(0, 0, 2.6, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ffffff';
    BBA.Character.star(c, 0, 0, 1.6, 5);
    // border
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.3;
    c.strokeRect(-19.6, -33.6, 39.2, 67.2);
    var tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  };

  function chevron(c, x, z, dir, a) {
    c.beginPath();
    c.moveTo(x - 0.9, z - dir * 0.3);
    c.lineTo(x, z + dir * 0.5);
    c.lineTo(x + 0.9, z - dir * 0.3);
    c.lineTo(x + 0.9, z - dir * 0.9);
    c.lineTo(x, z - dir * 0.1);
    c.lineTo(x - 0.9, z - dir * 0.9);
    c.closePath(); c.fill();
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  ArenaView.prototype._floor = function () {
    var geo = new THREE.PlaneGeometry(40, 68);
    var m = new THREE.MeshLambertMaterial({ map: this._floorTexture() });
    var f = new THREE.Mesh(geo, m);
    f.rotation.x = -Math.PI / 2; f.receiveShadow = true;
    this.group.add(f);
    // outer ground apron
    var ap = new THREE.Mesh(new THREE.PlaneGeometry(160, 180), lam('#3b3470'));
    ap.rotation.x = -Math.PI / 2; ap.position.y = -0.05; ap.receiveShadow = false;
    this.group.add(ap);
  };

  /* ---------------- platforms & ramps ---------------- */
  function stripeTex(c1, c2, n, vertical) {
    var cv = canvas(128, 128), c = cv.getContext('2d');
    c.fillStyle = c1; c.fillRect(0, 0, 128, 128);
    c.fillStyle = c2;
    for (var i = 0; i < n; i++) {
      if (vertical) c.fillRect(i * 128 / n, 0, 64 / n, 128);
      else c.fillRect(0, i * 128 / n, 128, 64 / n);
    }
    var t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function arrowTex(color, bg) {
    var cv = canvas(128, 256), c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, 128, 256);
    c.fillStyle = color;
    for (var i = 0; i < 3; i++) {
      var y = 40 + i * 80;
      c.beginPath(); c.moveTo(20, y + 30); c.lineTo(64, y - 10); c.lineTo(108, y + 30); c.lineTo(108, y + 50); c.lineTo(64, y + 10); c.lineTo(20, y + 50); c.closePath(); c.fill();
    }
    var t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  ArenaView.prototype._platforms = function () {
    var P = A.PLAT, g = this.group, sxs = [-1, 1], szs = [-1, 1], i, j;
    var topM = new THREE.MeshLambertMaterial({ color: '#8c6cff' });
    var sideM = new THREE.MeshLambertMaterial({ color: '#4a3bb3' });
    var trimM = new THREE.MeshLambertMaterial({ color: '#ffc93c', emissive: '#553a00', emissiveIntensity: 0.3 });
    var rampTex = arrowTex('#ffd74a', '#7a5cff');
    rampTex.repeat.set(1, 2);
    var rampM = new THREE.MeshLambertMaterial({ map: rampTex });
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
      var sx = sxs[i], sz = szs[j];
      var w = P.xOut - P.xIn, cx = sx * (P.xIn + w / 2);
      var len = P.zEnd - P.zTop, cz = sz * (P.zTop + len / 2);
      var top = new THREE.Mesh(new THREE.BoxGeometry(w, P.h, len), [sideM, sideM, topM, sideM, sideM, sideM]);
      top.position.set(cx, P.h / 2, cz); top.castShadow = true; top.receiveShadow = true;
      g.add(top);
      // edge trims
      g.add(box(0.25, 0.25, len, trimM, sx * (P.xIn + 0.12), P.h + 0.02, cz));
      g.add(box(w, 0.25, 0.25, trimM, cx, P.h + 0.02, sz * (P.zEnd - 0.12)));
      // inner rail (with walk-off gap)
      var railM = new THREE.MeshLambertMaterial({ color: '#ffffff' });
      var segs = [[P.zTop, P.gapA], [P.gapB, P.zEnd]];
      for (var s = 0; s < 2; s++) {
        var z0 = segs[s][0], z1 = segs[s][1], rl = z1 - z0;
        var rail = box(P.railW, 0.12, rl, trimM, sx * (P.xIn + P.railW / 2), P.h + P.railH, sz * (z0 + rl / 2));
        g.add(rail);
        for (var q = 0; q <= 2; q++) {
          var zz = z0 + rl * q / 2;
          g.add(box(0.1, P.railH, 0.1, railM, sx * (P.xIn + P.railW / 2), P.h + P.railH / 2, sz * zz));
        }
        var pad = box(P.railW, P.railH * 0.9, rl, new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 }), sx * (P.xIn + P.railW / 2), P.h + P.railH * 0.45, sz * (z0 + rl / 2));
        g.add(pad);
      }
      // ramp wedge
      var ramp = this._wedge(sx * P.xIn, sx * P.xOut, sz * P.zRamp, sz * P.zTop, P.h, rampM, sideM);
      g.add(ramp);
    }
  };

  /* A ramp from z0 (height 0) to z1 (height h) spanning x0..x1. */
  ArenaView.prototype._wedge = function (x0, x1, z0, z1, h, topM, sideM) {
    var grp = new THREE.Group();
    var xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    var geo = new THREE.BufferGeometry();
    var v = [
      xa, 0, z0, xb, 0, z0, xb, h, z1,
      xa, 0, z0, xb, h, z1, xa, h, z1
    ];
    var uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    // make sure the top faces up
    var n = geo.attributes.normal;
    if (n.getY(0) < 0) {
      v = [xa, 0, z0, xb, h, z1, xb, 0, z0, xa, 0, z0, xa, h, z1, xb, h, z1];
      uv = [0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
    }
    var topMesh = new THREE.Mesh(geo, topM);
    topMesh.receiveShadow = true;
    grp.add(topMesh);
    // side triangles + back face
    var sg = new THREE.BufferGeometry();
    var sv = [
      xa, 0, z0, xa, h, z1, xa, 0, z1,
      xb, 0, z0, xb, 0, z1, xb, h, z1
    ];
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
    sg.computeVertexNormals();
    var side = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: sideM.color, side: THREE.DoubleSide }));
    side.castShadow = true;
    grp.add(side);
    return grp;
  };

  /* ---------------- spawn decks ---------------- */
  ArenaView.prototype._decks = function () {
    var D = A.DECK, g = this.group, t, s;
    this.conveyors = [];
    for (t = 0; t < 2; t++) {
      var col = this.teamCss[t], zs = t === 0 ? -1 : 1;
      var dark = new THREE.Color(col).multiplyScalar(0.55);
      var sideM = new THREE.MeshLambertMaterial({ color: dark });
      var conv = arrowTex('rgba(255,255,255,0.55)', col);
      conv.repeat.set(3, 1.5);
      conv.rotation = 0;
      var topM = new THREE.MeshLambertMaterial({ map: conv });
      this.conveyors.push({ tex: conv, dir: zs });
      var frontTex = this._deckFront(col, t);
      var frontM = new THREE.MeshLambertMaterial({ map: frontTex });
      for (s = -1; s <= 1; s += 2) {
        var w = D.xOut - D.xIn, cx = s * (D.xIn + w / 2), len = D.zBack - D.zFront, cz = zs * (D.zFront + len / 2);
        // face order px,nx,py,ny,pz,nz ; court-facing face is nz for red (+z side), pz for blue
        var mats = [sideM, sideM, topM, sideM, zs > 0 ? sideM : frontM, zs > 0 ? frontM : sideM];
        var deck = new THREE.Mesh(new THREE.BoxGeometry(w, D.h, len), mats);
        deck.position.set(cx, D.h / 2, cz); deck.castShadow = true; deck.receiveShadow = true;
        g.add(deck);
        // glowing lip
        var lipM = new THREE.MeshBasicMaterial({ color: col });
        this.neon.push({ m: lipM, team: t });
        g.add(box(w, 0.18, 0.3, lipM, cx, D.h + 0.05, zs * (D.zFront + 0.15)));
        g.add(box(0.3, 0.18, len, lipM, s * (D.xIn + 0.15), D.h + 0.05, cz));
        var archM = new THREE.MeshLambertMaterial({ color: '#ffffff' });
        // flags
        for (var f = 0; f < 2; f++) {
          var fx = s * (D.xIn + 1 + f * (w - 2));
          g.add(box(0.12, 5, 0.12, archM, fx, D.h + 2.5, zs * (D.zBack - 0.6)));
          var flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide }));
          flag.position.set(fx + 0.9 * s, D.h + 4.4, zs * (D.zBack - 0.6));
          flag.userData.dynamic = true;
          g.add(flag);
          this.flags = this.flags || []; this.flags.push(flag);
        }
      }
    }
  };

  ArenaView.prototype._deckFront = function (col, t) {
    var cv = canvas(256, 128), c = cv.getContext('2d');
    var n = new THREE.Color(col).multiplyScalar(0.75);
    c.fillStyle = '#' + n.getHexString(); c.fillRect(0, 0, 256, 128);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    for (var i = 0; i < 256; i += 32) c.fillRect(i, 0, 16, 128);
    c.fillStyle = '#ffffff'; c.font = 'bold 34px Arial Black, Arial';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(t === 0 ? 'BLUE' : 'RED', 128, 50);
    c.font = 'bold 18px Arial'; c.fillText('TEAM START', 128, 90);
    return new THREE.CanvasTexture(cv);
  };
  ArenaView.prototype._goSign = function (col) {
    var cv = canvas(256, 40), c = cv.getContext('2d');
    c.fillStyle = '#1b1f4a'; c.fillRect(0, 0, 256, 40);
    c.fillStyle = col; c.fillRect(0, 0, 256, 5); c.fillRect(0, 35, 256, 5);
    c.fillStyle = '#ffffff'; c.font = 'bold 24px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('JUMP IN!', 128, 21);
    return new THREE.CanvasTexture(cv);
  };

  /* ---------------- walls ---------------- */
  ArenaView.prototype._walls = function () {
    var g = this.group, W = A.halfW, L = A.halfL;
    var padM = [new THREE.MeshLambertMaterial({ color: this.teamCss[0] }), new THREE.MeshLambertMaterial({ color: this.teamCss[1] })];
    var whiteM = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    var glass = new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    var frame = new THREE.MeshLambertMaterial({ color: '#2a2f6a' });
    var z, i;
    // long sides: padded segments alternating colors
    for (z = -L; z < L; z += 4) {
      var tm = z < 0 ? padM[0] : padM[1];
      for (i = -1; i <= 1; i += 2) {
        var seg = box(0.6, 1.3, 3.9, (Math.round(z / 4) % 2 === 0) ? tm : whiteM, i * (W + 0.3), 0.65, z + 2);
        seg.receiveShadow = true;
        g.add(seg);
      }
    }
    // end walls
    for (i = -1; i <= 1; i += 2) {
      g.add(box(W * 2 + 1.2, 1.3, 0.6, i < 0 ? padM[0] : padM[1], 0, 0.65, i * (L + 0.3)));
    }
    // glass
    var gh = 9;
    for (i = -1; i <= 1; i += 2) {
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, gh), glass);
      gl.rotation.y = Math.PI / 2; gl.position.set(i * (W + 0.3), 1.3 + gh / 2, 0); g.add(gl);
      var ge = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, gh + 7), glass);
      ge.position.set(0, 1.3 + (gh + 7) / 2, i * (L + 0.3)); g.add(ge);
      // posts
      for (z = -L; z <= L; z += 8.5) g.add(box(0.25, gh, 0.25, frame, i * (W + 0.35), 1.3 + gh / 2, z));
      g.add(box(0.3, 0.3, L * 2, frame, i * (W + 0.35), 1.3 + gh, 0));
    }
  };

  /* ---------------- hoops & towers ---------------- */
  ArenaView.prototype._crownTex = function (col, withBg) {
    var cv = canvas(256, 256), c = cv.getContext('2d');
    if (withBg) { c.fillStyle = 'rgba(20,24,70,0.0)'; c.fillRect(0, 0, 256, 256); }
    c.strokeStyle = col; c.lineWidth = 10; c.strokeRect(58, 88, 140, 104);
    c.fillStyle = '#ffffff';
    BBA.Character.drawCrown(c, 128, 110, 44);
    var t = new THREE.CanvasTexture(cv);
    return t;
  };

  ArenaView.prototype._hoops = function () {
    var g = this.group, T = A.TOWER;
    this.hoopViews = [];
    for (var t = 0; t < 2; t++) {
      var h = A.hoops[t], col = this.teamCss[t], zs = h.side;
      var hv = {};
      var towerM = new THREE.MeshLambertMaterial({ color: new THREE.Color(col).multiplyScalar(0.6) });
      var tlen = A.halfL - T.z;
      var tower = box(T.halfW * 2, T.h, tlen, towerM, 0, T.h / 2, zs * (T.z + tlen / 2));
      tower.castShadow = true; g.add(tower);
      var neonM = new THREE.MeshBasicMaterial({ color: col });
      this.neon.push({ m: neonM, team: t });
      // neon trims on tower
      g.add(box(0.2, T.h, 0.2, neonM, -T.halfW, T.h / 2, zs * (T.z - 0.05)));
      g.add(box(0.2, T.h, 0.2, neonM, T.halfW, T.h / 2, zs * (T.z - 0.05)));
      g.add(box(T.halfW * 2, 0.2, 0.2, neonM, 0, T.h, zs * (T.z - 0.05)));
      // crown sign on top
      var crownGold = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
      var cw = new THREE.Group();
      cw.add(box(3.4, 0.9, 0.4, crownGold, 0, 0, 0));
      for (var k = -1; k <= 1; k++) {
        var sp = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 4), crownGold);
        sp.position.set(k * 1.3, 1.0 - Math.abs(k) * 0.2, 0); cw.add(sp);
        var gem = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
        gem.position.set(k * 1.3, 0.05, zs > 0 ? -0.25 : 0.25); cw.add(gem);
      }
      cw.position.set(0, T.h + 0.9, zs * (T.z + 0.8));
      cw.userData.dynamic = true; g.add(cw); hv.crown = cw;
      // arm to board
      var armM = new THREE.MeshLambertMaterial({ color: '#2a2f6a' });
      g.add(box(0.5, 0.5, T.z - h.boardZ * zs, armM, 0, 6.2, zs * ((T.z + Math.abs(h.boardZ)) / 2)));
      // backboard
      var bw = h.boardHalfW * 2, bh = h.boardTop - h.boardBottom, bz = h.boardZ + zs * h.boardThick / 2;
      var panel = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, h.boardThick),
        new THREE.MeshLambertMaterial({ color: '#dff4ff', transparent: true, opacity: 0.35, depthWrite: false }));
      panel.position.set(0, h.boardBottom + bh / 2, bz); g.add(panel);
      var emb = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: this._crownTex(col), transparent: true, depthWrite: false }));
      emb.position.set(0, h.boardBottom + bh / 2 + 0.1, bz - zs * (h.boardThick / 2 + 0.02));
      if (zs > 0) emb.rotation.y = Math.PI;
      g.add(emb);
      var fm = new THREE.MeshBasicMaterial({ color: col });
      this.neon.push({ m: fm, team: t });
      var fr = 0.22;
      g.add(box(bw + fr * 2, fr, fr * 1.5, fm, 0, h.boardTop, bz));
      g.add(box(bw + fr * 2, fr, fr * 1.5, fm, 0, h.boardBottom, bz));
      g.add(box(fr, bh, fr * 1.5, fm, -h.boardHalfW - fr / 2, h.boardBottom + bh / 2, bz));
      g.add(box(fr, bh, fr * 1.5, fm, h.boardHalfW + fr / 2, h.boardBottom + bh / 2, bz));
      // rim
      var rimM = new THREE.MeshStandardMaterial({ color: '#ff6a1a', emissive: '#ff4a00', emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.4 });
      var rim = new THREE.Mesh(new THREE.TorusGeometry(h.ringR, 0.1, 8, 36), rimM);
      rim.rotation.x = Math.PI / 2; rim.position.set(h.x, h.y, h.z);
      rim.castShadow = true;
      rim.userData.dynamic = true; g.add(rim); hv.rim = rim;
      // bracket
      g.add(box(0.5, 0.15, Math.abs(h.boardZ - h.z) - h.ringR + 0.1, rimM, 0, h.y, h.z + zs * (h.ringR + (Math.abs(h.boardZ - h.z) - h.ringR) / 2)));
      // glow ring
      var glow = new THREE.Mesh(new THREE.TorusGeometry(h.ringR + 0.12, 0.07, 6, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 }));
      glow.rotation.x = Math.PI / 2; glow.position.set(h.x, h.y + 0.02, h.z); glow.userData.dynamic = true; g.add(glow); hv.glow = glow;
      // net
      var net = new THREE.Mesh(new THREE.CylinderGeometry(h.ringR * 0.98, h.ringR * 0.62, 1.4, 16, 4, true),
        new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.85 }));
      net.position.set(h.x, h.y - 0.7, h.z); net.userData.dynamic = true; g.add(net); hv.net = net;
      // under-hoop target circle
      var tc = new THREE.Mesh(new THREE.RingGeometry(h.ringR - 0.1, h.ringR + 0.1, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false }));
      tc.rotation.x = -Math.PI / 2; tc.position.set(h.x, 0.03, h.z); g.add(tc);
      this.hoopViews.push(hv);
    }
  };

  /* ---------------- pads ---------------- */
  ArenaView.prototype._pads = function () {
    var g = this.group, pads = A.pads, i;
    var ringTex = (function () {
      var cv = canvas(128, 128), c = cv.getContext('2d');
      c.fillStyle = '#10205a'; c.fillRect(0, 0, 128, 128);
      for (var r = 60; r > 0; r -= 14) { c.strokeStyle = r % 28 ? '#39e6ff' : '#b8f6ff'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, r, 0, 7); c.stroke(); }
      return new THREE.CanvasTexture(cv);
    })();
    var arrowT = (function () {
      var cv = canvas(128, 128), c = cv.getContext('2d');
      c.fillStyle = '#3a2a00'; c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#ffd23f';
      c.beginPath(); c.moveTo(64, 10); c.lineTo(112, 60); c.lineTo(82, 60); c.lineTo(82, 118); c.lineTo(46, 118); c.lineTo(46, 60); c.lineTo(16, 60); c.closePath(); c.fill();
      return new THREE.CanvasTexture(cv);
    })();
    this.padViews = [];
    for (i = 0; i < pads.length; i++) {
      var p = pads[i], pv = new THREE.Group();
      var base = new THREE.Mesh(new THREE.CylinderGeometry(p.r + 0.25, p.r + 0.35, 0.22, 24), new THREE.MeshLambertMaterial({ color: p.type === 'bounce' ? '#2a2f6a' : '#4a3a10' }));
      base.position.y = 0.11; base.receiveShadow = true; pv.add(base);
      var topMat = new THREE.MeshBasicMaterial({ map: p.type === 'bounce' ? ringTex : arrowT });
      var top = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.08, 24), topMat);
      top.position.y = 0.24; pv.add(top);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.25, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: p.type === 'bounce' ? '#39e6ff' : '#ffd23f' }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; pv.add(ring);
      if (p.type === 'launch') {
        top.rotation.y = Math.atan2(p.vx, p.vz);
      }
      pv.position.set(p.x, p.y, p.z);
      pv.userData.dynamic = true;
      g.add(pv);
      this.padViews.push({ g: pv, top: top, ring: ring, pulse: 0 });
    }
  };

  /* ---------------- bumpers ---------------- */
  ArenaView.prototype._bumpers = function () {
    var g = this.group, i;
    var stripe = stripeTex('#ff3b5c', '#ffffff', 4, false);
    stripe.repeat.set(1, 1);
    var pm = new THREE.MeshLambertMaterial({ map: stripe });
    for (i = 0; i < A.posts.length; i++) {
      var po = A.posts[i];
      var post = new THREE.Mesh(new THREE.CylinderGeometry(po.r, po.r * 1.1, po.h, 20), pm);
      post.position.set(po.x, po.h / 2, po.z); post.castShadow = true; g.add(post);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(po.r * 0.8, po.r, 0.25, 20), new THREE.MeshBasicMaterial({ color: '#ffd23f' }));
      cap.position.set(po.x, po.h + 0.12, po.z); g.add(cap);
    }
    var barTex = stripeTex('#ffd23f', '#222244', 8, true);
    var bm = new THREE.MeshLambertMaterial({ map: barTex });
    this.armViews = [];
    for (i = 0; i < A.arms.length; i++) {
      var a = A.arms[i], ag = new THREE.Group();
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(a.hubR, a.hubR * 1.2, a.hubH, 20), new THREE.MeshLambertMaterial({ color: '#4a3bb3' }));
      hub.position.y = a.hubH / 2; hub.castShadow = true;
      var bar = new THREE.Mesh(new THREE.CylinderGeometry(a.r, a.r, a.len * 2, 12), bm);
      bar.rotation.z = Math.PI / 2; bar.position.y = a.y; bar.castShadow = true;
      var e1 = new THREE.Mesh(new THREE.SphereGeometry(a.r * 1.3, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3b5c' }));
      e1.position.set(a.len, a.y, 0);
      var e2 = e1.clone(); e2.position.x = -a.len;
      var spinner = new THREE.Group();
      spinner.add(bar); spinner.add(e1); spinner.add(e2);
      var lightM = new THREE.MeshBasicMaterial({ color: '#39e6ff' });
      var lt = new THREE.Mesh(new THREE.CylinderGeometry(a.hubR * 0.7, a.hubR * 0.7, 0.2, 16), lightM);
      lt.position.y = a.hubH + 0.1;
      ag.add(hub); ag.add(spinner); ag.add(lt);
      ag.position.set(a.x, 0, a.z);
      ag.userData.dynamic = true;
      g.add(ag);
      this.armViews.push({ spinner: spinner, arm: a });
    }
  };

  /* ---------------- stands & crowd ---------------- */
  ArenaView.prototype._stands = function () {
    var g = this.group, W = A.halfW, L = A.halfL, i, j;
    var tierM = [new THREE.MeshLambertMaterial({ color: '#2a2f6a' }), new THREE.MeshLambertMaterial({ color: '#343a82' })];
    var tiers = 5;
    for (var s = -1; s <= 1; s += 2) {
      for (i = 0; i < tiers; i++) {
        var tb = box(2.2, 1 + i * 1.6, L * 2 + 8, tierM[i % 2], s * (W + 2.2 + i * 2.2), (1 + i * 1.6) / 2, 0);
        tb.receiveShadow = true; g.add(tb);
      }
      // roof canopy
      var canopy = box(12, 0.4, L * 2 + 10, new THREE.MeshLambertMaterial({ color: '#ffffff' }), s * (W + 7), 15, 0);
      g.add(canopy);
      for (j = -L; j <= L; j += 12) g.add(box(0.4, 15, 0.4, tierM[0], s * (W + 12.6), 7.5, j));
      // stripe under canopy
      var strip = box(12, 0.5, L * 2 + 10, new THREE.MeshBasicMaterial({ color: s < 0 ? this.teamCss[0] : this.teamCss[1] }), s * (W + 7), 14.6, 0);
      g.add(strip);
    }
    // end stands behind decks
    for (var e = -1; e <= 1; e += 2) {
      for (i = 0; i < 3; i++) {
        var eb = box(W * 2 + 20, 8 + i * 2, 2.4, tierM[i % 2], 0, (8 + i * 2) / 2, e * (L + 1.8 + i * 2.4));
        g.add(eb);
      }
    }
    // crowd (instanced beans)
    var count = this.mobile ? 220 : 420;
    var geo = new THREE.SphereGeometry(0.34, 7, 6); geo.scale(1, 1.35, 1);
    var cm = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    var inst = new THREE.InstancedMesh(geo, cm, count);
    var palette = ['#ffd23f', '#ff7a2f', '#ff4f8b', '#b86bff', '#5b8cff', '#2fd3c4', '#6fdc4a', '#ffffff', '#ff9ec8', '#8be0ff', this.teamCss[0], this.teamCss[1]];
    var dummy = new THREE.Object3D(), col = new THREE.Color();
    this.crowd = [];
    for (i = 0; i < count; i++) {
      var side, x, y, z;
      if (i < count * 0.8) {
        side = i % 2 ? 1 : -1;
        var tier = (Math.floor(i / 2) % tiers);
        x = side * (W + 2.2 + tier * 2.2); y = 1 + tier * 1.6 + 0.55;
        z = -L + ((Math.floor(i / (2 * tiers)) * 1.35) % (L * 2)) + (tier % 2) * 0.6;
      } else {
        var k = i - Math.floor(count * 0.8), e2 = k % 2 ? 1 : -1, row = Math.floor(k / 2) % 3;
        x = -W - 8 + ((Math.floor(k / 6) * 1.4) % (W * 2 + 16)); y = 8 + row * 2 + 0.55; z = e2 * (L + 1.8 + row * 2.4);
      }
      dummy.position.set(x, y, z); dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      col.set(palette[(i * 7 + (i >> 3)) % palette.length]);
      inst.setColorAt(i, col);
      this.crowd.push({ x: x, y: y, z: z, ph: Math.random() * 6.28, sp: 4 + Math.random() * 4 });
    }
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    g.add(inst);
    this.crowdMesh = inst;
    this.crowdHype = 0.2;
    // jumbotrons
    this.screens = [];
    for (e = -1; e <= 1; e += 2) {
      var cv = canvas(512, 192);
      var tex = new THREE.CanvasTexture(cv);
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.25), new THREE.MeshBasicMaterial({ map: tex }));
      scr.position.set(0, 19, e * (L + 6));
      if (e > 0) scr.rotation.y = Math.PI;
      g.add(scr);
      g.add(box(14.8, 6, 0.6, tierM[0], 0, 19, e * (L + 6.4)));
      this.screens.push({ cv: cv, tex: tex });
    }
    this.setScoreboard([0, 0], 240, false, '');
  };

  ArenaView.prototype.setScoreboard = function (score, clock, ot, msg) {
    var key = score[0] + '|' + score[1] + '|' + Math.ceil(clock) + '|' + ot + '|' + msg;
    if (key === this.lastBoard) return;
    this.lastBoard = key;
    for (var i = 0; i < this.screens.length; i++) {
      var s = this.screens[i], c = s.cv.getContext('2d');
      c.fillStyle = '#0c1033'; c.fillRect(0, 0, 512, 192);
      c.fillStyle = this.teamCss[0]; c.fillRect(0, 0, 200, 120);
      c.fillStyle = this.teamCss[1]; c.fillRect(312, 0, 200, 120);
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 80px Arial Black, Arial';
      c.fillText(String(score[0]), 100, 64); c.fillText(String(score[1]), 412, 64);
      c.font = 'bold 44px Arial Black, Arial';
      var m = Math.floor(Math.max(0, clock) / 60), sec = Math.floor(Math.max(0, clock) % 60);
      c.fillText(ot ? 'OT' : (m + ':' + (sec < 10 ? '0' : '') + sec), 256, 64);
      c.font = 'bold 34px Arial Black, Arial';
      c.fillStyle = '#ffd23f';
      c.fillText(msg || 'BEAN BALL ARENA', 256, 158);
      s.tex.needsUpdate = true;
    }
  };

  /* ---------------- scenery ---------------- */
  ArenaView.prototype._scenery = function () {
    var g = this.group, i;
    var trunkM = new THREE.MeshLambertMaterial({ color: '#8a5a36' });
    var leafM = new THREE.MeshLambertMaterial({ color: '#2fb35a', side: THREE.DoubleSide });
    var spots = [[-38, -44], [38, -44], [-38, 44], [38, 44], [-44, -10], [44, 10], [-44, 18], [44, -22], [-30, -52], [30, 52], [0, -56], [0, 56]];
    for (i = 0; i < spots.length; i++) {
      var tr = new THREE.Group(), hgt = 9 + (i % 3) * 2;
      for (var s = 0; s < 5; s++) {
        var seg = new THREE.Mesh(new THREE.CylinderGeometry(0.45 - s * 0.05, 0.5 - s * 0.05, hgt / 5, 7), trunkM);
        seg.position.set(s * 0.25, hgt / 5 * (s + 0.5), 0); tr.add(seg);
      }
      for (var l = 0; l < 7; l++) {
        var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 4, 1, true), leafM);
        var a = l / 7 * Math.PI * 2;
        leaf.position.set(1.25 + Math.cos(a) * 2, hgt + 0.3, Math.sin(a) * 2);
        leaf.rotation.set(Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3 + (Math.cos(a) > 0 ? 0 : 0));
        leaf.rotation.order = 'YXZ';
        leaf.lookAt(1.25 + Math.cos(a) * 5, hgt - 1.6, Math.sin(a) * 5);
        leaf.rotateX(Math.PI / 2);
        tr.add(leaf);
      }
      tr.position.set(spots[i][0], 0, spots[i][1]);
      g.add(tr);
    }
    // skyline
    var bm = [new THREE.MeshLambertMaterial({ color: '#6c8fd6' }), new THREE.MeshLambertMaterial({ color: '#8aa6e6' }), new THREE.MeshLambertMaterial({ color: '#5a76c0' })];
    for (i = 0; i < 46; i++) {
      var ang = i / 46 * Math.PI * 2, r = 150 + (i * 37 % 60);
      var hh = 30 + (i * 53 % 70), ww = 10 + (i * 13 % 14);
      var b = box(ww, hh, ww, bm[i % 3], Math.cos(ang) * r, hh / 2 - 2, Math.sin(ang) * r);
      g.add(b);
    }
    // light towers
    var ltm = new THREE.MeshLambertMaterial({ color: '#2a2f6a' });
    var lampM = new THREE.MeshBasicMaterial({ color: '#fff6d0' });
    var corners = [[-30, -40], [30, -40], [-30, 40], [30, 40]];
    for (i = 0; i < 4; i++) {
      g.add(box(0.8, 26, 0.8, ltm, corners[i][0], 13, corners[i][1]));
      var lamp = box(5, 3, 0.6, lampM, corners[i][0], 26, corners[i][1]);
      lamp.lookAt(0, 0, 0);
      g.add(lamp);
    }
  };

  /* ---------------- runtime ---------------- */
  ArenaView.prototype.pulsePad = function (i) { if (this.padViews[i]) this.padViews[i].pulse = 1; };
  ArenaView.prototype.flashHoop = function (hoopIdx) { this.hoopFx[hoopIdx] = 1; };
  ArenaView.prototype.setOvertime = function (on) { this.ot = on; };
  ArenaView.prototype.hype = function (amt) { this.crowdHype = Math.min(1.5, this.crowdHype + amt); };

  ArenaView.prototype.update = function (dt, simTime, obstacleMul) {
    this.t += dt;
    var i, t = this.t;
    // spinning bars follow the sim clock exactly
    for (i = 0; i < this.armViews.length; i++) {
      var av = this.armViews[i];
      av.spinner.rotation.y = -A.armAngle(av.arm, simTime, obstacleMul);
    }
    // pads
    for (i = 0; i < this.padViews.length; i++) {
      var pv = this.padViews[i];
      pv.pulse = Math.max(0, pv.pulse - dt * 3);
      var s = 1 + pv.pulse * 0.35 + Math.sin(t * 4 + i) * 0.03;
      pv.ring.scale.set(s, s, s);
      pv.top.position.y = 0.24 - pv.pulse * 0.12;
    }
    // conveyors
    for (i = 0; i < this.conveyors.length; i++) {
      var cvy = this.conveyors[i];
      cvy.tex.offset.y = (cvy.tex.offset.y + dt * 0.55 * (cvy.dir > 0 ? -1 : 1)) % 1;
    }
    // flags
    if (this.flags) for (i = 0; i < this.flags.length; i++) this.flags[i].rotation.y = Math.sin(t * 3 + i) * 0.35;
    // hoops
    for (i = 0; i < 2; i++) {
      var hv = this.hoopViews[i], fx = this.hoopFx[i];
      this.hoopFx[i] = Math.max(0, fx - dt * 1.2);
      var sc = 1 + Math.sin(fx * Math.PI * 3) * 0.08 * fx;
      hv.glow.scale.set(sc + fx * 0.3, sc + fx * 0.3, 1);
      hv.glow.material.opacity = 0.5 + 0.3 * Math.sin(t * 3 + i) + fx * 0.5;
      hv.net.scale.set(1 - fx * 0.2, 1 + Math.sin(fx * 12) * 0.25 * fx, 1 - fx * 0.2);
      hv.rim.rotation.y = Math.sin(fx * 30) * 0.06 * fx;
      hv.crown.rotation.y = Math.sin(t * 0.8 + i) * 0.25;
      hv.crown.position.y = A.TOWER.h + 0.9 + Math.sin(t * 2 + i) * 0.15 + fx * 0.8;
    }
    // neon pulse (overtime flashes)
    for (i = 0; i < this.neon.length; i++) {
      var n = this.neon[i], base = this.team[n.team];
      if (this.ot) {
        var k = 0.55 + 0.45 * Math.abs(Math.sin(t * 4 + n.team * 1.57));
        n.m.color.copy(base).multiplyScalar(k);
      } else n.m.color.copy(base);
    }
    // crowd bob
    this.crowdHype = Math.max(0.2, this.crowdHype - dt * 0.25);
    this.crowdFrame = (this.crowdFrame || 0) + 1;
    if (!this.mobile || this.crowdFrame % 2 === 0) {
      var dummy = this._dummy || (this._dummy = new THREE.Object3D());
      var hy = this.crowdHype;
      for (i = 0; i < this.crowd.length; i++) {
        var c = this.crowd[i];
        var j = Math.max(0, Math.sin(t * c.sp + c.ph)) * 0.35 * hy;
        dummy.position.set(c.x, c.y + j, c.z);
        dummy.rotation.y = c.x > 0 ? -Math.PI / 2 : Math.PI / 2;
        dummy.updateMatrix();
        this.crowdMesh.setMatrixAt(i, dummy.matrix);
      }
      this.crowdMesh.instanceMatrix.needsUpdate = true;
    }
  };

  ArenaView.prototype.dispose = function () {
    this.scene.remove(this.group);
    this.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < ms.length; i++) { if (ms[i].map) ms[i].map.dispose(); ms[i].dispose(); }
      }
    });
  };

  BBA.ArenaView = ArenaView;
})(this);
