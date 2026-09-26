/* BEAN BALL ARENA - shared/sim.js
 * The authoritative game simulation. No rendering, no DOM, no Three.js.
 * Offline: runs in the browser. Online (milestone 2): the Node server runs
 * this exact file and clients only send inputs.
 *
 * Deterministic given the same inputs + seed (own RNG, fixed timestep).
 *
 * Input per player per tick:
 *   { mx, mz, look, jump, sprint, dive, grab, pass, shoot, aim }
 *   mx/mz: desired world-space move (length 0..1), look: camera yaw (radians)
 *   yaw convention: direction = (sin yaw, cos yaw); yaw 0 faces +z.
 */
(function (root, factory) {
  var isNode = (typeof module === 'object' && module.exports);
  var deps = isNode
    ? [require('./constants.js'), require('./gameRules.js'), require('./arenaDef.js')]
    : [root.BBA.C, root.BBA.Rules, root.BBA.Arenas];
  var mod = factory(deps[0], deps[1], deps[2]);
  if (isNode) { module.exports = mod; } else { root.BBA.Sim = mod; }
})(this, function (C, Rules, Arenas) {
  var P = C.PLAYER, B = C.BALL, SH = C.SHOT, DK = C.DUNK;
  var BTN = C.BUTTONS;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function emptyInput() {
    return { mx: 0, mz: 0, look: 0, jump: false, sprint: false, dive: false, grab: false, pass: false, shoot: false, aim: false };
  }

  function Sim(opts) {
    opts = opts || {};
    this.settings = Rules.merge(Rules.DEFAULTS, opts.settings);
    this.mode = opts.mode || 'match';      // 'match' | 'practice' | 'attract'
    this.rng = mulberry32((opts.seed || 12345) >>> 0);
    this.time = 0;
    this.tick = 0;
    this.players = [];
    this.events = [];
    this.arena = Arenas.get(this.settings.arena);
    this.hoops = this.arena.hoops;
    this.ball = this._newBall();
    this.match = {
      phase: 'countdown', phaseT: 0, countdown: opts.countdown === undefined ? 3 : opts.countdown,
      clock: this.settings.duration, score: [0, 0], overtime: false, winner: -1,
      lastScore: null, final30: false, lastSec: -1, stats: []
    };
    if (this.mode !== 'match') this.match.clock = 0;
    var roster = opts.roster || [];
    var counts = [0, 0], i;
    for (i = 0; i < roster.length; i++) {
      var r = roster[i];
      var slot = counts[r.team]++;
      this.players.push(this._newPlayer(i, r, slot));
    }
    this._applyModifier();
    this._placeBallSpawn(true);
    // Warm-up: run around the court with the ball before the real match (Crown Jam style)
    this.warmup = opts.warmup || 0;           // seconds, Infinity = free practice
    this.warmupReady = {};
    this.warmBallT = 0;
    if (this.warmup > 0) {
      this.match.phase = 'warmup';
      this._warmupPositions();
      this._dropBall();
    }
  }

  Sim.prototype._warmupPositions = function () {
    var counts = [0, 0];
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i], k = counts[p.team]++;
      var side = p.team === 0 ? -1 : 1;
      var ws = this.arena.warmSpots(p.team, k);
      p.x = ws.x; p.z = ws.z; p.y = this.arena.groundHeight(p.x, p.z);
      p.vx = 0; p.vy = 0; p.vz = 0; p.grounded = true;
      p.yaw = p.team === 0 ? 0 : Math.PI;
    }
  };

  Sim.prototype.setWarmupReady = function (pid, ready) {
    if (this.match.phase !== 'warmup' || !this.players[pid]) return;
    if (ready === false) delete this.warmupReady[pid]; else this.warmupReady[pid] = true;
    this.emit({ t: 'warmupReady', id: pid, ready: ready !== false });
  };

  Sim.prototype.warmupReadyCount = function () {
    var humans = 0, ready = 0;
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].isBot) continue;
      humans++; if (this.warmupReady[i]) ready++;
    }
    return { humans: humans, ready: ready };
  };

  /* Send everyone back to their team deck and hover the ball at center. */
  Sim.prototype._resetToDecks = function (resetStats) {
    var i;
    this._forceRelease();
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.grabTarget >= 0) this._releaseGrab(p);
    }
    for (i = 0; i < this.players.length; i++) {
      var q = this.players[i];
      q.x = q.spawnX; q.z = q.spawnZ; q.y = this.arena.groundHeight(q.x, q.z);
      q.vx = 0; q.vy = 0; q.vz = 0; q.grounded = true; q.hidden = false; q.respawnT = 0;
      q.state = 'normal'; q.stateT = 0; q.dunk = null; q.charging = false; q.passHeld = false; q.passAim = -1;
      q.grabbedBy = -1; q.grabTarget = -1; q.callT = 0; q.launchT = 0; q.stunImmune = 0; q.wobble = 0;
      q.diveCd = 0; q.grabCd = 0; q.throwAnim = 0;
      q.yaw = q.team === 0 ? 0 : Math.PI;
      if (resetStats) {
        q.celebrateT = 0;
        q.stats = { pts: 0, dunks: 0, shots: 0, made: 0, passes: 0, steals: 0, tackles: 0, intercepts: 0, assists: 0 };
      }
    }
    this._placeBallSpawn(true);
  };

  Sim.prototype._endWarmup = function () {
    var m = this.match;
    this._resetToDecks(true);
    this.warmBallT = 0;
    m.phase = 'countdown'; m.phaseT = 0; m.lastSec = -1;
    this.emit({ t: 'warmupEnd' });
  };

  /* After a score: back to the decks and a short countdown, like the opening drop. */
  Sim.prototype._kickoff = function () {
    var m = this.match;
    this._resetToDecks(false);
    m.phase = 'countdown'; m.phaseT = 0; m.lastSec = -1;
    m.countdown = C.KICKOFF.countdown;
    this.emit({ t: 'kickoff' });
  };

  /* Team currently ahead by the mercy margin, or -1. */
  Sim.prototype.mercyWinner = function () {
    var lead = this.settings.mercyLead, sc = this.match.score;
    if (!(lead > 0) || this.mode !== 'match') return -1;
    if (sc[0] - sc[1] >= lead) return 0;
    if (sc[1] - sc[0] >= lead) return 1;
    return -1;
  };

  Sim.emptyInput = emptyInput;
  Sim.clamp = clamp;
  Sim.lerp = lerp;
  Sim.wrapAngle = wrapAngle;

  Sim.prototype._applyModifier = function () {
    var s = this.settings;
    this.physMul = { gravity: s.gravity, jump: s.jumpHeight, speed: 1, ballG: s.ballWeight, ballR: 1 };
    if (s.modifier === 'superbounce') this.physMul.jump = 1.6;
    if (s.modifier === 'lowgravity') this.physMul.gravity = 0.55;
    if (s.modifier === 'heavyball') this.physMul.ballG = 1.45;
    if (s.modifier === 'megaball') this.physMul.ballR = 1.8;
    if (s.modifier === 'turbo') this.physMul.speed = 1.3;
    this.ballRadius = B.radius * this.physMul.ballR;
    var ag = this.arena ? this.arena.gravity : 1;
    this.gPlayer = P.gravity * this.physMul.gravity * ag;
    this.gBall = B.gravity * this.physMul.gravity * this.physMul.ballG * ag;
  };

  Sim.prototype._newBall = function () {
    return {
      x: 0, y: 7, z: 0, vx: 0, vy: 0, vz: 0,
      state: 'spawn', holder: -1, prevY: 7,
      lastThrow: null, ignoreId: -1, ignoreT: 0, passTarget: -1,
      inFlight: false, lastTouchTeam: -1, lastPasser: -1, lastPassT: -99,
      idleT: 0, restT: 0, grounded: false, spawnT: 0, hitT: 0
    };
  };

  Sim.prototype._newPlayer = function (id, info, slot) {
    var sp = this.arena.spawns[info.team][slot % this.arena.spawns[info.team].length];
    var p = {
      id: id, team: info.team, name: info.name || ('Player ' + (id + 1)), isBot: !!info.isBot,
      slot: slot, x: sp.x, y: this.arena.groundHeight(sp.x, sp.z), z: sp.z, vx: 0, vy: 0, vz: 0,
      yaw: info.team === 0 ? 0 : Math.PI, grounded: true,
      state: 'normal', stateT: 0,
      coyote: 0, jumpBuf: 0, diveCd: 0, grabCd: 0,
      grabTarget: -1, grabbedBy: -1, grabT: 0, grabImmune: 0, stunImmune: 0,
      charging: false, charge: 0, chargeBtn: '', passHeld: false, passT: 0, passAim: -1,
      callT: 0, catchCd: 0, padCd: 0, launchT: 0, tackled: false,
      airT: 0, landImpact: 0, sprinting: false, wobble: 0,
      respawnT: 0, hidden: false, dunk: null, throwAnim: 0, throwKind: '',
      celebrateT: 0, moveAmt: 0, stuckT: 0,
      prev: emptyInput(), input: emptyInput(),
      stats: { pts: 0, dunks: 0, shots: 0, made: 0, passes: 0, steals: 0, tackles: 0, intercepts: 0, assists: 0 }
    };
    p.spawnX = p.x; p.spawnZ = p.z;
    return p;
  };

  Sim.prototype.emit = function (e) { e.time = this.time; this.events.push(e); };

  Sim.prototype.attackHoop = function (team) { return this.hoops[1 - team]; };
  Sim.prototype.ownHoop = function (team) { return this.hoops[team]; };

  Sim.prototype.player = function (id) { return (id >= 0 && id < this.players.length) ? this.players[id] : null; };

  /* ------------------------------------------------------------------ */
  /*  MAIN STEP                                                          */
  /* ------------------------------------------------------------------ */
  Sim.prototype.step = function (inputs, dt) {
    dt = dt || C.TICK;
    this.events.length = 0;
    var i, p, m = this.match;

    this._stepMatch(dt);

    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      var inp = (inputs && inputs[p.id]) || emptyInput();
      p.input = inp;
      this._stepPlayer(p, inp, dt);
    }
    this._playerContacts(dt);
    this._stepGrabs(dt);
    this._stepBall(dt);
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      var src = p.input;
      var pv = p.prev;
      for (var k = 0; k < BTN.length; k++) pv[BTN[k]] = !!src[BTN[k]];
    }
    this.time += dt;
    this.tick++;
    return this.events;
  };

  /* ------------------------------------------------------------------ */
  /*  MATCH FLOW                                                         */
  /* ------------------------------------------------------------------ */
  Sim.prototype._stepMatch = function (dt) {
    var m = this.match, b = this.ball;
    m.phaseT += dt;
    if (m.phase === 'warmup') {
      if (this.warmBallT > 0) { this.warmBallT -= dt; if (this.warmBallT <= 0) this._dropBall(); }
      var rc = this.warmupReadyCount();
      if (this.mode === 'match' && (m.phaseT >= this.warmup || (rc.humans > 0 && rc.ready >= rc.humans))) this._endWarmup();
      return;
    }
    if (m.phase === 'countdown') {
      var sec = Math.ceil(m.countdown - m.phaseT);
      if (sec !== m.lastSec && sec > 0) { m.lastSec = sec; this.emit({ t: 'countdown', n: sec }); }
      if (m.phaseT >= m.countdown) {
        m.phase = 'play'; m.phaseT = 0; m.lastSec = -1;
        this.emit({ t: 'go' });
        this._dropBall();
      }
      return;
    }
    if (m.phase === 'play') {
      if (this.mode === 'match' && !m.overtime) {
        var before = m.clock;
        m.clock -= dt;
        if (before > 30 && m.clock <= 30 && this.settings.duration > 45) { this.emit({ t: 'final30' }); }
        var s = Math.ceil(m.clock);
        if (m.clock <= 10.0001 && s !== m.lastSec && s > 0) { m.lastSec = s; this.emit({ t: 'tick', n: s }); }
        if (m.clock <= 0) {
          m.clock = 0;
          // Buzzer beater: a shot in the air or a dunk in progress still counts
          var dunking = false, i;
          for (i = 0; i < this.players.length; i++) { if (this.players[i].state === 'dunk') dunking = true; }
          this.emit({ t: 'buzzer' });
          if (dunking || (b.state === 'free' && b.inFlight && b.lastThrow && b.lastThrow.kind === 'shot')) {
            m.phase = 'buzzer'; m.phaseT = 0;
          } else {
            this._resolveEnd();
          }
        }
      }
      return;
    }
    if (m.phase === 'buzzer') {
      var stillLive = false, j;
      for (j = 0; j < this.players.length; j++) { if (this.players[j].state === 'dunk') stillLive = true; }
      if (b.state === 'free' && b.inFlight) stillLive = true;
      if (!stillLive || m.phaseT > 3.5) this._resolveEnd();
      return;
    }
    if (m.phase === 'scored') {
      if (b.state !== 'gone' && m.phaseT >= C.SCORE.ballHide) {
        b.state = 'gone'; b.holder = -1;
        this.emit({ t: 'ballGone' });
      }
      if (m.phaseT >= C.SCORE.celebrate) {
        var lim = this.settings.scoreLimit, mw = this.mercyWinner();
        if (mw >= 0) {
          this._endMatch(mw, 'mercy');
        } else if (this.mode === 'match' && (m.overtime || (lim > 0 && (m.score[0] >= lim || m.score[1] >= lim)))) {
          this._endMatch(m.score[0] > m.score[1] ? 0 : (m.score[1] > m.score[0] ? 1 : -1));
        } else if (this.mode === 'match' && m.clock <= 0) {
          this._resolveEnd();
        } else if (this.mode === 'match' && this.settings.kickoffReset) {
          this._kickoff();
        } else {
          m.phase = 'play'; m.phaseT = 0;
          this._dropBall();
        }
      }
      return;
    }
  };

  Sim.prototype._resolveEnd = function () {
    var m = this.match;
    if (m.score[0] !== m.score[1]) { this._endMatch(m.score[0] > m.score[1] ? 0 : 1); return; }
    if (this.settings.overtime) {
      m.overtime = true; m.phase = 'play'; m.phaseT = 0;
      this.emit({ t: 'overtime' });
      if (this.ball.state === 'gone' || this.ball.state === 'spawn') this._dropBall();
    } else {
      this._endMatch(-1);
    }
  };

  Sim.prototype._endMatch = function (winner, reason) {
    var m = this.match;
    m.phase = 'ended'; m.phaseT = 0; m.winner = winner; m.endReason = reason || '';
    this._forceRelease();
    var i;
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.charging = false; p.passHeld = false;
      if (p.grabTarget >= 0) this._releaseGrab(p);
    }
    this.emit({ t: 'end', winner: winner, score: [m.score[0], m.score[1]], reason: m.endReason });
  };

  Sim.prototype._forceRelease = function () {
    var b = this.ball;
    if (b.holder >= 0) {
      var h = this.players[b.holder];
      b.holder = -1; b.state = 'free';
      b.vx = h ? h.vx : 0; b.vy = 3; b.vz = h ? h.vz : 0;
    }
  };

  Sim.prototype._placeBallSpawn = function (hover) {
    var b = this.ball, s = this.arena.ballSpawn;
    b.x = s.x; b.y = s.y; b.z = s.z; b.vx = 0; b.vy = 0; b.vz = 0;
    b.prevY = b.y; b.holder = -1; b.state = hover ? 'spawn' : 'free';
    b.lastThrow = null; b.passTarget = -1; b.inFlight = false; b.idleT = 0; b.restT = 0;
    b.lastPasser = -1; b.lastTouchTeam = -1; b.ignoreId = -1; b.ignoreT = 0;
  };

  Sim.prototype._dropBall = function () {
    this._placeBallSpawn(false);
    var b = this.ball;
    b.vx = (this.rng() - 0.5) * 2.0;
    b.vz = (this.rng() - 0.5) * 1.0;
    b.vy = 1;
    this.emit({ t: 'ballSpawn' });
  };

  Sim.prototype.resetBall = function (reason) {
    this._forceRelease();
    this._dropBall();
    this.emit({ t: 'ballReset', reason: reason || '' });
  };

  /* Practice helpers */
  Sim.prototype.giveBall = function (pid) {
    var b = this.ball, p = this.players[pid];
    if (!p) return;
    if (b.holder >= 0 && b.holder !== pid) this._forceRelease();
    b.state = 'held'; b.holder = pid; b.lastThrow = null; b.inFlight = false;
    this._attachBall();
  };

  Sim.prototype.playActive = function () {
    var ph = this.match.phase;
    return ph === 'play' || ph === 'scored' || ph === 'buzzer';
  };

  /* ------------------------------------------------------------------ */
  /*  PLAYER                                                             */
  /* ------------------------------------------------------------------ */
  Sim.prototype.holdPos = function (p, out) {
    out = out || {};
    var fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    var f = 0.62, h = 1.05;
    if (p.state === 'dunk') { f = 0.45; h = 2.25; }
    else if (p.charging) { f = 0.25; h = 2.05; }
    else if (p.state === 'dive' || p.state === 'slide') { f = 1.0; h = 0.75; }
    else if (p.state === 'stun') { f = 0.5; h = 0.9; }
    var rr = this.ballRadius / B.radius;
    out.x = p.x + fx * f * (0.6 + 0.4 * rr);
    out.y = p.y + h + (rr - 1) * 0.4;
    out.z = p.z + fz * f * (0.6 + 0.4 * rr);
    return out;
  };

  Sim.prototype.canAct = function (p) {
    if (p.hidden) return false;
    if (p.state !== 'normal' && p.state !== 'recover') return false;
    var ph = this.match.phase;
    return ph === 'play' || ph === 'scored' || ph === 'buzzer' || ph === 'warmup';
  };

  Sim.prototype.canCatch = function (p) {
    if (p.hidden || p.catchCd > 0) return false;
    if (p.state === 'stun' || p.state === 'dunk') return false;
    if (p.grabTarget >= 0) return false;
    var ph = this.match.phase;
    return ph === 'play' || ph === 'buzzer' || (ph === 'warmup' && this.warmBallT <= 0);
  };

  Sim.prototype._supportHeight = function (x, z) {
    var g = this.arena.groundHeight, r = P.radius * 0.35;
    var h = g(x, z), t;
    t = g(x + r, z); if (t > h) h = t;
    t = g(x - r, z); if (t > h) h = t;
    t = g(x, z + r); if (t > h) h = t;
    t = g(x, z - r); if (t > h) h = t;
    return h;
  };

  Sim.prototype._blocked = function (x, z, y, sx, sz, grounded) {
    var g = this.arena.groundHeight, r = P.radius, lim = y + (grounded ? P.stepUp : 0.15);
    if (sx !== 0) {
      var ex = x + sx * r;
      if (g(ex, z) > lim || g(x + sx * r * 0.7, z + r * 0.7) > lim || g(x + sx * r * 0.7, z - r * 0.7) > lim) return true;
    }
    if (sz !== 0) {
      var ez = z + sz * r;
      if (g(x, ez) > lim || g(x + r * 0.7, z + sz * r * 0.7) > lim || g(x - r * 0.7, z + sz * r * 0.7) > lim) return true;
    }
    return false;
  };

  Sim.prototype._stepPlayer = function (p, inp, dt) {
    var m = this.match, b = this.ball;
    var pressed = function (k) { return !!inp[k] && !p.prev[k]; };
    var released = function (k) { return !inp[k] && !!p.prev[k]; };

    // timers
    if (p.diveCd > 0) p.diveCd -= dt;
    if (p.grabCd > 0) p.grabCd -= dt;
    if (p.grabImmune > 0) p.grabImmune -= dt;
    if (p.stunImmune > 0) p.stunImmune -= dt;
    if (p.callT > 0) p.callT -= dt;
    if (p.catchCd > 0) p.catchCd -= dt;
    if (p.padCd > 0) p.padCd -= dt;
    if (p.launchT > 0) p.launchT -= dt;
    if (p.throwAnim > 0) p.throwAnim -= dt;
    if (p.celebrateT > 0) p.celebrateT -= dt;
    if (p.jumpBuf > 0) p.jumpBuf -= dt;
    if (p.coyote > 0) p.coyote -= dt;
    p.wobble *= Math.max(0, 1 - dt * 3);
    p.landImpact = 0;

    // respawn
    if (p.hidden) {
      p.respawnT -= dt;
      if (p.respawnT <= 0 && !this.predictOnly) this._respawn(p);
      return;
    }

    var frozen = (m.phase === 'countdown');
    if (frozen) { inp = emptyInput(); inp.look = p.yaw; }
    var ended = (m.phase === 'ended');
    var hasBall = (b.holder === p.id);

    // state timers
    if (p.state === 'stun') {
      p.stateT -= dt;
      if (p.stateT <= 0) { p.state = 'recover'; p.stateT = P.recoverTime; }
    } else if (p.state === 'slide') {
      p.stateT -= dt;
      if (p.stateT <= 0) { p.state = 'recover'; p.stateT = P.recoverTime; }
    } else if (p.state === 'recover') {
      p.stateT -= dt;
      if (p.stateT <= 0) { p.state = 'normal'; }
    }

    var act = this.canAct(p) && !frozen;
    var actEnded = !frozen && !p.hidden && (p.state === 'normal' || p.state === 'recover');

    // lose ball-related action state if we don't have the ball
    if (!hasBall) { p.charging = false; p.passHeld = false; }

    // ---- jump buffer
    if (pressed('jump')) p.jumpBuf = P.jumpBuffer;

    // ---- DUNK (contextual): shoot or jump pressed mid-air in dunk zone
    var auth = !this.predictOnly; // client-side prediction never decides ball events
    if (auth && act && hasBall && !p.grounded && (pressed('shoot') || pressed('jump') || (inp.aim && pressed('grab')))) {
      if (this.dunkEligible(p)) { this._startDunk(p); hasBall = true; }
    }
    if (auth && p.state === 'dive' && hasBall && !p.grounded && pressed('shoot') && this.dunkEligible(p)) {
      this._startDunk(p);
    }

    act = this.canAct(p) && !frozen;

    // ---- actions
    if (act) {
      // shooting
      if (hasBall && p.state !== 'dunk') {
        var shootPress = pressed('shoot') ? 'shoot' : ((inp.aim && pressed('grab')) ? 'grab' : '');
        if (shootPress && !p.charging) {
          p.charging = true; p.charge = 0; p.chargeBtn = shootPress; p.passHeld = false;
          this.emit({ t: 'charge', id: p.id });
        }
        if (p.charging) {
          p.charge = Math.min(1, p.charge + dt / SH.chargeTime);
          if (released(p.chargeBtn)) { if (auth) this._throwShot(p, p.charge, inp.look); else p.charging = false; hasBall = false; }
        }
      }
      // passing / call for pass
      if (pressed('pass')) {
        if (hasBall) {
          if (p.charging) { p.charging = false; }
          p.passHeld = true; p.passT = 0;
        } else if (p.grabTarget < 0) {
          p.callT = 1.6;
          if (auth) this.emit({ t: 'call', id: p.id });
        }
      }
      if (hasBall && p.passHeld) {
        p.passT += dt;
        if (p.passT >= 0.2) p.passAim = this.choosePassTarget(p, inp.look, 0.8, 40);
        if (released('pass')) {
          if (!auth) p.passHeld = false;
          else if (p.passT < 0.2) this._quickPass(p, inp);
          else this._aimedPass(p, inp);
          hasBall = false;
        }
      } else {
        p.passAim = -1;
      }
      // grab / pickup
      if (auth && pressed('grab') && !hasBall && p.grabTarget < 0 && p.grabbedBy < 0 && p.grabCd <= 0 && !(inp.aim && hasBall)) {
        this._tryGrab(p);
      }
      // dive
      if (pressed('dive') && p.diveCd <= 0 && p.grabbedBy < 0) {
        this._startDive(p);
      }
    } else {
      p.passAim = -1;
      if (p.state !== 'dunk') { p.charging = false; }
    }

    // ---- movement
    var S = this.settings;
    var speedMul = this.physMul.speed;
    var dirX = inp.mx || 0, dirZ = inp.mz || 0;
    var mag = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (mag > 1) { dirX /= mag; dirZ /= mag; mag = 1; }
    if (!(act || (ended && actEnded))) { dirX = 0; dirZ = 0; mag = 0; }
    if (p.state !== 'normal' && p.state !== 'recover') { dirX = 0; dirZ = 0; mag = 0; }
    p.moveAmt = mag;

    var sprint = !!inp.sprint && mag > 0.1 && !p.charging;
    p.sprinting = sprint && p.grounded;
    var maxSpeed = (sprint ? P.sprint : P.walk) * speedMul;
    if (hasBall) maxSpeed *= P.holdMul;
    if (p.charging) maxSpeed *= P.chargeMul;
    if (p.grabTarget >= 0) maxSpeed *= P.grabberMul;
    if (p.grabbedBy >= 0) maxSpeed *= P.grabbedMul;
    if (p.state === 'recover') maxSpeed *= 0.6;

    var desX = dirX * maxSpeed, desZ = dirZ * maxSpeed;
    var gravity = this.gPlayer;

    if (p.state === 'dunk') {
      this._stepDunk(p, dt);
      return;
    }

    if (p.state === 'dive') {
      // minimal steering during a dive
      p.vy -= gravity * dt;
    } else if (p.state === 'slide' || p.state === 'stun') {
      var fr = (p.state === 'slide' ? 16 : 10);
      if (p.grounded) {
        var sp0 = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
        var ns = Math.max(0, sp0 - fr * dt);
        if (sp0 > 0.0001) { p.vx *= ns / sp0; p.vz *= ns / sp0; }
      }
      p.vy -= gravity * dt;
    } else {
      var accel;
      if (p.grounded) accel = (mag > 0.05) ? (sprint ? P.accelSprint : P.accelGround) : P.friction;
      else accel = P.accelAir;
      if (p.grounded && this.arena.ice.length && this.arena.surface(p.x, p.z, this._sf || (this._sf = {})).ice) accel *= (mag > 0.05 ? 0.22 : 0.08); // slippery
      if (p.launchT > 0) accel = 2;
      if (!p.grounded && mag < 0.05) accel = 2; // keep momentum in air
      var dvx = desX - p.vx, dvz = desZ - p.vz;
      var dl = Math.sqrt(dvx * dvx + dvz * dvz);
      var maxDv = accel * dt;
      if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
      // sprinting: turning control is reduced (lateral changes are slower)
      p.vx += dvx; p.vz += dvz;
      p.vy -= gravity * dt;

      // facing
      var targetYaw = p.yaw, turn = sprint ? P.turnSprint : P.turnWalk;
      if (p.charging || p.passHeld || inp.aim) { targetYaw = inp.look; turn = P.turnAim; }
      else if (mag > 0.1) { targetYaw = Math.atan2(dirX, dirZ); }
      if (p.grabTarget >= 0) {
        var gt = this.players[p.grabTarget];
        if (gt) targetYaw = Math.atan2(gt.x - p.x, gt.z - p.z);
      }
      var dy = wrapAngle(targetYaw - p.yaw);
      var maxTurn = turn * dt;
      p.yaw = wrapAngle(p.yaw + clamp(dy, -maxTurn, maxTurn));

      // jump
      if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0) && p.grabbedBy < 0 && (act || (ended && actEnded)) && p.state !== 'recover') {
        p.vy = P.jumpVel * Math.sqrt(this.physMul.jump);
        p.grounded = false; p.coyote = 0; p.jumpBuf = 0;
        this.emit({ t: 'jump', id: p.id });
      }
    }

    // spawn-deck conveyor (only once the match is live)
    if (p.grounded && !frozen) {
      var cv = this.arena.conveyor(p.x, p.z, this._sf || (this._sf = {}));
      if (cv) { p.x += cv.x * dt; p.z += cv.z * dt; }
    }
    this._moveBody(p, dt);
    this._stepPads(p);
    this._obstacles(p, dt);

    // stuck in geometry safety
    var gh = this.arena.groundHeight(p.x, p.z);
    if (gh > p.y + 1.2) { p.y = gh; p.vy = 0; }
    if (!this.predictOnly && (p.y < -6 || p.x !== p.x || p.z !== p.z || p.y !== p.y)) this._kill(p);
  };

  Sim.prototype._moveBody = function (p, dt) {
    var r = P.radius, A = this.arena;
    var nx = p.x + p.vx * dt;
    var sx = p.vx > 0 ? 1 : (p.vx < 0 ? -1 : 0);
    if (sx !== 0 && this._blocked(nx, p.z, p.y, sx, 0, p.grounded)) { p.vx = -p.vx * 0.1; nx = p.x; }
    p.x = nx;
    var nz = p.z + p.vz * dt;
    var sz = p.vz > 0 ? 1 : (p.vz < 0 ? -1 : 0);
    if (sz !== 0 && this._blocked(p.x, nz, p.y, 0, sz, p.grounded)) { p.vz = -p.vz * 0.1; nz = p.z; }
    p.z = nz;

    // arena walls
    var lx = A.halfW - r, lz = A.halfL - r, bw = A.bounceWalls, hit = 0;
    if (p.x > lx) { p.x = lx; if (p.vx > 0) { hit = p.vx; p.vx = bw ? -p.vx * 0.9 - 2 : 0; } }
    if (p.x < -lx) { p.x = -lx; if (p.vx < 0) { hit = -p.vx; p.vx = bw ? -p.vx * 0.9 + 2 : 0; } }
    if (p.z > lz) { p.z = lz; if (p.vz > 0) { hit = p.vz; p.vz = bw ? -p.vz * 0.9 - 2 : 0; } }
    if (p.z < -lz) { p.z = -lz; if (p.vz < 0) { hit = -p.vz; p.vz = bw ? -p.vz * 0.9 + 2 : 0; } }
    if (bw && hit > 4 && !this.predictOnly) { p.wobble = Math.max(p.wobble, 0.6); this.emit({ t: 'bumper', id: p.id, x: p.x, z: p.z, wall: true }); }

    // backboards
    for (var i = 0; i < 2; i++) {
      var h = this.hoops[i];
      if (p.y + P.height > h.boardBottom && p.y < h.boardTop && Math.abs(p.x) < h.boardHalfW + r) {
        var zc = h.boardZ + h.side * h.boardThick * 0.5;
        var dz = p.z - zc, lim = h.boardThick * 0.5 + r;
        if (Math.abs(dz) < lim) {
          p.z = zc + (dz >= 0 ? lim : -lim);
          p.vz = 0;
        }
      }
    }

    // vertical
    var wasGrounded = p.grounded;
    var vyBefore = p.vy;
    p.y += p.vy * dt;
    var gh = this._supportHeight(p.x, p.z);
    if (p.y <= gh) {
      p.y = gh;
      if (!wasGrounded) {
        p.landImpact = -vyBefore;
        if (-vyBefore > 4) this.emit({ t: 'land', id: p.id, v: -vyBefore });
        if (p.state === 'dive') { p.state = 'slide'; p.stateT = P.slideTime; }
      }
      if (p.vy < 0) p.vy = 0;
      p.grounded = true; p.airT = 0;
    } else if (wasGrounded && p.vy <= 0 && p.y - gh < 0.4) {
      p.y = gh; p.vy = 0; p.grounded = true;
    } else {
      if (wasGrounded) p.coyote = P.coyote;
      p.grounded = false; p.airT += dt;
    }
  };

  Sim.prototype._stepPads = function (p) {
    if (p.padCd > 0) return;
    var pads = this.arena.pads;
    for (var i = 0; i < pads.length; i++) {
      var pd = pads[i];
      var dx = p.x - pd.x, dz = p.z - pd.z;
      if (dx * dx + dz * dz > pd.r * pd.r) continue;
      if (p.y > pd.y + 0.35 || p.vy > 1) continue;
      if (pd.type === 'bounce') {
        p.vy = pd.vy * Math.sqrt(this.physMul.jump);
      } else {
        // aim from wherever the player touched the pad so the arc always lands in the dunk zone
        var g = this.gPlayer, T = pd.T;
        p.vx = (pd.tx - p.x) / T; p.vz = (pd.tz - p.z) / T; p.vy = (pd.ty - p.y + 0.5 * g * T * T) / T;
        p.launchT = pd.launchT;
        if (p.state === 'slide' || p.state === 'recover') p.state = 'normal';
        p.yaw = Math.atan2(p.vx, p.vz);
      }
      p.grounded = false; p.padCd = 0.4; p.jumpBuf = 0;
      this.emit({ t: 'pad', id: p.id, pad: i, kind: pd.type });
      return;
    }
  };

  Sim.prototype._obstacles = function (p, dt) {
    var A = this.arena, r = P.radius, i;
    // swinging pendulums (pirate cannonballs)
    var sw = this._swp || (this._swp = {});
    for (i = 0; i < A.swingers.length; i++) {
      var s0 = A.swingers[i];
      A.swingPos(s0, this.time, this.settings.obstacles, sw);
      if (p.y > sw.y + s0.r || p.y + P.height < sw.y - s0.r) continue;
      var sdx = p.x - sw.x, sdz = p.z - sw.z, sd = Math.sqrt(sdx * sdx + sdz * sdz), slim = s0.r + r;
      if (sd >= slim) continue;
      if (sd < 0.001) { sdx = 1; sdz = 0; sd = 1; }
      p.x = sw.x + sdx / sd * slim; p.z = sw.z + sdz / sd * slim;
      p.vx = sdx / sd * 4.5 + sw.vx * 0.45; p.vz = sdz / sd * 4.5 + sw.vz * 0.45;
      p.vy = Math.max(p.vy, 5); p.grounded = false;
      p.wobble = 1.2;
      if (!this.predictOnly && p.stunImmune <= 0 && p.state !== 'stun' && p.state !== 'dunk') this._stun(p, 0.55, true);
      if (!this.predictOnly) this.emit({ t: 'bumper', id: p.id, x: sw.x, z: sw.z, swing: true });
    }
    // bumper posts
    for (i = 0; i < A.posts.length; i++) {
      var po = A.posts[i];
      if (p.y > po.h) continue;
      var dx = p.x - po.x, dz = p.z - po.z, d2 = dx * dx + dz * dz, rr = po.r + r;
      if (d2 < rr * rr) {
        var d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
        p.x = po.x + nx * rr; p.z = po.z + nz * rr;
        var vn = p.vx * nx + p.vz * nz;
        if (vn < 0) { p.vx -= vn * nx; p.vz -= vn * nz; }
        var boost = Math.max(6, -vn * 1.2);
        p.vx += nx * boost; p.vz += nz * boost;
        if (p.grounded) p.vy = 3;
        p.grounded = false;
        p.wobble = Math.max(p.wobble, 0.6);
        this.emit({ t: 'bumper', id: p.id, x: po.x, z: po.z });
      }
    }
    // spinning bars
    var mul = this.settings.obstacles;
    for (i = 0; i < A.arms.length; i++) {
      var arm = A.arms[i];
      if (p.y > arm.top) continue;
      var ang = A.armAngle(arm, this.time, mul);
      var ax = Math.cos(ang), az = Math.sin(ang);
      var rx = p.x - arm.x, rz = p.z - arm.z;
      var t = clamp(rx * ax + rz * az, -arm.len, arm.len);
      var cx = arm.x + ax * t, cz = arm.z + az * t;
      var ddx = p.x - cx, ddz = p.z - cz, dd2 = ddx * ddx + ddz * ddz;
      var lim = r + (Math.abs(t) < arm.hubR ? arm.hubR : arm.r);
      if (dd2 < lim * lim) {
        var dd = Math.sqrt(dd2) || 0.001, nnx = ddx / dd, nnz = ddz / dd;
        p.x = cx + nnx * lim; p.z = cz + nnz * lim;
        // tangential velocity of bar at contact: w x r
        var w = arm.w * mul;
        var tvx = -w * (az * t), tvz = w * (ax * t);
        var push = Math.abs(w * t) * 1.2 + 3;
        p.vx = tvx * 1.1 + nnx * push; p.vz = tvz * 1.1 + nnz * push;
        if (p.grounded) { p.vy = 4; p.grounded = false; }
        p.wobble = Math.max(p.wobble, 1);
        if (!this.predictOnly && Math.abs(w * t) > 3 && p.stunImmune <= 0 && p.state !== 'stun' && p.state !== 'dunk') {
          this._stun(p, 0.3, false);
        }
        this.emit({ t: 'bumper', id: p.id, x: cx, z: cz, arm: true });
      }
    }
  };

  Sim.prototype._kill = function (p) {
    if (this.ball.holder === p.id) this.resetBall('fell');
    if (p.grabTarget >= 0) this._releaseGrab(p);
    if (p.grabbedBy >= 0) { var g = this.players[p.grabbedBy]; if (g) this._releaseGrab(g); }
    p.hidden = true;
    p.respawnT = this.match.overtime ? this.settings.respawnTime * 0.5 : this.settings.respawnTime;
    this.emit({ t: 'fell', id: p.id });
  };

  Sim.prototype._respawn = function (p) {
    p.hidden = false;
    p.x = p.spawnX; p.z = p.spawnZ; p.y = this.arena.groundHeight(p.x, p.z) + 0.2; p.vx = 0; p.vy = 0; p.vz = 0;
    p.state = 'normal'; p.stateT = 0; p.stunImmune = 1.5;
    p.yaw = p.team === 0 ? 0 : Math.PI;
    this.emit({ t: 'respawn', id: p.id });
  };

  /* ---- dive / tackle ---- */
  Sim.prototype._startDive = function (p) {
    if (p.grabTarget >= 0) this._releaseGrab(p);
    p.charging = false; p.passHeld = false;
    var fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    var inp = p.input;
    var mag = Math.sqrt(inp.mx * inp.mx + inp.mz * inp.mz);
    if (mag > 0.3) {
      // dive where the stick points (snappier than current facing)
      var yaw = Math.atan2(inp.mx, inp.mz);
      p.yaw = yaw; fx = Math.sin(yaw); fz = Math.cos(yaw);
    }
    var hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    var sp = Math.min(P.diveMax, Math.max(P.diveSpeed, hs + 4)) * this.physMul.speed;
    p.vx = fx * sp; p.vz = fz * sp;
    p.vy = p.grounded ? P.diveUp : Math.max(p.vy, P.diveAirUp);
    p.grounded = false;
    p.state = 'dive'; p.stateT = 0; p.tackled = false;
    p.diveCd = P.diveCooldown;
    p.launchT = 0;
    this.emit({ t: 'dive', id: p.id });
  };

  Sim.prototype._stun = function (p, dur, drop) {
    if (p.state === 'dunk') p.dunk = null;
    p.state = 'stun'; p.stateT = dur;
    p.stunImmune = dur + P.stunImmunity;
    p.charging = false; p.passHeld = false;
    if (p.grabTarget >= 0) this._releaseGrab(p);
    if (p.grabbedBy >= 0) { var g = this.players[p.grabbedBy]; if (g) this._releaseGrab(g); }
    if (drop && this.ball.holder === p.id) this._fumble(p, p.vx, p.vz);
  };

  Sim.prototype._fumble = function (p, dirx, dirz) {
    var b = this.ball;
    if (b.holder !== p.id) return;
    var hp = this.holdPos(p);
    b.holder = -1; b.state = 'free';
    b.x = hp.x; b.y = Math.max(hp.y, this.arena.groundHeight(hp.x, hp.z) + this.ballRadius + 0.05); b.z = hp.z;
    var l = Math.sqrt(dirx * dirx + dirz * dirz) || 1;
    var side = (this.rng() - 0.5) * 3;
    b.vx = dirx / l * 5 + (-dirz / l) * side;
    b.vz = dirz / l * 5 + (dirx / l) * side;
    b.vy = 6.5;
    b.lastThrow = null; b.passTarget = -1; b.inFlight = false;
    b.ignoreId = p.id; b.ignoreT = 0.2;
    p.catchCd = P.fumbleNoCatch;
    this.emit({ t: 'fumble', id: p.id });
  };

  /* ---- grab ---- */
  Sim.prototype._tryGrab = function (p) {
    var b = this.ball;
    // pickup loose ball in reach
    var live = this.match.phase === 'play' || this.match.phase === 'buzzer' || (this.match.phase === 'warmup' && this.warmBallT <= 0);
    if (live && (b.state === 'free') && p.catchCd <= 0 && !(b.ignoreId === p.id && b.ignoreT > 0)) {
      var cx = p.x, cy = p.y + 0.95, cz = p.z;
      var dx = b.x - cx, dy = b.y - cy, dz = b.z - cz;
      var reach = P.reach + (this.ballRadius - B.radius);
      if (dx * dx + dy * dy + dz * dz <= reach * reach) {
        this._catch(p, 'pickup');
        return;
      }
    }
    // grab an opponent
    var best = null, bestD = 1e9, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), i;
    for (i = 0; i < this.players.length; i++) {
      var o = this.players[i];
      if (o === p || o.team === p.team || o.hidden) continue;
      if (o.grabbedBy >= 0 || o.grabImmune > 0 || o.state === 'dunk') continue;
      var ox = o.x - p.x, oz = o.z - p.z, oy = o.y - p.y;
      var d = Math.sqrt(ox * ox + oz * oz);
      if (d > P.grabRange || Math.abs(oy) > 1.5) continue;
      var dot = d > 0.01 ? (ox * fx + oz * fz) / d : 1;
      if (dot < 0.25) continue;
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) {
      p.grabTarget = best.id; p.grabT = 0; best.grabbedBy = p.id;
      best.charging = false;
      this.emit({ t: 'grab', id: p.id, target: best.id });
    } else {
      p.grabCd = P.grabWhiffCooldown;
      this.emit({ t: 'whiff', id: p.id });
    }
  };

  Sim.prototype._releaseGrab = function (p) {
    if (p.grabTarget < 0) return;
    var t = this.players[p.grabTarget];
    if (t) { t.grabbedBy = -1; t.grabImmune = P.grabImmunity; }
    p.grabTarget = -1; p.grabT = 0; p.grabCd = P.grabCooldown;
    this.emit({ t: 'release', id: p.id });
  };

  Sim.prototype._stepGrabs = function (dt) {
    var i, b = this.ball;
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.grabTarget < 0) continue;
      var t = this.players[p.grabTarget];
      p.grabT += dt;
      var dx = t.x - p.x, dz = t.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      var stop = !p.input.grab || p.grabT >= P.grabDuration || d > 2.8 || t.hidden || p.hidden ||
        (p.state !== 'normal' && p.state !== 'recover') || t.state === 'stun' || t.state === 'dunk' || !this.playActive();
      if (stop) { this._releaseGrab(p); continue; }
      // tether: pull target toward grabber's front
      var fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      var hx = p.x + fx * 1.15, hz = p.z + fz * 1.15;
      var ex = hx - t.x, ez = hz - t.z;
      t.vx += ex * 18 * dt; t.vz += ez * 18 * dt;
      t.vx *= (1 - 4 * dt); t.vz *= (1 - 4 * dt);
      // steal
      if (b.holder === t.id && p.grabT >= P.stealTime) {
        b.holder = p.id; b.state = 'held';
        b.lastThrow = null; b.passTarget = -1; b.inFlight = false;
        b.lastTouchTeam = p.team;
        t.charging = false; t.passHeld = false;
        p.stats.steals++;
        this.emit({ t: 'steal', id: p.id, from: t.id });
        this._releaseGrab(p);
        p.grabImmune = 1.0; // a fresh steal can't be instantly grabbed back
        t.grabCd = Math.max(t.grabCd, 0.6);
      }
    }
  };

  /* ---- player vs player contact / tackles ---- */
  Sim.prototype._playerContacts = function (dt) {
    var ps = this.players, n = ps.length, i, j;
    var r2 = P.radius * 2;
    for (i = 0; i < n; i++) {
      var a = ps[i];
      if (a.hidden) continue;
      for (j = i + 1; j < n; j++) {
        var c = ps[j];
        if (c.hidden) continue;
        var dy = a.y - c.y;
        if (dy > 1.45 || dy < -1.45) continue;
        var dx = c.x - a.x, dz = c.z - a.z, d2 = dx * dx + dz * dz;
        var lim = r2 + ((a.state === 'dive' || c.state === 'dive') ? 0.25 : 0);
        if (d2 >= lim * lim) continue;
        var d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
        if (d2 < 0.000001) { nx = 1; nz = 0; }

        if (a.team !== c.team && (a.state === 'dive' || c.state === 'dive')) {
          var aDive = a.state === 'dive' && !a.tackled, cDive = c.state === 'dive' && !c.tackled;
          if (aDive && cDive) {
            this._tackle(a, c, nx, nz, 0.5);
            this._tackle(c, a, -nx, -nz, 0.5);
          } else if (aDive) {
            this._tackle(a, c, nx, nz, 1);
          } else if (cDive) {
            this._tackle(c, a, -nx, -nz, 1);
          }
        }
        // separation
        var pen = r2 - d;
        if (pen > 0) {
          a.x -= nx * pen * 0.5; a.z -= nz * pen * 0.5;
          c.x += nx * pen * 0.5; c.z += nz * pen * 0.5;
          var rv = (c.vx - a.vx) * nx + (c.vz - a.vz) * nz;
          if (rv < 0) {
            var imp = -rv * 0.55;
            a.vx -= nx * imp; a.vz -= nz * imp;
            c.vx += nx * imp; c.vz += nz * imp;
            if (-rv > 7) {
              a.wobble = Math.max(a.wobble, 0.5); c.wobble = Math.max(c.wobble, 0.5);
              this.emit({ t: 'bump', a: a.id, b: c.id, v: -rv });
            }
          }
        }
      }
    }
  };

  Sim.prototype._tackle = function (a, t, nx, nz, scale) {
    // a dives into t along normal (nx,nz) pointing a->t
    var rvx = a.vx - t.vx, rvz = a.vz - t.vz;
    var impact = rvx * nx + rvz * nz;
    a.tackled = true;
    if (impact < P.tackleMinImpact) return;
    var strength = impact * this.settings.tackleStrength * scale;
    var carrier = this.ball.holder === t.id;
    if (t.stunImmune > 0 || t.state === 'stun') {
      // protected: just a shove
      t.vx += nx * strength * 0.35; t.vz += nz * strength * 0.35;
      t.wobble = Math.max(t.wobble, 0.8);
      a.vx *= 0.4; a.vz *= 0.4;
      this.emit({ t: 'tackle', id: a.id, target: t.id, strength: strength, blocked: true });
      return;
    }
    var dur = clamp(0.45 + strength * 0.045, 0.5, 1.1);
    var avx = a.vx, avz = a.vz;
    this._stun(t, dur, false);
    t.vx = avx * 0.65 + nx * 3; t.vz = avz * 0.65 + nz * 3;
    t.vy = Math.max(t.vy, 4.5); t.grounded = false;
    t.wobble = 1.5;
    if (carrier) this._fumble(t, avx + nx * 2, avz + nz * 2);
    a.vx *= 0.3; a.vz *= 0.3;
    a.stats.tackles++;
    this.emit({ t: 'tackle', id: a.id, target: t.id, strength: strength, fumble: carrier });
  };

  /* ---- dunk ---- */
  Sim.prototype.dunkEligible = function (p) {
    if (this.ball.holder !== p.id || p.grounded || p.grabbedBy >= 0) return false;
    if (p.state !== 'normal' && p.state !== 'dive' && p.state !== 'recover') return false;
    if (this.match.phase !== 'play' && this.match.phase !== 'buzzer' && this.match.phase !== 'warmup') return false;
    var h = this.attackHoop(p.team);
    var dx = h.x - p.x, dz = h.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > DK.range) return false;
    if (p.y < h.y - DK.below || p.y > h.y + 0.8) return false;
    if ((p.z - h.z) * h.side > 0.6) return false; // behind the hoop
    if (d > 0.7) {
      var f = (Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz) / d;
      var vm = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      var fv = vm > 0.5 ? (p.vx * dx + p.vz * dz) / (d * vm) : -1;
      if (f < 0.15 && fv < 0.3) return false;
    }
    return true;
  };

  Sim.prototype._startDunk = function (p) {
    var h = this.attackHoop(p.team);
    var dx = p.x - h.x, dz = p.z - h.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.01) { dx = 0; dz = -h.side; d = 1; }
    // approach from the field side
    if (dz * h.side > 0) { dz = -dz; }
    var l = Math.sqrt(dx * dx + dz * dz);
    p.dunk = {
      sx: p.x, sy: p.y, sz: p.z,
      tx: h.x + dx / l * 0.85, ty: h.y - 1.35, tz: h.z + dz / l * 0.85,
      hoop: 1 - p.team, done: false
    };
    p.state = 'dunk'; p.stateT = 0;
    p.charging = false; p.passHeld = false;
    p.yaw = Math.atan2(h.x - p.x, h.z - p.z);
    if (p.grabTarget >= 0) this._releaseGrab(p);
    this.emit({ t: 'dunkStart', id: p.id });
  };

  Sim.prototype._stepDunk = function (p, dt) {
    var dk = p.dunk;
    if (!dk) { p.state = 'normal'; return; }
    p.stateT += dt;
    var k = clamp(p.stateT / DK.pullTime, 0, 1);
    var e = 1 - (1 - k) * (1 - k);
    p.x = lerp(dk.sx, dk.tx, e); p.z = lerp(dk.sz, dk.tz, e);
    p.y = lerp(dk.sy, dk.ty, e) + Math.sin(k * Math.PI) * 0.4;
    p.vx = 0; p.vz = 0; p.vy = 0; p.grounded = false;
    if (!dk.done && p.stateT >= DK.pullTime && !this.predictOnly) {
      dk.done = true;
      if (this.ball.holder === p.id) this._scoreDunk(p);
    }
    if (p.stateT >= DK.totalTime) {
      p.state = 'normal'; p.dunk = null; p.vy = -1;
      var h = this.hoops[dk.hoop];
      // pop back out toward the field so nobody hangs on the rim
      var ox = p.x - h.x, oz = p.z - h.z, ol = Math.sqrt(ox * ox + oz * oz) || 1;
      p.vx = ox / ol * 3; p.vz = oz / ol * 3;
      p.stunImmune = Math.max(p.stunImmune, 0.4);
    }
  };

  Sim.prototype._scoreDunk = function (p) {
    var b = this.ball, h = this.attackHoop(p.team);
    b.holder = -1; b.state = 'dunked';
    b.x = h.x; b.y = h.y + 0.6; b.z = h.z; b.prevY = b.y;
    b.vx = 0; b.vy = -11; b.vz = 0;
    p.stats.dunks++;
    this.emit({ t: 'dunk', id: p.id, hoop: h.team });
    this._award(p.team, C.SCORE.dunk, 'dunk', p.id);
  };

  /* ---- throwing ---- */
  Sim.prototype._releaseBallFrom = function (p, vx, vy, vz, kind, target) {
    var b = this.ball;
    var o = this.holdPos(p);
    var gh = this.arena.groundHeight(o.x, o.z);
    if (o.y < gh + this.ballRadius + 0.05) o.y = gh + this.ballRadius + 0.05;
    // keep throw origin inside the arena
    var lx = this.arena.halfW - this.ballRadius, lz = this.arena.halfL - this.ballRadius;
    o.x = clamp(o.x, -lx, lx); o.z = clamp(o.z, -lz, lz);
    b.holder = -1; b.state = 'free';
    b.x = o.x; b.y = o.y; b.z = o.z; b.prevY = o.y;
    var sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (sp > B.maxSpeed) { vx *= B.maxSpeed / sp; vy *= B.maxSpeed / sp; vz *= B.maxSpeed / sp; }
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.ignoreId = p.id; b.ignoreT = B.throwIgnore;
    var ah = this.attackHoop(p.team);
    var hx = ah.x - p.x, hz = ah.z - p.z;
    b.lastThrow = { by: p.id, team: p.team, kind: kind, dist: Math.sqrt(hx * hx + hz * hz), t: this.time };
    b.passTarget = (typeof target === 'number') ? target : -1;
    b.inFlight = true; b.lastTouchTeam = p.team; b.idleT = 0;
    if (kind === 'pass') { b.lastPasser = p.id; b.lastPassT = this.time; p.stats.passes++; }
    p.throwAnim = 0.32; p.throwKind = kind;
    p.charging = false; p.passHeld = false; p.passAim = -1;
  };

  /* Returns launch data for a shot. Used by the sim, bots and the client's arc preview. */
  Sim.prototype.shotLaunch = function (p, charge, yaw, out) {
    out = out || {};
    var h = this.attackHoop(p.team);
    var fakeCharging = p.charging;
    p.charging = true;
    var o = this.holdPos(p);
    p.charging = fakeCharging;
    var tx = h.x - o.x, tz = h.z - o.z, td = Math.sqrt(tx * tx + tz * tz);
    var hoopYaw = Math.atan2(tx, tz);
    var dyaw = wrapAngle(hoopYaw - yaw);
    var assisted = false, hu = !p.isBot;
    var aYaw = hu ? SH.humanAssistYaw : SH.assistYaw, aYawK = hu ? SH.humanAssistYawStrength : SH.assistYawStrength;
    var aWin = hu ? SH.humanAssistWindow : SH.assistWindow, aK = hu ? SH.humanAssistStrength : SH.assistStrength;
    if (Math.abs(dyaw) < aYaw) { yaw = yaw + dyaw * aYawK; assisted = true; }
    var c = charge;
    if (assisted) {
      var cs = this._perfectCharge(p, o, yaw, h);
      out.window = aWin;
      if (cs >= 0 && Math.abs(c - cs) < aWin) c = c + (cs - c) * aK;
      out.perfect = cs;
    } else { out.perfect = -1; }
    this._shotVel(p, o, c, yaw, out);
    out.ox = o.x; out.oy = o.y; out.oz = o.z; out.c = c; out.yaw = yaw; out.assisted = assisted;
    out.hoopDist = td;
    return out;
  };

  Sim.prototype._shotVel = function (p, o, c, yaw, out) {
    var ang = lerp(SH.angleLow, SH.angleHigh, c);
    var spd = lerp(SH.speedLow, SH.speedHigh, Math.pow(c, 0.9));
    var fx = Math.sin(yaw), fz = Math.cos(yaw);
    out.vx = fx * spd * Math.cos(ang) + p.vx * SH.carryH;
    out.vz = fz * spd * Math.cos(ang) + p.vz * SH.carryH;
    out.vy = spd * Math.sin(ang) + (p.grounded ? 0 : p.vy * SH.carryV);
    return out;
  };

  /* Analytic: charge whose descending arc passes through the ring center. -1 if unreachable. */
  Sim.prototype._perfectCharge = function (p, o, yaw, h) {
    var tx = h.x - o.x, tz = h.z - o.z, d = Math.sqrt(tx * tx + tz * tz);
    var ux = tx / (d || 1), uz = tz / (d || 1);
    var g = this.gBall, dyH = h.y - o.y;
    var tmp = {};
    var self = this;
    function reach(c) {
      self._shotVel(p, o, c, yaw, tmp);
      var disc = tmp.vy * tmp.vy - 2 * g * dyH;
      if (disc < 0) return -1;
      var t = (tmp.vy + Math.sqrt(disc)) / g;
      return (tmp.vx * ux + tmp.vz * uz) * t;
    }
    var lo = 0, hi = 1, rl = reach(0), rh = reach(1);
    if (rh < d) return -1;
    if (rl >= d) return 0;
    // find first c where reach is valid and >= d (reach can be -1 at low c)
    for (var i = 0; i < 22; i++) {
      var mid = (lo + hi) * 0.5, r = reach(mid);
      if (r < 0 || r < d) lo = mid; else hi = mid;
    }
    return (lo + hi) * 0.5;
  };

  Sim.prototype._throwShot = function (p, charge, look) {
    var L = this.shotLaunch(p, charge, look);
    p.yaw = L.yaw;
    this._releaseBallFrom(p, L.vx, L.vy, L.vz, 'shot', -1);
    p.stats.shots++;
    this.emit({ t: 'shoot', id: p.id, charge: charge, dist: L.hoopDist });
  };

  Sim.prototype.choosePassTarget = function (p, yaw, coneCos, maxDist) {
    var fx = Math.sin(yaw), fz = Math.cos(yaw), best = -1, bestS = 1e9, i;
    for (i = 0; i < this.players.length; i++) {
      var t = this.players[i];
      if (t === p || t.team !== p.team || t.hidden) continue;
      var dx = t.x - p.x, dz = t.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1.2 || d > maxDist) continue;
      var cs = (dx * fx + dz * fz) / d;
      if (cs < coneCos) continue;
      var s = (1 - cs) * 3 + d / 25 + (t.state === 'stun' ? 2 : 0) - (t.callT > 0 ? 0.35 : 0);
      if (s < bestS) { bestS = s; best = t.id; }
    }
    return best;
  };

  Sim.prototype.passLaunch = function (p, t, low, out) {
    out = out || {};
    var o = this.holdPos(p);
    var dx = t.x - o.x, dz = t.z - o.z, d = Math.sqrt(dx * dx + dz * dz);
    var T = clamp(0.24 + d / 24, 0.3, 1.2);
    if (low) T *= 0.8;
    var g = this.gBall;
    var lead = 0.85;
    var tx = t.x + t.vx * T * lead, tz = t.z + t.vz * T * lead;
    var ty = (t.grounded ? t.y : Math.max(this.arena.groundHeight(tx, tz), t.y + t.vy * T * 0.5)) + (low ? 0.6 : 1.2);
    var vx, vy, vz, sp, it;
    for (it = 0; it < 4; it++) {
      vx = (tx - o.x) / T; vz = (tz - o.z) / T; vy = (ty - o.y + 0.5 * g * T * T) / T;
      sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp <= 30) break;
      T *= 1.2;
    }
    out.vx = vx; out.vy = vy; out.vz = vz; out.T = T;
    return out;
  };

  Sim.prototype._passTo = function (p, targetId, low) {
    var t = this.players[targetId];
    var L = this.passLaunch(p, t, low);
    p.yaw = Math.atan2(t.x - p.x, t.z - p.z);
    this._releaseBallFrom(p, L.vx, L.vy, L.vz, 'pass', targetId);
    this.emit({ t: 'pass', id: p.id, target: targetId, low: !!low });
  };

  Sim.prototype._throwForward = function (p, yaw, speed, ang) {
    var fx = Math.sin(yaw), fz = Math.cos(yaw);
    p.yaw = yaw;
    this._releaseBallFrom(p, fx * speed * Math.cos(ang) + p.vx * 0.3, speed * Math.sin(ang), fz * speed * Math.cos(ang) + p.vz * 0.3, 'pass', -1);
    this.emit({ t: 'pass', id: p.id, target: -1 });
  };

  Sim.prototype._quickPass = function (p, inp) {
    var mag = Math.sqrt(inp.mx * inp.mx + inp.mz * inp.mz);
    var yaw = mag > 0.3 ? Math.atan2(inp.mx, inp.mz) : p.yaw;
    var t = this.choosePassTarget(p, yaw, 0.42, 40);
    if (t < 0) t = this.choosePassTarget(p, yaw, -0.05, 40);
    if (t >= 0) this._passTo(p, t, !!inp.aim);
    else this._throwForward(p, yaw, 14, 0.5);
  };

  Sim.prototype._aimedPass = function (p, inp) {
    var t = this.choosePassTarget(p, inp.look, 0.8, 40);
    if (t >= 0) { this._passTo(p, t, !!inp.aim); return; }
    var k = clamp((p.passT - 0.2) / 0.8, 0, 1);
    this._throwForward(p, inp.look, 12 + 14 * k, 0.6);
  };

  /* ------------------------------------------------------------------ */
  /*  BALL                                                               */
  /* ------------------------------------------------------------------ */
  Sim.prototype._attachBall = function () {
    var b = this.ball, p = this.players[b.holder];
    if (!p) { b.holder = -1; b.state = 'free'; return; }
    var hp = this.holdPos(p);
    var lx = this.arena.halfW - this.ballRadius, lz = this.arena.halfL - this.ballRadius;
    b.x = clamp(hp.x, -lx, lx); b.y = hp.y; b.z = clamp(hp.z, -lz, lz); b.prevY = b.y;
    b.vx = p.vx; b.vy = p.vy; b.vz = p.vz;
  };

  Sim.prototype._catch = function (p, how) {
    var b = this.ball;
    var wasPass = b.lastThrow && b.lastThrow.kind === 'pass' && b.inFlight;
    var wasShot = b.lastThrow && b.lastThrow.kind === 'shot' && b.inFlight;
    var fromTeam = b.lastThrow ? b.lastThrow.team : -1;
    b.holder = p.id; b.state = 'held'; b.inFlight = false; b.passTarget = -1;
    b.idleT = 0; b.lastTouchTeam = p.team;
    var ev = { t: 'catch', id: p.id, how: how };
    if ((wasPass || wasShot) && fromTeam >= 0 && fromTeam !== p.team) {
      ev.intercept = true; p.stats.intercepts++;
      ev.block = wasShot;
    }
    b.lastThrow = null;
    this._attachBall();
    this.emit(ev);
  };

  Sim.prototype._stepBall = function (dt) {
    var b = this.ball, m = this.match;
    if (b.ignoreT > 0) b.ignoreT -= dt;
    if (b.hitT > 0) b.hitT -= dt;
    if (b.state === 'gone' || b.state === 'spawn') return;
    if (b.state === 'held') {
      var hp = this.players[b.holder];
      if (!hp || hp.hidden) { b.state = 'free'; b.holder = -1; }
      else { this._attachBall(); return; }
    }
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    var steps = sp > 24 ? 3 : (sp > 11 ? 2 : 1);
    var h = dt / steps;
    for (var s = 0; s < steps; s++) {
      this.ballPhysics(b, h, this.time + h * s, true);
      if (b.state !== 'free' && b.state !== 'dunked') break;
    }
    if (b.state === 'free') this._ballPlayers(dt);

    // idle / stuck recovery
    if (b.state === 'free') {
      var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
      b.idleT += dt;
      if (speed < 0.4) b.restT += dt; else b.restT = 0;
      var gh = this.arena.groundHeight(b.x, b.z);
      var bad = b.x !== b.x || b.y !== b.y || b.z !== b.z || b.y < -3 ||
        Math.abs(b.x) > this.arena.halfW + 1 || Math.abs(b.z) > this.arena.halfL + 1;
      var perched = b.restT > 2.5 && b.y - gh > this.ballRadius + 0.5; // resting on top of something weird
      if (bad || perched || b.idleT > 25 || (b.restT > 12)) {
        if (m.phase === 'play' || m.phase === 'warmup' || this.mode !== 'match') this.resetBall(bad ? 'escaped' : 'stuck');
      }
    }
  };

  /* Pure-ish ball physics. `live` = sim ball (scoring & events). For predictions pass live=false. */
  Sim.prototype.ballPhysics = function (b, dt, t, live) {
    var A = this.arena, R = this.ballRadius;
    b.prevY = b.y;
    b.vy -= this.gBall * dt;
    var px = b.x, pz = b.z;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;

    // walls
    var lx = A.halfW - R, lz = A.halfL - R;
    if (b.x > lx) { b.x = lx; if (b.vx > 0) { this._ballHit(b, live, 'wall', b.vx); b.vx = -b.vx * A.wallRest; } }
    if (b.x < -lx) { b.x = -lx; if (b.vx < 0) { this._ballHit(b, live, 'wall', -b.vx); b.vx = -b.vx * A.wallRest; } }
    if (b.z > lz) { b.z = lz; if (b.vz > 0) { this._ballHit(b, live, 'wall', b.vz); b.vz = -b.vz * A.wallRest; } }
    if (b.z < -lz) { b.z = -lz; if (b.vz < 0) { this._ballHit(b, live, 'wall', -b.vz); b.vz = -b.vz * A.wallRest; } }
    if (b.y > A.ceiling - R) { b.y = A.ceiling - R; if (b.vy > 0) b.vy = -b.vy * 0.5; }

    // vertical faces of the height field (platform sides, rails, poles)
    var g = A.groundHeight;
    var cy = b.y;
    if (g(b.x + R * 0.9, b.z) > cy && b.vx > 0) { b.x = px; this._ballHit(b, live, 'wall', b.vx); b.vx = -b.vx * B.restWall; }
    else if (g(b.x - R * 0.9, b.z) > cy && b.vx < 0) { b.x = px; this._ballHit(b, live, 'wall', -b.vx); b.vx = -b.vx * B.restWall; }
    if (g(b.x, b.z + R * 0.9) > cy && b.vz > 0) { b.z = pz; this._ballHit(b, live, 'wall', b.vz); b.vz = -b.vz * B.restWall; }
    else if (g(b.x, b.z - R * 0.9) > cy && b.vz < 0) { b.z = pz; this._ballHit(b, live, 'wall', -b.vz); b.vz = -b.vz * B.restWall; }

    // floor / ramps
    var gh = g(b.x, b.z);
    b.grounded = false;
    if (b.y - R <= gh) {
      if (gh - (b.y - R) > 0.8 && g(px, pz) < gh - 0.3) {
        // fell into a face sideways: undo horizontal
        b.x = px; b.z = pz; b.vx = -b.vx * 0.5; b.vz = -b.vz * 0.5;
        gh = g(b.x, b.z);
      }
      var n = A.isRamp(b.x, b.z) ? A.rampNormal(b.x, b.z) : { x: 0, y: 1, z: 0 };
      b.y = gh + R;
      var vn = b.vx * n.x + b.vy * n.y + b.vz * n.z;
      if (vn < 0) {
        if (-vn > 1.6) this._ballHit(b, live, 'floor', -vn);
        var e = -vn > 1.6 ? B.restFloor : 0;
        b.vx -= (1 + e) * vn * n.x; b.vy -= (1 + e) * vn * n.y; b.vz -= (1 + e) * vn * n.z;
        if (live && b.inFlight && b.lastThrow && b.lastThrow.kind === 'shot' && -vn > 1.6) {
          b.inFlight = false; // bounced on the floor: no longer a clean shot
        } else if (live && b.inFlight && -vn > 1.6) {
          b.inFlight = false;
        }
      }
      b.grounded = true;
      var sfb = A.surface(b.x, b.z, this._sfb || (this._sfb = {}));
      var fr = Math.max(0, 1 - B.rollFriction * (sfb.ice ? 0.15 : 1) * dt);
      b.vx *= fr; b.vz *= fr;
      if (sfb.moving) { var kk = Math.min(1, 2.5 * dt); b.vx += (sfb.vx - b.vx) * kk * (sfb.vx ? 1 : 0); b.vz += (sfb.vz - b.vz) * kk * (sfb.vz ? 1 : 0); }
    }

    // pads
    for (var i = 0; i < A.pads.length; i++) {
      var pd = A.pads[i];
      var pdx = b.x - pd.x, pdz = b.z - pd.z;
      if (pdx * pdx + pdz * pdz < pd.r * pd.r && b.y - R < pd.y + 0.25 && b.vy <= 0.5) {
        b.vy = Math.max(12, -b.vy);
        if (live) this.emit({ t: 'padBall', pad: i });
      }
    }

    // swinging pendulums
    for (i = 0; i < A.swingers.length; i++) {
      var sg = A.swingers[i], sp2 = A.swingPos(sg, t, this.settings.obstacles, this._swb || (this._swb = {}));
      var ex = b.x - sp2.x, ey = b.y - sp2.y, ez = b.z - sp2.z, ed = Math.sqrt(ex * ex + ey * ey + ez * ez), elim = sg.r + R;
      if (ed < elim && ed > 0.001) {
        var nx0 = ex / ed, ny0 = ey / ed, nz0 = ez / ed;
        b.x = sp2.x + nx0 * elim; b.y = sp2.y + ny0 * elim; b.z = sp2.z + nz0 * elim;
        var rv = (b.vx - sp2.vx) * nx0 + b.vy * ny0 + (b.vz - sp2.vz) * nz0;
        if (rv < 0) { b.vx -= 1.8 * rv * nx0; b.vy -= 1.8 * rv * ny0; b.vz -= 1.8 * rv * nz0; }
        b.vx += sp2.vx * 0.6; b.vz += sp2.vz * 0.6;
        this._ballHit(b, live, 'bumper', 6);
      }
    }
    // posts
    for (i = 0; i < A.posts.length; i++) {
      var po = A.posts[i];
      if (b.y - R > po.h) continue;
      var dx = b.x - po.x, dz = b.z - po.z, d2 = dx * dx + dz * dz, rr = po.r + R;
      if (d2 < rr * rr) {
        var d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
        b.x = po.x + nx * rr; b.z = po.z + nz * rr;
        var v2 = b.vx * nx + b.vz * nz;
        if (v2 < 0) { b.vx -= 2 * v2 * nx; b.vz -= 2 * v2 * nz; }
        b.vx += nx * 4; b.vz += nz * 4;
        this._ballHit(b, live, 'bumper', 6);
      }
    }
    // arms
    var mul = this.settings.obstacles;
    for (i = 0; i < A.arms.length; i++) {
      var arm = A.arms[i];
      if (b.y - R > arm.top) continue;
      var ang = A.armAngle(arm, t, mul);
      var ax = Math.cos(ang), az = Math.sin(ang);
      var rx = b.x - arm.x, rz = b.z - arm.z;
      var tt = clamp(rx * ax + rz * az, -arm.len, arm.len);
      var cx = arm.x + ax * tt, cz = arm.z + az * tt;
      var ddx = b.x - cx, ddz = b.z - cz, dd2 = ddx * ddx + ddz * ddz;
      var lim = R + (Math.abs(tt) < arm.hubR ? arm.hubR : arm.r);
      if (dd2 < lim * lim) {
        var dd = Math.sqrt(dd2) || 0.001, nnx = ddx / dd, nnz = ddz / dd;
        b.x = cx + nnx * lim; b.z = cz + nnz * lim;
        var w = arm.w * mul;
        var tvx = -w * (az * tt), tvz = w * (ax * tt);
        var vrel = (b.vx - tvx) * nnx + (b.vz - tvz) * nnz;
        if (vrel < 0) { b.vx -= 1.7 * vrel * nnx; b.vz -= 1.7 * vrel * nnz; }
        b.vx += tvx * 0.5; b.vz += tvz * 0.5;
        b.vy = Math.max(b.vy, 2.5);
        this._ballHit(b, live, 'bumper', 5);
      }
    }

    // hoops: backboard + rim + scoring
    for (i = 0; i < 2; i++) this._ballHoop(b, this.hoops[i], live);

    // final containment
    if (b.x > lx) b.x = lx; if (b.x < -lx) b.x = -lx;
    if (b.z > lz) b.z = lz; if (b.z < -lz) b.z = -lz;
    // clamp speed
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    if (sp > B.maxSpeed) { var k = B.maxSpeed / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
  };

  Sim.prototype._ballHit = function (b, live, kind, v) {
    if (!live) return;
    if (b.hitT > 0 && kind !== 'rim' && kind !== 'board') return;
    b.hitT = 0.06;
    this.emit({ t: 'ballHit', kind: kind, v: v, x: b.x, y: b.y, z: b.z });
  };

  Sim.prototype._ballHoop = function (b, h, live) {
    var R = this.ballRadius;
    // backboard box
    var z0 = h.boardZ, z1 = h.boardZ + h.side * h.boardThick;
    var zmin = Math.min(z0, z1), zmax = Math.max(z0, z1);
    var qx = clamp(b.x, -h.boardHalfW, h.boardHalfW), qy = clamp(b.y, h.boardBottom, h.boardTop), qz = clamp(b.z, zmin, zmax);
    var dx = b.x - qx, dy = b.y - qy, dz = b.z - qz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < R * R) {
      var d = Math.sqrt(d2);
      var nx, ny, nz;
      if (d < 0.0001) { nx = 0; ny = 0; nz = -h.side; d = 0; }
      else { nx = dx / d; ny = dy / d; nz = dz / d; }
      b.x = qx + nx * R; b.y = qy + ny * R; b.z = qz + nz * R;
      var vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        if (-vn > 1.5) this._ballHit(b, live, 'board', -vn);
        b.vx -= (1 + B.restBoard) * vn * nx; b.vy -= (1 + B.restBoard) * vn * ny; b.vz -= (1 + B.restBoard) * vn * nz;
      }
    }
    // rim (torus as circle)
    var rx = b.x - h.x, rz = b.z - h.z, rl = Math.sqrt(rx * rx + rz * rz);
    if (rl < 0.0001) { rx = 1; rz = 0; rl = 1; }
    var cxr = h.x + rx / rl * h.ringR, czr = h.z + rz / rl * h.ringR;
    var ex = b.x - cxr, ey = b.y - h.y, ez = b.z - czr;
    var e2 = ex * ex + ey * ey + ez * ez, lim = R + h.tube;
    if (e2 < lim * lim) {
      var el = Math.sqrt(e2) || 0.001;
      var mx = ex / el, my = ey / el, mz = ez / el;
      b.x = cxr + mx * lim; b.y = h.y + my * lim; b.z = czr + mz * lim;
      var vr = b.vx * mx + b.vy * my + b.vz * mz;
      if (vr < 0) {
        if (-vr > 1) this._ballHit(b, live, 'rim', -vr);
        b.vx -= (1 + B.restRim) * vr * mx; b.vy -= (1 + B.restRim) * vr * my; b.vz -= (1 + B.restRim) * vr * mz;
      }
    }
    // scoring: crossing ring plane downward inside the ring
    if (live && b.prevY >= h.y && b.y < h.y && b.vy < 0) {
      var sx = b.x - h.x, sz = b.z - h.z;
      if (sx * sx + sz * sz < (h.ringR - R * 0.35) * (h.ringR - R * 0.35)) {
        if (b.state === 'free') this._basket(h);
      }
    }
  };

  Sim.prototype._basket = function (h) {
    var b = this.ball, team = 1 - h.team;
    var lt = b.lastThrow;
    var pts = C.SCORE.basket, kind = 'basket', scorer = -1;
    if (lt && lt.kind === 'shot' && lt.team === team) {
      scorer = lt.by;
      if (b.inFlight && lt.dist >= h.threeDist) { pts = C.SCORE.longRange; kind = 'long'; }
    } else if (lt && lt.team === team) {
      scorer = lt.by;
    } else if (lt && lt.team !== team) {
      kind = 'own';
    }
    if (scorer >= 0) { var sp = this.players[scorer]; if (sp) sp.stats.made++; }
    this._award(team, pts, kind, scorer);
  };

  Sim.prototype._award = function (team, pts, kind, scorerId) {
    var m = this.match, b = this.ball;
    if (m.phase === 'warmup') {
      // practice basket: celebrate, don't count, new ball shortly
      if (this.warmBallT <= 0) {
        this.warmBallT = kind === 'dunk' ? 1.3 : 1.0;
        var sp = this.players[scorerId];
        if (sp) sp.celebrateT = 1.4;
        b.lastThrow = null; b.lastPasser = -1; b.passTarget = -1;
        this.emit({ t: 'practiceScore', team: team, pts: pts, kind: kind, scorer: scorerId });
      }
      return;
    }
    if (m.phase !== 'play' && m.phase !== 'buzzer') return;
    m.score[team] += pts;
    var assist = -1;
    if (b.lastPasser >= 0 && b.lastPasser !== scorerId && this.time - b.lastPassT < 6) {
      var ap = this.players[b.lastPasser];
      if (ap && ap.team === team) { assist = ap.id; ap.stats.assists++; }
    }
    var sc = this.players[scorerId];
    if (sc && sc.team === team) sc.stats.pts += pts;
    m.lastScore = { team: team, pts: pts, kind: kind, scorer: scorerId, assist: assist, time: this.time };
    m.phase = 'scored'; m.phaseT = 0;
    b.lastThrow = null; b.lastPasser = -1; b.passTarget = -1;
    var i;
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.team === team) p.celebrateT = 1.4;
      if (p.grabTarget >= 0) this._releaseGrab(p);
    }
    this.emit({ t: 'score', team: team, pts: pts, kind: kind, scorer: scorerId, assist: assist, score: [m.score[0], m.score[1]] });
  };

  Sim.prototype._ballPlayers = function (dt) {
    var b = this.ball, R = this.ballRadius, i;
    var best = null, bestD = 1e9;
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.hidden) continue;
      // closest point on player's vertical capsule segment
      var sy = clamp(b.y, p.y + 0.5, p.y + 1.35);
      var dx = b.x - p.x, dy = b.y - sy, dz = b.z - p.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var ignored = (b.ignoreId === p.id && b.ignoreT > 0);
      if (!ignored && this.canCatch(p)) {
        var cr = (b.passTarget === p.id) ? P.catchRadiusTarget : P.catchRadius;
        if (p.state === 'dive') cr += 0.35;
        cr += (R - B.radius);
        if (d < cr && d < bestD) { bestD = d; best = p; }
      } else if (!ignored) {
        var lim = R + P.radius;
        if (d < lim) {
          var nx = dx / (d || 1), ny = dy / (d || 1), nz = dz / (d || 1);
          b.x = p.x + nx * lim; b.y = sy + ny * lim; b.z = p.z + nz * lim;
          var rvx = b.vx - p.vx, rvy = b.vy - p.vy, rvz = b.vz - p.vz;
          var vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            b.vx -= (1 + B.restPlayer) * vn * nx; b.vy -= (1 + B.restPlayer) * vn * ny; b.vz -= (1 + B.restPlayer) * vn * nz;
            this._ballHit(b, true, 'player', -vn);
          }
        }
      }
    }
    if (best) this._catch(best, b.inFlight ? 'catch' : 'touch');
  };

  /* Client-side prediction: advance only one player with its input (no ball / score decisions). */
  Sim.prototype.predictPlayer = function (p, inp, dt) {
    var was = this.predictOnly;
    this.predictOnly = true;
    this._stepPlayer(p, inp, dt);
    for (var k = 0; k < BTN.length; k++) p.prev[BTN[k]] = !!inp[BTN[k]];
    this.predictOnly = was;
  };

  /* Predict loose-ball positions (no players). Returns array of {x,y,z,t}. */
  Sim.prototype.predictBall = function (seconds, stepDt, from) {
    var src = from || this.ball;
    var b = { x: src.x, y: src.y, z: src.z, vx: src.vx, vy: src.vy, vz: src.vz, prevY: src.y, state: 'free', grounded: false, hitT: 0 };
    var out = [], t = 0, dt = stepDt || (1 / 30);
    var sub = 2;
    while (t < seconds) {
      for (var s = 0; s < sub; s++) this.ballPhysics(b, dt / sub, this.time + t + s * dt / sub, false);
      t += dt;
      out.push({ x: b.x, y: b.y, z: b.z, t: t, g: b.grounded });
    }
    return out;
  };

  /* Preview of a shot for the arc indicator. */
  Sim.prototype.previewShot = function (p, charge, look, seconds) {
    var L = this.shotLaunch(p, charge, look);
    var pts = [{ x: L.ox, y: L.oy, z: L.oz, t: 0 }];
    var more = this.predictBall(seconds || 1.6, 1 / 30, { x: L.ox, y: L.oy, z: L.oz, vx: L.vx, vy: L.vy, vz: L.vz });
    for (var i = 0; i < more.length; i++) pts.push(more[i]);
    // does the predicted path drop through the ring? (includes board / rim bounces)
    var h = this.attackHoop(p.team), makes = false, endIdx = pts.length - 1, lim = h.ringR - this.ballRadius * 0.55;
    for (i = 1; i < pts.length; i++) {
      var a = pts[i - 1], q = pts[i];
      if (a.y >= h.y && q.y < h.y) {
        var k = (a.y - h.y) / ((a.y - q.y) || 1);
        var cx = a.x + (q.x - a.x) * k - h.x, cz = a.z + (q.z - a.z) * k - h.z;
        if (cx * cx + cz * cz < lim * lim) { makes = true; endIdx = i; break; }
      }
      if (q.g) { endIdx = i; break; }
    }
    return { points: pts, launch: L, makes: makes, endIdx: endIdx };
  };

  /* Compact snapshot for network / debugging (milestone 2 uses this). */
  Sim.prototype.snapshot = function () {
    var ps = [], i;
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      ps.push([p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.vx.toFixed(2), +p.vy.toFixed(2), +p.vz.toFixed(2),
        +p.yaw.toFixed(3), p.state, p.grounded ? 1 : 0, p.grabTarget, p.grabbedBy, +p.charge.toFixed(2), p.charging ? 1 : 0, p.hidden ? 1 : 0]);
    }
    var b = this.ball, m = this.match;
    return {
      tick: this.tick, time: this.time,
      p: ps,
      b: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), +b.vx.toFixed(2), +b.vy.toFixed(2), +b.vz.toFixed(2), b.state, b.holder],
      m: [m.phase, +m.clock.toFixed(2), m.score[0], m.score[1], m.overtime ? 1 : 0, m.winner]
    };
  };

  return Sim;
});
