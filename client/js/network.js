/* BEAN BALL ARENA - client/js/network.js
 * Socket.IO client: rooms/lobby calls, sequenced input upload, snapshot
 * buffering, reconnect. Only active when the page is served by the Bean
 * Ball server (window.BBA_SERVER + /socket.io/socket.io.js).
 *
 * Testing latency: add ?lag=100 to the URL to simulate a 100 ms round trip.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var P = BBA.Protocol, EV = P.EV;

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(root.location.search || '');
    return m ? decodeURIComponent(m[1]) : null;
  }
  function store(k, v) { try { if (v === null) root.sessionStorage.removeItem(k); else root.sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { var s = root.sessionStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  var Net = {
    available: !!(root.io && root.BBA_SERVER),
    socket: null, connected: false,
    code: null, token: null, pub: -1,
    lobby: null, inMatch: false,
    rtt: 0, lag: +(qs('lag') || 0),
    outbox: [], flushT: 0,
    onLobby: null, onStart: null, onSnapshot: null, onEnded: null, onNotice: null, onConnChange: null
  };

  Net.connect = function () {
    if (!Net.available || Net.socket) return;
    var s = root.io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000 });
    Net.socket = s;
    s.on('connect', function () {
      Net.connected = true;
      if (Net.onConnChange) Net.onConnChange(true);
      // rejoin after a drop or page refresh
      var sess = load('bba_room');
      if (sess && sess.code && sess.token) {
        Net.join(sess.code, sess.token, function (res) {
          if (!res.ok) { store('bba_room', null); Net.code = null; if (Net.onNotice) Net.onNotice('Could not rejoin room ' + sess.code + ': ' + res.error); }
        });
      }
    });
    s.on('disconnect', function () {
      Net.connected = false;
      if (Net.onConnChange) Net.onConnChange(false);
    });
    Net._on(EV.lobbyState, function (st) { Net.lobby = st; if (st.state === 'lobby') Net.inMatch = false; if (Net.onLobby) Net.onLobby(st); });
    Net._on(EV.startMatch, function (info) { Net.inMatch = true; if (Net.onStart) Net.onStart(info); });
    Net._on(EV.snapshot, function (snap) { if (Net.onSnapshot) Net.onSnapshot(snap); });
    Net._on(EV.matchEnded, function (res) { if (Net.onEnded) Net.onEnded(res); });
    Net._on(EV.playerJoined, function (d) { if (Net.onNotice) Net.onNotice(d.name + ' joined'); });
    Net._on(EV.playerDisconnected, function (d) { if (Net.onNotice) Net.onNotice(d.name + ' disconnected, a bot is covering (' + d.seconds + 's to return)'); });
    Net._on(EV.playerReconnected, function (d) { if (Net.onNotice) Net.onNotice(d.name + ' is back'); });
    setInterval(function () {
      if (!Net.connected) return;
      var t0 = performance.now();
      Net.emit('pingCheck', t0, function () { var r = performance.now() - t0; Net.rtt = Net.rtt ? Net.rtt * 0.7 + r * 0.3 : r; });
    }, 2000);
  };

  /* incoming handlers with optional simulated lag */
  Net._on = function (ev, fn) {
    Net.socket.on(ev, function (d) {
      if (Net.lag) setTimeout(function () { fn(d); }, Net.lag / 2); else fn(d);
    });
  };
  Net.emit = function (ev, d, cb) {
    if (!Net.socket) return;
    var go = function () {
      if (cb) Net.socket.emit(ev, d, function (r) { if (Net.lag) setTimeout(function () { cb(r); }, Net.lag / 2); else cb(r); });
      else Net.socket.emit(ev, d);
    };
    if (Net.lag) setTimeout(go, Net.lag / 2); else go();
  };

  function profile() {
    var S = BBA.Settings.data;
    return { name: S.name, cosmetics: S.cosmetics };
  }
  function remember(res) {
    if (res && res.ok) { Net.code = res.code; Net.token = res.token; Net.pub = res.pub; store('bba_room', { code: res.code, token: res.token }); }
  }

  Net.create = function (cb) {
    var d = profile();
    Net.emit(EV.createRoom, d, function (res) { remember(res); if (cb) cb(res); });
  };
  Net.join = function (code, token, cb) {
    var d = profile(); d.code = String(code || '').toUpperCase().trim(); d.token = token || null;
    Net.emit(EV.joinRoom, d, function (res) { remember(res); if (cb) cb(res); });
  };
  Net.leave = function () {
    Net.emit(EV.leaveRoom, {});
    store('bba_room', null);
    Net.code = null; Net.token = null; Net.pub = -1; Net.lobby = null; Net.inMatch = false;
  };
  Net.switchTeam = function () { Net.emit(EV.switchTeam, {}); };
  Net.ready = function (r) { Net.emit(EV.playerReady, { ready: !!r }); };
  Net.addBot = function (team) { Net.emit(EV.addBot, { team: team }); };
  Net.removeBot = function (team) { Net.emit(EV.removeBot, { team: team }); };
  Net.settings = function (patch) { Net.emit('setSettings', patch); };
  Net.start = function (cb) { Net.emit(EV.startMatch, {}, cb); };

  /* inputs are sent in small batches (every 2 ticks) */
  Net.queueInput = function (seq, inp) {
    Net.outbox.push(P.packInput(seq, inp));
    if (Net.outbox.length >= 2) Net.flush();
  };
  Net.flush = function () {
    if (!Net.outbox.length) return;
    // resend the previous packet too so one dropped packet never loses an input
    var batch = (Net.lastSent || []).concat(Net.outbox);
    Net.emit(EV.playerInput, batch);
    Net.lastSent = Net.outbox.slice(-2);
    Net.outbox = [];
  };

  Net.me = function () {
    var st = Net.lobby; if (!st) return null;
    for (var t = 0; t < 2; t++) for (var i = 0; i < st.teams[t].length; i++) { var s = st.teams[t][i]; if (s.pub === Net.pub) { s.team = t; return s; } }
    return null;
  };
  Net.isHost = function () { return !!(Net.lobby && Net.lobby.host === Net.pub); };
  Net.shareLink = function () {
    return root.location.origin + root.location.pathname + '?room=' + (Net.code || '');
  };
  Net.roomFromUrl = function () { var r = qs('room'); return r ? r.toUpperCase().slice(0, 8) : null; };

  BBA.Net = Net;
})(this);
