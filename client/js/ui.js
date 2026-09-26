/* BEAN BALL ARENA - client/js/ui.js
 * Menus (main, play vs bots, customize, settings, pause, results, help),
 * gamepad/keyboard menu navigation, and the in-match HUD.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var doc = root.document;
  var C = BBA.C;

  function $(id) { return doc.getElementById(id); }
  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  var UI = { current: null, stack: [], focusIdx: 0, G: null, setTab: 'graphics' };

  UI.init = function (G) {
    UI.G = G;
    BBA.Controls.onNav = UI.nav;
    // generic button actions
    var screens = doc.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-act]') : null;
        if (b) { BBA.Audio.unlock(); BBA.Audio.play('ui'); UI.action(b.getAttribute('data-act')); }
      });
    }
    $('pc-avatar').parentNode.addEventListener('click', function () { UI.show('customize'); });
    $('tut-skip').addEventListener('click', function () { if (UI.G.tutorial) UI.G.tutorial.finish(true); });
    $('edit-done').addEventListener('click', function () { if (BBA.Controls.stopTouchEdit) BBA.Controls.stopTouchEdit(); });
    $('pause-btn').addEventListener('click', function () { UI.G.togglePause(); });
    $('wu-ready').addEventListener('click', function (e) { e.stopPropagation(); UI.G.warmupReady(); });
    $('wu-ready').addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
    $('version').textContent = 'v' + C.VERSION + ' · offline build';
    var nameIn = $('cust-name');
    nameIn.addEventListener('input', function () {
      var v = nameIn.value.replace(/[<>]/g, '').slice(0, 14);
      BBA.Settings.data.name = v || 'Player'; BBA.Settings.save(); UI.refreshCard();
    });
    nameIn.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') nameIn.blur(); });
    var jIn = $('cust-jersey'), jT = null;
    jIn.addEventListener('input', function () {
      var v = BBA.Character.cleanJerseyName(jIn.value);
      BBA.Settings.data.cosmetics.jerseyName = v; BBA.Settings.save();
      clearTimeout(jT); jT = setTimeout(function () { UI.G.refreshPreview(); UI.G.previewShowBack(); }, 250);
    });
    jIn.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') jIn.blur(); });
    UI.buildArenaRow();
    UI.refreshCard();
    UI.applyUIScale();
    UI.onDevice(BBA.Controls.device);
    UI.show('main');
    BBA.Lobby.init();
  };

  UI.gfxNotice = function (on) {
    var f = $('fatal');
    if (on) {
      f.innerHTML = 'Your device paused the graphics. Restoring…<br><br><button class="pbtn go" onclick="location.reload()">RELOAD GAME</button>';
      f.classList.remove('hidden');
    } else f.classList.add('hidden');
  };

  UI.fatal = function (msg) { var f = $('fatal'); f.textContent = msg; f.classList.remove('hidden'); };

  UI.applyUIScale = function () {
    doc.documentElement.style.setProperty('--ui', BBA.Settings.data.uiScale);
    doc.body.classList.toggle('cb', !!BBA.Settings.data.colorblind);
  };

  UI.refreshCard = function () {
    var S = BBA.Settings.data;
    $('pc-name').textContent = S.name;
    $('pc-avatar').style.background = S.cosmetics.color;
  };

  UI.onDevice = function (d) {
    doc.body.classList.toggle('touch-on', d === 'touch');
    var keys = $('w-keys');
    if (!keys) return;
    var g = BBA.Controls.glyph;
    if (d === 'touch') keys.innerHTML = 'Left thumb: move (push far to sprint)<br>Right side: drag to look, buttons for Jump / Grab / Pass / Dive / Shoot';
    else keys.innerHTML = '<b>Move</b> ' + (d === 'pad' ? 'Left stick' : 'WASD') + ' · <b>Jump</b> ' + g('jump') + ' · <b>Sprint</b> ' + g('sprint') +
      '<br><b>Grab</b> ' + g('grab') + ' · <b>Dive</b> ' + g('dive') + ' · <b>Pass</b> ' + g('pass') + '<br><b>Shoot</b> hold ' + g('shoot') + ' · <b>Ball cam</b> ' + g('ballcam');
    UI.updateHints();
  };

  var ARENA_BG = {
    bean_bowl: 'linear-gradient(135deg,#ff9a3a,#7a5cff 60%,#2f7bff)',
    rooftop: 'linear-gradient(135deg,#5bc8ff,#ffb86b 70%,#4a8f4a)',
    factory: 'linear-gradient(135deg,#5a5f6e,#e0a13a 60%,#2d3140)',
    neon: 'linear-gradient(135deg,#2a0f5e,#d23cff 60%,#2fd3ff)',
    pirate: 'linear-gradient(135deg,#8a5a36,#3ab0d8 60%,#f0d48a)',
    space: 'linear-gradient(135deg,#0b0f33,#5b3cc0 60%,#ff4f8b)',
    snowy: 'linear-gradient(135deg,#e8f6ff,#8bc8ff 60%,#4a6fa0)'
  };
  UI.buildArenaRow = function () {
    var row = $('arena-row'), list = BBA.Arenas.list, cur = BBA.Settings.data.lastSetup.arena || 'bean_bowl';
    row.innerHTML = '';
    list.forEach(function (a) {
      var t = el('button', 'atile' + (a.id === cur ? ' sel' : ''), UI.G.esc(a.name) + (a.id === cur ? '<span class="chk">&#10003;</span>' : ''));
      t.style.background = ARENA_BG[a.id] || '#333';
      t.title = a.blurb;
      t.addEventListener('click', function () {
        BBA.Settings.data.lastSetup.arena = a.id; BBA.Settings.save();
        UI.G.menuArena = a.id;
        if (UI.G.mode === 'attract') UI.G.startAttract();
        UI.buildArenaRow();
        BBA.Audio.play('ui');
      });
      row.appendChild(t);
    });
  };

  /* ---------------- screen stack ---------------- */
  UI.show = function (name, noPush) {
    var cur = UI.current;
    if (cur && !noPush && cur !== name) UI.stack.push(cur);
    var all = doc.querySelectorAll('.screen'), i;
    for (i = 0; i < all.length; i++) all[i].classList.remove('on');
    var scr = $('scr-' + name);
    if (scr) scr.classList.add('on');
    UI.current = name;
    if (name === 'main') UI.stack = [];
    if (name === 'setup') UI.buildSetup();
    if (name === 'settings') UI.buildSettings();
    if (name === 'customize') UI.buildCustomize();
    if (name === 'help') UI.buildHelp();
    if (name === 'main') UI.refreshCard();
    if (name === 'lobby') BBA.Lobby.render();
    if (name === 'pause') { var rs = $('pause-restart'); if (rs) rs.style.display = UI.G.mode === 'online' ? 'none' : ''; }
    if (name === 'results') { var online = UI.G.mode === 'online'; $('res-again').textContent = online ? 'BACK TO LOBBY' : 'PLAY AGAIN'; $('res-quit').textContent = online ? 'LEAVE ROOM' : 'MAIN MENU'; }
    UI.focusIdx = 0;
    UI._focus(false);
  };
  UI.hideMenus = function () {
    var all = doc.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('on');
    UI.current = null; UI.stack = [];
  };
  UI.back = function () {
    if (!UI.current) return;
    if (UI.current === 'main') return;
    BBA.Audio.play('uiBack');
    if (UI.current === 'pause') { UI.G.pause(false); return; }
    if (UI.current === 'results' || UI.current === 'tutdone') return;
    if (UI.current === 'lobby') return; // use LEAVE explicitly
    var prev = UI.stack.pop();
    if (prev) UI.show(prev, true);
    else if (UI.G.mode === 'attract') UI.show('main', true);
    else UI.hideMenus();
  };

  UI.action = function (a) {
    var G = UI.G;
    switch (a) {
      case 'quick': BBA.Audio.unlock(); UI.hideMenus(); G.startMatch({ teamSize: 3, duration: 240, difficulty: BBA.Settings.data.lastSetup.difficulty || 'normal', modifier: 'none', arena: BBA.Settings.data.lastSetup.arena || 'bean_bowl', warmup: BBA.Settings.data.lastSetup.warmup }); break;
      case 'setup': UI.show('setup'); break;
      case 'create': $('online-title').textContent = 'CREATE PRIVATE MATCH'; BBA.Lobby.create(); break;
      case 'join': $('online-title').textContent = 'JOIN PRIVATE MATCH'; if (BBA.Net.available) UI.show('join'); else UI.show('online'); break;
      case 'customize': UI.show('customize'); break;
      case 'settings': UI.show('settings'); break;
      case 'tutorial': UI.hideMenus(); G.startTutorial(); break;
      case 'back': UI.back(); break;
      case 'start': BBA.Settings.save(); UI.hideMenus(); G.startMatch(BBA.Settings.data.lastSetup); break;
      case 'resume': G.pause(false); break;
      case 'restart': UI.hideMenus(); if (G.mode === 'tutorial') G.startTutorial(); else if (G.freePractice) G.startPractice(); else G.startMatch(G.setup); break;
      case 'practice': UI.hideMenus(); G.startPractice(); break;
      case 'help': UI.show('help'); break;
      case 'quit': UI.hideMenus(); if (G.mode === 'online') BBA.Lobby.leave(); else G.quitToMenu(); break;
      case 'again':
        if (G.mode === 'online') { G.backToLobby(); break; }
        UI.hideMenus(); G.startMatch(G.setup); break;
      case 'randomize': UI.randomizeCosmetics(); break;
      case 'restore': UI.restoreDefaults(); break;
      default: if (a.indexOf('lobby-') === 0) BBA.Lobby.action(a); break;
    }
  };

  /* ---------------- gamepad / arrow navigation ---------------- */
  UI._focusables = function () {
    if (!UI.current) return [];
    var scr = $('scr-' + UI.current);
    if (!scr) return [];
    var list = scr.querySelectorAll('.mbtn, .pbtn, .orow, .tab, .tut-btn');
    var out = [];
    for (var i = 0; i < list.length; i++) if (list[i].offsetParent !== null) out.push(list[i]);
    return out;
  };
  UI._focus = function (show) {
    var f = UI._focusables(), i;
    for (i = 0; i < f.length; i++) f[i].classList.remove('focus');
    if (!f.length) return;
    UI.focusIdx = (UI.focusIdx + f.length) % f.length;
    if (show !== false || BBA.Controls.device === 'pad') {
      f[UI.focusIdx].classList.add('focus');
      if (f[UI.focusIdx].scrollIntoView) f[UI.focusIdx].scrollIntoView({ block: 'nearest' });
    }
  };
  UI.nav = function (dir) {
    if (!UI.current) return;
    if (BBA.Controls.editing) return;
    var f = UI._focusables();
    if (!f.length) return;
    var cur = f[clamp(UI.focusIdx, 0, f.length - 1)];
    if (dir === 'up') { UI.focusIdx--; UI._focus(true); BBA.Audio.play('ui', { minGap: 0.05 }); }
    else if (dir === 'down') { UI.focusIdx++; UI._focus(true); BBA.Audio.play('ui', { minGap: 0.05 }); }
    else if (dir === 'left' || dir === 'right') {
      if (cur && cur._step) { cur._step(dir === 'left' ? -1 : 1); }
      else if (cur && (cur.classList.contains('tab') || cur.classList.contains('pbtn'))) { UI.focusIdx += dir === 'left' ? -1 : 1; UI._focus(true); }
    }
    else if (dir === 'confirm') { if (cur) { if (cur._confirm) cur._confirm(); else cur.click(); } }
    else if (dir === 'back') UI.back();
  };

  /* ---------------- option row builders ---------------- */
  function row(label, desc) {
    var r = el('div', 'orow');
    var l = el('div', '', '<div class="olab">' + label + '</div>' + (desc ? '<div class="odesc">' + desc + '</div>' : ''));
    r.appendChild(l);
    return r;
  }
  UI.choice = function (label, values, get, set, desc) {
    var r = row(label, desc);
    var box = el('div', 'ochoose');
    var lb = el('button', 'oarr', '&#9664;'), val = el('span', 'oval'), rb = el('button', 'oarr', '&#9654;');
    box.appendChild(lb); box.appendChild(val); box.appendChild(rb); r.appendChild(box);
    function idx() { var v = get(), i; for (i = 0; i < values.length; i++) if (values[i][0] === v) return i; return 0; }
    function render() { val.textContent = values[idx()][1]; }
    r._step = function (d) { var i = (idx() + d + values.length) % values.length; set(values[i][0]); render(); BBA.Audio.play('ui'); };
    r._confirm = function () { r._step(1); };
    lb.addEventListener('click', function (e) { e.stopPropagation(); r._step(-1); });
    rb.addEventListener('click', function (e) { e.stopPropagation(); r._step(1); });
    render();
    return r;
  };
  UI.slider = function (label, min, max, step, get, set, fmt, desc) {
    var r = row(label, desc);
    var box = el('div', 'ochoose');
    var inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
    var num = el('span', 'onum');
    function render() { num.textContent = fmt ? fmt(+inp.value) : inp.value; }
    inp.addEventListener('input', function () { set(+inp.value); render(); });
    box.appendChild(inp); box.appendChild(num); r.appendChild(box);
    r._step = function (d) { var v = clamp(+inp.value + d * step, min, max); inp.value = v; set(v); render(); };
    render();
    return r;
  };
  UI.toggle = function (label, get, set, desc) {
    var r = row(label, desc);
    var t = el('div', 'toggle' + (get() ? ' on' : ''));
    r.appendChild(t);
    r._confirm = function () { set(!get()); t.classList.toggle('on', !!get()); BBA.Audio.play('ui'); };
    r._step = function () { r._confirm(); };
    r.addEventListener('click', function () { r._confirm(); });
    return r;
  };
  UI.button = function (label, btnLabel, fn, desc) {
    var r = row(label, desc);
    var b = el('button', 'bindbtn', btnLabel);
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); });
    r.appendChild(b);
    r._confirm = function () { fn(b); };
    return r;
  };
  UI.swatches = function (label, colors, get, set) {
    var r = row(label);
    var box = el('div', 'swatches');
    function render() {
      box.innerHTML = '';
      for (var i = 0; i < colors.length; i++) {
        (function (c) {
          var s = el('div', 'sw' + (get() === c ? ' sel' : ''));
          s.style.background = c === 'team' ? 'linear-gradient(135deg,#2f7bff 50%,#ff3b4e 50%)' : c;
          if (c === 'team') s.title = 'Team color';
          s.addEventListener('click', function (e) { e.stopPropagation(); set(c); render(); BBA.Audio.play('ui'); });
          box.appendChild(s);
        })(colors[i]);
      }
    }
    r._step = function (d) { var i = colors.indexOf(get()); i = (i + d + colors.length) % colors.length; set(colors[i]); render(); };
    render();
    r.appendChild(box);
    return r;
  };

  /* ---------------- play vs bots setup ---------------- */
  UI.buildSetup = function () {
    var S = BBA.Settings.data, L = S.lastSetup, box = $('setup-opts');
    box.innerHTML = '';
    function save() { BBA.Settings.save(); UI.teamsPreview(); }
    box.appendChild(UI.choice('ARENA', BBA.Arenas.list.map(function (a) { return [a.id, a.name]; }), function () { return L.arena || 'bean_bowl'; },
      function (v) { L.arena = v; save(); UI.G.menuArena = v; UI.buildArenaRow(); }, BBA.Arenas.list.filter(function (a) { return a.id === (L.arena || 'bean_bowl'); })[0].blurb));
    box.appendChild(UI.choice('TEAM SIZE', [[1, '1 v 1'], [2, '2 v 2'], [3, '3 v 3']], function () { return L.teamSize; }, function (v) { L.teamSize = v; save(); }));
    box.appendChild(UI.choice('MATCH LENGTH', [[180, '3 minutes'], [240, '4 minutes'], [300, '5 minutes']], function () { return L.duration; }, function (v) { L.duration = v; save(); }));
    box.appendChild(UI.choice('BOT DIFFICULTY', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], function () { return L.difficulty; }, function (v) { L.difficulty = v; save(); }));
    box.appendChild(UI.choice('WARM-UP', [[0, 'Off'], [30, '30 seconds'], [45, '45 seconds'], [90, '90 seconds'], [-1, "Until I'm ready"]],
      function () { return L.warmup === undefined ? 45 : L.warmup; }, function (v) { L.warmup = v; save(); }, 'Practice on the court before the match starts'));
    box.appendChild(UI.choice('MERCY RULE', [[0, 'Off'], [8, 'Lead by 8'], [10, 'Lead by 10'], [12, 'Lead by 12'], [15, 'Lead by 15']],
      function () { return L.mercyLead === undefined ? 12 : L.mercyLead; }, function (v) { L.mercyLead = v; save(); }, 'A team that gets this far ahead wins right away'));
    box.appendChild(UI.choice('AFTER A SCORE', [[true, 'Reset to decks'], [false, 'Keep playing']],
      function () { return L.kickoffReset !== false; }, function (v) { L.kickoffReset = v; save(); }, 'Everyone drops from their deck again after each basket'));
    box.appendChild(UI.choice('MODIFIER', [['none', 'None (standard)'], ['superbounce', 'Super Bounce'], ['lowgravity', 'Low Gravity'], ['heavyball', 'Heavy Ball'], ['megaball', 'Mega Ball'], ['turbo', 'Turbo']],
      function () { return L.modifier || 'none'; }, function (v) { L.modifier = v; save(); }, 'Optional fun rules'));
    UI.teamsPreview();
  };
  UI.teamsPreview = function () {
    var L = BBA.Settings.data.lastSetup, n = L.teamSize, i;
    var b = '<div class="tp-col blue"><h4>BLUE</h4><div class="slot me">' + UI.G.esc(BBA.Settings.data.name) + ' (you)</div>';
    for (i = 1; i < n; i++) b += '<div class="slot">BOT</div>';
    b += '</div><div class="tp-col red"><h4>RED</h4>';
    for (i = 0; i < n; i++) b += '<div class="slot">BOT</div>';
    b += '</div>';
    $('teams-preview').innerHTML = b;
  };

  /* ---------------- customize ---------------- */
  UI.buildCustomize = function () {
    var S = BBA.Settings.data, cos = S.cosmetics, COS = BBA.Character.COS, box = $('cust-opts'), G = UI.G;
    $('cust-name').value = S.name;
    $('cust-jersey').value = cos.jerseyName || '';
    box.innerHTML = '';
    function upd() { BBA.Settings.save(); G.refreshPreview(); UI.refreshCard(); }
    function ch(label, key, list, extra) {
      var r = UI.choice(label, list, function () { return cos[key]; }, function (v) { cos[key] = v; upd(); if (extra) extra(); });
      box.appendChild(r);
    }
    box.appendChild(UI.swatches('BODY COLOR', COS.colors, function () { return cos.color; }, function (v) { cos.color = v; upd(); }));
    box.appendChild(UI.swatches('JERSEY COLOR', ['team'].concat(COS.colors), function () { return cos.jerseyColor || 'team'; }, function (v) { cos.jerseyColor = v; upd(); }));
    box.appendChild(UI.swatches('JERSEY SECOND COLOR', ['#ffffff', 'team'].concat(COS.colors.filter(function (c) { return c !== '#f2f2f2'; })).concat(['#1c1c28']),
      function () { return cos.jerseyColor2 || '#ffffff'; }, function (v) { cos.jerseyColor2 = v; upd(); }));
    ch('JERSEY STYLE', 'jerseyStyle', COS.jerseyStyles);
    ch('PATTERN', 'pattern', COS.patterns);
    box.appendChild(UI.swatches('PATTERN COLOR', COS.colors, function () { return cos.color2; }, function (v) { cos.color2 = v; upd(); }));
    ch('FACE', 'face', COS.faces);
    ch('HAT', 'hat', COS.hats);
    ch('UPPER OUTFIT', 'upper', COS.uppers);
    ch('LOWER OUTFIT', 'lower', COS.lowers);
    ch('CELEBRATION', 'celebration', COS.celebrations, function () { G.previewCelebrate(); });
    ch('VICTORY', 'victory', COS.victories, function () { G.previewVictory(); });
    var nums = []; for (var n = 0; n <= 99; n++) nums.push([n, (n < 10 ? '0' : '') + n]);
    ch('JERSEY NUMBER', 'number', nums);
    box.appendChild(UI.button('PREVIEW', 'CELEBRATE', function () { G.previewCelebrate(); }));
    G.refreshPreview();
  };
  UI.randomizeCosmetics = function () {
    var COS = BBA.Character.COS, cos = BBA.Settings.data.cosmetics;
    function pk(a) { return a[Math.floor(Math.random() * a.length)]; }
    cos.color = pk(COS.colors); cos.color2 = pk(COS.colors); cos.pattern = pk(COS.patterns)[0]; cos.face = pk(COS.faces)[0];
    cos.hat = pk(COS.hats)[0]; cos.upper = pk(COS.uppers)[0]; cos.lower = pk(COS.lowers)[0];
    cos.celebration = pk(COS.celebrations)[0]; cos.jerseyColor = Math.random() < 0.5 ? 'team' : pk(COS.colors);
    cos.jerseyColor2 = Math.random() < 0.4 ? '#ffffff' : pk(COS.colors); cos.jerseyStyle = pk(COS.jerseyStyles)[0]; cos.victory = pk(COS.victories)[0]; cos.number = Math.floor(Math.random() * 100);
    BBA.Settings.save();
    UI.buildCustomize(); UI.refreshCard();
  };

  /* ---------------- settings ---------------- */
  var TABS = [['graphics', 'GRAPHICS'], ['audio', 'AUDIO'], ['controls', 'CONTROLS'], ['mobile', 'MOBILE'], ['access', 'ACCESSIBILITY']];
  UI.buildSettings = function () {
    var tabs = $('set-tabs'), i;
    tabs.innerHTML = '';
    for (i = 0; i < TABS.length; i++) {
      (function (t) {
        var b = el('button', 'tab' + (UI.setTab === t[0] ? ' sel' : ''), t[1]);
        b.addEventListener('click', function () { UI.setTab = t[0]; UI.buildSettings(); });
        tabs.appendChild(b);
      })(TABS[i]);
    }
    var box = $('set-opts'), S = BBA.Settings.data, G = UI.G;
    box.innerHTML = '';
    function save() { BBA.Settings.save(); }
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var tab = UI.setTab;
    if (tab === 'graphics') {
      box.appendChild(UI.slider('RENDER SCALE', 0.5, 1, 0.05, function () { return S.renderScale; }, function (v) { S.renderScale = v; save(); G.applyGraphics(); }, pct, 'Lower = faster on phones'));
      box.appendChild(UI.toggle('AUTO RESOLUTION', function () { return S.autoRes; }, function (v) { S.autoRes = v; save(); G.dynScale = 1; G.applyGraphics(); }, 'Drops resolution a little when the game slows down, keeps it smooth'));
      box.appendChild(UI.toggle('SHADOWS', function () { return S.shadows; }, function (v) { S.shadows = v; save(); G.applyGraphics(); }));
      box.appendChild(UI.toggle('EFFECTS / PARTICLES', function () { return S.effects; }, function (v) { S.effects = v; save(); }));
      box.appendChild(UI.toggle('ANTI-ALIASING', function () { return S.antialias; }, function (v) { S.antialias = v; save(); }, 'Applies after reloading the page'));
      box.appendChild(UI.choice('FPS LIMIT', [[0, 'Display rate'], [60, '60 FPS'], [30, '30 FPS']], function () { return S.fpsLimit; }, function (v) { S.fpsLimit = v; save(); }));
      box.appendChild(UI.button('FULLSCREEN', 'TOGGLE', function () {
        var d = doc.documentElement;
        try {
          if (doc.fullscreenElement || doc.webkitFullscreenElement) { (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc); }
          else if (d.requestFullscreen) d.requestFullscreen(); else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
        } catch (e) {}
      }, 'Not available on iPhone Safari'));
    } else if (tab === 'audio') {
      var av = function () { BBA.Audio.applyVolumes(); save(); };
      box.appendChild(UI.slider('MASTER', 0, 1, 0.05, function () { return S.master; }, function (v) { S.master = v; av(); }, pct));
      box.appendChild(UI.slider('MUSIC', 0, 1, 0.05, function () { return S.music; }, function (v) { S.music = v; av(); }, pct));
      box.appendChild(UI.slider('EFFECTS', 0, 1, 0.05, function () { return S.sfx; }, function (v) { S.sfx = v; av(); }, pct));
      box.appendChild(UI.slider('CROWD', 0, 1, 0.05, function () { return S.crowd; }, function (v) { S.crowd = v; av(); }, pct));
    } else if (tab === 'controls') {
      box.appendChild(UI.slider('MOUSE / TOUCH SENSITIVITY', 0.2, 3, 0.1, function () { return S.mouseSens; }, function (v) { S.mouseSens = v; save(); }, function (v) { return v.toFixed(1); }));
      box.appendChild(UI.slider('CONTROLLER CAMERA SENSITIVITY', 0.2, 3, 0.1, function () { return S.padSens; }, function (v) { S.padSens = v; save(); }, function (v) { return v.toFixed(1); }));
      box.appendChild(UI.slider('STICK DEADZONE', 0.05, 0.4, 0.01, function () { return S.deadzone; }, function (v) { S.deadzone = v; save(); }, function (v) { return v.toFixed(2); }));
      box.appendChild(UI.toggle('INVERT CAMERA Y', function () { return S.invertY; }, function (v) { S.invertY = v; save(); }));
      box.appendChild(UI.toggle('VIBRATION', function () { return S.vibration; }, function (v) { S.vibration = v; save(); }));
      box.appendChild(UI.toggle('AUTO CAMERA (pad/touch)', function () { return S.autoCam; }, function (v) { S.autoCam = v; save(); }, 'Camera gently swings behind you while running'));
      box.appendChild(UI.choice('SHOT ARC', [['full', 'Full path'], ['short', 'Short (harder)'], ['off', 'Off']], function () { return S.shotArc || 'full'; }, function (v) { S.shotArc = v; save(); }, 'Shows where your shot will go. Turns green when it is going in'));
      box.appendChild(UI.choice('AIM ASSIST (pad/touch)', [['strong', 'Strong'], ['normal', 'Normal'], ['off', 'Off']], function () { return S.aimAssist || 'normal'; }, function (v) { S.aimAssist = v; save(); }, 'While charging a shot, the camera turns toward the hoop'));
      box.appendChild(el('div', 'orow', '<div class="olab" style="color:#ffc93c">KEYBOARD + MOUSE</div>'));
      var acts = [['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Move left'], ['right', 'Move right'], ['jump', 'Jump'], ['sprint', 'Sprint'], ['dive', 'Dive / tackle'],
        ['grab', 'Grab / pick up'], ['shoot', 'Shoot (hold)'], ['pass', 'Pass / call for pass'], ['aim', 'Aim'], ['ballcam', 'Ball camera'], ['pause', 'Pause']];
      for (var a = 0; a < acts.length; a++) box.appendChild(UI.bindRow(acts[a][0], acts[a][1], 'key'));
      box.appendChild(el('div', 'orow', '<div class="olab" style="color:#ffc93c">CONTROLLER</div><div class="odesc">Xbox / PlayStation / Android handhelds</div>'));
      var pacts = [['jump', 'Jump'], ['sprint', 'Sprint'], ['dive', 'Dive / tackle'], ['grab', 'Grab / pick up'], ['shoot', 'Shoot (hold)'], ['pass', 'Pass / call'], ['aim', 'Aim (+Grab = shoot)'], ['ballcam', 'Ball camera'], ['pause', 'Pause']];
      for (a = 0; a < pacts.length; a++) box.appendChild(UI.bindRow(pacts[a][0], pacts[a][1], 'pad'));
    } else if (tab === 'mobile') {
      box.appendChild(UI.slider('BUTTON SIZE', 0.7, 1.5, 0.05, function () { return S.touchSize; }, function (v) { S.touchSize = v; save(); BBA.Controls.applyTouchLayout(); }, pct));
      box.appendChild(UI.slider('BUTTON OPACITY', 0.25, 1, 0.05, function () { return S.touchOpacity; }, function (v) { S.touchOpacity = v; save(); BBA.Controls.applyTouchLayout(); }, pct));
      box.appendChild(UI.slider('JOYSTICK SENSITIVITY', 0.5, 2, 0.1, function () { return S.joySens; }, function (v) { S.joySens = v; save(); }, function (v) { return v.toFixed(1); }, 'Higher = full speed with less thumb travel'));
      box.appendChild(UI.slider('LOOK SENSITIVITY', 0.3, 2, 0.05, function () { return S.touchLook || 0.8; }, function (v) { S.touchLook = v; save(); }, function (v) { return v.toFixed(2); }, 'How fast swiping turns the camera'));
      box.appendChild(UI.toggle('SPRINT AT FULL TILT', function () { return S.stickSprint; }, function (v) { S.stickSprint = v; save(); }, 'Push the stick all the way to sprint. Off = never sprint (easier turning)'));
      box.appendChild(UI.toggle('DRAG BUTTONS TO LOOK', function () { return S.dragButtonsLook; }, function (v) { S.dragButtonsLook = v; save(); }, 'Hold Shoot and slide your thumb to aim'));
      box.appendChild(UI.button('BUTTON LAYOUT', 'EDIT', function () { UI.editTouch(); }, 'Drag buttons where you want them'));
      box.appendChild(UI.button('RESET LAYOUT', 'RESET', function () { S.touchLayout = null; save(); BBA.Controls.applyTouchLayout(); }));
    } else if (tab === 'access') {
      box.appendChild(UI.toggle('COLORBLIND TEAM COLORS', function () { return S.colorblind; }, function (v) { S.colorblind = v; save(); UI.applyUIScale(); UI.G.rebuildTeamColors && UI.G.rebuildTeamColors(); }, 'Blue vs Orange instead of Blue vs Red'));
      box.appendChild(UI.toggle('SCREEN SHAKE', function () { return S.screenShake; }, function (v) { S.screenShake = v; save(); }));
      box.appendChild(UI.toggle('REDUCED MOTION', function () { return S.reducedMotion; }, function (v) { S.reducedMotion = v; save(); }));
      box.appendChild(UI.slider('UI SCALE', 0.75, 1.4, 0.05, function () { return S.uiScale; }, function (v) { S.uiScale = v; save(); UI.applyUIScale(); }, pct));
      box.appendChild(UI.toggle('SOUND CAPTIONS', function () { return S.captions; }, function (v) { S.captions = v; save(); }, 'Show text for important sounds'));
    }
    UI.focusIdx = 0; UI._focus(false);
  };

  UI.bindRow = function (action, label, kind) {
    var S = BBA.Settings.data, Ctl = BBA.Controls;
    var r = row(label);
    var b = el('button', 'bindbtn');
    function render() {
      if (kind === 'key') b.textContent = (S.keys[action] || []).map(Ctl.keyName).join(' / ') || '—';
      else b.textContent = Ctl.padButtonName(S.pad[action]);
    }
    function start() {
      b.classList.add('wait'); b.textContent = kind === 'key' ? 'Press a key…' : 'Press a button…';
      Ctl.capture = function (res) {
        b.classList.remove('wait');
        if (res && kind === 'key' && res.type === 'key') { S.keys[action] = [res.code]; }
        if (res && kind === 'pad' && res.type === 'pad') { S.pad[action] = res.index; }
        BBA.Settings.save(); render();
      };
    }
    b.addEventListener('click', function (e) { e.stopPropagation(); start(); });
    r._confirm = start;
    r.appendChild(b);
    render();
    return r;
  };

  UI.restoreDefaults = function () {
    var tab = UI.setTab, map = {
      graphics: ['renderScale', 'shadows', 'effects', 'antialias', 'fpsLimit', 'autoRes'],
      audio: ['master', 'music', 'sfx', 'crowd'],
      controls: ['mouseSens', 'padSens', 'invertY', 'deadzone', 'vibration', 'autoCam', 'keys', 'pad', 'shotArc', 'aimAssist'],
      mobile: ['touchSize', 'touchOpacity', 'joySens', 'touchLayout', 'touchLook', 'stickSprint', 'dragButtonsLook'],
      access: ['colorblind', 'screenShake', 'reducedMotion', 'uiScale', 'captions']
    };
    BBA.Settings.reset(map[tab]);
    BBA.Audio.applyVolumes(); UI.applyUIScale(); BBA.Controls.applyTouchLayout(); UI.G.applyGraphics();
    UI.buildSettings();
  };

  UI.editTouch = function () {
    var prev = UI.current;
    UI.hideMenus();
    $('edit-bar').classList.remove('hidden');
    BBA.Controls.startTouchEdit(function () {
      $('edit-bar').classList.add('hidden');
      UI.show(prev || 'settings', true);
    });
  };

  /* ---------------- help ---------------- */
  UI.buildHelp = function () {
    var g = BBA.Controls, S = BBA.Settings.data;
    function kn(a) { return (S.keys[a] || []).map(g.keyName).join(' / '); }
    function pn(a) { return g.padButtonName(S.pad[a]); }
    var acts = [['Move', 'WASD', 'Left stick', 'Left thumb'], ['Camera', 'Mouse', 'Right stick', 'Drag right side'], ['Jump', kn('jump'), pn('jump'), 'Jump'],
      ['Sprint', kn('sprint'), pn('sprint') + ' / L3', 'Push stick 80%+'], ['Dive / tackle', kn('dive'), pn('dive'), 'Dive'], ['Grab / pick up', kn('grab'), pn('grab'), 'Grab'],
      ['Shoot (hold)', kn('shoot'), pn('shoot') + ' or ' + pn('aim') + '+' + pn('grab'), 'Shoot'], ['Pass (tap) / aimed pass (hold)', kn('pass'), pn('pass'), 'Pass'],
      ['Call for pass', kn('pass') + ' (no ball)', pn('pass') + ' (no ball)', 'Pass (no ball)'], ['Ball camera', kn('ballcam'), pn('ballcam'), 'Ball'], ['Pause', kn('pause'), pn('pause'), 'II']];
    var cols = ['KEYBOARD + MOUSE', 'CONTROLLER', 'TOUCH'], html = '', c, i;
    for (c = 0; c < 3; c++) {
      html += '<div class="help-col"><h4>' + cols[c] + '</h4>';
      for (i = 0; i < acts.length; i++) html += '<div><span>' + acts[i][0] + '</span><b>' + UI.G.esc(acts[i][c + 1]) + '</b></div>';
      html += '</div>';
    }
    html += '<div class="help-tips"><b>Tips:</b> Dunk by jumping near the enemy hoop with the ball and pressing Shoot (or Jump again) in the air. Bounce pads and the launch pads on the side platforms make dunks easy. ' +
      'Shots from outside the painted arc are worth 3. Dive into a ball carrier to knock the ball loose. Grab and hold a carrier to steal it. Tap Pass without the ball to call for it.</div>';
    $('help-grid').innerHTML = html;
  };

  /* ---------------- HUD ---------------- */
  UI.showHUD = function (on) {
    $('hud').classList.toggle('hidden', !on);
    $('pause-btn').classList.toggle('hidden', !on || BBA.Controls.device !== 'touch');
    $('tutorial-box').classList.add('hidden');
    $('feed').innerHTML = '';
    UI.hintT = 0;
    UI.updateHints();
  };

  UI.updateHints = function () {
    var h = $('hints'); if (!h) return;
    var g = BBA.Controls.glyph, d = BBA.Controls.device;
    if (d === 'touch') { h.innerHTML = ''; return; }
    h.innerHTML = '<b>' + g('jump') + '</b> jump · <b>' + g('sprint') + '</b> sprint · <b>' + g('dive') + '</b> dive<br><b>' + g('grab') + '</b> grab · <b>' + g('shoot') +
      '</b> hold to shoot · <b>' + g('pass') + '</b> pass/call<br><b>' + g('ballcam') + '</b> ball cam · <b>' + g('pause') + '</b> pause';
  };

  UI.banner = function (title, sub, cls) {
    var b = $('banner');
    b.className = '';
    b.querySelector('.b-title').innerHTML = title;
    b.querySelector('.b-sub').innerHTML = sub || '';
    void b.offsetWidth;
    b.className = 'show ' + (cls || '');
  };
  UI.toast = function (txt) {
    var t = $('toast'); t.textContent = txt; t.className = ''; void t.offsetWidth; t.className = 'show';
  };
  UI.bigTick = function (n) {
    var t = $('bigtick'); t.textContent = n; t.className = ''; void t.offsetWidth; t.className = 'show';
  };
  UI.scoreFlash = function (team) {
    var s = $('sb-s' + team); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash');
  };
  UI.feed = function (html) {
    var f = $('feed');
    var it = el('div', 'fitem', html);
    f.insertBefore(it, f.firstChild);
    while (f.children.length > 4) f.removeChild(f.lastChild);
    setTimeout(function () { it.classList.add('out'); setTimeout(function () { if (it.parentNode) it.parentNode.removeChild(it); }, 600); }, 4200);
  };
  UI.caption = function (txt) {
    var c = $('captions');
    var it = el('div', 'cap'); it.textContent = txt;
    c.appendChild(it);
    while (c.children.length > 3) c.removeChild(c.firstChild);
    setTimeout(function () { if (it.parentNode) it.parentNode.removeChild(it); }, 1800);
  };

  UI.tutorial = function (idx, total, text, sub, flash) {
    var b = $('tutorial-box');
    b.classList.remove('hidden');
    $('tut-step').textContent = 'TUTORIAL ' + idx + ' / ' + total;
    $('tut-text').innerHTML = text;
    $('tut-sub').innerHTML = sub || '';
    if (flash) { b.classList.remove('done'); void b.offsetWidth; b.classList.add('done'); }
  };

  function fmtClock(t) {
    t = Math.max(0, t);
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    if (t < 10 && t > 0) return t.toFixed(1);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function key(a) { return '<span class="key">' + BBA.Controls.glyph(a) + '</span>'; }

  UI.updateHUD = function (G, sim, lp, ball, dt) {
    var m = sim.match, b = sim.ball;
    UI.hintT += dt;
    // scoreboard
    var s0 = $('sb-s0'), s1 = $('sb-s1');
    if (s0.textContent !== String(m.score[0])) s0.textContent = m.score[0];
    if (s1.textContent !== String(m.score[1])) s1.textContent = m.score[1];
    var clockEl = $('sb-clock');
    var ctext = sim.mode !== 'match' ? 'PRACTICE' : (m.phase === 'warmup' ? 'WARM-UP' : fmtClock(m.clock));
    if (m.overtime) ctext = 'OT';
    if (clockEl.textContent !== ctext) clockEl.textContent = ctext;
    var cbox = clockEl.parentNode;
    cbox.classList.toggle('low', sim.mode === 'match' && !m.overtime && m.clock <= 10 && m.phase !== 'ended');
    cbox.classList.toggle('ot', m.overtime);
    var holderTeam = b.holder >= 0 ? sim.players[b.holder].team : -1;
    $('sb-p0').classList.toggle('on', holderTeam === 0);
    $('sb-p1').classList.toggle('on', holderTeam === 1);

    // warm-up / practice panel
    var wb = $('warmup-box');
    if (m.phase === 'warmup') {
      wb.classList.remove('hidden');
      var free = G.freePractice || sim.mode === 'practice';
      $('wu-title').textContent = free ? 'PRACTICE' : 'WARM-UP';
      var sub = free ? 'Free play · scores don\'t count' : "Scores don't count";
      if (!free && isFinite(sim.warmup)) {
        var left = Math.max(0, sim.warmup - m.phaseT);
        sub = 'Match in ' + Math.floor(left / 60) + ':' + ('0' + Math.floor(left % 60)).slice(-2) + ' · ' + sub;
      }
      var mine, cnt;
      if (G.mode === 'online') { mine = G.net.myReady; cnt = G.net.wr; }
      else { mine = !!sim.warmupReady[G.localId]; cnt = null; }
      if (cnt && cnt[1] > 1) sub += ' · ready ' + cnt[0] + '/' + cnt[1];
      $('wu-sub').textContent = sub;
      var rb = $('wu-ready');
      rb.style.display = free ? 'none' : '';
      var lbl = mine ? 'READY ✓' : "I'M READY" + (BBA.Controls.device === 'touch' ? '' : ' (' + (BBA.Controls.device === 'pad' ? BBA.Controls.padButtonName(BBA.Settings.data.pad.ready) : 'Enter') + ')');
      if (rb.textContent !== lbl) rb.textContent = lbl;
      rb.classList.toggle('on', !!mine);
    } else wb.classList.add('hidden');

    // charge ring
    var ch = $('charge');
    if (lp.charging && b.holder === lp.id) {
      ch.style.display = 'block';
      $('charge-fg').style.strokeDashoffset = String(264 * (1 - lp.charge));
      var ah = sim.attackHoop(lp.team), dd = Math.sqrt((ah.x - lp.x) * (ah.x - lp.x) + (ah.z - lp.z) * (ah.z - lp.z));
      $('charge-txt').textContent = dd >= ah.threeDist ? '3 PT' : 'SHOOT';
      // sweet spot: the charge range where the shot is on target (release inside the green band)
      var si = G.shotInfo, zone = $('charge-zone');
      if (si && si.active && si.perfect >= 0) {
        var z0 = clamp(si.perfect - si.window * 0.6, 0, 1), z1 = clamp(si.perfect + si.window * 0.6, 0, 1);
        zone.style.strokeDasharray = ((z1 - z0) * 264).toFixed(1) + ' 264';
        zone.style.strokeDashoffset = String(-z0 * 264);
      } else zone.style.strokeDasharray = '0 264';
      ch.classList.toggle('good', !!(si && si.active && si.makes));
    } else ch.style.display = 'none';
    $('crosshair').style.display = (lp.charging || (lp.input && lp.input.aim)) ? 'block' : 'none';

    // contextual prompt
    var pr = $('prompt'), txt = '', cls = '';
    var hasBall = b.holder === lp.id;
    if (m.phase === 'ended' || lp.hidden) txt = '';
    else if (hasBall && sim.dunkEligible(lp)) { txt = 'DUNK! ' + key('shoot'); cls = 'dunk'; }
    else if (hasBall) {
      var h = sim.attackHoop(lp.team), hd = Math.sqrt((h.x - lp.x) * (h.x - lp.x) + (h.z - lp.z) * (h.z - lp.z));
      if (lp.charging) txt = (G.shotInfo && G.shotInfo.makes) ? 'Release now! ' + key('shoot') : 'Release ' + key('shoot') + ' when the arc turns green';
      else if (lp.passHeld && lp.passT > 0.2) txt = lp.passAim >= 0 ? 'Release to pass' : 'Release to throw';
      else if (hd < 7) txt = key('jump') + ' then ' + key('shoot') + ' in the air to DUNK';
      else if (UI.hintT < 40 || hd < 18) txt = 'Hold ' + key('shoot') + ' shoot · ' + key('pass') + ' pass';
    } else if (b.state === 'free' && m.phase === 'play') {
      var dx = b.x - lp.x, dy = b.y - (lp.y + 0.95), dz = b.z - lp.z;
      if (dx * dx + dy * dy + dz * dz < 2.3 * 2.3) txt = key('grab') + ' grab the ball';
    } else if (BBA.Arena.onDeck(lp.x, lp.z) && m.phase === 'play') {
      txt = 'Jump down onto the court!';
    } else if (holderTeam === lp.team && b.holder !== lp.id && UI.hintT < 60 && lp.callT <= 0) {
      txt = key('pass') + ' call for the ball';
    } else if (holderTeam >= 0 && holderTeam !== lp.team && UI.hintT < 60) {
      txt = key('dive') + ' dive to tackle · ' + key('grab') + ' hold to steal';
    }
    if (m.phase === 'countdown') txt = 'Get ready to jump down!';
    if (m.phase === 'warmup' && !txt) txt = UI.hintT < 12 ? 'Grab the ball and practice shots and dunks' : '';
    if (pr._t !== txt) { pr.innerHTML = txt; pr._t = txt; }
    pr.className = cls;
    // touch button highlights
    if (BBA.Controls.touchBtnEls) {
      BBA.Controls.touchBtnEls.shoot.classList.toggle('hot', hasBall);
      BBA.Controls.touchBtnEls.pass.classList.toggle('hot', hasBall);
    }
    // hints fade
    $('hints').style.opacity = UI.hintT < 25 ? 0.85 : 0;

    // offscreen ball arrow
    var arrow = $('ballarrow');
    if (ball.visible && b.holder !== lp.id) {
      var v = UI._tmp || (UI._tmp = new root.THREE.Vector3());
      v.set(ball.x, ball.y, ball.z); v.project(G.camera);
      var W = root.innerWidth, H = root.innerHeight;
      var behind = v.z > 1;
      var sx = v.x, sy = v.y;
      if (behind) { sx = -sx; sy = -sy; }
      var off = behind || sx < -0.95 || sx > 0.95 || sy < -0.95 || sy > 0.9;
      if (off) {
        var ang = Math.atan2(sy, sx);
        if (behind && Math.abs(sx) < 0.05 && Math.abs(sy) < 0.05) ang = -Math.PI / 2;
        var rx = W / 2 - 50, ry = H / 2 - 60;
        var ex = Math.cos(ang), ey = Math.sin(ang);
        var k = Math.min(rx / Math.abs(ex || 1e-6), ry / Math.abs(ey || 1e-6));
        var px = W / 2 + ex * k - 28, py = H / 2 - ey * k - 28;
        arrow.style.display = 'block';
        arrow.style.transform = 'translate(' + px + 'px,' + py + 'px)';
        arrow.firstChild.style.transform = 'rotate(' + (-ang + Math.PI / 2) + 'rad)';
      } else arrow.style.display = 'none';
    } else arrow.style.display = 'none';

    UI.drawRadar(sim, lp, G.teamCss, G.rig.yaw);
  };

  UI.drawRadar = function (sim, lp, teamCss, yaw) {
    var cv = $('radar'), c = cv.getContext('2d'), W = cv.width, H = cv.height, A = BBA.Arena;
    var sx = W / (A.halfW * 2 + 4), sz = H / (A.halfL * 2 + 4);
    // rotate so that "your attack direction" is up
    var flip = lp.team === 0 ? -1 : 1;
    function X(x) { return W / 2 + x * sx * flip; }
    function Z(z) { return H / 2 + z * sz * flip; }
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,170,90,0.25)'; c.fillRect(X(A.halfW), Z(-A.halfL) < Z(A.halfL) ? Z(-A.halfL) : Z(A.halfL), A.halfW * 2 * sx, A.halfL * 2 * sz);
    var i;
    function rect(b) { var x0 = X(b.x0), x1 = X(b.x1), z0 = Z(b.z0), z1 = Z(b.z1); c.fillRect(Math.min(x0, x1), Math.min(z0, z1), Math.abs(x1 - x0), Math.abs(z1 - z0)); }
    c.fillStyle = 'rgba(20,20,40,0.85)'; A.pits.forEach(rect);
    c.fillStyle = 'rgba(160,220,255,0.35)'; A.ice.forEach(rect);
    c.fillStyle = 'rgba(140,108,255,0.55)';
    A.blocks.forEach(function (b) { if (b.tag !== 'tower' && b.tag !== 'rail') rect(b); });
    c.fillStyle = 'rgba(140,108,255,0.35)'; A.ramps.forEach(rect);
    for (i = 0; i < 2; i++) {
      var h = sim.hoops[i];
      c.strokeStyle = teamCss[i]; c.lineWidth = 3;
      c.beginPath(); c.arc(X(h.x), Z(h.z), 5, 0, 7); c.stroke();
    }
    for (i = 0; i < sim.players.length; i++) {
      var p = sim.players[i];
      if (p.hidden) continue;
      c.fillStyle = teamCss[p.team];
      var r = p.id === lp.id ? 5 : 3.6;
      c.beginPath(); c.arc(X(p.x), Z(p.z), r, 0, 7); c.fill();
      if (p.id === lp.id) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    }
    var b = sim.ball;
    if (b.state !== 'gone') {
      c.fillStyle = '#ffd23f'; c.strokeStyle = '#000'; c.lineWidth = 1;
      c.beginPath(); c.arc(X(b.x), Z(b.z), 3.4, 0, 7); c.fill(); c.stroke();
    }
    // camera view cone
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    var fx = Math.sin(yaw), fz = Math.cos(yaw);
    c.beginPath(); c.moveTo(X(lp.x), Z(lp.z)); c.lineTo(X(lp.x + fx * 8), Z(lp.z + fz * 8)); c.stroke();
  };

  /* ---------------- results ---------------- */
  UI.showResults = function (sim, localId, teamCss, podium) {
    $('scr-results').classList.toggle('podium', !!podium);
    var m = sim.match, lp = sim.players[localId];
    var title = m.winner < 0 ? 'DRAW!' : (C.TEAM_NAMES[m.winner] + ' WINS!');
    var won = m.winner === lp.team;
    $('res-title').textContent = won ? 'VICTORY! ' + title : title;
    $('res-title').style.color = m.winner < 0 ? '#fff' : teamCss[m.winner];
    $('res-score').innerHTML = '<span class="rb" style="color:' + teamCss[0] + '">' + m.score[0] + '</span> - <span class="rr" style="color:' + teamCss[1] + '">' + m.score[1] + '</span>' + (m.overtime ? ' <span style="font-size:18px">(OT)</span>' : '');
    var best = null, bestV = -1, i;
    for (i = 0; i < sim.players.length; i++) {
      var s = sim.players[i].stats;
      var v = s.pts * 1 + s.assists * 1.5 + s.steals + s.tackles * 0.6 + s.intercepts;
      if (v > bestV) { bestV = v; best = sim.players[i]; }
    }
    $('res-mvp').textContent = best ? '★ MVP: ' + best.name + ' ★' : '';
    var html = '<table><tr><th></th><th>PTS</th><th>DUNKS</th><th>AST</th><th>STL</th><th>TKL</th><th>INT</th></tr>';
    var order = sim.players.slice().sort(function (a, b) { return a.team - b.team || b.stats.pts - a.stats.pts; });
    for (i = 0; i < order.length; i++) {
      var p = order[i], st = p.stats;
      html += '<tr class="t' + p.team + (p.id === localId ? ' me' : '') + '"><td class="n">' + UI.G.esc(p.name) + '</td><td>' + st.pts + '</td><td>' + st.dunks + '</td><td>' + st.assists + '</td><td>' + st.steals + '</td><td>' + st.tackles + '</td><td>' + st.intercepts + '</td></tr>';
    }
    html += '</table>';
    $('res-table').innerHTML = html;
    UI.show('results');
  };

  BBA.UI = UI;
})(this);
