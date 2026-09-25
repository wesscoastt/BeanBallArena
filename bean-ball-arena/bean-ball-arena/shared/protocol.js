/* BEAN BALL ARENA - shared/protocol.js
 * Network event names and compact input encoding shared by client and the
 * (milestone 2) Socket.IO server. Offline play only uses the input packer
 * for tests, but keeping it here makes the server a thin wrapper later.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) { module.exports = mod; }
  else { root.BBA = root.BBA || {}; root.BBA.Protocol = mod; }
})(this, function () {
  var EV = {
    createRoom: 'createRoom', joinRoom: 'joinRoom', leaveRoom: 'leaveRoom',
    playerJoined: 'playerJoined', playerDisconnected: 'playerDisconnected', playerReconnected: 'playerReconnected',
    switchTeam: 'switchTeam', playerReady: 'playerReady',
    addBot: 'addBot', removeBot: 'removeBot', setBotDifficulty: 'setBotDifficulty',
    startMatch: 'startMatch', playerInput: 'playerInput',
    snapshot: 'snapshot', matchEvent: 'matchEvent', scoreEvent: 'scoreEvent',
    overtime: 'overtime', matchEnded: 'matchEnded', lobbyState: 'lobbyState', error: 'errorMsg'
  };

  var BITS = { jump: 1, sprint: 2, dive: 4, grab: 8, pass: 16, shoot: 32, aim: 64 };

  /* Pack an input into [seq, mx*127, mz*127, look*1000, bits] */
  function packInput(seq, inp) {
    var b = 0, k;
    for (k in BITS) if (inp[k]) b |= BITS[k];
    return [seq, Math.round((inp.mx || 0) * 127), Math.round((inp.mz || 0) * 127), Math.round((inp.look || 0) * 1000), b];
  }
  function unpackInput(a) {
    var b = a[4] | 0, out = { mx: (a[1] | 0) / 127, mz: (a[2] | 0) / 127, look: (a[3] | 0) / 1000 }, k;
    for (k in BITS) out[k] = !!(b & BITS[k]);
    // sanitize (never trust the client)
    var m = Math.sqrt(out.mx * out.mx + out.mz * out.mz);
    if (m > 1) { out.mx /= m; out.mz /= m; }
    if (!(out.look === out.look) || Math.abs(out.look) > 7) out.look = 0;
    return { seq: a[0] | 0, input: out };
  }

  function roomCode(rng) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '', i;
    for (i = 0; i < 5; i++) s += chars.charAt(Math.floor((rng || Math.random)() * chars.length));
    return s;
  }

  /* ---- snapshot encoding (server -> clients) ---- */
  var P_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'state', 'stateT', 'grounded', 'grabTarget', 'grabbedBy', 'grabT',
    'charge', 'charging', 'hidden', 'passHeld', 'passT', 'passAim', 'callT', 'throwAnim', 'throwKind', 'celebrateT', 'wobble',
    'sprinting', 'diveCd', 'grabCd', 'grabImmune', 'stunImmune', 'launchT', 'padCd', 'coyote', 'jumpBuf', 'catchCd', 'moveAmt',
    'respawnT', 'chargeBtn', 'tackled'];
  var B_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'state', 'holder', 'passTarget', 'inFlight', 'ignoreId', 'ignoreT'];
  var M_FIELDS = ['phase', 'phaseT', 'countdown', 'clock', 'overtime', 'winner'];

  function enc(v) {
    if (typeof v === 'number') return Math.round(v * 1000) / 1000;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  }
  function encodeObj(o, fields) { var a = [], i; for (i = 0; i < fields.length; i++) a.push(enc(o[fields[i]])); return a; }
  function decodeObj(a, o, fields, boolFields) {
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i], v = a[i];
      if (boolFields && boolFields[f]) v = !!v;
      o[f] = v;
    }
    return o;
  }
  var P_BOOL = { grounded: 1, charging: 1, hidden: 1, passHeld: 1, sprinting: 1, tackled: 1 };
  var B_BOOL = { inFlight: 1 };
  var M_BOOL = { overtime: 1 };

  function encodePlayer(p) {
    var a = encodeObj(p, P_FIELDS);
    a.push(p.dunk ? [enc(p.dunk.sx), enc(p.dunk.sy), enc(p.dunk.sz), enc(p.dunk.tx), enc(p.dunk.ty), enc(p.dunk.tz), p.dunk.hoop, p.dunk.done ? 1 : 0] : 0);
    return a;
  }
  function decodePlayer(a, p) {
    decodeObj(a, p, P_FIELDS, P_BOOL);
    var d = a[P_FIELDS.length];
    p.dunk = d ? { sx: d[0], sy: d[1], sz: d[2], tx: d[3], ty: d[4], tz: d[5], hoop: d[6], done: !!d[7] } : null;
    return p;
  }

  /* Full world snapshot from a Sim (server side). */
  function encodeSnapshot(sim, extra) {
    var ps = [], i;
    for (i = 0; i < sim.players.length; i++) ps.push(encodePlayer(sim.players[i]));
    var m = sim.match;
    var snap = {
      k: sim.tick, t: enc(sim.time), p: ps,
      b: encodeObj(sim.ball, B_FIELDS),
      m: encodeObj(m, M_FIELDS).concat([m.score[0], m.score[1]])
    };
    if (extra) for (var key in extra) snap[key] = extra[key];
    return snap;
  }
  function decodeMatch(a, m) {
    decodeObj(a, m, M_FIELDS, M_BOOL);
    m.score[0] = a[M_FIELDS.length]; m.score[1] = a[M_FIELDS.length + 1];
    return m;
  }
  function decodeBall(a, b) { return decodeObj(a, b, B_FIELDS, B_BOOL); }

  return {
    EV: EV, BITS: BITS, packInput: packInput, unpackInput: unpackInput, roomCode: roomCode, SNAPSHOT_HZ: 20,
    P_FIELDS: P_FIELDS, encodePlayer: encodePlayer, decodePlayer: decodePlayer, encodeSnapshot: encodeSnapshot,
    decodeMatch: decodeMatch, decodeBall: decodeBall, MAX_HUMANS: 6, RECONNECT_SECONDS: 45
  };
});
