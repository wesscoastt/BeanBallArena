/* BEAN BALL ARENA - client/js/ball.js
 * Ball visuals: textured sphere with spin, readability outline, ground
 * marker + height line, speed trail. Purely visual; the sim owns the ball.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;

  function ballTexture() {
    var cv = root.document.createElement('canvas'); cv.width = 512; cv.height = 256;
    var c = cv.getContext('2d');
    var grd = c.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#ff8a2a'); grd.addColorStop(0.5, '#ff7a1c'); grd.addColorStop(1, '#e8620e');
    c.fillStyle = grd; c.fillRect(0, 0, 512, 256);
    // pebble dots
    c.fillStyle = 'rgba(120,40,0,0.12)';
    for (var i = 0; i < 1400; i++) { c.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    c.strokeStyle = '#2a1206'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(0, 128); c.lineTo(512, 128); c.stroke();
    c.beginPath(); c.moveTo(128, 0); c.lineTo(128, 256); c.stroke();
    c.beginPath(); c.moveTo(384, 0); c.lineTo(384, 256); c.stroke();
    c.lineWidth = 6;
    c.beginPath();
    for (var x = 0; x <= 512; x += 4) { var y = 128 + Math.sin(x / 512 * Math.PI * 2) * 0; }
    // curved seams
    c.beginPath(); c.ellipse(0, 128, 70, 128, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(512, 128, 70, 128, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(256, 128, 70, 128, 0, 0, Math.PI * 2); c.stroke();
    var t = new THREE.CanvasTexture(cv);
    return t;
  }

  function BallView(scene, radius) {
    this.scene = scene;
    this.R = radius;
    var g = new THREE.Group();
    this.group = g;
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.55, emissive: '#3a1400', emissiveIntensity: 0.35 }));
    mesh.castShadow = true;
    this.mesh = mesh;
    g.add(mesh);
    var outline = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#fff3a0', side: THREE.BackSide, transparent: true, opacity: 0.55 }));
    outline.scale.setScalar(1.09);
    this.outline = outline;
    g.add(outline);
    scene.add(g);
    this.setRadius(radius);

    // ground marker
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 28), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.8, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    scene.add(this.marker);
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    scene.add(this.blob);
    // height line
    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
    this.line = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: '#ffe066', dashSize: 0.25, gapSize: 0.2, transparent: true, opacity: 0.7 }));
    scene.add(this.line);
    // trail
    this.trail = [];
    var tm = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.4, depthWrite: false });
    var tg = new THREE.SphereGeometry(1, 8, 6);
    for (var i = 0; i < 10; i++) {
      var tmesh = new THREE.Mesh(tg, tm.clone());
      tmesh.visible = false; scene.add(tmesh);
      this.trail.push({ m: tmesh, life: 0 });
    }
    this.trailIdx = 0; this.trailT = 0;
    this.spawnSpin = 0;
    this.q = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
  }

  BallView.prototype.setRadius = function (r) {
    this.R = r;
    this.mesh.scale.setScalar(r);
    this.outline.scale.setScalar(r * 1.09);
  };

  /* state: {x,y,z,vx,vy,vz,state,holderTeam} ; teamCss array */
  BallView.prototype.update = function (dt, s, teamCss, groundH) {
    var visible = s.state !== 'gone';
    this.group.visible = visible;
    this.marker.visible = visible && s.state !== 'held';
    this.blob.visible = visible;
    this.line.visible = visible && s.state !== 'held' && s.y > 2.6;
    if (!visible) { for (var k = 0; k < this.trail.length; k++) this.trail[k].m.visible = false; return; }
    this.group.position.set(s.x, s.y, s.z);
    // spin
    var sp = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
    if (s.state === 'spawn') {
      this.spawnSpin += dt * 2;
      this.mesh.rotation.set(0.3, this.spawnSpin, 0);
      this.group.position.y = s.y + Math.sin(this.spawnSpin * 1.5) * 0.25;
    } else if (sp > 0.05) {
      this.axis.set(s.vz, 0, -s.vx).normalize();
      this.q.setFromAxisAngle(this.axis, sp * dt / this.R);
      this.mesh.quaternion.premultiply(this.q);
    }
    var gh = groundH(s.x, s.z);
    var hgt = s.y - gh;
    this.marker.position.set(s.x, gh + 0.05, s.z);
    var ms = 1 + Math.min(2, hgt * 0.12);
    this.marker.scale.set(ms, ms, 1);
    this.marker.material.opacity = 0.85;
    this.blob.position.set(s.x, gh + 0.03, s.z);
    var bs = Math.max(0.3, 1 - hgt * 0.06) * this.R / 0.5;
    this.blob.scale.set(bs, bs, 1);
    this.blob.material.opacity = Math.max(0.08, 0.35 - hgt * 0.02);
    if (this.line.visible) {
      var p = this.line.geometry.attributes.position;
      p.setXYZ(0, s.x, gh, s.z); p.setXYZ(1, s.x, s.y - this.R, s.z); p.needsUpdate = true;
      this.line.computeLineDistances();
      this.line.geometry.computeBoundingSphere();
    }
    var oc = s.holderTeam >= 0 ? teamCss[s.holderTeam] : '#fff3a0';
    this.outline.material.color.set(oc);
    // trail
    var speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    this.trailT -= dt;
    if (speed > 11 && s.state === 'free' && this.trailT <= 0 && BBA.Settings.data.effects) {
      this.trailT = 0.025;
      var tr = this.trail[this.trailIdx++ % this.trail.length];
      tr.life = 0.3; tr.m.visible = true; tr.m.position.set(s.x, s.y, s.z);
    }
    for (var i = 0; i < this.trail.length; i++) {
      var t = this.trail[i];
      if (t.life <= 0) { t.m.visible = false; continue; }
      t.life -= dt;
      var f = t.life / 0.3;
      t.m.scale.setScalar(this.R * (0.3 + f * 0.6));
      t.m.material.opacity = 0.35 * f;
    }
  };

  BBA.BallView = BallView;
})(this);
