/* BEAN BALL ARENA - client/js/effects.js
 * Pooled particle bursts (dust, impact stars, confetti, sparks) and
 * expanding shock rings. One InstancedMesh = one draw call for all particles.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;

  function Effects(scene, mobile) {
    this.scene = scene;
    this.max = mobile ? 220 : 450;
    var geo = new THREE.OctahedronGeometry(1, 0);
    var mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    var c = new THREE.Color('#ffffff'), i;
    this.p = [];
    for (i = 0; i < this.max; i++) {
      this.mesh.setColorAt(i, c);
      this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, g: 0, rx: 0, ry: 0, drag: 0 });
    }
    this.idx = 0;
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    scene.add(this.mesh);
    // rings
    this.rings = [];
    var rg = new THREE.RingGeometry(0.8, 1, 32);
    for (i = 0; i < 8; i++) {
      var r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r);
      this.rings.push({ m: r, life: 0, max: 0.5, size: 3 });
    }
    this.ringIdx = 0;
    this.hideAll();
  }

  Effects.prototype.hideAll = function () {
    this.dummy.scale.setScalar(0); this.dummy.updateMatrix();
    for (var i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  };

  Effects.prototype.spawn = function (x, y, z, vx, vy, vz, life, size, color, g, drag) {
    if (!BBA.Settings.data.effects) return;
    var i = this.idx++ % this.max, p = this.p[i];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.s = size; p.g = g || 0; p.drag = drag || 0;
    p.rx = Math.random() * 6; p.ry = Math.random() * 6;
    this.col.set(color);
    this.mesh.setColorAt(i, this.col);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  };

  function rnd(a) { return (Math.random() - 0.5) * 2 * a; }

  Effects.prototype.burst = function (type, x, y, z, o) {
    o = o || {};
    var i, n;
    if (type === 'dust') {
      n = o.n || 8;
      for (i = 0; i < n; i++) { var a = Math.random() * 6.28, s = 1.5 + Math.random() * 2; this.spawn(x, y + 0.1, z, Math.cos(a) * s, 0.5 + Math.random(), Math.sin(a) * s, 0.4 + Math.random() * 0.2, 0.12 + Math.random() * 0.08, o.color || '#e8dccb', -1, 3); }
    } else if (type === 'stars') {
      for (i = 0; i < 12; i++) this.spawn(x, y, z, rnd(6), 2 + Math.random() * 5, rnd(6), 0.5 + Math.random() * 0.3, 0.12, i % 2 ? '#ffe14a' : '#ffffff', 12, 1.5);
      this.ring(x, 0.1, z, '#ffe14a', 2.5, 0.35);
    } else if (type === 'confetti') {
      var cols = o.colors || ['#ff4f8b', '#ffd23f', '#39e6ff', '#6fdc4a', '#ffffff'];
      n = o.n || 60;
      for (i = 0; i < n; i++) this.spawn(x + rnd(1), y, z + rnd(1), rnd(7), 4 + Math.random() * 9, rnd(7), 1.4 + Math.random() * 0.9, 0.1 + Math.random() * 0.06, cols[i % cols.length], 7, 1.2);
    } else if (type === 'sparks') {
      for (i = 0; i < 10; i++) this.spawn(x, y, z, rnd(5), rnd(4) + 2, rnd(5), 0.3, 0.06, i % 2 ? '#ffb02e' : '#fff6c0', 10, 0.5);
    } else if (type === 'pad') {
      this.ring(x, y + 0.3, z, o.color || '#39e6ff', 3, 0.4);
      for (i = 0; i < 10; i++) { var a2 = i / 10 * 6.28; this.spawn(x + Math.cos(a2) * 0.9, y + 0.3, z + Math.sin(a2) * 0.9, Math.cos(a2) * 1.5, 6 + Math.random() * 3, Math.sin(a2) * 1.5, 0.45, 0.09, o.color || '#39e6ff', 6, 1); }
    } else if (type === 'slam') {
      this.ring(x, y, z, o.color || '#ffffff', 5, 0.5);
      this.ring(x, 0.1, z, o.color || '#ffffff', 7, 0.7);
      for (i = 0; i < 26; i++) this.spawn(x, y, z, rnd(9), rnd(4) + 3, rnd(9), 0.6 + Math.random() * 0.3, 0.13, i % 3 ? (o.color || '#ffffff') : '#ffd23f', 14, 1);
    } else if (type === 'poof') {
      for (i = 0; i < 14; i++) this.spawn(x + rnd(0.4), y + Math.random() * 1.5, z + rnd(0.4), rnd(2), Math.random() * 2, rnd(2), 0.5, 0.2, o.color || '#ffffff', -2, 2);
    }
  };

  Effects.prototype.ring = function (x, y, z, color, size, life) {
    if (!BBA.Settings.data.effects) return;
    var r = this.rings[this.ringIdx++ % this.rings.length];
    r.m.position.set(x, y, z); r.m.material.color.set(color); r.life = life; r.max = life; r.size = size; r.m.visible = true;
  };

  Effects.prototype.update = function (dt) {
    var i, d = this.dummy, any = false;
    for (i = 0; i < this.max; i++) {
      var p = this.p[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      p.vy -= p.g * dt;
      var dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy *= (p.g < 0 ? dr : 1);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.rx += dt * 8; p.ry += dt * 6;
      var f = Math.max(0, p.life / p.max);
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rx, p.ry, 0);
      var s = p.s * (0.3 + 0.7 * Math.min(1, f * 2));
      if (p.life <= 0) s = 0;
      d.scale.set(s, s * (p.g > 5 ? 0.35 : 1), s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    if (any || this.wasAny) this.mesh.instanceMatrix.needsUpdate = true;
    this.wasAny = any;
    for (i = 0; i < this.rings.length; i++) {
      var r = this.rings[i];
      if (r.life <= 0) { r.m.visible = false; continue; }
      r.life -= dt;
      var k = 1 - r.life / r.max;
      var sc = 0.3 + k * r.size;
      r.m.scale.set(sc, sc, sc);
      r.m.material.opacity = (1 - k) * 0.8;
    }
  };

  BBA.Effects = Effects;
})(this);
