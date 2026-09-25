/* End-to-end multiplayer test against a running server.
 * node tests/net_test.js [url]   (default http://localhost:3100)
 * Two clients: create room, join by code, bots, ready, start, inputs,
 * snapshots, disconnect + reconnect with the same seat, match end.
 */
var io = require('../server/node_modules/socket.io-client');
var P = require('../shared/protocol.js');
var URL = process.argv[2] || 'http://localhost:3100';
var EV = P.EV;
var pass = 0, fail = 0;
function ok(c, name, extra) { if (c) { pass++; console.log('  ok  ' + name + (extra ? '  (' + extra + ')' : '')); } else { fail++; console.log('  FAIL ' + name + (extra ? '  (' + extra + ')' : '')); } }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function emitAck(s, ev, d) { return new Promise(function (r) { s.emit(ev, d, r); }); }
function client() { return io(URL, { transports: ['websocket'], forceNew: true, reconnection: false }); }
function connected(s) { return new Promise(function (r) { if (s.connected) r(); else s.on('connect', r); }); }

(async function () {
  var A = client(), B = client();
  await connected(A); await connected(B);
  var lobbyA = null, lobbyB = null;
  A.on(EV.lobbyState, function (s) { lobbyA = s; });
  B.on(EV.lobbyState, function (s) { lobbyB = s; });

  console.log('rooms');
  var ra = await emitAck(A, EV.createRoom, { name: 'Wes<script>', cosmetics: { color: '#ff0000', hat: 'crown', number: 12 } });
  ok(ra.ok && /^[A-Z0-9]{5}$/.test(ra.code), 'create room returns 5-char code', ra.code);
  var bad = await emitAck(B, EV.joinRoom, { code: 'ZZZZZ', name: 'Friend' });
  ok(!bad.ok, 'wrong code is rejected', bad.error);
  var rb = await emitAck(B, EV.joinRoom, { code: ra.code.toLowerCase(), name: 'Friend' });
  ok(rb.ok, 'join with code (case-insensitive)');
  await wait(150);
  ok(lobbyA && lobbyA.humans === 2, 'both players in the same lobby', lobbyA && lobbyA.humans);
  var names = lobbyA.teams[0].concat(lobbyA.teams[1]).filter(function (s) { return s.kind === 'human'; }).map(function (s) { return s.name; });
  ok(names.indexOf('Wesscript') >= 0 || names.indexOf('Wes') === 0 || names.join(',').indexOf('<') < 0, 'names sanitized', names.join(','));
  ok(lobbyA.teams[0].length === 3 && lobbyA.teams[1].length === 3, '3v3 slots shown');

  console.log('lobby controls');
  B.emit(EV.switchTeam, {}); await wait(120);
  var meB = lobbyA.teams[0].concat(lobbyA.teams[1]).filter(function (s) { return s.pub === rb.pub; })[0];
  var teamB = lobbyA.teams[0].indexOf(meB) >= 0 ? 0 : 1;
  ok(teamB === 0, 'switch team moves Friend onto Blue with Wes', 'team ' + teamB);
  B.emit('setSettings', { duration: 5 }); await wait(100);
  ok(lobbyA.settings.duration !== 5, 'non-host cannot change settings');
  A.emit('setSettings', { duration: 60, difficulty: 'hard', autoFillBots: false }); await wait(120);
  ok(lobbyA.settings.duration === 60 && lobbyA.settings.difficulty === 'hard', 'host changes settings');
  A.emit(EV.addBot, { team: 1 }); A.emit(EV.addBot, { team: 1 }); A.emit(EV.addBot, { team: 0 }); await wait(150);
  var red = lobbyA.teams[1].filter(function (s) { return s.kind === 'bot'; }).length;
  ok(red === 2, 'host adds bots', red + ' red bots');
  var st0 = await emitAck(A, EV.startMatch, {});
  ok(!st0.ok, 'cannot start until everyone is ready', st0.error);
  B.emit(EV.playerReady, { ready: true }); await wait(120);

  console.log('match');
  var startA = null, startB = null, snapsA = [], snapsB = [], endRes = null;
  A.on(EV.startMatch, function (i) { startA = i; });
  B.on(EV.startMatch, function (i) { startB = i; });
  A.on(EV.snapshot, function (s) { snapsA.push({ s: s, at: Date.now() }); });
  B.on(EV.snapshot, function (s) { snapsB.push({ s: s, at: Date.now() }); });
  A.on(EV.matchEnded, function (r) { endRes = r; });
  var st = await emitAck(A, EV.startMatch, {});
  ok(st.ok, 'host starts the match');
  await wait(300);
  ok(startA && startB && startA.you !== startB.you, 'both get matchStart with different player slots', startA && startA.you + ' / ' + startB.you);
  ok(startA.roster.length === 5, '2 humans + 3 bots in roster (2v... with auto-fill off)', startA.roster.map(function (r) { return r.name + (r.isBot ? '*' : ''); }).join(','));
  // send inputs from B: run forward for 5 seconds
  var seq = 0, youB = startB.you, t0 = Date.now();
  var sendLoop = setInterval(function () {
    var pk = [];
    for (var k = 0; k < 2; k++) { seq++; pk.push(P.packInput(seq, { mx: 0, mz: 1, look: 0, sprint: true, jump: seq % 90 < 2 })); }
    B.emit(EV.playerInput, pk);
  }, 33);
  await wait(6000);
  clearInterval(sendLoop);
  var n = snapsA.length, dtAvg = (snapsA[n - 1].at - snapsA[0].at) / (n - 1);
  ok(Math.abs(1000 / dtAvg - 20) < 4, 'snapshots at ~20 Hz', (1000 / dtAvg).toFixed(1) + ' Hz');
  var last = snapsB[snapsB.length - 1].s;
  ok(last.acks[youB] > 250, 'server acknowledges B inputs', 'ack ' + last.acks[youB] + ' of ' + seq);
  var pB = P.decodePlayer(last.p[youB], {});
  ok(pB.z > -20, 'B player moved on the server (dropped off the deck)', 'z=' + pB.z.toFixed(1) + ' y=' + pB.y.toFixed(1));
  var sameA = P.decodePlayer(snapsA[snapsA.length - 1].s.p[youB], {});
  ok(Math.abs(sameA.z - pB.z) < 1.5, 'A sees B at the same place (one authoritative state)');
  var bytes = JSON.stringify(last).length;
  ok(bytes < 4000, 'snapshot size reasonable', bytes + ' bytes -> ~' + Math.round(bytes * 20 / 1024) + ' KB/s');
  // spoofed input can't teleport or score
  B.emit(EV.playerInput, [[seq + 1, 9999, 9999, 99999, 255]]); await wait(200);
  var pB2 = P.decodePlayer(snapsB[snapsB.length - 1].s.p[youB], {});
  ok(Math.abs(pB2.x) <= 20 && Math.abs(pB2.z) <= 34, 'garbage input is clamped by the server');

  console.log('disconnect / reconnect');
  var tokenB = rb.token, code = ra.code;
  B.disconnect();
  await wait(1200);
  var laterA = snapsA[snapsA.length - 1].s;
  ok(laterA.m[0] === 'play' || laterA.m[0] === 'countdown' || laterA.m[0] === 'scored', 'match keeps running when a player drops', laterA.m[0]);
  var B2 = client(); await connected(B2);
  var start2 = null; B2.on(EV.startMatch, function (i) { start2 = i; });
  var rj = await emitAck(B2, EV.joinRoom, { code: code, token: tokenB, name: 'Friend' });
  await wait(400);
  ok(rj.ok && rj.reconnected && start2 && start2.you === youB, 'reconnect returns the same seat', 'slot ' + (start2 && start2.you));
  var C = client(); await connected(C);
  var rc = await emitAck(C, EV.joinRoom, { code: code, name: 'Late' });
  ok(!rc.ok, 'new players cannot join mid-match', rc.error);

  console.log('match end (60 s match, waiting)…');
  var tEnd = Date.now();
  while (!endRes && Date.now() - tEnd < 90000) await wait(500);
  ok(!!endRes, 'match ends and results are sent', endRes && ('score ' + endRes.score.join('-') + ' winner ' + endRes.winner));
  var goal = Date.now();
  while (lobbyA.state !== 'lobby' && Date.now() - goal < 15000) await wait(300);
  ok(lobbyA.state === 'lobby', 'room returns to the lobby after the match');

  A.disconnect(); B2.disconnect(); C.disconnect();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
