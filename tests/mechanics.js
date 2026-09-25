/* Deterministic mechanics tests on the shared sim (no rendering).
 * node tests/mechanics.js
 */
var Sim = require('../shared/sim.js');
var Arena = require('../shared/arenaDef.js').get('bean_bowl');
var pass = 0, fail = 0;
function ok(cond, name, extra) { if (cond) { pass++; console.log('  ok  ' + name + (extra ? '  (' + extra + ')' : '')); } else { fail++; console.log('  FAIL ' + name + (extra ? '  (' + extra + ')' : '')); } }
function inp(o) { var i = Sim.emptyInput(); for (var k in o) i[k] = o[k]; return i; }
function mk(roster, settings) {
  var s = new Sim({ roster: roster || [{ team: 0, name: 'A' }, { team: 0, name: 'B' }, { team: 1, name: 'C' }], countdown: 0, settings: settings || {} });
  s.step({}); // enter play
  return s;
}
function place(p, x, z, yaw) { p.x = x; p.z = z; p.y = Arena.groundHeight(x, z); p.vx = 0; p.vy = 0; p.vz = 0; p.yaw = yaw || 0; p.grounded = true; p.state = 'normal'; }
function run(s, n, f) { for (var i = 0; i < n; i++) { var r = f ? f(i) : {}; s.step(r); } }
function park(s, ids) { ids.forEach(function (id) { place(s.players[id], 18, -1 + id); }); }

console.log('movement');
(function () {
  var s = mk(); park(s, [1, 2]);
  var p = s.players[0]; place(p, 0, -5);
  var maxY = 0;
  run(s, 60, function (i) { if (p.y > maxY) maxY = p.y; return { 0: inp({ jump: i < 2 }) }; });
  ok(Math.abs(maxY - 2.2) < 0.15, 'jump apex ~2.2m', maxY.toFixed(2));
  // sprint speed
  place(p, -8, -20);
  run(s, 90, function () { return { 0: inp({ mz: 1, sprint: true }) }; });
  ok(p.vz > 9.5, 'sprint speed', p.vz.toFixed(2));
  // can't jump onto platform from ground
  place(p, 10.2, 12.5, Math.PI / 2);
  run(s, 60, function (i) { return { 0: inp({ mx: 1, jump: i === 5 || i === 30 }) }; });
  ok(p.x < 11 && p.y < 0.5, 'platform wall blocks jump-up', 'x=' + p.x.toFixed(2) + ' y=' + p.y.toFixed(2));
  // walk up ramp onto platform
  place(p, 15, 2, 0);
  run(s, 150, function () { return { 0: inp({ mz: 1 }) }; });
  ok(p.y > 2.4 && p.z > 9, 'ramp leads onto platform', 'y=' + p.y.toFixed(2) + ' z=' + p.z.toFixed(2));
  // deck drop
  var s2 = new Sim({ roster: [{ team: 0, name: 'A' }], countdown: 0.1 });
  var q = s2.players[0];
  ok(q.y > 6.9, 'spawns on elevated deck', 'y=' + q.y);
  var t = 0;
  while (t < 300 && !(q.y < 0.1 && q.grounded)) { s2.step({ 0: inp({ mz: 1, sprint: true }) }); t++; }
  ok(t < 150, 'drops off deck onto court quickly', (t / 60).toFixed(2) + 's, z=' + q.z.toFixed(1));
  // deck conveyor pushes idle players off
  var s3 = new Sim({ roster: [{ team: 1, name: 'R' }], countdown: 0 });
  var r = s3.players[0]; t = 0;
  while (t < 60 * 8 && Arena.onDeck(r.x, r.z)) { s3.step({}); t++; }
  ok(!Arena.onDeck(r.x, r.z), 'conveyor pushes idle player off the deck', (t / 60).toFixed(1) + 's');
})();

