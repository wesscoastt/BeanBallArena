/* BEAN BALL ARENA - shared/ai.js
 * Bot brains. Bots never touch sim state directly: every tick they produce
 * the same input object a human controller produces, so they obey the exact
 * same movement, cooldown and physics rules (no cheating on Hard).
 *
 * Team roles (reassigned ~4x per second):
 *   carrier  - has the ball: drive, dodge, pass, shoot, dunk
 *   support  - get open in passing lanes / near the enemy hoop
 *   safety   - stay back between the ball and our hoop while we attack
 *   pressure - challenge the enemy ball carrier (grab / dive tackle)
 *   defend   - protect our hoop, block dunks
 *   mark     - shadow an enemy non-carrier, deny passes, intercept
 *   recover  - chase a loose ball (only one bot per team, usually)
 *   receive  - a pass is coming to me
 */
(function (root, factory) {
  var isNode = (typeof module === 'object' && module.exports);
  var deps = isNode
    ? [require('./constants.js'), require('./gameRules.js'), require('./arenaDef.js')]
    : [root.BBA.C, root.BBA.Rules, root.BBA.Arena];
  var mod = factory(deps[0], deps[1], deps[2]);
  if (isNode) { module.exports = mod; } else { root.BBA.AI = mod; }
})(this, function (C, Rules, Arena) {
  var P = C.PLAYER;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hyp(x, z) { return Math.sqrt(x * x + z * z); }
  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  /* ---------------- navigation (static graph + walkability) ---------------- */
  var NAV = { nodes: Arena.navNodes, matrix: null };

  function segWalkable(ax, az, ay, bx, bz) {
    var g = Arena.groundHeight;
    var dx = bx - ax, dz = bz - az, L = hyp(dx, dz);
    if (L < 0.01) return true;
    var n = Math.ceil(L / 0.45), i;
    var px = -dz / L * 0.5, pz = dx / L * 0.5;
    var h = Math.max(ay, g(ax, az));
    for (i = 1; i <= n; i++) {
      var t = i / n, x = ax + dx * t, z = az + dz * t;
      var nh = Math.max(g(x, z), g(x + px, z + pz), g(x - px, z - pz));
      if (nh > h + 0.42) return false;
      h = nh;
    }
    return true;
  }

  function buildMatrix() {
    var n = NAV.nodes.length, m = [], i, j;
    for (i = 0; i < n; i++) {
      m.push([]);
      for (j = 0; j < n; j++) {
        if (i === j) { m[i].push(0); continue; }
        var a = NAV.nodes[i], b = NAV.nodes[j];
        m[i].push(segWalkable(a.x, a.z, Arena.groundHeight(a.x, a.z), b.x, b.z) ? hyp(b.x - a.x, b.z - a.z) : -1);
      }
    }
    NAV.matrix = m;
  }

  function route(sx, sz, sy, tx, tz) {
    if (segWalkable(sx, sz, sy, tx, tz)) return [{ x: tx, z: tz }];
    if (!NAV.matrix) buildMatrix();
    var nodes = NAV.nodes, n = nodes.length, i, j;
    var dist = [], prev = [], done = [];
    var toGoal = [];
    for (i = 0; i < n; i++) {
      var nd = nodes[i];
      dist.push(segWalkable(sx, sz, sy, nd.x, nd.z) ? hyp(nd.x - sx, nd.z - sz) : 1e9);
      prev.push(-1); done.push(false);
      toGoal.push(segWalkable(nd.x, nd.z, Arena.groundHeight(nd.x, nd.z), tx, tz) ? hyp(tx - nd.x, tz - nd.z) : -1);
    }
    var bestEnd = -1, bestTotal = 1e9;
    for (var it = 0; it < n; it++) {
      var u = -1, ud = 1e9;
      for (i = 0; i < n; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      if (toGoal[u] >= 0 && ud + toGoal[u] < bestTotal) { bestTotal = ud + toGoal[u]; bestEnd = u; }
      for (j = 0; j < n; j++) {
        var w = NAV.matrix[u][j];
        if (w > 0 && !done[j] && ud + w < dist[j]) { dist[j] = ud + w; prev[j] = u; }
      }
    }
    if (bestEnd < 0) return [{ x: tx, z: tz }]; // give up, go straight (unstick logic handles it)
    var path = [{ x: tx, z: tz }], c = bestEnd;
    while (c >= 0) { path.unshift({ x: nodes[c].x, z: nodes[c].z }); c = prev[c]; }
    return path;
  }

  /* ---------------- AI manager ---------------- */
  function AI(sim) {
    this.sim = sim;
    this.brains = {};
    this.teamTimer = 0;
    this.pred = null;
    this.predT = 0;
    this.enabled = true;
  }

  AI.segWalkable = segWalkable;
  AI.route = route;

  AI.prototype.addBot = function (pid, difficulty, personality) {
    var sim = this.sim;
    var pers = personality || Rules.PERSONALITY_LIST[Math.floor(sim.rng() * Rules.PERSONALITY_LIST.length)];
    this.brains[pid] = {
      pid: pid,
      diffName: difficulty || 'normal',
      diff: Rules.DIFFICULTY[difficulty] || Rules.DIFFICULTY.normal,
      persName: pers,
      pers: Rules.PERSONALITIES[pers] || Rules.PERSONALITIES.playmaker,
      role: 'support', decideT: sim.rng() * 0.3,
      tx: 0, tz: 0, sprint: false, arrive: 1.0, look: 0, face: null,
      path: null, pathT: 0, pathTx: 1e9, pathTz: 1e9,
      pulse: { jump: 0, dive: 0, grab: 0, pass: 0, shoot: 0 }, cool: { jump: 0, dive: 0, grab: 0, pass: 0, shoot: 0 },
      holdGrab: 0, holdShoot: false, shootErr: 0, holdPass: 0,
      spot: null, spotT: 0, stuckT: 0, unstickT: 0, udx: 0, udz: 0, lastX: 0, lastZ: 0, checkT: 0,
      callCd: 2 + sim.rng() * 2, dunkRun: false, markId: -1, dummy: false, passive: false,
      input: { mx: 0, mz: 0, look: 0, jump: false, sprint: false, dive: false, grab: false, pass: false, shoot: false, aim: false }
    };
    return this.brains[pid];
  };

  AI.prototype.removeBot = function (pid) { delete this.brains[pid]; };
  AI.prototype.isBot = function (pid) { return !!this.brains[pid]; };

  AI.prototype.update = function (dt) {
    var sim = this.sim, out = {}, pid;
    this.teamTimer -= dt;
    this.predT -= dt;
    var b = sim.ball;
    if (b.state === 'free' && this.predT <= 0) {
      this.pred = sim.predictBall(2.0, 1 / 20);
      this.predT = 0.1;
    } else if (b.state !== 'free') {
      this.pred = null;
    }
    if (this.teamTimer <= 0) { this.teamTimer = 0.25; this._assignRoles(); }
    for (pid in this.brains) {
      if (!this.brains.hasOwnProperty(pid)) continue;
      out[pid] = this._think(this.brains[pid], dt);
    }
    return out;
  };

  /* ---------------- helpers ---------------- */
  AI.prototype._ballPos = function () {
    var b = this.sim.ball;
    if (b.state === 'gone' || b.state === 'spawn' || b.state === 'dunked') return { x: Arena.ballSpawn.x, y: 1, z: Arena.ballSpawn.z };
    return { x: b.x, y: b.y, z: b.z };
  };

  AI.prototype._landing = function () {
    var pr = this.pred, i;
    if (!pr) return this._ballPos();
    for (i = 0; i < pr.length; i++) {
      if (pr[i].y < 2.3 && pr[i].t > 0.05) return pr[i];
    }
    return pr[pr.length - 1];
  };

  AI.prototype._opponents = function (team) {
    var r = [], ps = this.sim.players, i;
    for (i = 0; i < ps.length; i++) if (ps[i].team !== team && !ps[i].hidden) r.push(ps[i]);
    return r;
  };
  AI.prototype._mates = function (team) {
    var r = [], ps = this.sim.players, i;
    for (i = 0; i < ps.length; i++) if (ps[i].team === team && !ps[i].hidden) r.push(ps[i]);
    return r;
  };

  AI.prototype._openness = function (x, z, team) {
    var opp = this._opponents(team), m = 12, i;
    for (i = 0; i < opp.length; i++) { var d = hyp(opp[i].x - x, opp[i].z - z); if (d < m) m = d; }
    return m;
  };

  AI.prototype._laneClear = function (ax, az, bx, bz, team) {
    var opp = this._opponents(team), m = 12, i;
    var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    for (i = 0; i < opp.length; i++) {
      var o = opp[i];
      var t = clamp(((o.x - ax) * dx + (o.z - az) * dz) / L2, 0, 1);
      var d = hyp(ax + dx * t - o.x, az + dz * t - o.z);
      if (d < m) m = d;
    }
    return m;
  };

  AI.prototype._timeTo = function (p, x, z) {
    return hyp(x - p.x, z - p.z) / 9.5;
  };

  /* ---------------- role assignment ---------------- */
  AI.prototype._assignRoles = function () {
    var sim = this.sim, b = sim.ball, team, i;
    var holder = b.holder >= 0 ? sim.players[b.holder] : null;
    for (team = 0; team < 2; team++) {
      var mates = this._mates(team);
      var bots = [];
      for (i = 0; i < mates.length; i++) if (this.brains[mates[i].id] && !this.brains[mates[i].id].dummy) bots.push(mates[i]);
      if (!bots.length) continue;
      var own = sim.ownHoop(team), atk = sim.attackHoop(team);
      var self = this;
      var setRole = function (p, r) { var br = self.brains[p.id]; if (br.role !== r) { br.role = r; br.spotT = 0; } };

      if (holder && holder.team === team) {
        var others = [];
        for (i = 0; i < bots.length; i++) { if (bots[i] === holder) setRole(bots[i], 'carrier'); else others.push(bots[i]); }
        others.sort(function (a, c) { return hyp(a.x - atk.x, a.z - atk.z) - hyp(c.x - atk.x, c.z - atk.z); });
        for (i = 0; i < others.length; i++) {
          var br0 = this.brains[others[i].id];
          if (b.passTarget === others[i].id) { setRole(others[i], 'receive'); continue; }
          if (i >= 1 && (mates.length >= 3) && (br0.persName === 'defender' || i >= 2)) setRole(others[i], 'safety');
          else setRole(others[i], 'support');
        }
      } else if (holder) {
        // opponents have the ball
        var sorted = bots.slice().sort(function (a, c) { return hyp(a.x - holder.x, a.z - holder.z) - hyp(c.x - holder.x, c.z - holder.z); });
        var humanPressing = false;
        for (i = 0; i < mates.length; i++) {
          if (!this.brains[mates[i].id] && hyp(mates[i].x - holder.x, mates[i].z - holder.z) < 3.5) humanPressing = true;
        }
        var start = 0;
        if (!humanPressing || sorted.length >= 2) { setRole(sorted[0], 'pressure'); start = 1; }
        var rest = sorted.slice(start).sort(function (a, c) { return hyp(a.x - own.x, a.z - own.z) - hyp(c.x - own.x, c.z - own.z); });
        for (i = 0; i < rest.length; i++) setRole(rest[i], i === 0 ? 'defend' : 'mark');
      } else {
        // loose ball (or ball in flight / respawning)
        var L = this._landing();
        var cands = mates.slice().sort(function (a, c) { return self._timeTo(a, L.x, L.z) - self._timeTo(c, L.x, L.z); });
        var passTo = (b.state === 'free' && b.passTarget >= 0) ? sim.players[b.passTarget] : null;
        var recoverAssigned = false, remaining = [];
        if (passTo && passTo.team === team && this.brains[passTo.id]) { setRole(passTo, 'receive'); }
        var humanFirst = cands.length && !this.brains[cands[0].id];
        var opp = this._opponents(team), oppBest = 1e9;
        for (i = 0; i < opp.length; i++) oppBest = Math.min(oppBest, this._timeTo(opp[i], L.x, L.z));
        for (i = 0; i < cands.length; i++) {
          var c = cands[i];
          if (!this.brains[c.id] || this.brains[c.id].dummy) continue;
          if (passTo && c.id === passTo.id) continue;
          if (!recoverAssigned) {
            var myT = this._timeTo(c, L.x, L.z);
            if (humanFirst && !(passTo && passTo.team === team)) {
              var humT = this._timeTo(cands[0], L.x, L.z);
              // a human teammate has it covered unless an enemy wins the race
              if (humT < oppBest - 0.2 || myT > humT + 1.2) { remaining.push(c); recoverAssigned = true; continue; }
            }
            if (passTo && passTo.team === team) { remaining.push(c); continue; }
            setRole(c, 'recover'); recoverAssigned = true;
          } else {
            // second chaser only if very close and contested
            var myT2 = this._timeTo(c, L.x, L.z);
            if (myT2 < 0.45 && oppBest < 0.8 && remaining.length === 0) setRole(c, 'recover');
            else remaining.push(c);
          }
        }
        var inOwnHalf = (L.z - 0) * atk.side < 0; // ball on our defensive side
        for (i = 0; i < remaining.length; i++) {
          var rb = remaining[i];
          if (i === 0 && inOwnHalf) setRole(rb, 'defend');
          else if (i === 0) setRole(rb, 'support');
          else setRole(rb, inOwnHalf ? 'support' : 'safety');
        }
      }
    }
  };

  /* ---------------- per-bot thinking ---------------- */
  AI.prototype._pulse = function (br, k) {
    if (br.cool[k] > 0) return;
    br.pulse[k] = 1; br.cool[k] = 2;
  };

  AI.prototype._think = function (br, dt) {
    var sim = this.sim, p = sim.players[br.pid], inp = br.input;
    var k;
    for (k in br.cool) if (br.cool[k] > 0) br.cool[k]--;
    inp.jump = false; inp.dive = false; inp.pass = false; inp.shoot = false; inp.grab = false; inp.aim = false;
    if (!p || p.hidden || br.passive) { inp.mx = 0; inp.mz = 0; return inp; }

    var m = sim.match;
    if (m.phase === 'countdown') { inp.mx = 0; inp.mz = 0; inp.look = p.yaw; return inp; }
    if (m.phase === 'ended') {
      inp.mx = 0; inp.mz = 0;
      if (m.winner === p.team && p.grounded && sim.rng() < 0.03) this._pulse(br, 'jump');
      this._emitPulses(br, inp);
      return inp;
    }
    if (br.dummy) { inp.mx = 0; inp.mz = 0; this._emitPulses(br, inp); return inp; }

    br.decideT -= dt;
    var decide = false;
    if (br.decideT <= 0) { br.decideT = br.diff.react * (0.75 + sim.rng() * 0.5); decide = true; }

    var hasBall = sim.ball.holder === p.id;
    if (hasBall && br.role !== 'carrier') br.role = 'carrier';
    if (!hasBall && br.role === 'carrier') br.role = 'support';

    // continuous actions (every tick)
    this._continuous(br, p, dt, hasBall);

    if (decide) {
      switch (br.role) {
        case 'carrier': this._carrier(br, p); break;
        case 'support': this._support(br, p); break;
        case 'safety': this._safety(br, p); break;
        case 'pressure': this._pressure(br, p); break;
        case 'defend': this._defend(br, p); break;
        case 'mark': this._mark(br, p); break;
        case 'recover': this._recover(br, p); break;
        case 'receive': this._recover(br, p); break;
        default: this._support(br, p);
      }
    }

    this._steer(br, p, dt);
    this._emitPulses(br, inp);
    return inp;
  };

  AI.prototype._emitPulses = function (br, inp) {
    var k;
    for (k in br.pulse) { if (br.pulse[k] > 0) { inp[k] = true; br.pulse[k]--; } }
    if (br.holdGrab > 0) { inp.grab = true; }
    if (br.holdShoot) { inp.shoot = true; }
    if (br.holdPass > 0) { inp.pass = true; br.holdPass--; }
  };

  AI.prototype._continuous = function (br, p, dt, hasBall) {
    var sim = this.sim, i;
    if (br.holdGrab > 0) {
      br.holdGrab -= dt;
      if (p.grabTarget < 0 && br.holdGrab < 0.9) br.holdGrab = 0; // whiffed or released
    }
    // shooting: release when charge reaches desired
    if (br.holdShoot) {
      if (!hasBall) { br.holdShoot = false; }
      else {
        var h = sim.attackHoop(p.team);
        br.look = Math.atan2(h.x - p.x, h.z - p.z) + br.yawErr;
        br.tx = p.x; br.tz = p.z; br.sprint = false;
        var L = sim.shotLaunch(p, p.charge, br.look);
        var want = (L.perfect >= 0 ? L.perfect : 1) + br.shootErr;
        if (p.charging && p.charge >= clamp(want, 0.02, 1)) br.holdShoot = false;
        if (p.charging && p.charge >= 1) br.holdShoot = false;
      }
    }
    // dunk whenever eligible
    if (hasBall && !p.grounded && sim.dunkEligible(p)) this._pulse(br, 'shoot');
    // hop over a spinning bar
    if (p.grounded && p.state === 'normal') {
      var arms = Arena.arms, mul = sim.settings.obstacles;
      for (i = 0; i < arms.length; i++) {
        var a = arms[i];
        var fx = p.x + p.vx * 0.3, fz = p.z + p.vz * 0.3;
        var ang = Arena.armAngle(a, sim.time + 0.25, mul);
        var ax = Math.cos(ang), az = Math.sin(ang);
        var t = clamp((fx - a.x) * ax + (fz - a.z) * az, -a.len, a.len);
        var d = hyp(fx - (a.x + ax * t), fz - (a.z + az * t));
        if (d < 1.2 && Math.abs(t) > a.hubR && sim.rng() < 0.3 + br.diff.dodge) { this._pulse(br, 'jump'); break; }
      }
    }
    // dodge incoming dive tackles
    if (p.grounded && p.state === 'normal' && hasBall) {
      var opp = this._opponents(p.team);
      for (i = 0; i < opp.length; i++) {
        var o = opp[i];
        if (o.state !== 'dive') continue;
        var dx = p.x - o.x, dz = p.z - o.z, dd = hyp(dx, dz);
        if (dd < 3.2 && (o.vx * dx + o.vz * dz) / (dd || 1) > 6 && sim.rng() < br.diff.dodge * 0.25) { this._pulse(br, 'jump'); }
      }
    }
    // unstick
    br.checkT -= dt;
    if (br.checkT <= 0) {
      var moved = hyp(p.x - br.lastX, p.z - br.lastZ);
      var wants = hyp(br.tx - p.x, br.tz - p.z) > 2;
      if (wants && moved < 0.8 && p.state === 'normal' && p.grabbedBy < 0 && p.grabTarget < 0 && !p.charging) {
        br.stuckT += 1;
        if (br.stuckT >= 1) {
          br.unstickT = 0.7;
          var ang2 = sim.rng() * Math.PI * 2;
          br.udx = Math.cos(ang2); br.udz = Math.sin(ang2);
          br.path = null;
          this._pulse(br, 'jump');
        }
      } else br.stuckT = 0;
      br.lastX = p.x; br.lastZ = p.z; br.checkT = 1.0;
    }
  };

  AI.prototype._setTarget = function (br, x, z, sprint, arrive) {
    br.tx = x; br.tz = z; br.sprint = !!sprint && (this.sim.rng() < br.diff.sprintUse + 0.2); br.arrive = arrive || 1.0;
  };

  AI.prototype._steer = function (br, p, dt) {
    var sim = this.sim, inp = br.input;
    if (br.unstickT > 0) {
      br.unstickT -= dt;
      inp.mx = br.udx; inp.mz = br.udz; inp.sprint = false;
      inp.look = br.look;
      return;
    }
    var lim = Arena.halfW - 0.8, limz = Arena.halfL - 0.8;
    var tx = clamp(br.tx, -lim, lim), tz = clamp(br.tz, -limz, limz);
    // path planning (cached)
    br.pathT -= dt;
    if (!br.path || br.pathT <= 0 || hyp(tx - br.pathTx, tz - br.pathTz) > 2) {
      br.path = route(p.x, p.z, p.y, tx, tz);
      br.pathT = 0.6; br.pathTx = tx; br.pathTz = tz;
    }
    var wp = br.path[0];
    while (br.path.length > 1 && hyp(wp.x - p.x, wp.z - p.z) < 1.3) { br.path.shift(); wp = br.path[0]; }
    var dx = wp.x - p.x, dz = wp.z - p.z, d = hyp(dx, dz);
    var final = br.path.length === 1;
    var mag = 1;
    if (final) {
      if (d < br.arrive * 0.5) mag = 0;
      else if (d < br.arrive * 2.2) mag = clamp(d / (br.arrive * 2.2), 0.3, 1);
    }
    if (d > 0.001) { dx /= d; dz /= d; } else { dx = 0; dz = 0; }
    // avoid posts
    var posts = Arena.posts, i;
    for (i = 0; i < posts.length; i++) {
      var po = posts[i];
      var ox = po.x - p.x, oz = po.z - p.z, od = hyp(ox, oz);
      if (od < 3 && (ox * dx + oz * dz) > 0) {
        var side = (ox * dz - oz * dx) > 0 ? 1 : -1;
        dx += dz * side * 0.8 * (3 - od) / 3; dz -= dx * side * 0.0 + (-dx) * 0; // perpendicular nudge
        var nl = hyp(dx, dz) || 1; dx /= nl; dz /= nl;
      }
    }
    inp.mx = dx * mag; inp.mz = dz * mag;
    inp.sprint = br.sprint && mag > 0.8 && d > 3;
    inp.look = br.look;
    if (br.face !== null && mag === 0) { inp.look = br.face; }
  };

  /* ---------------- roles ---------------- */
  AI.prototype._carrier = function (br, p) {
    var sim = this.sim, h = sim.attackHoop(p.team), rng = sim.rng;
    var dx = h.x - p.x, dz = h.z - p.z, d = hyp(dx, dz);
    var hoopYaw = Math.atan2(dx, dz);
    br.look = hoopYaw;
    var opp = this._opponents(p.team), i;
    var threat = 99, threatFront = 99;
    for (i = 0; i < opp.length; i++) {
      var o = opp[i], od = hyp(o.x - p.x, o.z - p.z);
      if (o.state === 'stun') continue;
      if (od < threat) threat = od;
      var fdot = ((o.x - p.x) * dx + (o.z - p.z) * dz) / ((od || 1) * (d || 1));
      if (fdot > 0.5 && od < threatFront) threatFront = od;
    }
    if (p.charging || br.holdShoot) return;
    if (p.passHeld) return;

    // grabbed while holding the ball: get rid of it
    if (p.grabbedBy >= 0) {
      if (this._tryPass(br, p, 2.0, true)) return;
    }
    // human teammate calling for the ball
    var calling = null, mates = this._mates(p.team);
    for (i = 0; i < mates.length; i++) if (mates[i] !== p && !this.brains[mates[i].id] && mates[i].callT > 0) calling = mates[i];
    if (calling) {
      var open = this._openness(calling.x, calling.z, p.team);
      var lane = this._laneClear(p.x, p.z, calling.x, calling.z, p.team);
      var chance = br.diff.callPass * br.pers.pass + (open > 4 ? 0.25 : -0.2) + (lane > 2 ? 0.1 : -0.4);
      if (rng() < chance * 0.6) { this._passTo(br, p, calling); return; }
    }

    // shooting
    var shotRange = 13.5 * br.pers.range * br.diff.shotRangeMul;
    var canShoot = d > 6 && d < shotRange && p.grounded && (h.z - p.z) * h.side > 1.5;
    var openShot = threatFront > 3.2 && threat > 2.2;
    if (canShoot && openShot) {
      var pShoot = 0.22 * br.pers.shoot * (d > h.threeDist ? 0.8 : 1) * (d < 9 ? 0.6 : 1);
      if (rng() < pShoot) { this._startShot(br, p); return; }
    }
    // pressured: pass or panic shot
    if (threat < 2.6) {
      if (rng() < 0.6 * br.pers.pass && this._tryPass(br, p, 1.2, false)) return;
      if (canShoot && rng() < 0.25 * br.pers.shoot) { this._startShot(br, p); return; }
    } else if (rng() < 0.07 * br.pers.pass) {
      if (this._tryPass(br, p, 3.5, false)) return;
    }

    // drive: dunk run or approach
    var laneToHoop = this._laneClear(p.x, p.z, h.x, h.z, p.team);
    var wantDunk = (d < 10 && (laneToHoop > 1.6 || rng() < 0.3 * br.pers.dunk)) || br.pers.dunk > 1.5;
    if (wantDunk && d < 4.6 && d > 2.2 && p.grounded) {
      var sp = hyp(p.vx, p.vz);
      var toward = (p.vx * dx + p.vz * dz) / ((d || 1) * (sp || 1));
      if (sp > 3.5 && toward > 0.6) { this._pulse(br, 'jump'); }
    }
    // pick a pad route when a dunker is near a bounce pad lined up with the hoop
    var tx = h.x, tz = h.z - h.side * 1.2;
    if (br.pers.dunk > 1.2 || rng() < 0.25) {
      var pads = Arena.pads;
      for (i = 0; i < pads.length; i++) {
        var pd = pads[i];
        if (pd.type !== 'bounce' || (pd.z * h.side) < 0) continue;
        var pdist = hyp(pd.x - p.x, pd.z - p.z);
        var pdh = hyp(pd.x - h.x, pd.z - h.z);
        if (pdist < 7 && pdist > 1.2 && pdh < d - 1) { tx = pd.x + (h.x - pd.x) * 0.1; tz = pd.z + (h.z - pd.z) * 0.1; break; }
      }
    }
    // evade defenders: sidestep away from the nearest one in front
    if (threatFront < 4.5) {
      var sideX = -dz / (d || 1), sideZ = dx / (d || 1);
      var near = null, nd = 99;
      for (i = 0; i < opp.length; i++) { var q = opp[i], qd = hyp(q.x - p.x, q.z - p.z); if (qd < nd) { nd = qd; near = q; } }
      if (near) {
        var s = ((near.x - p.x) * sideX + (near.z - p.z) * sideZ) > 0 ? -1 : 1;
        tx = p.x + dx / d * 4 + sideX * s * 4; tz = p.z + dz / d * 4 + sideZ * s * 4;
      }
    }
    this._setTarget(br, tx, tz, threat > 3 || d > 8, 0.3);
  };

  AI.prototype._startShot = function (br, p) {
    var sim = this.sim;
    br.holdShoot = true;
    var g = 0; for (var i = 0; i < 3; i++) g += sim.rng(); g = (g / 3 - 0.5) * 3.4; // ~N(0,1)ish
    br.shootErr = g * br.diff.shotErr;
    br.yawErr = (sim.rng() - 0.5) * 2 * br.diff.yawErr;
    this._pulse(br, 'shoot');
    br.pulse.shoot = 0; // holdShoot keeps it held from this tick
  };

  AI.prototype._tryPass = function (br, p, minScore, desperate) {
    var sim = this.sim, mates = this._mates(p.team), h = sim.attackHoop(p.team);
    var best = null, bestS = -1e9, i;
    var myD = hyp(h.x - p.x, h.z - p.z);
    for (i = 0; i < mates.length; i++) {
      var t = mates[i];
      if (t === p || t.state === 'stun' || t.grabbedBy >= 0) continue;
      var dd = hyp(t.x - p.x, t.z - p.z);
      if (dd < 3 || dd > 30) continue;
      var open = Math.min(8, this._openness(t.x, t.z, p.team));
      var lane = this._laneClear(p.x, p.z, t.x, t.z, p.team);
      var fwd = myD - hyp(h.x - t.x, h.z - t.z);
      var s = open * 0.6 + fwd * 0.22 * br.diff.passSense - (lane < 1.6 ? 6 * br.diff.passSense : 0) - (dd > 22 ? 2 : 0);
      if (!this.brains[t.id]) s += 0.8 + (t.callT > 0 ? 2.5 : 0);
      if (s > bestS) { bestS = s; best = t; }
    }
    if (best && (bestS >= minScore || desperate)) { this._passTo(br, p, best); return true; }
    return false;
  };

  AI.prototype._passTo = function (br, p, t) {
    var sim = this.sim;
    var err = br.diff.passErr;
    var ax = t.x + (sim.rng() - 0.5) * err * 2, az = t.z + (sim.rng() - 0.5) * err * 2;
    var dx = ax - p.x, dz = az - p.z, d = hyp(dx, dz) || 1;
    // point the stick at the receiver for the press+release ticks (quick pass)
    br.tx = p.x + dx / d * 3; br.tz = p.z + dz / d * 3; br.sprint = false; br.path = null;
    br.input.mx = dx / d; br.input.mz = dz / d;
    br.look = Math.atan2(dx, dz);
    this._pulse(br, 'pass');
  };

  AI.prototype._supportSpots = function (team) {
    var sim = this.sim, a = sim.attackHoop(team).side;
    return [
      { x: -7, z: a * 15 }, { x: 7, z: a * 15 }, { x: 0, z: a * 19 },
      { x: -3.4, z: a * 20.8 }, { x: 3.4, z: a * 20.8 },
      { x: -9, z: a * 22 }, { x: 9, z: a * 22 }, { x: 0, z: a * 9 },
      { x: -8, z: a * 6 }, { x: 8, z: a * 6 }, { x: -3, z: a * 23.5 }, { x: 3, z: a * 23.5 }
    ];
  };

  AI.prototype._support = function (br, p) {
    var sim = this.sim, b = sim.ball, rng = sim.rng;
    var holder = b.holder >= 0 ? sim.players[b.holder] : null;
    var h = sim.attackHoop(p.team);
    var src = holder && holder.team === p.team ? holder : this._ballPos();
    br.spotT -= 0.25;
    if (!br.spot || br.spotT <= 0) {
      var spots = this._supportSpots(p.team), best = null, bestS = -1e9, i, j;
      var mates = this._mates(p.team);
      for (i = 0; i < spots.length; i++) {
        var s = spots[i];
        var open = Math.min(8, this._openness(s.x, s.z, p.team));
        var lane = this._laneClear(src.x, src.z, s.x, s.z, p.team);
        var crowd = 0;
        for (j = 0; j < mates.length; j++) {
          if (mates[j] === p) continue;
          var md = hyp(mates[j].x - s.x, mates[j].z - s.z);
          if (md < 6) crowd += (6 - md);
          var mb = this.brains[mates[j].id];
          if (mb && mb.spot && mb.spot.x === s.x && mb.spot.z === s.z) crowd += 6;
        }
        var fromSrc = hyp(s.x - src.x, s.z - src.z);
        var score = open * 0.8 + Math.min(lane, 4) * 0.9 * br.diff.passSense - crowd * 0.7 - hyp(s.x - p.x, s.z - p.z) * 0.06
          - (fromSrc > 24 ? 3 : 0) - (fromSrc < 4 ? 3 : 0) + (br.pers.dunk > 1.2 && hyp(s.x - h.x, s.z - h.z) < 8 ? 2 : 0) + rng() * 0.8;
        if (score > bestS) { bestS = score; best = s; }
      }
      br.spot = best; br.spotT = 1.4 + rng();
    }
    // face the ball carrier when arrived
    br.face = Math.atan2(src.x - p.x, src.z - p.z);
    br.look = br.face;
    this._setTarget(br, br.spot.x, br.spot.z, hyp(br.spot.x - p.x, br.spot.z - p.z) > 6, 1.2);
    // call for the ball from a human carrier when open
    br.callCd -= 0.25;
    if (holder && holder.team === p.team && !this.brains[holder.id] && br.callCd <= 0) {
      if (this._openness(p.x, p.z, p.team) > 4.5 && hyp(p.x - holder.x, p.z - holder.z) > 5) {
        this._pulse(br, 'pass'); br.callCd = 4 + rng() * 3;
      }
    }
  };

  AI.prototype._safety = function (br, p) {
    var sim = this.sim, own = sim.ownHoop(p.team), bp = this._ballPos();
    var tx = (bp.x * 0.3), tz = own.z * 0.25 + bp.z * 0.2;
    tz = own.side > 0 ? Math.max(tz, 0) : Math.min(tz, 0);
    br.look = Math.atan2(bp.x - p.x, bp.z - p.z); br.face = br.look;
    this._setTarget(br, tx, tz, false, 1.5);
  };

  AI.prototype._pressure = function (br, p) {
    var sim = this.sim, b = sim.ball, rng = sim.rng;
    var c = b.holder >= 0 ? sim.players[b.holder] : null;
    if (!c || c.team === p.team) { this._defend(br, p); return; }
    var own = sim.ownHoop(p.team);
    var lead = 0.25 + br.diff.intercept * 0.15;
    var tx = c.x + c.vx * lead, tz = c.z + c.vz * lead;
    // come from the goal side
    var gx = own.x - c.x, gz = own.z - c.z, gl = hyp(gx, gz) || 1;
    tx += gx / gl * 0.6; tz += gz / gl * 0.6;
    var dx = c.x - p.x, dz = c.z - p.z, d = hyp(dx, dz);
    br.look = Math.atan2(dx, dz);
    this._setTarget(br, tx, tz, true, 0.2);
    if (c.state === 'dunk') return;
    if (d < 1.8 && p.grabTarget < 0 && p.grabCd <= 0 && br.holdGrab <= 0) {
      if (rng() < 0.55 + br.diff.aggression * 0.4) { br.holdGrab = 1.2; }
    } else if (d > 2.0 && d < 5.2 && p.diveCd <= 0 && c.stunImmune <= 0 && p.grounded) {
      var chance = 0.18 * br.diff.aggression * br.pers.tackle;
      if (!c.grounded && d < 4) chance *= 2.5; // stop a dunk attempt
      if (rng() < chance) {
        var ld = d / 14;
        var ax = c.x + c.vx * ld - p.x, az = c.z + c.vz * ld - p.z, al = hyp(ax, az) || 1;
        br.input.mx = ax / al; br.input.mz = az / al;
        br.tx = p.x + ax; br.tz = p.z + az; br.path = null;
        this._pulse(br, 'dive');
      }
    }
  };

  AI.prototype._defend = function (br, p) {
    var sim = this.sim, b = sim.ball, rng = sim.rng, own = sim.ownHoop(p.team);
    var c = b.holder >= 0 ? sim.players[b.holder] : null;
    var threat = (c && c.team !== p.team) ? c : null;
    var bp = threat ? threat : this._ballPos();
    var hx = bp.x - own.x, hz = bp.z - own.z, hd = hyp(hx, hz) || 1;
    var stand = clamp(hd * 0.35 * br.pers.defend / 1.2, 2.5, 8);
    if (br.pers.defend > 1.5) stand = Math.min(stand, 5);
    var tx = own.x + hx / hd * stand, tz = own.z + hz / hd * stand;
    br.look = Math.atan2(bp.x - p.x, bp.z - p.z); br.face = br.look;
    if (threat) {
      var d = hyp(threat.x - p.x, threat.z - p.z);
      var tdh = hyp(threat.x - own.x, threat.z - own.z);
      if (tdh < 7.5) { tx = threat.x + threat.vx * 0.2; tz = threat.z + threat.vz * 0.2; }
      if (!threat.grounded && d < 3 && p.grounded && rng() < br.diff.block) this._pulse(br, 'jump');
      if (tdh < 9 && d > 1.8 && d < 4.5 && p.diveCd <= 0 && threat.stunImmune <= 0 && rng() < 0.2 * br.diff.aggression * br.pers.tackle) {
        var ax = threat.x - p.x, az = threat.z - p.z, al = hyp(ax, az) || 1;
        br.input.mx = ax / al; br.input.mz = az / al; br.path = null;
        this._pulse(br, 'dive');
      }
      if (d < 1.8 && br.holdGrab <= 0 && p.grabCd <= 0 && rng() < 0.5) br.holdGrab = 1.2;
    } else {
      this._intercept(br, p);
    }
    this._setTarget(br, tx, tz, hyp(tx - p.x, tz - p.z) > 5, 0.8);
  };

  AI.prototype._mark = function (br, p) {
    var sim = this.sim, own = sim.ownHoop(p.team), bp = this._ballPos(), b = sim.ball;
    var opp = this._opponents(p.team), best = null, bd = 1e9, i;
    for (i = 0; i < opp.length; i++) {
      var o = opp[i];
      if (o.id === b.holder) continue;
      var d = hyp(o.x - own.x, o.z - own.z) + hyp(o.x - p.x, o.z - p.z) * 0.5;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) { this._defend(br, p); return; }
    if (this._intercept(br, p)) return;
    // deny the lane: stand between mark and ball, goal side
    var dx = bp.x - best.x, dz = bp.z - best.z, dl = hyp(dx, dz) || 1;
    var gx = own.x - best.x, gz = own.z - best.z, gl = hyp(gx, gz) || 1;
    var tx = best.x + dx / dl * 1.8 + gx / gl * 1.0, tz = best.z + dz / dl * 1.8 + gz / gl * 1.0;
    br.look = Math.atan2(bp.x - p.x, bp.z - p.z); br.face = br.look;
    this._setTarget(br, tx, tz, hyp(tx - p.x, tz - p.z) > 4, 0.6);
  };

  /* Chase an enemy pass that passes near me. Returns true if intercepting. */
  AI.prototype._intercept = function (br, p) {
    var sim = this.sim, b = sim.ball, pr = this.pred, i;
    if (b.state !== 'free' || !b.inFlight || !b.lastThrow || b.lastThrow.team === p.team || !pr) return false;
    if (sim.rng() > br.diff.intercept) return false;
    for (i = 0; i < pr.length; i++) {
      var q = pr[i];
      if (q.y > 3.2) continue;
      var need = hyp(q.x - p.x, q.z - p.z) / 9.5 + 0.1;
      if (need <= q.t) {
        this._setTarget(br, q.x, q.z, true, 0.2);
        br.look = Math.atan2(q.x - p.x, q.z - p.z);
        if (q.y > 2.0 && q.t < 0.45 && hyp(q.x - p.x, q.z - p.z) < 1.8 && p.grounded) this._pulse(br, 'jump');
        return true;
      }
    }
    return false;
  };

  AI.prototype._recover = function (br, p) {
    var sim = this.sim, b = sim.ball, rng = sim.rng, pr = this.pred, i;
    var bp = this._ballPos();
    var tx = bp.x, tz = bp.z, tt = 0;
    if (b.state === 'free' && pr) {
      var found = false;
      for (i = 0; i < pr.length; i++) {
        var q = pr[i];
        var need = hyp(q.x - p.x, q.z - p.z) / 9.8 + 0.05;
        if (need <= q.t && q.y < 3.3) { tx = q.x; tz = q.z; tt = q.t; found = true; break; }
      }
      if (!found) { var last = this._landing(); tx = last.x; tz = last.z; }
    }
    br.look = Math.atan2(bp.x - p.x, bp.z - p.z);
    br.face = null;
    this._setTarget(br, tx, tz, true, 0.15);
    if (b.state !== 'free') return;
    var dx = b.x - p.x, dy = b.y - (p.y + 0.95), dz = b.z - p.z;
    var d3 = Math.sqrt(dx * dx + dy * dy + dz * dz), dh = hyp(dx, dz);
    if (d3 < P.reach - 0.1 && p.grabCd <= 0) this._pulse(br, 'grab');
    // jump for high balls
    if (dh < 2.2 && b.y > p.y + 2.2 && b.y < p.y + 4.4 && b.vy < 3 && p.grounded) this._pulse(br, 'jump');
    // dive for contested loose balls on the ground
    if (dh > 3 && dh < 6.5 && b.y < p.y + 1.6 && p.diveCd <= 0 && p.grounded) {
      var opp = this._opponents(p.team), close = false;
      for (i = 0; i < opp.length; i++) if (hyp(opp[i].x - b.x, opp[i].z - b.z) < dh + 1) close = true;
      if (close && rng() < 0.3 * br.diff.aggression) {
        br.input.mx = dx / dh; br.input.mz = dz / dh; br.path = null;
        this._pulse(br, 'dive');
      }
    }
  };

  return AI;
});
