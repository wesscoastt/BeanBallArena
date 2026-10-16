/* BEAN BALL ARENA - client/js/career.js
 * Progression saved on this device: XP + levels (with titles and unlockable
 * cosmetics), Ranked (tiers vs CPU teams) and Career mode (seasons in an 8-team
 * league with a schedule, simulated games, standings, playoffs, stats, MVP).
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var KEY = 'bba_profile_v1';

  /* ---------------- levels ---------------- */
  var MAX_LEVEL = 50;
  function xpToNext(level) { return 250 + level * 75; }
  var TITLES = [[1, 'Rookie'], [3, 'Bench Bean'], [6, 'Starter'], [10, 'Hooper'], [15, 'All-Star'], [22, 'Superstar'], [30, 'MVP Bean'], [40, 'Legend'], [50, 'Hall of Bean']];

  /* Everything not listed here is unlocked from the start. */
  var UNLOCKS = [
    [2, 'hats', 'propeller'], [2, 'faces', 'fierce'], [3, 'patterns', 'dots'], [3, 'jerseyStyles', 'panels'],
    [4, 'hats', 'headphones'], [4, 'celebrations', 'spin'], [5, 'uppers', 'scarf'], [5, 'faces', 'sleepy'],
    [6, 'hats', 'cone'], [6, 'patterns', 'split'], [7, 'jerseyStyles', 'sash'], [7, 'lowers', 'socks'],
    [8, 'hats', 'antenna'], [8, 'faces', 'wink'], [9, 'celebrations', 'flex'], [9, 'patterns', 'checker'],
    [10, 'hats', 'tophat'], [10, 'victories', 'bounce'], [11, 'uppers', 'bowtie'], [12, 'faces', 'shades'],
    [12, 'jerseyStyles', 'chevron'], [13, 'hats', 'chef'], [14, 'patterns', 'zigzag'], [14, 'lowers', 'boots'],
    [15, 'hats', 'flower'], [15, 'celebrations', 'wave'], [16, 'faces', 'stareyes'], [17, 'patterns', 'camo'],
    [18, 'hats', 'bunny'], [18, 'jerseyStyles', 'hoops'], [19, 'uppers', 'cape'], [20, 'hats', 'pirate'],
    [20, 'victories', 'dance'], [21, 'faces', 'visor'], [22, 'patterns', 'spots'], [23, 'hats', 'horns'],
    [24, 'lowers', 'tutu'], [25, 'hats', 'wizard'], [26, 'jerseyStyles', 'split'], [27, 'faces', 'derp'],
    [28, 'patterns', 'stars'], [30, 'hats', 'spikes'], [35, 'hats', 'halo'], [40, 'hats', 'crown']
  ];
  var LOCK = {};
  UNLOCKS.forEach(function (u) { LOCK[u[1] + ':' + u[2]] = u[0]; });

  /* ---------------- ranked ---------------- */
  var TIERS = [
    { name: 'BRONZE', min: 0, color: '#c5814a', diff: 'easy' },
    { name: 'SILVER', min: 100, color: '#c8d2e0', diff: 'easy' },
    { name: 'GOLD', min: 200, color: '#ffc93c', diff: 'normal' },
    { name: 'PLATINUM', min: 300, color: '#5fe0d0', diff: 'normal' },
    { name: 'DIAMOND', min: 400, color: '#7ab8ff', diff: 'normal' },
    { name: 'CHAMPION', min: 500, color: '#ff5fa2', diff: 'hard' }
  ];

  /* ---------------- league ---------------- */
  var TEAMS = [
    { name: 'Bean Town Bouncers', short: 'BOUNCERS', color: '#2f7bff' },
    { name: 'Jellybean Jets', short: 'JETS', color: '#ff4f8b' },
    { name: 'Lima Legends', short: 'LEGENDS', color: '#6fdc4a' },
    { name: 'Pinto Panthers', short: 'PANTHERS', color: '#b86bff' },
    { name: 'Kidney Kings', short: 'KINGS', color: '#ff3b4e' },
    { name: 'Coffee Bean Comets', short: 'COMETS', color: '#c58a52' },
    { name: 'Garbanzo Gators', short: 'GATORS', color: '#2fd3c4' },
    { name: 'Edamame Eagles', short: 'EAGLES', color: '#ffd23f' }
  ];
  var ARENA_ROTATION = ['bean_bowl', 'rooftop', 'factory', 'neon', 'pirate', 'space', 'snowy'];

  function rnd() { return Math.random(); }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function freshProfile() {
    return { v: 1, xp: 0, level: 1, games: 0, wins: 0, rp: 0, ranked: { games: 0, wins: 0, best: 0 },
      career: { seasons: 0, titles: 0, mvps: 0, finalsMvps: 0, games: 0, pts: 0, ast: 0, stl: 0, dunks: 0, history: [] }, season: null };
  }

  var Career = { TEAMS: TEAMS, TIERS: TIERS, UNLOCKS: UNLOCKS, MAX_LEVEL: MAX_LEVEL };

  Career.load = function () {
    var p = null;
    try { p = JSON.parse(root.localStorage.getItem(KEY) || 'null'); } catch (e) { p = null; }
    var f = freshProfile(), k;
    if (!p || typeof p !== 'object') p = f;
    for (k in f) if (p[k] === undefined) p[k] = f[k];
    Career.p = p;
    return p;
  };
  Career.save = function () { try { root.localStorage.setItem(KEY, JSON.stringify(Career.p)); } catch (e) {} };

  /* ---- levels / unlocks ---- */
  Career.title = function (level) { var t = TITLES[0][1]; TITLES.forEach(function (x) { if (level >= x[0]) t = x[1]; }); return t; };
  Career.xpToNext = xpToNext;
  Career.unlockLevel = function (kind, id) { return LOCK[kind + ':' + id] || 0; };
  Career.isUnlocked = function (kind, id) { return Career.p.level >= Career.unlockLevel(kind, id); };
  Career.unlocksAt = function (level) { return UNLOCKS.filter(function (u) { return u[0] === level; }); };
  Career.nextUnlock = function () {
    for (var i = 0; i < UNLOCKS.length; i++) if (UNLOCKS[i][0] > Career.p.level) return UNLOCKS[i];
    return null;
  };
  Career.addXp = function (amt) {
    var p = Career.p, ups = [];
    p.xp += amt;
    while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) { p.xp -= xpToNext(p.level); p.level++; ups.push(p.level); }
    if (p.level >= MAX_LEVEL) p.xp = Math.min(p.xp, xpToNext(p.level));
    return ups;
  };

  /* ---- ranked ---- */
  Career.tier = function (rp) {
    rp = rp === undefined ? Career.p.rp : rp;
    var t = TIERS[0], i;
    for (i = 0; i < TIERS.length; i++) if (rp >= TIERS[i].min) t = TIERS[i];
    return t;
  };
  Career.tierProgress = function () {
    var rp = Career.p.rp, i = TIERS.indexOf(Career.tier(rp));
    if (i === TIERS.length - 1) return { into: rp - TIERS[i].min, span: 0 };
    return { into: rp - TIERS[i].min, span: TIERS[i + 1].min - TIERS[i].min };
  };
  Career.rankedSetup = function () {
    var t = Career.tier(), arena = pick(ARENA_ROTATION);
    return { teamSize: 3, duration: 240, difficulty: t.diff, mateDifficulty: t.diff === 'hard' ? 'normal' : t.diff, modifier: 'none', arena: arena, warmup: 0,
      mercyLead: 12, kickoffReset: true, abilities: true, context: { kind: 'ranked' }, teamNames: ['YOU', t.name + ' CPU'] };
  };

  /* ---------------- seasons ---------------- */
  function roundRobin(n) {
    // circle method: n-1 rounds, every team plays once per round
    var teams = [], rounds = [], r, i;
    for (i = 0; i < n; i++) teams.push(i);
    for (r = 0; r < n - 1; r++) {
      var games = [];
      for (i = 0; i < n / 2; i++) {
        var a = teams[i], b = teams[n - 1 - i];
        games.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(games);
      teams.splice(1, 0, teams.pop());
    }
    return rounds;
  }

  function makeRoster(teamIdx, myName) {
    var names = BBA.Rules.BOT_NAMES.slice(), out = [], i;
    for (i = 0; i < 3; i++) out.push(names.splice(Math.floor(rnd() * names.length), 1)[0]);
    if (teamIdx === 0) out[0] = myName;
    return out;
  }

  Career.newSeason = function (length) {
    var p = Career.p, myName = BBA.Settings.data.name || 'Bean', i;
    var used = {};
    var teams = TEAMS.map(function (t, i) {
      var roster;
      do { roster = makeRoster(i, myName); } while (roster.some(function (n, k) { return (i !== 0 || k > 0) && used[n]; }));
      roster.forEach(function (n) { used[n] = 1; });
      // ratings 1..5: how good the CPU team is (your team sits in the middle, you carry it)
      var rating = i === 0 ? 3 : clamp(Math.round(1 + rnd() * 4), 1, 5);
      return { id: i, name: t.name, short: t.short, color: t.color, rating: rating, roster: roster, w: 0, l: 0, pf: 0, pa: 0 };
    });
    var rounds = roundRobin(8);
    if (length === 14) rounds = rounds.concat(roundRobin(8).map(function (g) { return g.map(function (x) { return [x[1], x[0]]; }); }));
    var players = {};
    teams.forEach(function (t) { t.roster.forEach(function (n, k) { players[t.id + ':' + k] = { team: t.id, name: n, me: t.id === 0 && k === 0, gp: 0, pts: 0, ast: 0, stl: 0, dunks: 0, tkl: 0 }; }); });
    p.season = { n: (p.career.seasons || 0) + 1, length: rounds.length, round: 0, rounds: rounds, teams: teams, players: players, results: [],
      phase: 'regular', playoffs: null, champion: -1, mvp: null, finalsMvp: null, done: false };
    Career.save();
    return p.season;
  };

  Career.standings = function () {
    var s = Career.p.season;
    return s.teams.slice().sort(function (a, b) { return (b.w - a.w) || ((b.pf - b.pa) - (a.pf - a.pa)) || (b.pf - a.pf); });
  };

  /* the user's next game (team 0), or null */
  Career.nextGame = function () {
    var s = Career.p.season;
    if (!s || s.done) return null;
    if (s.phase === 'regular') {
      var g = s.rounds[s.round].filter(function (x) { return x[0] === 0 || x[1] === 0; })[0];
      return { home: g[0], away: g[1], label: 'Game ' + (s.round + 1) + ' of ' + s.length };
    }
    if (s.phase === 'playoffs' && s.playoffs) {
      var gm = s.playoffs.current;
      if (gm && (gm.a === 0 || gm.b === 0)) return { home: gm.a, away: gm.b, label: s.playoffs.stage === 'final' ? 'THE FINAL' : 'Semifinal' };
    }
    return null;
  };

  Career.gameSetup = function () {
    var s = Career.p.season, g = Career.nextGame();
    if (!g) return null;
    var opp = g.home === 0 ? g.away : g.home, ot = s.teams[opp], mine = s.teams[0];
    var diff = ot.rating <= 2 ? 'easy' : 'normal';
    var arena = ARENA_ROTATION[(s.round + opp + s.n) % ARENA_ROTATION.length];
    return { teamSize: 3, duration: 180, difficulty: diff, mateDifficulty: 'normal', modifier: 'none', arena: arena, warmup: 0,
      mercyLead: 15, kickoffReset: true, abilities: true, context: { kind: 'season', opp: opp },
      names: { mates: mine.roster.slice(1), opps: ot.roster.slice() }, teamNames: [mine.short, ot.short] };
  };

  /* simulate a CPU game: points from team ratings, stats spread over the roster */
  function simGame(s, a, b) {
    var A = s.teams[a], B = s.teams[b];
    function score(t, o) { return Math.max(4, Math.round(13 + t.rating * 2.6 - o.rating * 1.1 + (rnd() - 0.5) * 10)); }
    var sa = score(A, B), sb = score(B, A);
    if (sa === sb) { if (rnd() < 0.5) sa += 2; else sb += 2; }
    [[A, sa], [B, sb]].forEach(function (x) {
      var t = x[0], pts = x[1], shares = [0.42, 0.33, 0.25].sort(function () { return rnd() - 0.5; });
      t.roster.forEach(function (n, k) {
        var pl = s.players[t.id + ':' + k];
        if (pl.me) return;
        pl.gp++; pl.pts += Math.round(pts * shares[k]); pl.ast += Math.round(rnd() * 3); pl.stl += Math.round(rnd() * 2);
        pl.dunks += Math.round(rnd() * pts * shares[k] / 5); pl.tkl += Math.round(rnd() * 3);
      });
    });
    return [sa, sb];
  }
  function record(s, a, b, sa, sb) {
    var A = s.teams[a], B = s.teams[b];
    A.pf += sa; A.pa += sb; B.pf += sb; B.pa += sa;
    if (sa > sb) { A.w++; B.l++; } else { B.w++; A.l++; }
    s.results.push({ r: s.phase === 'regular' ? s.round : s.playoffs.stage, a: a, b: b, sa: sa, sb: sb });
  }

  /* After the user's game (or a simmed one): record it, sim the rest of the round, advance. */
  Career.finishGame = function (myScore, oppScore, myStats, teammateStats) {
    var s = Career.p.season, g = Career.nextGame();
    if (!g) return;
    var opp = g.home === 0 ? g.away : g.home;
    if (myStats) {
      var me = s.players['0:0'];
      me.gp++; me.pts += myStats.pts; me.ast += myStats.assists; me.stl += myStats.steals; me.dunks += myStats.dunks; me.tkl += myStats.tackles;
      (teammateStats || []).forEach(function (st, k) {
        var pl = s.players['0:' + (k + 1)]; if (!pl || !st) return;
        pl.gp++; pl.pts += st.pts; pl.ast += st.assists; pl.stl += st.steals; pl.dunks += st.dunks; pl.tkl += st.tackles;
      });
      var oppPl = s.teams[opp];
      oppPl.roster.forEach(function (n, k) { var pl = s.players[opp + ':' + k]; pl.gp++; pl.pts += Math.round(oppScore * [0.4, 0.33, 0.27][k]); pl.ast += Math.round(rnd() * 2); });
      var c = Career.p.career; c.games++; c.pts += myStats.pts; c.ast += myStats.assists; c.stl += myStats.steals; c.dunks += myStats.dunks;
    }
    if (s.phase === 'regular') {
      s.rounds[s.round].forEach(function (x) {
        if (x[0] === 0 || x[1] === 0) {
          var home0 = x[0] === 0;
          record(s, x[0], x[1], home0 ? myScore : oppScore, home0 ? oppScore : myScore);
        } else { var sc = simGame(s, x[0], x[1]); record(s, x[0], x[1], sc[0], sc[1]); }
      });
      s.round++;
      if (s.round >= s.length) Career._startPlayoffs();
    } else {
      var cur = s.playoffs.current;
      var home = cur.a === 0;
      Career._playoffResult(home ? myScore : oppScore, home ? oppScore : myScore, myStats);
    }
    Career.save();
  };

  /* sim the user's own game too (skip button) */
  Career.simMyGame = function () {
    var s = Career.p.season, g = Career.nextGame();
    if (!g) return null;
    var opp = g.home === 0 ? g.away : g.home;
    var me = { rating: 3.4 }, ot = s.teams[opp];
    var my = Math.max(4, Math.round(13 + me.rating * 2.6 - ot.rating * 1.1 + (rnd() - 0.5) * 10));
    var op = Math.max(4, Math.round(13 + ot.rating * 2.6 - me.rating * 1.1 + (rnd() - 0.5) * 10));
    if (my === op) my += 2;
    var share = 0.35 + rnd() * 0.15;
    var st = { pts: Math.round(my * share), assists: Math.round(rnd() * 3), steals: Math.round(rnd() * 2), dunks: Math.round(rnd() * 2), tackles: Math.round(rnd() * 3) };
    Career.finishGame(my, op, st, [
      { pts: Math.round(my * (1 - share) * 0.55), assists: 1, steals: 1, dunks: 0, tackles: 1 },
      { pts: Math.round(my * (1 - share) * 0.45), assists: 1, steals: 0, dunks: 0, tackles: 1 }]);
    return { my: my, opp: op };
  };

  Career._startPlayoffs = function () {
    var s = Career.p.season, st = Career.standings();
    s.phase = 'playoffs';
    s.mvp = Career.computeMvp();
    s.playoffs = { seeds: st.slice(0, 4).map(function (t) { return t.id; }), stage: 'semi', semis: [], final: null, current: null, done: [] };
    var sd = s.playoffs.seeds;
    s.playoffs.semis = [{ a: sd[0], b: sd[3], winner: -1 }, { a: sd[1], b: sd[2], winner: -1 }];
    Career._nextPlayoff();
  };

  /* advance the bracket: sim every playoff game that doesn't involve the user */
  Career._nextPlayoff = function () {
    var s = Career.p.season, P = s.playoffs;
    while (true) {
      var queue = P.stage === 'semi' ? P.semis.filter(function (g) { return g.winner < 0; }) : (P.final && P.final.winner < 0 ? [P.final] : []);
      if (!queue.length) {
        if (P.stage === 'semi') { P.stage = 'final'; P.final = { a: P.semis[0].winner, b: P.semis[1].winner, winner: -1 }; continue; }
        Career._seasonOver(); return;
      }
      var g = queue[0];
      if (g.a === 0 || g.b === 0) { P.current = g; return; }
      var sc = simGame(s, g.a, g.b);
      g.score = sc; g.winner = sc[0] > sc[1] ? g.a : g.b;
      if (P.stage === 'final') g.finalsMvp = Career._bestOf(g.winner);
    }
  };
  Career._playoffResult = function (sa, sb, myStats) {
    var s = Career.p.season, P = s.playoffs, g = P.current;
    g.score = [sa, sb]; g.winner = sa > sb ? g.a : g.b;
    if (P.stage === 'final') g.finalsMvp = (g.winner === 0 && myStats) ? s.players['0:0'].name : Career._bestOf(g.winner);
    P.current = null;
    Career._nextPlayoff();
  };
  Career._bestOf = function (teamId) {
    var s = Career.p.season, best = null;
    for (var k = 0; k < 3; k++) { var pl = s.players[teamId + ':' + k]; if (!best || pl.pts > best.pts) best = pl; }
    return best ? best.name : '';
  };
  Career._seasonOver = function () {
    var s = Career.p.season, P = s.playoffs, c = Career.p.career;
    s.champion = P.final.winner; s.finalsMvp = P.final.finalsMvp || '';
    s.done = true; s.phase = 'done';
    c.seasons = s.n;
    var me = s.players['0:0'];
    if (s.champion === 0) c.titles++;
    if (s.mvp && s.mvp.me) c.mvps++;
    if (s.champion === 0 && s.finalsMvp === me.name) c.finalsMvps++;
    var rank = Career.standings().map(function (t) { return t.id; }).indexOf(0) + 1;
    c.history.push({ n: s.n, w: s.teams[0].w, l: s.teams[0].l, seed: rank, champ: s.champion === 0, mvp: !!(s.mvp && s.mvp.me),
      ppg: me.gp ? +(me.pts / me.gp).toFixed(1) : 0 });
    s.rewards = Career._seasonRewards(rank);
  };
  Career._seasonRewards = function (rank) {
    var s = Career.p.season, xp = 150 + (s.teams[0].w * 20);
    if (s.playoffs.seeds.indexOf(0) >= 0) xp += 150;
    if (s.champion === 0) xp += 400;
    if (s.mvp && s.mvp.me) xp += 300;
    var ups = Career.addXp(xp);
    Career.save();
    return { xp: xp, levels: ups };
  };

  /* Regular-season MVP: production + team success */
  Career.computeMvp = function () {
    var s = Career.p.season, best = null, bs = -1, k;
    for (k in s.players) {
      var pl = s.players[k]; if (!pl.gp) continue;
      var t = s.teams[pl.team], winPct = (t.w + t.l) ? t.w / (t.w + t.l) : 0;
      var score = pl.pts / pl.gp + 0.8 * pl.ast / pl.gp + 0.6 * pl.stl / pl.gp + 0.4 * pl.dunks / pl.gp + winPct * 6;
      if (score > bs) { bs = score; best = pl; }
    }
    return best ? { name: best.name, team: best.team, me: !!best.me, ppg: +(best.pts / best.gp).toFixed(1) } : null;
  };
  Career.leaders = function (stat, n) {
    var s = Career.p.season, list = [], k;
    for (k in s.players) { var pl = s.players[k]; if (pl.gp) list.push(pl); }
    list.sort(function (a, b) { return b[stat] / b.gp - a[stat] / a.gp; });
    return list.slice(0, n || 5);
  };

  /* ---------------- match rewards ---------------- */
  /* Called when any match ends. Returns what to show on the results screen. */
  Career.onMatchEnd = function (setup, sim, localId) {
    var p = Career.p, m = sim.match, lp = sim.players[localId];
    if (!lp || sim.mode !== 'match') return null;
    var ctx = (setup && setup.context) || { kind: 'quick' };
    var won = m.winner === lp.team, st = lp.stats, out = { lines: [], ctx: ctx.kind };
    var xp = 100 + (won ? 80 : 0) + st.pts * 6 + st.dunks * 8 + st.assists * 10 + st.steals * 12 + st.tackles * 6;
    if (ctx.kind === 'ranked') xp = Math.round(xp * 1.25);
    if (ctx.kind === 'season') xp = Math.round(xp * 1.15);
    p.games++; if (won) p.wins++;
    if (ctx.kind === 'ranked') {
      var before = Career.tier().name, diff = m.score[lp.team] - m.score[1 - lp.team];
      var d = won ? 22 + Math.min(10, Math.round(diff / 2)) : -(m.winner < 0 ? 0 : (Math.abs(diff) <= 4 ? 12 : 18));
      p.rp = Math.max(0, p.rp + d); p.ranked.games++; if (won) p.ranked.wins++; p.ranked.best = Math.max(p.ranked.best, p.rp);
      var after = Career.tier().name;
      out.lines.push((d >= 0 ? '+' : '') + d + ' RP  (' + p.rp + ' RP, ' + after + ')');
      if (after !== before) out.lines.push(d > 0 ? 'PROMOTED TO ' + after + '!' : 'Dropped to ' + after);
    }
    if (ctx.kind === 'season') {
      var mates = sim.players.filter(function (q) { return q.team === lp.team && q.id !== lp.id; }).map(function (q) { return q.stats; });
      Career.finishGame(m.score[lp.team], m.score[1 - lp.team], st, mates);
    }
    var ups = Career.addXp(xp);
    out.lines.unshift('+' + xp + ' XP');
    ups.forEach(function (lv) {
      out.lines.push('LEVEL ' + lv + '! ' + Career.title(lv));
      Career.unlocksAt(lv).forEach(function (u) { out.lines.push('Unlocked: ' + Career.unlockName(u)); });
    });
    Career.save();
    return out;
  };

  Career.unlockName = function (u) {
    var COS = BBA.Character.COS, list = COS[u[1]] || [], i;
    var kindName = { hats: 'hat', faces: 'face', patterns: 'pattern', jerseyStyles: 'jersey style', uppers: 'outfit', lowers: 'outfit', celebrations: 'celebration', victories: 'victory pose' }[u[1]] || u[1];
    for (i = 0; i < list.length; i++) if (list[i][0] === u[2]) return list[i][1] + ' (' + kindName + ')';
    return u[2];
  };

  Career.load();
  BBA.Career = Career;
})(this);