console.log('dive / tackle / grab');
(function () {
  var s = mk(); park(s, [1]);
  var a = s.players[0], c = s.players[2];
  place(a, 0, -10, 0); place(c, 0, -6, Math.PI);
  s.giveBall(2);
  var tackled = false, fum = false;
  run(s, 60, function (i) { return { 0: inp({ mz: 1, dive: i === 3 }) }; });
  var ev = null;
  ok(c.stats && s.players[0].stats.tackles === 1, 'dive into carrier = tackle');
  ok(s.ball.holder !== 2, 'tackle knocks ball loose', 'holder=' + s.ball.holder);
  // stun immunity: second tackle right after doesn't re-stun
  place(a, 0, -8, 0); c.state = 'normal'; c.stunImmune = 0.8; place(c, 0, -5, Math.PI); c.stunImmune = 0.8; a.diveCd = 0;
  run(s, 30, function (i) { return { 0: inp({ mz: 1, dive: i === 1 }) }; });
  ok(c.state !== 'stun', 'stun immunity prevents stun-lock', 'state=' + c.state);
  // grab steal
  var s2 = mk(); park(s2, [1]);
  var g = s2.players[0], v = s2.players[2];
  place(g, 0, 0, 0); place(v, 0, 1.4, 0);
  s2.giveBall(2);
  run(s2, 50, function () { return { 0: inp({ grab: true }), 2: inp({}) }; });
  ok(s2.ball.holder === 0, 'hold-grab steals the ball', 'holder=' + s2.ball.holder);
  // grab auto release
  var s3 = mk(); park(s3, [1]);
  var g3 = s3.players[0], v3 = s3.players[2];
  place(g3, 0, 0, 0); place(v3, 0, 1.4, 0);
  var maxT = 0;
  run(s3, 150, function () { if (g3.grabT > maxT) maxT = g3.grabT; return { 0: inp({ grab: true }) }; });
  ok(maxT <= 1.3 && g3.grabTarget < 0, 'grab auto-releases', maxT.toFixed(2) + 's');
})();

console.log('pass');
(function () {
  var s = mk(); park(s, [2]);
  var a = s.players[0], b = s.players[1];
  place(a, 0, -10, 0); place(b, 2, 2, Math.PI);
  s.giveBall(0);
  run(s, 90, function (i) { return { 0: inp({ pass: i === 1, look: 0 }) }; });
  ok(s.ball.holder === 1, 'quick pass reaches teammate');
  // long pass to moving teammate
  place(a, -5, -22, 0); place(b, 8, 5, 0);
  s.giveBall(0);
  run(s, 120, function (i) { return { 0: inp({ pass: i === 1, look: 0.4, mx: 0.3, mz: 1 }), 1: inp({ mz: 1 }) }; });
  ok(s.ball.holder === 1, 'lead pass to running teammate');
})();

console.log('shooting');
(function () {
  var dists = [7, 10, 13, 16, 20], errs = [0, 0.05, 0.1, 0.16, 0.25], table = [];
  errs.forEach(function (e) {
    var made = 0, tot = 0;
    dists.forEach(function (d) {
      [-1, 1].forEach(function (sg) {
        [0, 0.6].forEach(function (ang) {
          var s = mk(); park(s, [1, 2]);
          var p = s.players[0];
          var x = Math.sin(ang) * d, z = 26 - Math.cos(ang) * d;
          place(p, x, z, Math.atan2(-x, 26 - z));
          s.giveBall(0);
          var look = Math.atan2(-x, 26 - z) + 0.1 * sg;
          var L = s.shotLaunch(p, 0.5, look), c = Math.max(0, Math.min(1, L.perfect + e * sg));
          p.charging = true; p.charge = c; p.chargeBtn = 'shoot'; p.prev.shoot = true;
          var scored = false;
          run(s, 200, function (i) { var ev = s.events; for (var k = 0; k < ev.length; k++) if (ev[k].t === 'score') scored = true; return { 0: inp({ shoot: false, look: look }) }; });
          var ev2 = s.match.score[0] > 0; tot++; if (ev2) made++;
        });
      });
    });
    table.push('err ' + e + ': ' + made + '/' + tot);
  });
  console.log('   make rate by charge error -> ' + table.join(' | '));
  ok(/err 0: (1[6-9]|20)\/20/.test(table[0]), 'perfect-charge shots mostly go in', table[0]);
  ok(!/err 0.25: (1[0-9]|20)\/20/.test(table[4]), 'badly-timed shots mostly miss', table[4]);
})();

