/* BEAN BALL ARENA - client/js/tutorial.js
 * Short interactive tutorial: drop in, sprint, jump, dive, grab, pick up,
 * pass, tackle, shoot, dunk. Runs on the normal sim in 'practice' mode.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};

  function key(a) { return '<span class="key">' + BBA.Controls.glyph(a) + '</span>'; }

  function Tutorial(G) {
    this.G = G; this.sim = G.sim;
    this.idx = -1; this.t = 0; this.cnt = 0; this.sprintT = 0; this.shots = 0; this.giveT = 0; this.coachT = -1; this.doneT = -1;
    var s = this.sim;
    // place the coach and the dummy on the court
    var coach = s.players[1], dummy = s.players[2];
    coach.x = coach.spawnX = -6; coach.z = coach.spawnZ = -6; coach.y = 0; coach.yaw = Math.PI;
    dummy.x = dummy.spawnX = 3; dummy.z = dummy.spawnZ = -9; dummy.y = 0; dummy.yaw = Math.PI;
    var self = this;
    this.steps = [
      { text: function () { return 'Walk off your team deck and drop onto the court'; },
        sub: function () { return BBA.Controls.device === 'touch' ? 'Move with your left thumb' : 'Move with ' + (BBA.Controls.device === 'pad' ? 'the left stick' : 'WASD'); },
        check: function (p) { return !BBA.Arena.onDeck(p.x, p.z) && p.grounded && p.y < 0.6; } },
      { text: function () { return BBA.Controls.device === 'touch' ? 'Push the stick all the way to SPRINT' : 'Hold ' + key('sprint') + ' while moving to SPRINT'; },
        sub: function () { return 'Sprinting is faster but turns wider'; },
        check: function (p, dt) { if (p.sprinting && p.moveAmt > 0.5) self.sprintT += dt; return self.sprintT > 1.2; } },
      { text: function () { return 'Press ' + key('jump') + ' to JUMP (twice)'; }, sub: function () { return ''; },
        on: function (e) { if (e.t === 'jump' && e.id === 0) self.cnt++; }, check: function () { return self.cnt >= 2; } },
      { text: function () { return 'Press ' + key('dive') + ' to DIVE forward'; }, sub: function () { return 'Dive to reach loose balls, intercept passes and tackle'; },
        on: function (e) { if (e.t === 'dive' && e.id === 0) self.cnt++; }, check: function () { return self.cnt >= 1; } },
      { text: function () { return 'Walk up to the red Dummy and press ' + key('grab') + ' to GRAB'; }, sub: function () { return 'Holding a player slows you both down'; },
        on: function (e) { if (e.t === 'grab' && e.id === 0 && e.target === 2) self.cnt++; }, check: function () { return self.cnt >= 1; } },
      { text: function () { return 'Pick up the ball: run into it or press ' + key('grab'); }, sub: function () { return 'Holding the ball slows you a little'; },
        start: function () { self.placeBall(); },
        on: function (e) { if (e.t === 'catch' && e.id === 0) self.cnt++; }, check: function () { return self.cnt >= 1; } },
      { text: function () { return 'Tap ' + key('pass') + ' to PASS to Coach Tofu'; }, sub: function () { return 'Face your teammate. Hold ' + BBA.Controls.glyph('pass') + ' for an aimed pass.'; },
        start: function () { self.ensureBall(); },
        on: function (e) { if (e.t === 'catch' && e.id === 1) { self.cnt++; self.coachT = 1.0; } }, check: function () { return self.cnt >= 1; } },
      { text: function () { return 'TACKLE: ' + key('dive') + ' into the Dummy!'; }, sub: function () { return 'A strong tackle knocks the ball loose'; },
        on: function (e) { if (e.t === 'tackle' && e.id === 0 && e.target === 2 && !e.blocked) self.cnt++; }, check: function () { return self.cnt >= 1; } },
      { text: function () { return 'Hold ' + key('shoot') + ' to charge, release to SHOOT at the red hoop'; },
        sub: function () { return 'Longer charge = longer shot. The start of the arc shows your aim. Outside the arc = 3 points.'; },
        start: function () { self.ensureBall(); },
        on: function (e) { if (e.t === 'shoot' && e.id === 0) self.shots++; if (e.t === 'score' && e.team === 0 && e.kind !== 'dunk') self.cnt++; },
        check: function () { return self.cnt >= 1 || self.shots >= 5; }, giveBall: true },
      { text: function () { return 'DUNK: jump near the red hoop, then press ' + key('shoot') + ' in the air'; },
        sub: function () { return 'Bounce pads near the hoop and the launch pads on the side platforms make it easy'; },
        start: function () { self.ensureBall(); },
        on: function (e) { if (e.t === 'dunk' && e.id === 0) self.cnt++; }, check: function () { return self.cnt >= 1; }, giveBall: true }
    ];
    this.next();
  }

  Tutorial.prototype.placeBall = function () {
    var s = this.sim, p = s.players[0], b = s.ball;
    if (b.holder >= 0) s._forceRelease();
    var fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    b.state = 'free'; b.holder = -1;
    b.x = BBA.Sim.clamp(p.x + fx * 3.5, -18, 18); b.z = BBA.Sim.clamp(p.z + fz * 3.5, -26, 26); b.y = 2.5;
    b.vx = 0; b.vy = 0; b.vz = 0; b.inFlight = false; b.lastThrow = null; b.idleT = 0;
  };
  Tutorial.prototype.ensureBall = function () {
    var s = this.sim;
    if (s.ball.holder !== 0 && s.match.phase === 'play') s.giveBall(0);
  };

  Tutorial.prototype.next = function () {
    this.idx++;
    this.cnt = 0; this.t = 0; this.shots = 0; this.sprintT = 0;
    if (this.idx >= this.steps.length) { this.finish(false); return; }
    var st = this.steps[this.idx];
    if (st.start) st.start();
    this.render(this.idx > 0);
  };

  Tutorial.prototype.render = function (flash) {
    var st = this.steps[this.idx];
    if (!st) return;
    BBA.UI.tutorial(this.idx + 1, this.steps.length, st.text(), st.sub ? st.sub() : '', flash);
  };

  Tutorial.prototype.step = function (ev) {
    if (this.doneT >= 0) return;
    var s = this.sim, p = s.players[0], dt = BBA.C.TICK, st = this.steps[this.idx], i;
    if (!st) return;
    this.t += dt;
    for (i = 0; i < ev.length; i++) if (st.on) st.on(ev[i]);
    // coach passes back
    if (this.coachT >= 0) {
      this.coachT -= dt;
      if (this.coachT < 0 && s.ball.holder === 1) s._passTo(s.players[1], 0, false);
    }
    if (s.ball.holder === 1 && this.coachT < 0) this.coachT = 0.8;
    // keep the practice flowing: hand the ball back when needed
    if (st.giveBall) {
      var b = s.ball;
      if (b.holder === 0 || b.inFlight || s.match.phase !== 'play') this.giveT = 0;
      else { this.giveT += dt; if (this.giveT > 1.4) { s.giveBall(0); this.giveT = 0; } }
    }
    // keep the dummy on the court
    var d = s.players[2];
    if (d.state === 'normal' && (Math.abs(d.x - d.spawnX) > 6 || Math.abs(d.z - d.spawnZ) > 6)) { d.x = d.spawnX; d.z = d.spawnZ; d.vx = 0; d.vz = 0; }
    // refresh text on device switch
    if (((this.t * 60) | 0) % 30 === 0) this.render(false);
    if (st.check(p, dt)) {
      BBA.Audio.play('score');
      this.next();
    }
  };

  Tutorial.prototype.finish = function (skipped) {
    this.doneT = 0;
    this.G.paused = true;
    BBA.Controls.releaseLock();
    try { BBA.Settings.data.tutorialDone = true; BBA.Settings.save(); } catch (e) {}
    document.getElementById('tutorial-box').classList.add('hidden');
    BBA.UI.show('tutdone');
  };

  BBA.Tutorial = Tutorial;
})(this);
