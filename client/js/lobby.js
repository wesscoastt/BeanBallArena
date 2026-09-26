/* BEAN BALL ARENA - client/js/lobby.js
 * Private match screens: create / join by code, lobby with teams, ready,
 * bots, host settings, start. Driven by BBA.Net lobby state.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var doc = root.document;
  function $(id) { return doc.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var L = { showSettings: false, busy: false };

  L.init = function () {
    var Net = BBA.Net;
    $('join-go').addEventListener('click', function () { L.join($('join-code').value); });
    $('join-code').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') L.join($('join-code').value); });
    $('join-code').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
    $('lobby-copy').addEventListener('click', function () {
      var txt = Net.shareLink();
      var done = function () { L.status('Invite link copied: send it to your friends'); };
      try { root.navigator.clipboard.writeText(txt).then(done, function () { L.status(txt); }); } catch (e) { L.status(txt); }
    });
    $('lobby-code').addEventListener('click', function () { $('lobby-copy').click(); });
    if (!Net.available) return;
    Net.onLobby = function (st) { if (BBA.UI.current === 'lobby') L.render(); if (st.state === 'lobby' && BBA.Game.mode === 'online' && BBA.Game.onlineEnded) { /* results still on screen */ } };
    Net.onNotice = function (t) { if (BBA.Game.mode === 'online') BBA.UI.feed(esc(t)); else L.status(t); };
    Net.onConnChange = function (on) {
      if (!on && (BBA.UI.current === 'lobby' || BBA.Game.mode === 'online')) L.status('Connection lost, reconnecting…');
      else if (on) L.status('');
    };
    Net.connect();
    var code = Net.roomFromUrl();
    if (code) { $('join-code').value = code; BBA.UI.show('join'); setTimeout(function () { L.join(code); }, 600); }
  };

  L.status = function (t) { var s = $('lobby-status'); if (s) s.textContent = t || ''; var j = $('join-status'); if (j) j.textContent = t || ''; };

  L.create = function () {
    var Net = BBA.Net;
    if (!Net.available) { BBA.UI.show('online'); return; }
    if (L.busy) return;
    L.busy = true; L.status('Creating room…');
    Net.create(function (res) {
      L.busy = false;
      if (!res.ok) { L.status(res.error || 'Could not create a room.'); return; }
      L.status('');
      BBA.UI.show('lobby');
    });
  };

  L.join = function (code) {
    var Net = BBA.Net;
    code = String(code || '').toUpperCase().trim();
    if (code.length < 4) { L.status('Enter the 5-letter room code.'); return; }
    if (L.busy) return;
    L.busy = true; L.status('Joining ' + code + '…');
    Net.join(code, null, function (res) {
      L.busy = false;
      if (!res.ok) { L.status(res.error || 'Could not join.'); return; }
      L.status('');
      if (!res.reconnected || !Net.inMatch) BBA.UI.show('lobby');
    });
  };

  L.leave = function () {
    BBA.Net.leave();
    if (BBA.Game.mode === 'online') BBA.Game.quitToMenu();
    else BBA.UI.show('main');
  };

  var SETTINGS = [
    ['arena', 'ARENA', BBA.Arenas.list.map(function (a) { return [a.id, a.name]; })],
    ['teamSize', 'TEAM SIZE', [[1, '1 v 1'], [2, '2 v 2'], [3, '3 v 3']]],
    ['duration', 'MATCH LENGTH', [[180, '3 min'], [240, '4 min'], [300, '5 min'], [420, '7 min']]],
    ['warmup', 'WARM-UP', [[0, 'Off'], [30, '30 s'], [60, '60 s'], [120, '2 min'], [-1, 'Until all ready']]],
    ['scoreLimit', 'SCORE LIMIT', [[0, 'None'], [10, '10'], [15, '15'], [21, '21']]],
    ['mercyLead', 'MERCY RULE', [[0, 'Off'], [8, 'Lead by 8'], [10, 'Lead by 10'], [12, 'Lead by 12'], [15, 'Lead by 15']]],
    ['kickoffReset', 'AFTER A SCORE', [[true, 'Reset to decks'], [false, 'Keep playing']]],
    ['difficulty', 'BOT DIFFICULTY', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]],
    ['autoFillBots', 'AUTO-FILL BOTS', [[true, 'On'], [false, 'Off']]],
    ['overtime', 'OVERTIME', [[true, 'On'], [false, 'Off (draws allowed)']]],
    ['modifier', 'MODIFIER', [['none', 'None'], ['superbounce', 'Super Bounce'], ['lowgravity', 'Low Gravity'], ['heavyball', 'Heavy Ball'], ['megaball', 'Mega Ball'], ['turbo', 'Turbo']]],
    ['tackleStrength', 'TACKLE STRENGTH', [[0.6, 'Soft'], [1, 'Normal'], [1.5, 'Brutal']]],
    ['ballWeight', 'BALL WEIGHT', [[0.75, 'Light'], [1, 'Normal'], [1.4, 'Heavy']]],
    ['gravity', 'GRAVITY', [[0.6, 'Floaty'], [1, 'Normal'], [1.3, 'Heavy']]],
    ['jumpHeight', 'JUMP HEIGHT', [[0.8, 'Low'], [1, 'Normal'], [1.35, 'High']]],
    ['respawnTime', 'RESPAWN TIME', [[1.5, '1.5 s'], [3, '3 s'], [5, '5 s']]],
    ['obstacles', 'OBSTACLE INTENSITY', [[0, 'Off'], [0.6, 'Chill'], [1, 'Normal'], [1.8, 'Wild']]]
  ];

  function nearest(list, v) {
    var best = list[0], bd = 1e9;
    for (var i = 0; i < list.length; i++) { var d = (typeof v === 'number') ? Math.abs(list[i][0] - v) : (list[i][0] === v ? 0 : 1); if (d < bd) { bd = d; best = list[i]; } }
    return best;
  }

  L.render = function () {
    var Net = BBA.Net, st = Net.lobby;
    if (!st) return;
    $('lobby-code').textContent = st.code;
    $('lobby-link').textContent = Net.shareLink().replace(/^https?:\/\//, '');
    var host = Net.isHost(), me = Net.me();
    var html = '';
    for (var t = 0; t < 2; t++) {
      html += '<div class="tp-col ' + (t === 0 ? 'blue' : 'red') + '"><h4>' + (t === 0 ? 'BLUE' : 'RED') + ' TEAM</h4>';
      st.teams[t].forEach(function (s) {
        if (s.kind === 'human') {
          html += '<div class="slot' + (s.pub === Net.pub ? ' me' : '') + '"><span class="dot" style="background:' + esc(s.color) + '"></span>' +
            (s.host ? '&#9819; ' : '') + esc(s.name) + (s.pub === Net.pub ? ' (you)' : '') +
            '<span class="tag">' + (!s.connected ? 'reconnecting' : (s.host ? 'HOST' : (s.ready ? 'READY' : 'not ready'))) + '</span></div>';
        } else if (s.kind === 'bot') html += '<div class="slot bot">BOT ' + esc(s.name) + '</div>';
        else if (s.kind === 'autobot') html += '<div class="slot bot dim">BOT (auto-fill)</div>';
        else html += '<div class="slot dim">- empty -</div>';
      });
      if (host) html += '<div class="bot-btns"><button class="pbtn small" data-bot="add" data-team="' + t + '">+ BOT</button><button class="pbtn small" data-bot="remove" data-team="' + t + '">- BOT</button></div>';
      html += '</div>';
    }
    $('lobby-teams').innerHTML = html;
    var bb = $('lobby-teams').querySelectorAll('[data-bot]');
    for (var i = 0; i < bb.length; i++) {
      bb[i].addEventListener('click', function () {
        var team = +this.getAttribute('data-team');
        if (this.getAttribute('data-bot') === 'add') Net.addBot(team); else Net.removeBot(team);
        BBA.Audio.play('ui');
      });
    }
    // buttons
    var readyBtn = $('lobby-ready');
    readyBtn.style.display = host ? 'none' : '';
    readyBtn.textContent = me && me.ready ? 'NOT READY' : 'READY';
    readyBtn.classList.toggle('go', !(me && me.ready));
    $('lobby-start').style.display = host ? '' : 'none';
    $('lobby-settings-btn').textContent = host ? (L.showSettings ? 'HIDE SETTINGS' : 'MATCH SETTINGS') : (L.showSettings ? 'HIDE SETTINGS' : 'VIEW SETTINGS');
    // settings
    var box = $('lobby-settings');
    box.style.display = L.showSettings ? '' : 'none';
    if (L.showSettings) {
      box.innerHTML = '';
      SETTINGS.forEach(function (d) {
        var key = d[0], list = d[1 + 1];
        if (host) {
          box.appendChild(BBA.UI.choice(d[1], list, function () { return nearest(list, st.settings[key])[0]; }, function (v) { var p = {}; p[key] = v; Net.settings(p); }));
        } else {
          var r = doc.createElement('div'); r.className = 'orow';
          r.innerHTML = '<div class="olab">' + d[1] + '</div><div class="oval" style="color:#ffc93c;font-family:var(--font-h)">' + esc(nearest(list, st.settings[key])[1]) + '</div>';
          box.appendChild(r);
        }
      });
      if (host) box.appendChild(BBA.UI.button('RESTORE DEFAULTS', 'RESET', function () { Net.settings({ restoreDefaults: true }); }));
    }
    var s = st.settings;
    $('lobby-summary').textContent = s.teamSize + 'v' + s.teamSize + ' · ' + Math.round(s.duration / 60) + ' min · bots ' + s.difficulty + (s.modifier !== 'none' ? ' · ' + s.modifier : '') + ' · ' + st.humans + '/' + st.maxHumans + ' players';
  };

  L.action = function (a) {
    var Net = BBA.Net, me = Net.me();
    if (a === 'lobby-switch') Net.switchTeam();
    else if (a === 'lobby-ready') Net.ready(!(me && me.ready));
    else if (a === 'lobby-start') {
      Net.start(function (res) { if (!res.ok) L.status(res.error); });
    } else if (a === 'lobby-settings') { L.showSettings = !L.showSettings; L.render(); }
    else if (a === 'lobby-leave') L.leave();
  };

  BBA.Lobby = L;
})(this);