console.log('dunks');
(function () {
  // running jump dunk
  var s = mk(); park(s, [1, 2]);
  var p = s.players[0];
  place(p, 0.5, 19, 0);
  s.giveBall(0);
  var dunk = false, jumped = false;
  run(s, 120, function (i) {
    for (var k = 0; k < s.events.length; k++) if (s.events[k].t === 'dunk') dunk = true;
    var d = Math.sqrt(p.x * p.x + (26 - p.z) * (26 - p.z));
    var jump = !jumped && d < 4.2 && p.grounded; if (jump) jumped = true;
    var sh = !p.grounded && s.dunkEligible(p) && (i % 2 === 0);
    return { 0: inp({ mz: 1, jump: jump, shoot: sh, look: 0 }) };
  });
  ok(dunk && s.match.score[0] === 2, 'running jump dunk scores 2', 'score=' + s.match.score[0]);
  // bounce pad dunk
  var s2 = mk(); park(s2, [1, 2]);
  var q = s2.players[0];
  place(q, 3.4, 16.5, 0); s2.giveBall(0);
  var dunk2 = false;
  run(s2, 150, function (i) {
    for (var k = 0; k < s2.events.length; k++) if (s2.events[k].t === 'dunk') dunk2 = true;
    var dx = 0 - q.x, dz = 26 - q.z, dl = Math.sqrt(dx * dx + dz * dz);
    var toPad = q.z < 20.8;
    var mx = toPad ? 0 : dx / dl, mz = toPad ? 1 : dz / dl;
    return { 0: inp({ mx: mx, mz: mz, shoot: !q.grounded && s2.dunkEligible(q) && i % 2 === 0, look: Math.atan2(dx, dz) }) };
  });
  ok(dunk2, 'bounce pad dunk');
  // launch pad dunk (from the platform)
  var s3 = mk(); park(s3, [1, 2]);
  var r = s3.players[0];
  place(r, -15.5, 12.4, 0); s3.giveBall(0);
  var dunk3 = false;
  run(s3, 160, function (i) {
    for (var k = 0; k < s3.events.length; k++) if (s3.events[k].t === 'dunk') dunk3 = true;
    return { 0: inp({ mz: r.launchT > 0 ? 0 : 1, shoot: !r.grounded && s3.dunkEligible(r) && i % 2 === 0, look: 0 }) };
  });
  ok(dunk3, 'launch pad dunk');
  // no dunk while standing (must be airborne)
  var s4 = mk(); park(s4, [1, 2]);
  var u = s4.players[0]; place(u, 0, 24, 0); s4.giveBall(0);
  ok(!s4.dunkEligible(u), 'no dunk from the ground');
})();

console.log('match flow');
(function () {
  var s = new Sim({ roster: [{ team: 0, name: 'A' }, { team: 1, name: 'B' }], countdown: 0.2, settings: { duration: 3 } });
  var evs = {};
  for (var i = 0; i < 60 * 10; i++) { var e = s.step({}); e.forEach(function (x) { evs[x.t] = (evs[x.t] || 0) + 1; }); }
  ok(s.match.overtime && s.match.phase === 'play', 'tied at buzzer -> overtime');
  s.players[0].x = 0; s.players[0].z = 24; s.players[0].y = 0; s.giveBall(0);
  s.award = null;
  s._award(0, 2, 'basket', 0);
  for (i = 0; i < 60 * 4; i++) s.step({});
  ok(s.match.phase === 'ended' && s.match.winner === 0, 'overtime score ends match');
  ok(evs.tick >= 3, 'final-seconds ticks emitted', evs.tick);
  // no double score
  var s2 = mk(); park(s2, [0, 1, 2]);
  s2.ball.state = 'free'; s2.ball.holder = -1; s2.ball.x = 0; s2.ball.z = 26; s2.ball.y = 6.5; s2.ball.vx = 0; s2.ball.vy = -1; s2.ball.vz = 0;
  var scores = 0;
  for (i = 0; i < 300; i++) { var e2 = s2.step({}); e2.forEach(function (x) { if (x.t === 'score') scores++; }); }
  ok(scores === 1 && s2.match.score[0] === 2, 'ball through hoop scores exactly once', 'events=' + scores + ' score=' + s2.match.score[0]);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
