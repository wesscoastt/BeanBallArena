/* BEAN BALL ARENA - server/rooms.js
 * Private rooms: codes, members, teams, ready state, bots, host settings,
 * reconnect windows and handing a match back to the lobby.
 */
var Rules = require('../shared/gameRules.js');
var Protocol = require('../shared/protocol.js');
var Match = require('./match.js');

var LOBBY_GRACE = 20;                      // seconds a disconnected lobby member keeps their seat
var MATCH_GRACE = Protocol.RECONNECT_SECONDS;

var DEFAULT_SETTINGS = Rules.merge(Rules.DEFAULTS, { autoFillBots: true, warmup: 60 });

var LIMITS = {
  teamSize: [1, 3, 'int'], duration: [60, 600, 'int'], scoreLimit: [0, 99, 'int'], tackleStrength: [0.3, 2, 'num'],
  ballWeight: [0.5, 2, 'num'], gravity: [0.4, 1.6, 'num'], jumpHeight: [0.6, 1.8, 'num'], respawnTime: [0.5, 8, 'num'], obstacles: [0, 2.5, 'num'], warmup: [-1, 180, 'int']
};
var CHOICES = {
  difficulty: ['easy', 'normal', 'hard'],
  modifier: ['none', 'superbounce', 'lowgravity', 'heavyball', 'megaball', 'turbo'],
  overtime: [true, false], autoFillBots: [true, false], arena: require('../shared/arenaDef.js').ids
};

