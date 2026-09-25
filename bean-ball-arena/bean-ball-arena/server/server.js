/* BEAN BALL ARENA - server/server.js
 * One Node process that serves the game client AND runs authoritative
 * online matches over Socket.IO. Deploy anywhere that runs Node 18+
 * (Render, Railway, Fly.io, a VPS...). Players just open the URL.
 *
 *   cd server && npm install && npm start      -> http://localhost:3000
 *   PORT=8080 npm start
 *   LAG_MS=80 npm start                        -> simulate latency for testing
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var Protocol = require('../shared/protocol.js');
var RoomsMod = require('./rooms.js');

var PORT = process.env.PORT || 3000;
var LAG = +(process.env.LAG_MS || 0);
var ROOT = path.join(__dirname, '..');
var EV = Protocol.EV;

var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}

var indexCache = null;
function indexHtml() {
  if (indexCache && process.env.NODE_ENV === 'production') return indexCache;
  var html = fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8');
  html = html.replace(/\.\.\/shared\//g, 'shared/');
  // online-capable build: load the socket.io client from this server
  html = html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script src="/socket.io/socket.io.js"></script>\n<script>window.BBA_SERVER = true;</script>');
  indexCache = html;
  return html;
}

function serveStatic(req, res) {
  var url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/' || url === '/index.html') return send(res, 200, indexHtml(), MIME['.html']);
  if (url === '/health') return send(res, 200, JSON.stringify({ ok: true, rooms: rooms.count() }), MIME['.json']);
  var file = null;
  if (url === '/styles.css') file = path.join(ROOT, 'client', 'styles.css');
  else if (url.indexOf('/js/') === 0) file = path.join(ROOT, 'client', 'js', path.basename(url));
  else if (url.indexOf('/shared/') === 0) file = path.join(ROOT, 'shared', path.basename(url));
  if (!file) return send(res, 404, 'Not found');
  fs.readFile(file, function (err, data) {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

var server = http.createServer(serveStatic);
var io = require('socket.io')(server, { cors: { origin: '*' }, pingInterval: 5000, pingTimeout: 8000 });
var rooms = new RoomsMod.Rooms(io);

function withLag(fn) {
  if (!LAG) return fn;
  return function () { var a = arguments, self = this; setTimeout(function () { fn.apply(self, a); }, LAG / 2); };
}

io.on('connection', function (socket) {
  socket.data = socket.data || {};
  function ack(cb, obj) { if (typeof cb === 'function') cb(obj); }
  function myRoom() { return socket.data.room ? rooms.get(socket.data.room) : null; }
  function me() { var r = myRoom(); return r ? r.memberByToken(socket.data.token) : null; }
  function isHost() { var m = me(); return !!(m && m.host); }

  socket.on(EV.createRoom, withLag(function (d, cb) {
    d = d || {};
    if (myRoom()) leave();
    var room = rooms.create();
    var token = crypto.randomBytes(12).toString('hex');
    var r = room.addMember(socket, d.name, d.cosmetics, token);
    if (r.error) return ack(cb, { ok: false, error: r.error });
    ack(cb, { ok: true, code: room.code, token: token, pub: r.member.pub });
    room.broadcastLobby();
  }));

  socket.on(EV.joinRoom, withLag(function (d, cb) {
    d = d || {};
    var room = rooms.get(d.code);
    if (!room) return ack(cb, { ok: false, error: 'No room with code ' + String(d.code || '').toUpperCase().slice(0, 8) + '.' });
    // reconnect with an existing seat
    if (d.token) {
      var existing = room.memberByToken(String(d.token));
      if (existing) {
        ack(cb, { ok: true, code: room.code, token: existing.token, pub: existing.pub, reconnected: true });
        room.onReconnect(socket, existing);
        return;
      }
    }
    if (room.state === 'match') return ack(cb, { ok: false, error: 'That match already started. Ask the host to let you in after it ends.' });
    if (myRoom()) leave();
    var token = crypto.randomBytes(12).toString('hex');
    var r = room.addMember(socket, d.name, d.cosmetics, token);
    if (r.error) return ack(cb, { ok: false, error: r.error });
    ack(cb, { ok: true, code: room.code, token: token, pub: r.member.pub });
    socket.to(room.channel()).emit(EV.playerJoined, { name: r.member.name });
    room.broadcastLobby();
  }));

  function leave() {
    var room = myRoom(), m = me();
    socket.leave(room ? room.channel() : '');
    socket.data.room = null;
    if (room && m) room.removeMember(m);
  }
  socket.on(EV.leaveRoom, function () { leave(); });

  socket.on(EV.switchTeam, function () {
    var room = myRoom(), m = me();
    if (!room || !m || room.state !== 'lobby') return;
    if (room.switchTeam(m)) room.broadcastLobby();
  });
  socket.on(EV.playerReady, function (d) {
    var room = myRoom(), m = me();
    if (!room || !m || room.state !== 'lobby') return;
    m.ready = !!(d && d.ready);
    room.broadcastLobby();
  });
  socket.on(EV.addBot, function (d) {
    var room = myRoom();
    if (!room || !isHost() || room.state !== 'lobby') return;
    room.addBot(d && d.team); room.broadcastLobby();
  });
  socket.on(EV.removeBot, function (d) {
    var room = myRoom();
    if (!room || !isHost() || room.state !== 'lobby') return;
    room.removeBot(d && d.team); room.broadcastLobby();
  });
  socket.on(EV.setBotDifficulty, function (d) {
    var room = myRoom();
    if (!room || !isHost() || room.state !== 'lobby') return;
    room.setSettings({ difficulty: d && d.difficulty }); room.broadcastLobby();
  });
  socket.on('setSettings', function (d) {
    var room = myRoom();
    if (!room || !isHost() || room.state !== 'lobby') return;
    room.setSettings(d); room.broadcastLobby();
  });
  socket.on(EV.startMatch, function (d, cb) {
    var room = myRoom();
    if (!room || !isHost()) return ack(cb, { ok: false, error: 'Only the host can start.' });
    if (room.state !== 'lobby') return ack(cb, { ok: false, error: 'Match already running.' });
    var why = room.canStart();
    if (why) return ack(cb, { ok: false, error: why });
    room.startMatch();
    ack(cb, { ok: true });
  });
  socket.on(EV.playerInput, withLag(function (packets) {
    var room = myRoom();
    if (!room || !room.match) return;
    var pid = room.match.pidOf(socket.data.token);
    if (pid >= 0) room.match.onInput(pid, packets);
  }));
  socket.on('pingCheck', function (t, cb) { ack(cb, t); });

  socket.on('disconnect', function () {
    var room = myRoom(), m = me();
    if (room && m && m.socketId === socket.id) room.onDisconnect(m);
  });
});

server.listen(PORT, function () {
  console.log('Bean Ball Arena server running on http://localhost:' + PORT + (LAG ? ' (simulated lag ' + LAG + 'ms)' : ''));
});

module.exports = { server: server, io: io, rooms: rooms };
