/* BEAN BALL ARENA - server/match.js
 * One authoritative match: runs the shared Sim + bot AI at 60 Hz, consumes
 * sequenced client inputs, broadcasts snapshots at 20 Hz, lets the AI
 * drive disconnected players until they reconnect.
 */
var Sim = require('../shared/sim.js');
var AI = require('../shared/ai.js');
var Protocol = require('../shared/protocol.js');
var C = require('../shared/constants.js');

var TICK = C.TICK;
var SNAP_EVERY = 3; // 60 / 3 = 20 snapshots per second

function Match(room, io) {
  this.room = room;
  this.io = io;
  this.running = false;
  var roster = [], cosmetics = [], owners = [], s = room.settings;
  var self = this;
  // team 0 slots then team 1 slots
  room.slotsByTeam().forEach(function (slots, team) {
    slots.forEach(function (slot) {
      if (slot.kind === 'human') {
        roster.push({ team: team, name: slot.member.name, isBot: false });
        cosmetics.push(slot.member.cosmetics);
        owners.push(slot.member.token);
      } else {
        roster.push({ team: team, name: slot.name, isBot: true });
        cosmetics.push(slot.cosmetics);
        owners.push(null);
      }
    });
  });
  this.seed = (Math.random() * 1e9) | 0;
  this.sim = new Sim({
    roster: roster, mode: 'match', seed: this.seed, countdown: 4,
    settings: {
      duration: s.duration, scoreLimit: s.scoreLimit, overtime: s.overtime, difficulty: s.difficulty, teamSize: s.teamSize,
      tackleStrength: s.tackleStrength, ballWeight: s.ballWeight, gravity: s.gravity, jumpHeight: s.jumpHeight,
      respawnTime: s.respawnTime, obstacles: s.obstacles, modifier: s.modifier
    }
  });
  this.ai = new AI(this.sim);
  this.owners = owners;          // pid -> member token (null for bots)
  this.cosmetics = cosmetics;
  this.inputs = {};              // pid -> { queue: [], last: input, ack: seq }
  var i;
  for (i = 0; i < roster.length; i++) {
    if (roster[i].isBot) this.ai.addBot(i, s.difficulty);
    else this.inputs[i] = { queue: [], last: Sim.emptyInput(), ack: 0 };
  }
  // any human that is not connected right now is driven by AI until they return
  for (i = 0; i < owners.length; i++) {
    if (owners[i]) { var m = room.memberByToken(owners[i]); if (!m || !m.connected) this.setAway(i, true); }
  }
  this.pendingEvents = [];
  this.endTimer = -1;
  this.t0 = 0; this.acc = 0;
}

Match.prototype.startInfo = function (token) {
  var sim = this.sim, pid = this.owners.indexOf(token);
  return {
    seed: this.seed, settings: sim.settings,
    roster: sim.players.map(function (p) { return { team: p.team, name: p.name, isBot: p.isBot }; }),
    humans: this.owners.map(function (o) { return !!o; }),
    cosmetics: this.cosmetics,
    you: pid,
    snapshot: Protocol.encodeSnapshot(sim, { acks: this.acks() })
  };
};

Match.prototype.pidOf = function (token) { return this.owners.indexOf(token); };

Match.prototype.setAway = function (pid, away) {
  if (away) { if (!this.ai.isBot(pid)) this.ai.addBot(pid, this.room.settings.difficulty); }
  else { this.ai.removeBot(pid); if (this.inputs[pid]) { this.inputs[pid].queue.length = 0; } }
};

/* Convert a human slot into a permanent bot (reconnect window expired). */
Match.prototype.convertToBot = function (pid) {
  this.owners[pid] = null;
  delete this.inputs[pid];
  if (!this.ai.isBot(pid)) this.ai.addBot(pid, this.room.settings.difficulty);
  this.sim.players[pid].isBot = true;
};

Match.prototype.onInput = function (pid, packets) {
  var st = this.inputs[pid];
  if (!st || !Array.isArray(packets)) return;
  for (var i = 0; i < packets.length && i < 12; i++) {
    var pk = packets[i];
    if (!Array.isArray(pk) || pk.length !== 5) continue;
    var u = Protocol.unpackInput(pk);
    if (u.seq <= st.ack || (st.queue.length && u.seq <= st.queue[st.queue.length - 1].seq)) continue;
    st.queue.push(u);
  }
  // don't let a lagging client build an unbounded backlog
  while (st.queue.length > 10) st.queue.shift();
};

Match.prototype.acks = function () {
  var a = {}, pid;
  for (pid in this.inputs) a[pid] = this.inputs[pid].ack;
  return a;
};

Match.prototype.start = function () {
  var self = this;
  this.running = true;
  var last = process.hrtime.bigint();
  this.timer = setInterval(function () {
    var now = process.hrtime.bigint();
    self.acc += Number(now - last) / 1e9;
    last = now;
    var steps = 0;
    while (self.acc >= TICK && steps < 8) { self.tick(); self.acc -= TICK; steps++; }
    if (steps >= 8) self.acc = 0;
  }, 1000 / 120);
};

Match.prototype.stop = function () {
  this.running = false;
  if (this.timer) clearInterval(this.timer);
  this.timer = null;
};

Match.prototype.tick = function () {
  var sim = this.sim, inputs = this.ai.update(TICK), pid;
  for (pid in this.inputs) {
    if (this.ai.isBot(+pid)) continue; // away: AI drives
    var st = this.inputs[pid];
    var next = st.queue.shift();
    if (next) { st.last = next.input; st.ack = next.seq; }
    inputs[pid] = st.last;
  }
  var ev = sim.step(inputs, TICK);
  for (var i = 0; i < ev.length; i++) this.pendingEvents.push(ev[i]);
  if (sim.tick % SNAP_EVERY === 0) this.broadcast();
  if (sim.match.phase === 'ended') {
    if (this.endTimer < 0) { this.endTimer = 0; this.broadcast(); this.io.to(this.room.channel()).emit(Protocol.EV.matchEnded, this.results()); }
    this.endTimer += TICK;
    if (this.endTimer > 9) { this.stop(); this.room.onMatchOver(this); }
  }
};

Match.prototype.broadcast = function () {
  var snap = Protocol.encodeSnapshot(this.sim, { acks: this.acks(), ev: this.pendingEvents });
  this.pendingEvents = [];
  this.io.to(this.room.channel()).emit(Protocol.EV.snapshot, snap);
};

Match.prototype.results = function () {
  var sim = this.sim;
  return {
    score: [sim.match.score[0], sim.match.score[1]], winner: sim.match.winner, overtime: sim.match.overtime,
    players: sim.players.map(function (p) { return { name: p.name, team: p.team, isBot: p.isBot, stats: p.stats }; })
  };
};

module.exports = Match;