function cleanName(n) {
  n = String(n || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return n || 'Player';
}
function cleanCosmetics(c) {
  var out = {}, k, ok = /^[a-z0-9_]{1,20}$/i;
  if (!c || typeof c !== 'object') return null;
  ['pattern', 'face', 'hat', 'upper', 'lower', 'celebration', 'victory'].forEach(function (k2) { if (ok.test(String(c[k2] || ''))) out[k2] = String(c[k2]); });
  ['color', 'color2'].forEach(function (k2) { if (/^#[0-9a-f]{6}$/i.test(String(c[k2] || ''))) out[k2] = String(c[k2]); });
  var num = parseInt(c.number, 10); out.number = isNaN(num) ? 7 : Math.max(0, Math.min(99, num));
  out.jerseyColor = /^#[0-9a-f]{6}$/i.test(String(c.jerseyColor || '')) ? String(c.jerseyColor) : 'team';
  out.jerseyName = String(c.jerseyName || '').toUpperCase().replace(/[^A-Z0-9 .'\-]/g, '').trim().slice(0, 10);
  return out;
}

var pubCounter = 1;

function Room(code, io, rooms) {
  this.code = code;
  this.io = io;
  this.rooms = rooms;
  this.members = [];            // {pub, token, name, cosmetics, team, ready, connected, socketId, host, graceTimer}
  this.bots = [[], []];         // manual bots per team: {name}
  this.settings = Rules.merge(DEFAULT_SETTINGS, {});
  this.state = 'lobby';
  this.match = null;
  this.lastResults = null;
}

Room.prototype.channel = function () { return 'room:' + this.code; };
Room.prototype.memberByToken = function (t) { for (var i = 0; i < this.members.length; i++) if (this.members[i].token === t) return this.members[i]; return null; };
Room.prototype.humansOn = function (team) { return this.members.filter(function (m) { return m.team === team; }).length; };
Room.prototype.host = function () { for (var i = 0; i < this.members.length; i++) if (this.members[i].host) return this.members[i]; return null; };

Room.prototype.usedBotNames = function () {
  var used = {};
  this.bots.forEach(function (list) { list.forEach(function (b) { used[b.name] = 1; }); });
  return used;
};
Room.prototype.newBotName = function () {
  var used = this.usedBotNames(), pool = Rules.BOT_NAMES.filter(function (n) { return !used[n]; });
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'Bot' + Math.floor(Math.random() * 99);
};

/* Slots in play order (what a match will use). */
Room.prototype.slotsByTeam = function () {
  var self = this, out = [[], []], t, size = this.settings.teamSize;
  for (t = 0; t < 2; t++) {
    this.members.forEach(function (m) { if (m.team === t) out[t].push({ kind: 'human', member: m }); });
    this.bots[t].forEach(function (b) { if (out[t].length < size) out[t].push({ kind: 'bot', name: b.name, cosmetics: null }); });
    if (this.settings.autoFillBots) {
      while (out[t].length < size) {
        var nm = this.newBotName(), used = {};
        out[0].concat(out[1]).forEach(function (s2) { if (s2.kind === 'bot') used[s2.name] = 1; });
        var tries = 0;
        while (used[nm] && tries++ < 30) nm = this.newBotName();
        out[t].push({ kind: 'bot', name: nm, cosmetics: null, auto: true });
      }
    }
  }
  return out;
};

Room.prototype.lobbyState = function () {
  var size = this.settings.teamSize, self = this;
  var teams = [0, 1].map(function (t) {
    var slots = [];
    self.members.forEach(function (m) { if (m.team === t) slots.push({ kind: 'human', pub: m.pub, name: m.name, ready: m.ready, host: m.host, connected: m.connected, color: (m.cosmetics && m.cosmetics.color) || '#ffd23f' }); });
    self.bots[t].forEach(function (b) { if (slots.length < size) slots.push({ kind: 'bot', name: b.name }); });
    while (slots.length < size) slots.push({ kind: self.settings.autoFillBots ? 'autobot' : 'empty' });
    return slots;
  });
  var h = this.host();
  return { code: this.code, state: this.state, teams: teams, settings: this.settings, host: h ? h.pub : -1, humans: this.members.length, maxHumans: Protocol.MAX_HUMANS };
};

Room.prototype.broadcastLobby = function () {
  this.io.to(this.channel()).emit(Protocol.EV.lobbyState, this.lobbyState());
};

Room.prototype.addMember = function (socket, name, cosmetics, token) {
  if (this.members.length >= Protocol.MAX_HUMANS) return { error: 'Room is full (6 players max).' };
  var size = this.settings.teamSize;
  var t0 = this.humansOn(0), t1 = this.humansOn(1), team;
  if (t0 < size && (t0 <= t1 || t1 >= size)) team = 0;
  else if (t1 < size) team = 1;
  else if (size < 3) { this.settings.teamSize = size + 1; team = t0 <= t1 ? 0 : 1; }
  else return { error: 'Both teams are full.' };
  // a new human takes a bot's seat if needed
  if (this.humansOn(team) + this.bots[team].length >= this.settings.teamSize) this.bots[team].pop();
  var m = {
    pub: pubCounter++, token: token, name: cleanName(name), cosmetics: cleanCosmetics(cosmetics), team: team,
    ready: false, connected: true, socketId: socket.id, host: this.members.length === 0, graceTimer: null
  };
  this.members.push(m);
  socket.join(this.channel());
  socket.data.room = this.code; socket.data.token = token;
  return { member: m };
};

Room.prototype.removeMember = function (m) {
  var i = this.members.indexOf(m);
  if (i < 0) return;
  if (m.graceTimer) clearTimeout(m.graceTimer);
  this.members.splice(i, 1);
  if (m.host && this.members.length) {
    var next = this.members.filter(function (x) { return x.connected; })[0] || this.members[0];
    next.host = true;
  }
  if (this.match) {
    var pid = this.match.pidOf(m.token);
    if (pid >= 0) this.match.convertToBot(pid);
  }
  if (!this.members.length) { this.destroy(); return; }
  this.broadcastLobby();
};

Room.prototype.destroy = function () {
  if (this.match) this.match.stop();
  this.match = null;
  delete this.rooms[this.code];
};

Room.prototype.onDisconnect = function (m) {
  var self = this;
  m.connected = false; m.socketId = null;
  if (this.match) {
    var pid = this.match.pidOf(m.token);
    if (pid >= 0) this.match.setAway(pid, true);
    this.io.to(this.channel()).emit(Protocol.EV.playerDisconnected, { name: m.name, seconds: MATCH_GRACE });
  }
  var grace = this.match ? MATCH_GRACE : LOBBY_GRACE;
  if (m.graceTimer) clearTimeout(m.graceTimer);
  m.graceTimer = setTimeout(function () {
    m.graceTimer = null;
    if (!m.connected) self.removeMember(m);
  }, grace * 1000);
  this.broadcastLobby();
};

Room.prototype.onReconnect = function (socket, m) {
  if (m.graceTimer) { clearTimeout(m.graceTimer); m.graceTimer = null; }
  m.connected = true; m.socketId = socket.id;
  socket.join(this.channel());
  socket.data.room = this.code; socket.data.token = m.token;
  if (this.match) {
    var pid = this.match.pidOf(m.token);
    if (pid >= 0) {
      this.match.setAway(pid, false);
      socket.emit(Protocol.EV.startMatch, this.match.startInfo(m.token));
    }
    this.io.to(this.channel()).emit(Protocol.EV.playerReconnected, { name: m.name });
  }
  this.broadcastLobby();
};

Room.prototype.setSettings = function (patch) {
  var s = this.settings, k;
  if (!patch || typeof patch !== 'object') return;
  if (patch.restoreDefaults) { this.settings = Rules.merge(DEFAULT_SETTINGS, {}); this.trimBots(); return; }
  for (k in patch) {
    if (!patch.hasOwnProperty(k)) continue;
    if (LIMITS[k]) {
      var v = Number(patch[k]);
      if (isNaN(v)) continue;
      v = Math.max(LIMITS[k][0], Math.min(LIMITS[k][1], v));
      if (LIMITS[k][2] === 'int') v = Math.round(v);
      if (k === 'teamSize' && (v < this.humansOn(0) || v < this.humansOn(1))) continue; // can't shrink below humans
      s[k] = v;
    } else if (CHOICES[k] && CHOICES[k].indexOf(patch[k]) >= 0) {
      s[k] = patch[k];
    }
  }
  this.trimBots();
};

Room.prototype.trimBots = function () {
  for (var t = 0; t < 2; t++) {
    var room = this.settings.teamSize - this.humansOn(t);
    while (this.bots[t].length > Math.max(0, room)) this.bots[t].pop();
  }
};

Room.prototype.switchTeam = function (m) {
  var other = 1 - m.team;
  if (this.humansOn(other) >= this.settings.teamSize) {
    if (this.humansOn(other) + 0 < this.settings.teamSize) return false;
    return false;
  }
  m.team = other; m.ready = false;
  if (this.humansOn(other) + this.bots[other].length > this.settings.teamSize) this.bots[other].pop();
  return true;
};

Room.prototype.addBot = function (team) {
  if (team !== 0 && team !== 1) return;
  if (this.humansOn(team) + this.bots[team].length >= this.settings.teamSize) return;
  this.bots[team].push({ name: this.newBotName() });
};
Room.prototype.removeBot = function (team) {
  if (team !== 0 && team !== 1) return;
  this.bots[team].pop();
};

Room.prototype.canStart = function () {
  var self = this, notReady = this.members.filter(function (m) { return !m.host && m.connected && !m.ready; });
  if (notReady.length) return 'Waiting for ' + notReady.map(function (m) { return m.name; }).join(', ') + ' to be ready.';
  var slots = this.slotsByTeamPreview();
  if (slots[0] === 0 || slots[1] === 0) return 'Each team needs at least one player or bot.';
  return '';
};
Room.prototype.slotsByTeamPreview = function () {
  var size = this.settings.teamSize, self = this;
  return [0, 1].map(function (t) {
    var n = self.humansOn(t) + self.bots[t].length;
    if (self.settings.autoFillBots) n = size;
    return Math.min(n, size);
  });
};

Room.prototype.startMatch = function () {
  var self = this;
  this.state = 'match';
  this.match = new Match(this, this.io);
  this.members.forEach(function (m) {
    if (!m.socketId) return;
    var sock = self.io.sockets.sockets.get(m.socketId);
    if (sock) sock.emit(Protocol.EV.startMatch, self.match.startInfo(m.token));
  });
  this.match.start();
  this.broadcastLobby();
};

Room.prototype.onMatchOver = function (match) {
  if (this.match !== match) return;
  this.lastResults = match.results();
  this.match = null;
  this.state = 'lobby';
  var t;
  this.members.forEach(function (m) { m.ready = false; });
  var gone = this.members.filter(function (m) { return !m.connected; });
  for (t = 0; t < gone.length; t++) this.removeMember(gone[t]);
  if (this.rooms[this.code]) this.broadcastLobby();
};

function Rooms(io) { this.io = io; this.rooms = {}; }
Rooms.prototype.create = function () {
  var code, n = 0;
  do { code = Protocol.roomCode(); n++; } while (this.rooms[code] && n < 50);
  var r = new Room(code, this.io, this.rooms);
  this.rooms[code] = r;
  return r;
};
Rooms.prototype.get = function (code) { return this.rooms[String(code || '').toUpperCase().trim()] || null; };
Rooms.prototype.count = function () { return Object.keys(this.rooms).length; };

module.exports = { Rooms: Rooms, Room: Room, cleanName: cleanName };
