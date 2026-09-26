/* BEAN BALL ARENA - client/js/animations.js
 * Procedural animation for bean characters: run cycles, lean, squash &
 * stretch, dive, stumble, grab, hold/charge/throw, dunk, celebrate, win/lose.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function damp(cur, target, k, dt) { return cur + (target - cur) * (1 - Math.exp(-k * dt)); }

  var Anim = {};

  Anim.create = function () {
    return {
      phase: 0, t: Math.random() * 10, squash: 0, squashV: 0, stepT: 0,
      aLx: 0, aLz: 0.25, aRx: 0, aRz: -0.25, lL: 0, lR: 0, px: 0, pz: 0, py: 0, hop: 0, spin: 0,
      lastState: 'normal', spawnPop: 1, flip: 0
    };
  };

  /* v: view data derived from the sim player (see player.js) */
  Anim.update = function (ch, v, dt) {
    var A = ch.anim; if (!A) return;
    var reduced = BBA.Settings.data.reducedMotion;
    A.t += dt;
    var t = A.t;
    var sp = v.speed;
    var tLx = 0, tLz = 0.25, tRx = 0, tRz = -0.25, tlL = 0, tlR = 0, tpx = 0, tpz = 0, hop = 0, spin = 0;
    var k = 16;

    // landing squash (spring)
    if (v.landImpact > 4) { A.squashV -= Math.min(6, v.landImpact * 0.35); }
    A.squashV += (-A.squash * 180 - A.squashV * 14) * dt;
    A.squash += A.squashV * dt;
    A.squash = clamp(A.squash, -0.35, 0.3);

    // locomotion cycle
    var moving = sp > 0.6 && v.grounded;
    if (moving) A.phase += dt * (4 + sp * 1.25);
    var amp = clamp(sp / 9, 0, 1);
    var swing = Math.sin(A.phase);
    if (moving) {
      tlL = swing * 0.95 * amp; tlR = -swing * 0.95 * amp;
      tLx = -swing * 0.8 * amp; tRx = swing * 0.8 * amp;
      hop = Math.abs(Math.cos(A.phase)) * 0.07 * amp;
      k = 22;
    } else if (v.grounded) {
      // idle breathe / sway
      tLx = Math.sin(t * 1.7) * 0.06; tRx = -tLx;
      hop = Math.sin(t * 2.2) * 0.01;
    }
    // lean into acceleration and turns
    tpx = clamp(sp / 10 * 0.22 + v.accel * 0.012, -0.25, 0.45) * (v.sprinting ? 1.35 : 1);
    tpz = clamp(-v.yawRate * 0.07 * amp, -0.35, 0.35);

    // airborne
    if (!v.grounded && v.state !== 'dive' && v.state !== 'dunk' && v.state !== 'stun') {
      if (v.vy > 0) { tLx = -2.5; tRx = -2.5; tLz = 0.5; tRz = -0.5; tlL = -0.6; tlR = 0.2; }
      else { tLx = -2.2 + Math.sin(t * 16) * 0.35; tRx = -2.2 - Math.sin(t * 16) * 0.35; tLz = 0.7; tRz = -0.7; tlL = 0.3 + Math.sin(t * 12) * 0.3; tlR = -0.3 - Math.sin(t * 12) * 0.3; }
      tpx = 0.1;
    }
    // holding the ball
    if (v.hasBall && v.state !== 'dunk') {
      tLx = -1.2; tRx = -1.2; tLz = 0.05; tRz = -0.05;
      if (v.charging) { tLx = -2.95; tRx = -2.95; tLz = 0.15; tRz = -0.15; tpx = -0.18 - v.charge * 0.12; }
      if (v.passAiming) { tLx = -1.6; tRx = -1.6; }
    }
    // just threw
    if (v.throwAnim > 0) {
      var tk = 1 - v.throwAnim / 0.32;
      if (v.throwKind === 'shot') { tLx = -2.9 + tk * 1.6; tRx = tLx; tpx = 0.25 * tk; }
      else { tLx = -1.3 - Math.sin(tk * Math.PI) * 0.6; tRx = tLx; tLz = 0.05; tRz = -0.05; tpx = 0.15; }
      k = 30;
    }
    // grabbing someone
    if (v.grabbing) { tLx = -1.55; tRx = -1.55; tLz = 0.12; tRz = -0.12; tpx = 0.2; }
    if (v.grabbed) { tpz = Math.sin(t * 15) * 0.25; tLx = -1.8 + Math.sin(t * 20) * 0.6; tRx = -1.8 - Math.sin(t * 20) * 0.6; tLz = 0.9; tRz = -0.9; }
    // dive / slide / recover
    if (v.state === 'dive' || v.state === 'slide') {
      tpx = 1.38; tLx = -2.9; tRx = -2.9; tLz = 0.25; tRz = -0.25; tlL = 0.35; tlR = 0.35; k = 20;
      if (v.hasBall) { tLx = -3.0; tRx = -3.0; tLz = 0.05; tRz = -0.05; }
      if (v.state === 'slide') { tpz = Math.sin(t * 30) * 0.05; }
    } else if (v.state === 'recover') {
      tpx = 0.6; k = 14;
    }
    // stun / stumble
    if (v.state === 'stun') {
      tpx = -0.35 + Math.sin(t * 9) * 0.2;
      tpz = Math.sin(t * 17) * 0.45;
      tLx = -1.5 + Math.sin(t * 22) * 1.2; tRx = -1.5 - Math.sin(t * 22) * 1.2; tLz = 1.3; tRz = -1.3;
      tlL = Math.sin(t * 18) * 0.7; tlR = -tlL;
      k = 18;
    }
    // dunk
    if (v.state === 'dunk') {
      var dt2 = v.dunkT;
      if (dt2 < 0.2) { tLx = -3.1; tRx = -3.1; tLz = 0.1; tRz = -0.1; tpx = -0.3; tlL = -0.7; tlR = -0.7; }
      else { tLx = -0.9; tRx = -0.9; tpx = 0.55; tlL = 0.4; tlR = 0.4; }
      k = 35;
    }
    // hard impacts: wobble
    if (v.wobble > 0.05 && !reduced) { tpz += Math.sin(t * 26) * v.wobble * 0.22; }

    // celebrations
    if (v.celebrateT > 0 && v.grounded && v.state === 'normal' && !v.hasBall) {
      var style = v.celebration || 'hop';
      if (style === 'hop') { hop = Math.abs(Math.sin(t * 9)) * 0.35; tLx = -2.9; tRx = -2.9; tLz = 0.6; tRz = -0.6; }
      else if (style === 'spin') { spin = (1.4 - v.celebrateT) * 9; tLz = 1.4; tRz = -1.4; tLx = 0; tRx = 0; }
      else if (style === 'flex') { tLz = 1.5; tRz = -1.5; tLx = -0.6 + Math.sin(t * 8) * 0.2; tRx = tLx; tpx = -0.1; }
      else if (style === 'wave') { tLx = -3.0; tLz = 0.4 + Math.sin(t * 14) * 0.5; tRx = 0; }
    }
    // match over
    if (v.ended === 'win' && v.grounded && v.state === 'normal') {
      var vs = v.victory || 'backflip', cyc = (t % 1.6);
      if (vs === 'backflip') {
        if (cyc < 0.7) { hop = Math.sin(cyc / 0.7 * Math.PI) * 1.2; A.flip = -cyc / 0.7 * Math.PI * 2; }
        else { A.flip = 0; hop = 0; }
        tLx = -2.8; tRx = -2.8; tLz = 0.5; tRz = -0.5;
      } else if (vs === 'bounce') { hop = Math.abs(Math.sin(t * 7)) * 0.6; tLx = -2.9; tRx = -2.9; tLz = 0.8 + Math.sin(t * 7) * 0.4; tRz = -tLz; }
      else { tpz = Math.sin(t * 8) * 0.3; hop = Math.abs(Math.sin(t * 8)) * 0.12; tLx = -1.5 + Math.sin(t * 8) * 1.2; tRx = -1.5 - Math.sin(t * 8) * 1.2; tLz = 0.6; tRz = -0.6; }
    } else if (v.ended === 'lose' && v.grounded) {
      tpx = 0.4; tLx = 0.15; tRx = 0.15; tLz = 0.08; tRz = -0.08; hop = -0.05; k = 4;
      A.flip = 0;
    } else { A.flip = damp(A.flip, 0, 10, dt); }

    // apply smoothing
    A.aLx = damp(A.aLx, tLx, k, dt); A.aRx = damp(A.aRx, tRx, k, dt);
    A.aLz = damp(A.aLz, tLz, k, dt); A.aRz = damp(A.aRz, tRz, k, dt);
    A.lL = damp(A.lL, tlL, k, dt); A.lR = damp(A.lR, tlR, k, dt);
    A.px = damp(A.px, tpx, v.state === 'dive' ? 14 : 9, dt);
    A.pz = damp(A.pz, tpz, 10, dt);
    A.hop = damp(A.hop, hop, 20, dt);
    if (spin) A.spin = spin; else A.spin = damp(A.spin, Math.round(A.spin / (Math.PI * 2)) * Math.PI * 2, 8, dt);

    ch.armL.rotation.x = A.aLx; ch.armL.rotation.z = A.aLz;
    ch.armR.rotation.x = A.aRx; ch.armR.rotation.z = A.aRz;
    ch.legL.rotation.x = A.lL; ch.legR.rotation.x = A.lR;
    ch.pivot.rotation.x = A.px + A.flip;
    ch.pivot.rotation.z = A.pz;
    ch.pivot.rotation.y = A.spin;
    ch.pivot.position.y = 0.85 + A.hop;
    var sq = reduced ? A.squash * 0.4 : A.squash;
    var s = A.spawnPop;
    if (s < 1) { A.spawnPop = Math.min(1, s + dt * 3); }
    var pop = A.spawnPop < 1 ? (1 - Math.pow(1 - A.spawnPop, 3)) * (1 + Math.sin(A.spawnPop * Math.PI) * 0.2) : 1;
    ch.body.scale.set((1 - sq * 0.55) * pop, (1 + sq) * pop, (1 - sq * 0.55) * pop);

    // accessories
    if (ch.propeller) ch.propeller.rotation.y += dt * (6 + sp * 3);
    // positive = swing backward, away from the body (never into it)
    if (ch.cape) ch.cape.rotation.x = damp(ch.cape.rotation.x, 0.2 + clamp(sp / 10, 0, 1) * 0.9 + (v.grounded ? 0 : 0.3) + Math.sin(t * 9) * 0.05, 8, dt);
    if (ch.antenna) ch.antenna.position.x = Math.sin(t * 6) * 0.03 * (1 + sp * 0.2);

    // footstep hook
    if (moving) {
      A.stepT += dt * (4 + sp * 1.25);
      if (A.stepT > Math.PI) { A.stepT -= Math.PI; if (v.onStep) v.onStep(); }
    }
  };

  BBA.Anim = Anim;
})(this);
