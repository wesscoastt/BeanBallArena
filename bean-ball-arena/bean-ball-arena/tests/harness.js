/* Headless bot-vs-bot match harness.
 * node tests/harness.js [matches] [difficulty] [teamSize]
 * Runs full matches through the shared sim + AI and checks invariants.
 */
var Sim = require('../shared/sim.js');
var AI = require('../shared/ai.js');
var Arena = require('../shared/arenaDef.js');

var N = +(process.argv[2] || 6);
var DIFF = process.argv[3] || 'normal';
var SIZE = +(process.argv[4] || 3);

function hyp(x, z) { return Math.sqrt(x * x + z * z); }

var totals = { matches: 0, ot: 0, pts: 0, dunks: 0, longs: 0, baskets: 0, shots: 0, passes: 0, steals: 0, tackles: 0, intercepts: 0, resets: 0, stuckMax: 0, chaseViol: 0, deckTimeMax: 0 };
var problems = [];

for (var mi = 0; mi < N; mi++) {
  var roster = [];
  for (var t = 0; t < 2; t++) for (var i = 0; i < SIZE; i++) roster.push({ team: t, name: 'B' + t + i, isBot: true });
  var s = new Sim({ roster: roster, seed: 1000 + mi * 77, settings: { duration: 240, difficulty: DIFF } });
  var ai = new AI(s);
  s.players.forEach(function (p) { ai.addBot(p.id, DIFF); });
  var stuck = {}, lastPos = {}, deckT = {};
  var ticks = 0, lastScore = [0, 0];
  var scoreEvents = 0, kinds = {};
  while (s.match.phase !== 'ended' && ticks < 60 * 60 * 9) {
    var inp = ai.update(1 / 60);
    var ev = s.step(inp, 1 / 60);
    ticks++;
    for (var e = 0; e < ev.length; e++) {
      var x = ev[e];
      if (x.t === 'score') {
        scoreEvents++; kinds[x.kind] = (kinds[x.kind] || 0) + 1;
        var d0 = s.match.score[0] - lastScore[0], d1 = s.match.score[1] - lastScore[1];
        if (d0 + d1 !== x.pts) problems.push('score delta mismatch m' + mi);
        lastScore = [s.match.score[0], s.match.score[1]];
      }
      if (x.t === 'ballReset') totals.resets++;
      if (x.t === 'overtime') totals.ot++;
    }
    // invariants
    var b = s.ball;
    if (b.holder >= 0 && b.state !== 'held') problems.push('holder w/o held state');
    if (b.state === 'held' && (b.holder < 0 || s.players[b.holder].hidden)) problems.push('held w/o holder');
    if (b.x !== b.x || Math.abs(b.x) > Arena.halfW + 0.1 || Math.abs(b.z) > Arena.halfL + 0.1) problems.push('ball out ' + b.x + ',' + b.z);
    var chasers = [0, 0];
    for (i = 0; i < s.players.length; i++) {
      var p = s.players[i];
      if (p.x !== p.x || Math.abs(p.x) > Arena.halfW || Math.abs(p.z) > Arena.halfL) problems.push('player out ' + p.id);
      if (p.grabTarget >= 0 && p.grabT > 1.4) problems.push('infinite grab ' + p.id);
      var br = ai.brains[p.id];
      if (br.role === 'recover' || br.role === 'pressure') chasers[p.team]++;
      if (ticks % 60 === 0) {
        var lp = lastPos[p.id];
        if (lp && hyp(p.x - lp.x, p.z - lp.z) < 0.3 && s.match.phase === 'play' && hyp(br.tx - p.x, br.tz - p.z) > 3) stuck[p.id] = (stuck[p.id] || 0) + 1;
        else stuck[p.id] = 0;
        if (stuck[p.id] > totals.stuckMax) totals.stuckMax = stuck[p.id];
        lastPos[p.id] = { x: p.x, z: p.z };
      }
      if (Arena.onDeck(p.x, p.z) && s.match.phase === 'play') { deckT[p.id] = (deckT[p.id] || 0) + 1 / 60; if (deckT[p.id] > totals.deckTimeMax) totals.deckTimeMax = deckT[p.id]; }
      else deckT[p.id] = 0;
    }
    if (chasers[0] > 2 || chasers[1] > 2) totals.chaseViol++;
  }
  totals.matches++;
  var st = { pts: 0, dunks: 0, shots: 0, made: 0, passes: 0, steals: 0, tackles: 0, intercepts: 0 };
  s.players.forEach(function (p) { for (var k in st) st[k] += p.stats[k]; });
  totals.pts += s.match.score[0] + s.match.score[1];
  totals.dunks += st.dunks; totals.shots += st.shots; totals.passes += st.passes; totals.steals += st.steals;
  totals.tackles += st.tackles; totals.intercepts += st.intercepts; totals.longs += (kinds.long || 0); totals.baskets += (kinds.basket || 0);
  console.log('match', mi, 'score', s.match.score.join('-'), 'OT', s.match.overtime, 'secs', (ticks / 60).toFixed(0),
    'kinds', JSON.stringify(kinds), 'shots', st.shots, 'made', st.made, 'dunks', st.dunks, 'passes', st.passes, 'steals', st.steals, 'tackles', st.tackles, 'int', st.intercepts);
}
console.log('TOTALS', JSON.stringify(totals));
var uniq = {};
problems.forEach(function (p) { uniq[p] = (uniq[p] || 0) + 1; });
console.log('PROBLEMS', JSON.stringify(uniq));
