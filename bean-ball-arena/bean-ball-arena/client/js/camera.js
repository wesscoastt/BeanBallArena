/* BEAN BALL ARENA - client/js/camera.js
 * Third-person follow camera: orbit input, sprint/speed pull-back, aim
 * zoom, ball camera, gentle auto-follow for pad/touch, geometry avoidance,
 * trauma-based screen shake. Also menu orbit + end-of-match framing.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;
  var A = BBA.Arena;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function damp(k, dt) { return 1 - Math.exp(-k * dt); }

  function CameraRig(camera) {
    this.cam = camera;
    this.yaw = 0; this.pitch = 0.3;
    this.dist = 7.5;
    this.tgt = new THREE.Vector3(0, 2, 0);
    this.pos = new THREE.Vector3(0, 6, -8);
    this.trauma = 0;
    this.fov = 64;
    this.ballCamT = 0;
    this.idleLook = 0;
    this.mode = 'follow';
    this.orbitA = 0;
    this.shoulder = 0;
    this.snapped = false;
  }

  CameraRig.prototype.addTrauma = function (t) {
    if (!BBA.Settings.data.screenShake || BBA.Settings.data.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + t);
  };

  CameraRig.prototype.snapBehind = function (yaw, focus) {
    this.yaw = yaw; this.pitch = 0.32;
    if (focus) { this.tgt.set(focus.x, focus.y + 1.6, focus.z); }
    this.snapped = true;
  };

  CameraRig.prototype.lookAtYawPitch = function (fromX, fromY, fromZ, toX, toY, toZ) {
    var dx = toX - fromX, dz = toZ - fromZ, dy = toY - fromY;
    return { yaw: Math.atan2(dx, dz), pitch: clamp(-Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) + 0.35, -0.15, 0.9) };
  };

  /* f: focus {x,y,z,vx,vz,speed,sprinting,aiming,hasBall}, ctl: control state, ball: {x,y,z,visible} */
  CameraRig.prototype.update = function (dt, f, ctl, ball) {
    var S = BBA.Settings.data;
    if (this.mode === 'orbit') return this._orbit(dt, ball);
    if (this.mode === 'end') return this._end(dt, f);

    var lookX = ctl ? ctl.lookX : 0, lookY = ctl ? ctl.lookY : 0;
    this.yaw = wrap(this.yaw - lookX);
    this.pitch = clamp(this.pitch + lookY, -0.3, 1.15);
    if (Math.abs(lookX) + Math.abs(lookY) > 0.0005) this.idleLook = 0; else this.idleLook += dt;

    // ball camera
    if (ctl && ctl.ballcamPress) this.ballCamT = 0.35;
    var tracking = (ctl && ctl.held.ballcam) || this.ballCamT > 0;
    if (tracking && ball && ball.visible) {
      this.ballCamT -= dt;
      var lp = this.lookAtYawPitch(f.x, f.y + 1.6, f.z, ball.x, ball.y, ball.z);
      var k = damp(this.ballCamT > 0 ? 14 : 8, dt);
      this.yaw = wrap(this.yaw + wrap(lp.yaw - this.yaw) * k);
      this.pitch += (lp.pitch - this.pitch) * k;
      this.idleLook = 0;
    }

    // gentle auto-follow behind movement for pad / touch players
    var device = ctl ? ctl.device : 'kbm';
    if (S.autoCam && device !== 'kbm' && this.idleLook > 0.9 && f.speed > 3 && !f.aiming) {
      var hy = Math.atan2(f.vx, f.vz);
      var d = wrap(hy - this.yaw);
      if (Math.abs(d) < 2.3) this.yaw = wrap(this.yaw + d * Math.min(1, dt * 1.1 * Math.min(1, f.speed / 9)));
      this.pitch += (0.3 - this.pitch) * damp(1.5, dt);
    }

    // distance / fov
    var wantDist = 7.3 + Math.min(1.6, f.speed * 0.1) + (f.sprinting ? 0.8 : 0) + (f.hasBall ? 0.3 : 0);
    var wantShoulder = 0, wantFov = 64 + (f.sprinting ? 7 : 0) + Math.min(4, f.speed * 0.3);
    if (f.aiming) { wantDist = 5.2; wantShoulder = 0.9; wantFov = 58; }
    if (f.airborne) wantDist += 0.6;
    this.dist += (wantDist - this.dist) * damp(4, dt);
    this.shoulder += (wantShoulder - this.shoulder) * damp(8, dt);
    this.fov += (wantFov - this.fov) * damp(4, dt);

    // target smoothing (less vertical jitter on jumps)
    var ty = f.y + 1.55 + (f.aiming ? 0.3 : 0);
    if (this.snapped) { this.tgt.set(f.x, ty, f.z); this.snapped = false; }
    this.tgt.x += (f.x - this.tgt.x) * damp(16, dt);
    this.tgt.z += (f.z - this.tgt.z) * damp(16, dt);
    this.tgt.y += (ty - this.tgt.y) * damp(f.airborne ? 5 : 10, dt);

    this._place(dt);
  };

  CameraRig.prototype._place = function (dt) {
    var fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    var rx = -fz, rz = fx; // screen-right
    var cp = Math.cos(this.pitch), spt = Math.sin(this.pitch);
    var tx = this.tgt.x + rx * this.shoulder, tz = this.tgt.z + rz * this.shoulder, ty = this.tgt.y;
    var dist = this.dist;
    // avoid geometry: march from target toward the camera
    var steps = 14, i, best = dist;
    for (i = 1; i <= steps; i++) {
      var dd = dist * i / steps;
      var px = tx - fx * cp * dd, pz = tz - fz * cp * dd, py = ty + spt * dd;
      var gh = A.groundHeight(px, pz);
      if (py < gh + 0.45) { best = Math.max(1.4, dd - dist / steps); break; }
    }
    dist = best;
    var cx = tx - fx * cp * dist, cz = tz - fz * cp * dist, cy = ty + spt * dist;
    // stay inside the stadium glass
    var W = A.halfW + 3, L = A.halfL + 2;
    cx = clamp(cx, -W, W); cz = clamp(cz, -L, L);
    var g2 = A.groundHeight(cx, cz);
    if (cy < g2 + 0.5) cy = g2 + 0.5;
    this.pos.set(cx, cy, cz);
    this.cam.position.copy(this.pos);
    // shake
    if (this.trauma > 0) {
      var s = this.trauma * this.trauma * 0.45, t = performance.now() * 0.05;
      this.cam.position.x += Math.sin(t * 1.3) * s; this.cam.position.y += Math.sin(t * 1.7 + 1) * s; this.cam.position.z += Math.sin(t * 1.1 + 2) * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    this.cam.fov = this.fov;
    this.cam.updateProjectionMatrix();
    this.cam.lookAt(tx + fx * 2, ty - 0.2 + (this.pitch < 0 ? -this.pitch * 2 : 0), tz + fz * 2);
  };

  CameraRig.prototype._orbit = function (dt, ball) {
    this.orbitA += dt * 0.06;
    var bx = ball && ball.visible ? ball.x : 0, bz = ball && ball.visible ? ball.z : 0;
    this.tgt.x += (bx * 0.6 - this.tgt.x) * damp(0.8, dt);
    this.tgt.z += (bz * 0.6 - this.tgt.z) * damp(0.8, dt);
    this.tgt.y = 2;
    var r = 34;
    this.cam.position.set(this.tgt.x + Math.sin(this.orbitA) * r, 17, this.tgt.z + Math.cos(this.orbitA) * r * 1.2);
    this.cam.fov = 55; this.cam.updateProjectionMatrix();
    this.cam.lookAt(this.tgt.x, 2, this.tgt.z);
  };

  CameraRig.prototype._end = function (dt, f) {
    // frame a point (winning team centroid) from the front
    this.orbitA += dt * 0.25;
    var r = 9;
    var px = f.x + Math.sin(this.orbitA) * r, pz = f.z + Math.cos(this.orbitA) * r;
    this.pos.x += (px - this.pos.x) * damp(3, dt);
    this.pos.z += (pz - this.pos.z) * damp(3, dt);
    this.pos.y += (f.y + 4 - this.pos.y) * damp(3, dt);
    this.cam.position.copy(this.pos);
    this.cam.fov = 55; this.cam.updateProjectionMatrix();
    this.cam.lookAt(f.x, f.y + 1.2, f.z);
  };

  BBA.CameraRig = CameraRig;
})(this);
