/* BEAN BALL ARENA - client/js/careerui.js
 * Screens for Ranked and Career mode (the data and rules live in career.js).
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var UI = BBA.UI, doc = root.document;
  function $(id) { return doc.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ic(n) { return BBA.Icons.svg(n); }
  function f1(a, b) { return b ? (a / b).toFixed(1) : '0.0'; }

  /* ---------------- player card (main menu) ---------------- */
  UI.refreshLevel = function () {
    var K = BBA.Career, p = K.p;
    if ($('pc-sub')) $('pc-sub').textContent = 'Level ' + p.level + ' · ' + K.title(p.level) + ' · ' + K.tier().name;
    if ($('pc-xpfill')) $('pc-xpfill').style.width = Math.min(100, p.xp / K.xpToNext(p.level) * 100).toFixed(0) + '%';
  };

  /* ---------------- ranked ---------------- */
  UI.buildRanked = function () {
    var K = BBA.Career, p = K.p, t = K.tier(), pr = K.tierProgress();
    var pct = pr.span ? Math.min(100, pr.into / pr.span * 100) : 100;
    var html = '<div class="rk-badge" style="--tc:' + t.color + '">' + ic('medal') + '<div><div class="rk-tier">' + t.name + '</div><div class="rk-rp">' + p.rp + ' RP</div></div></div>' +
      '<div class="rk-bar"><div style="width:' + pct.toFixed(0) + '%;background:' + t.color + '"></div></div>' +
      '<div class="rk-sub">' + (pr.span ? (pr.span - pr.into) + ' RP to the next tier' : 'Top tier. Defend your spot!') + '</div>' +
      '<div class="rk-stats"><div><b>' + p.ranked.wins + '-' + (p.ranked.games - p.ranked.wins) + '</b><span>RECORD</span></div><div><b>' + K.tier(p.ranked.best).name + '</b><span>BEST</span></div><div><b>3 v 3</b><span>4 MIN</span></div></div>' +
      '<div class="rk-tiers">' + K.TIERS.map(function (x) { return '<span class="' + (x === t ? 'on' : '') + '" style="--tc:' + x.color + '">' + x.name + '</span>'; }).join('') + '</div>' +
      '<p class="dim center">Win to climb (+22 RP, more for big wins), lose and you drop RP. CPU teams get tougher every tier. Ranked is saved on this device.</p>';
    $('rk-body').innerHTML = html;
  };

  /* ---------------- career ---------------- */
  UI.crTab = 'standings';
  UI.buildCareer = function () {
    var K = BBA.Career, s = K.p.season, body = $('cr-body'), acts = $('cr-actions'), tabs = $('cr-tabs');
    if (!s) {
      $('cr-title').textContent = 'CAREER';
      tabs.innerHTML = '';
      body.innerHTML = '<div class="cr-intro">' + ic('trophy') + '<h3>YOUR BEAN BALL CAREER</h3><p>Join the <b>' + esc(K.TEAMS[0].name) + '</b> in an 8-team league. Play the regular season, finish top 4 to make the playoffs, win the final and chase the MVP. Every season adds to your career stats.</p>' +
        UI._careerTotals() + '</div>';
      acts.innerHTML = '<button class="pbtn back" data-act="back">BACK</button><button class="pbtn" data-act="career-new14">FULL SEASON (14)</button><button class="pbtn go" data-act="career-new7">SHORT SEASON (7)</button>';
      return;
    }
    var me = s.teams[0], seed = K.standings().indexOf(me) + 1;
    $('cr-title').textContent = 'SEASON ' + s.n + ' · ' + (s.done ? 'FINAL' : (s.phase === 'regular' ? 'GAME ' + (s.round + 1) + ' OF ' + s.length : 'PLAYOFFS'));
    var T = [['standings', 'STANDINGS'], ['leaders', 'LEADERS'], ['results', 'RESULTS'], ['career', 'CAREER']];
    tabs.innerHTML = T.map(function (t) { return '<button class="tab' + (UI.crTab === t[0] ? ' sel' : '') + '" data-act="career-tab-' + t[0] + '">' + t[1] + '</button>'; }).join('');
    var head = '';
    if (s.done) {
      var champ = s.teams[s.champion];
      head = '<div class="cr-card done">' + ic('trophy') + '<div><div class="cr-big">' + esc(champ.name) + ' WIN IT ALL!</div>' +
        '<div>MVP: <b>' + esc(s.mvp ? s.mvp.name : '-') + '</b> (' + (s.mvp ? s.mvp.ppg : 0) + ' ppg) · Finals MVP: <b>' + esc(s.finalsMvp || '-') + '</b></div>' +
        (s.rewards ? '<div class="cr-xp">+' + s.rewards.xp + ' XP for the season' + (s.rewards.levels.length ? ' · LEVEL ' + s.rewards.levels[s.rewards.levels.length - 1] + '!' : '') + '</div>' : '') + '</div></div>';
    } else {
      var g = K.nextGame();
      if (g) {
        var opp = s.teams[g.home === 0 ? g.away : g.home];
        head = '<div class="cr-card"><div class="cr-label">' + esc(g.label) + (s.phase === 'playoffs' ? ' · PLAYOFFS' : '') + '</div><div class="cr-big"><span style="color:' + me.color + '">' + esc(me.short) + '</span> vs <span style="color:' + opp.color + '">' + esc(opp.short) + '</span></div>' +
          '<div>Your record ' + me.w + '-' + me.l + ' · #' + seed + ' · ' + esc(opp.name) + ' are ' + opp.w + '-' + opp.l + ' · strength ' + opp.rating + '/5</div></div>';
      } else {
        head = '<div class="cr-card"><div class="cr-big">Season over for ' + esc(me.short) + '</div><div>Finished ' + me.w + '-' + me.l + ', #' + seed + '. ' + (s.phase === 'playoffs' ? 'Missed the playoffs.' : '') + '</div></div>';
      }
    }
    body.innerHTML = head + '<div class="cr-tab">' + UI['_cr_' + UI.crTab]() + '</div>';
    var b = '<button class="pbtn back" data-act="back">MENU</button>';
    if (s.done) b += '<button class="pbtn go" data-act="career-next">NEXT SEASON</button>';
    else if (K.nextGame()) b += '<button class="pbtn" data-act="career-sim">SIM GAME</button><button class="pbtn go" data-act="career-play">PLAY GAME</button>';
    else b += '<button class="pbtn go" data-act="career-simrest">SIM TO THE END</button>';
    acts.innerHTML = b;
  };

  UI._cr_standings = function () {
    var K = BBA.Career, s = K.p.season, st = K.standings();
    var h = '<table class="cr-table"><tr><th>#</th><th>TEAM</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/-</th></tr>';
    st.forEach(function (t, i) {
      h += '<tr class="' + (t.id === 0 ? 'me' : '') + (i === 3 ? ' cut' : '') + '"><td>' + (i + 1) + '</td><td class="n"><i style="background:' + t.color + '"></i>' + esc(t.name) + '</td><td>' + t.w + '</td><td>' + t.l + '</td><td>' + t.pf + '</td><td>' + t.pa + '</td><td>' + (t.pf - t.pa > 0 ? '+' : '') + (t.pf - t.pa) + '</td></tr>';
    });
    h += '</table><p class="dim">Top 4 make the playoffs.</p>';
    if (s.playoffs) h += UI._bracket();
    return h;
  };
  UI._bracket = function () {
    var s = BBA.Career.p.season, P = s.playoffs;
    function g(x, label) {
      if (!x) return '';
      var A = s.teams[x.a], B = s.teams[x.b], sc = x.score ? x.score : null;
      return '<div class="br-g"><div class="br-l">' + label + '</div><div class="' + (x.winner === x.a ? 'w' : '') + '">' + esc(A.short) + (sc ? ' <b>' + sc[0] + '</b>' : '') + '</div><div class="' + (x.winner === x.b ? 'w' : '') + '">' + esc(B.short) + (sc ? ' <b>' + sc[1] + '</b>' : '') + '</div></div>';
    }
    return '<div class="bracket">' + g(P.semis[0], 'SEMI 1') + g(P.semis[1], 'SEMI 2') + g(P.final, 'FINAL') + '</div>';
  };
  UI._cr_leaders = function () {
    var K = BBA.Career, s = K.p.season;
    function col(stat, label) {
      return '<div class="ld"><h4>' + label + '</h4>' + K.leaders(stat, 5).map(function (p, i) {
        return '<div class="' + (p.me ? 'me' : '') + '"><span>' + (i + 1) + '. ' + esc(p.name) + ' <i style="color:' + s.teams[p.team].color + '">' + esc(s.teams[p.team].short) + '</i></span><b>' + f1(p[stat], p.gp) + '</b></div>';
      }).join('') + '</div>';
    }
    var me = s.players['0:0'];
    return '<div class="ld-me">YOU: <b>' + f1(me.pts, me.gp) + '</b> PPG · <b>' + f1(me.ast, me.gp) + '</b> APG · <b>' + f1(me.stl, me.gp) + '</b> SPG · <b>' + me.dunks + '</b> dunks · ' + me.gp + ' GP</div>' +
      (s.mvp ? '<div class="ld-mvp">' + ic('star') + ' Season MVP: <b>' + esc(s.mvp.name) + '</b></div>' : '') +
      '<div class="ld-grid">' + col('pts', 'POINTS') + col('ast', 'ASSISTS') + col('stl', 'STEALS') + col('dunks', 'DUNKS') + '</div>';
  };
  UI._cr_results = function () {
    var s = BBA.Career.p.season, list = s.results.slice(-12).reverse();
    if (!list.length) return '<p class="dim center">No games yet.</p>';
    return '<div class="res-list">' + list.map(function (r) {
      var A = s.teams[r.a], B = s.teams[r.b], mine = r.a === 0 || r.b === 0;
      return '<div class="' + (mine ? 'me' : '') + '"><span>G' + (r.r + 1) + '</span><span class="' + (r.sa > r.sb ? 'w' : '') + '">' + esc(A.short) + ' ' + r.sa + '</span><span class="' + (r.sb > r.sa ? 'w' : '') + '">' + r.sb + ' ' + esc(B.short) + '</span></div>';
    }).join('') + '</div>';
  };
  UI._cr_career = function () { return UI._careerTotals(); };
  UI._careerTotals = function () {
    var K = BBA.Career, c = K.p.career;
    var h = '<div class="ct-grid"><div><b>' + c.seasons + '</b><span>SEASONS</span></div><div><b>' + c.titles + '</b><span>TITLES</span></div><div><b>' + c.mvps + '</b><span>MVPs</span></div><div><b>' + c.finalsMvps + '</b><span>FINALS MVPs</span></div><div><b>' + f1(c.pts, c.games) + '</b><span>CAREER PPG</span></div><div><b>' + c.games + '</b><span>GAMES</span></div></div>';
    if (c.history.length) {
      h += '<table class="cr-table small"><tr><th>SEASON</th><th>RECORD</th><th>SEED</th><th>PPG</th><th></th></tr>' + c.history.slice().reverse().map(function (x) {
        return '<tr><td>' + x.n + '</td><td>' + x.w + '-' + x.l + '</td><td>#' + x.seed + '</td><td>' + x.ppg + '</td><td>' + (x.champ ? ic('trophy') + ' CHAMPS ' : '') + (x.mvp ? ic('star') + ' MVP' : '') + '</td></tr>';
      }).join('') + '</table>';
    }
    return h;
  };

  /* ---------------- actions ---------------- */
  UI.careerAction = function (a) {
    var K = BBA.Career, G = UI.G;
    if (a === 'ranked') { UI.show('ranked'); return; }
    if (a === 'ranked-play') { BBA.Audio.unlock(); UI.hideMenus(); G.startMatch(K.rankedSetup()); return; }
    if (a === 'career') { UI.show('career'); return; }
    if (a === 'career-new7' || a === 'career-new14') { K.newSeason(a === 'career-new7' ? 7 : 14); UI.crTab = 'standings'; UI.buildCareer(); return; }
    if (a === 'career-next') { K.newSeason(K.p.season.length); UI.crTab = 'standings'; UI.buildCareer(); UI.refreshLevel(); return; }
    if (a === 'career-play') { var su = K.gameSetup(); if (su) { BBA.Audio.unlock(); UI.hideMenus(); G.startMatch(su); } return; }
    if (a === 'career-sim') { var r = K.simMyGame(); if (r) UI.toast('Simmed: ' + r.my + ' - ' + r.opp + (r.my > r.opp ? ' (W)' : ' (L)')); UI.buildCareer(); UI.refreshLevel(); return; }
    if (a === 'career-simrest') { var guard = 0; while (!K.p.season.done && guard++ < 10) K._nextPlayoff(); UI.buildCareer(); UI.refreshLevel(); return; }
    if (a.indexOf('career-tab-') === 0) { UI.crTab = a.slice(11); UI.buildCareer(); return; }
    if (a === 'career-continue') { UI.G.quitToMenu(); UI.show('career'); return; }
    if (a === 'ranked-continue') { UI.G.quitToMenu(); UI.show('ranked'); return; }
  };
})(this);
