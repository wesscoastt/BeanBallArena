/* BEAN BALL ARENA - client/js/game.js
 * Main loop + match orchestration for offline play (1 human + bots),
 * the menu attract mode and the tutorial. Runs the shared authoritative sim
 * at a fixed 60 Hz and renders with interpolation at display rate.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;
  var C = BBA.C, Rules = BBA.Rules, Arena = BBA.Arena;
  var TICK = C.TICK;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hyp(x, z) { return Math.sqrt(x * x + z * z); }

  var G = {
    mode: 'boot',            // 'attract' | 'match' | 'tutorial'
    paused: false,
    sim: null, ai: null, views: [], localId: -1,
    acc: 0, last: 0, fpsAcc: 0,
    endT: -1, resultsShown: false,
    setup: null
  };

  G.init = function () {
    var S = BBA.Settings.data;
    var canvas = root.document.getElementById('game');
    G.canvas = canvas;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !!S.antialias, powerPreference: 'high-performance' });
    } catch (e) {
      BBA.UI.fatal('WebGL is not available on this device/browser.');
      return;
    }
    G.renderer = renderer;
    // Phones can drop the WebGL context under memory pressure (shows as a black screen
    // with the HUD still on top). Let three.js restore it instead of staying black.
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      G.contextLost = true;
      BBA.UI.gfxNotice(true);
    }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      G.contextLost = false;
      BBA.UI.gfxNotice(false);
      G.applyGraphics();
    }, false);
    renderer.shadowMap.enabled = !!S.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 900);
    G.rig = new BBA.CameraRig(G.camera);
    G.teamCss = BBA.Settings.teamColors();
    G.arena = new BBA.ArenaView(G.scene, { arena: BBA.Arenas.get('bean_bowl'), teamCss: G.teamCss, mobile: BBA.Settings.isMobile });
    G.ballView = new BBA.BallView(G.scene, C.BALL.radius);
    G.fx = new BBA.Effects(G.scene, BBA.Settings.isMobile);
    G._buildArc();
    G._buildPreviewScene();
    G.applyGraphics();
    root.addEventListener('resize', G.resize);
    root.addEventListener('orientationchange', function () { setTimeout(G.resize, 200); });
    G.resize();

    BBA.Controls.init(canvas);
    BBA.Controls.onPause = function () { G.togglePause(); };
    BBA.Controls.onLockLost = function () { if ((G.mode === 'match' || G.mode === 'tutorial' || G.mode === 'online') && !G.paused && !G.resultsShown && !(G.sim && G.sim.match.phase === 'ended')) { G.lockLostT = performance.now(); G.pause(true); } };
    BBA.Controls.onDeviceChange = function (d) { BBA.UI.onDevice(d); };
    function unlock() { BBA.Audio.unlock(); }
    root.document.addEventListener('pointerdown', unlock);
    root.document.addEventListener('keydown', unlock);
    root.document.addEventListener('touchend', unlock);
    BBA.Audio.onCaption = function (t) { BBA.UI.caption(t); };

    BBA.UI.init(G);
    if (BBA.Net) { BBA.Net.onStart = G.startOnline; BBA.Net.onSnapshot = G.onSnapshot; BBA.Net.onEnded = G.onEnded; }
    G.startAttract();
    G.last = performance.now();
    root.requestAnimationFrame(G.frame);
  };

  G.applyGraphics = function () {
    var S = BBA.Settings.data;
    var dpr = Math.min(root.devicePixelRatio || 1, BBA.Settings.isMobile ? 2 : 2);
    G.renderer.setPixelRatio(dpr * S.renderScale);
    if (G.renderer.shadowMap.enabled !== !!S.shadows) {
      G.renderer.shadowMap.enabled = !!S.shadows;
      G.scene.traverse(function (o) { if (o.material) { var m = Array.isArray(o.material) ? o.material : [o.material]; for (var i = 0; i < m.length; i++) m[i].needsUpdate = true; } });
    }
    G.resize();
  };

  G.resize = function () {
    var w = root.innerWidth, h = root.innerHeight;
    G.renderer.setSize(w, h, false);
    G.camera.aspect = w / h;
    G.camera.updateProjectionMatrix();
    if (G.pCam) { G.pCam.aspect = w / h; G.pCam.updateProjectionMatrix(); }
  };

  /* ---------------- roster helpers ---------------- */
  function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }
  function randomCosmetics(r) {
    var COS = BBA.Character.COS;
    return {
      color: pick(COS.colors, r), color2: pick(COS.colors, r), pattern: r() < 0.5 ? 'solid' : pick(COS.patterns, r)[0],
      face: pick(COS.faces, r)[0], hat: r() < 0.35 ? 'none' : pick(COS.hats, r)[0], upper: r() < 0.8 ? 'jersey' : pick(COS.uppers, r)[0],
      lower: pick(COS.lowers, r)[0], celebration: pick(COS.celebrations, r)[0], victory: pick(COS.victories, r)[0],
      number: 1 + Math.floor(r() * 98),
      jerseyColor2: r() < 0.5 ? '#ffffff' : pick(COS.colors, r), jerseyStyle: r() < 0.4 ? 'classic' : pick(COS.jerseyStyles, r)[0]
    };
  }
  function rng32(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function botNames(n, r) {
    var pool = Rules.BOT_NAMES.slice(), out = [];
    for (var i = 0; i < n; i++) { var k = Math.floor(r() * pool.length); out.push(pool.splice(k, 1)[0]); }
    return out;
  }

  /* ---------------- match lifecycle ---------------- */
  G._clear = function () {
    for (var i = 0; i < G.views.length; i++) G.views[i].dispose();
    G.views = [];
    G.sim = null; G.ai = null; G.localId = -1;
    G.tutorial = null;
    G.endT = -1; G.resultsShown = false;
    G.arc.visible = false; G.passRing.visible = false;
    G.arena.setOvertime(false);
    G._endPodium();
  };

  /* ---------------- post-game podium ---------------- */
  G._buildPodium = function () {
    var grp = new THREE.Group(), i;
    function numTex(n, col) {
      var cv = root.document.createElement('canvas'); cv.width = 128; cv.height = 128;
      var c = cv.getContext('2d'); c.fillStyle = col; c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#ffffff'; c.font = 'bold 92px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(n), 64, 70);
      return new THREE.CanvasTexture(cv);
    }
    var spec = [[0, 1.7, '#ffc93c', 1], [-2.25, 1.15, '#c9d3e0', 2], [2.25, 0.7, '#e09a5a', 3]];
    G.podiumSpots = [];
    for (i = 0; i < 3; i++) {
      var s = spec[i];
      var side = new THREE.MeshLambertMaterial({ color: '#2a2f6a' });
      var front = new THREE.MeshLambertMaterial({ map: numTex(s[3], '#2a2f6a') });
      var top = new THREE.MeshLambertMaterial({ color: s[2], emissive: s[2], emissiveIntensity: 0.25 });
      var bl = new THREE.Mesh(new THREE.BoxGeometry(2.1, s[1], 2.1), [side, side, top, side, front, side]);
      bl.position.set(s[0], s[1] / 2, 0); bl.castShadow = true; bl.receiveShadow = true;
      grp.add(bl);
      var rim = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 2.2), new THREE.MeshBasicMaterial({ color: s[2] }));
      rim.position.set(s[0], s[1], 0); grp.add(rim);
      G.podiumSpots.push({ x: s[0], y: s[1] + 0.06, z: 0 });
    }
    // backdrop
    var cv2 = root.document.createElement('canvas'); cv2.width = 1024; cv2.height = 320;
    G.podiumBannerCv = cv2;
    G.podiumBannerTex = new THREE.CanvasTexture(cv2);
    var banner = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.75), new THREE.MeshBasicMaterial({ map: G.podiumBannerTex }));
    banner.position.set(0, 5.2, -2.6); grp.add(banner);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(12.6, 4.3, 0.3), new THREE.MeshLambertMaterial({ color: '#1b1f5a' }));
    frame.position.set(0, 5.2, -2.8); grp.add(frame);
    for (i = -1; i <= 1; i += 2) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.4, 0.4), new THREE.MeshLambertMaterial({ color: '#ffc93c' }));
      post.position.set(i * 6.4, 3.7, -2.8); grp.add(post);
    }
    // floating crown for the MVP
    var gold = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
    var crown = new THREE.Group();
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.2, 16, 1, true), gold); crown.add(band);
    for (i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), gold);
      sp.position.set(Math.sin(a) * 0.34, 0.2, Math.cos(a) * 0.34); crown.add(sp);
    }
    grp.add(crown); G.podiumCrown = crown;
    grp.visible = false;
    G.scene.add(grp);
    G.podiumGroup = grp;
  };

  G._startPodium = function () {
    var sim = G.sim, m = sim.match;
    if (!G.podiumGroup) G._buildPodium();
    var wt = m.winner, list = [], i;
    for (i = 0; i < sim.players.length; i++) if (sim.players[i].team === wt) list.push(sim.players[i]);
    list.sort(function (a, b) { return (b.stats.pts - a.stats.pts) || (b.stats.assists - a.stats.assists) || (b.stats.steals - a.stats.steals); });
    G.podium = { t: 0, winners: list.map(function (p) { return p.id; }), team: wt, fx: 0 };
    // banner
    var c = G.podiumBannerCv.getContext('2d'), col = G.teamCss[wt];
    c.fillStyle = '#141a4d'; c.fillRect(0, 0, 1024, 320);
    c.fillStyle = col; c.fillRect(0, 0, 1024, 26); c.fillRect(0, 294, 1024, 26);
    c.fillStyle = '#ffd23f'; BBA.Character.drawCrown(c, 512, 92, 46);
    c.fillStyle = '#ffffff'; c.font = 'bold 110px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(BBA.C.TEAM_NAMES[wt] + ' WINS!', 512, 200);
    G.podiumBannerTex.needsUpdate = true;
    G.podiumGroup.visible = true;
    G.rig.mode = 'podium';
    root.document.body.classList.add('podium');
    BBA.Audio.setCrowd(1);
    G.arena.hype(1.5);
    // quick flash to hide the cut
    var fl = root.document.getElementById('flash');
    if (fl) { fl.className = ''; void fl.offsetWidth; fl.className = 'go'; }
  };

  G._endPodium = function () {
    G.podium = null;
    if (G.podiumGroup) G.podiumGroup.visible = false;
    root.document.body.classList.remove('podium');
  };

  G._updatePodium = function (dt) {
    var P = G.podium, sim = G.sim, i;
    P.t += dt;
    for (i = 0; i < G.views.length; i++) {
      var place = P.winners.indexOf(i);
      if (place < 0 || place > 2) G.views[i].hideForPodium();
      else {
        var s = G.podiumSpots[place], cos = G.cosmetics[i] || {};
        G.views[i].podiumUpdate(dt, s.x, s.y, s.z, 0, G.camera, cos.celebration || 'hop', P.t + place * 0.35, place === 0);
      }
    }
    if (G.podiumCrown) {
      var first = G.podiumSpots[0];
      G.podiumCrown.position.set(first.x, first.y + 2.35 + Math.sin(P.t * 3) * 0.08, first.z);
      G.podiumCrown.rotation.y += dt * 1.5;
    }
    // confetti + fireworks
    P.fx -= dt;
    if (P.fx <= 0) {
      P.fx = 0.45;
      var x = (Math.random() - 0.5) * 9;
      G.fx.burst('confetti', x, 7 + Math.random() * 2, -1 + Math.random() * 2, { n: 26, colors: [G.teamCss[P.team], '#ffffff', '#ffd23f'] });
      if (Math.random() < 0.4) G.fx.ring((Math.random() - 0.5) * 10, 9 + Math.random() * 3, -2, G.teamCss[P.team], 3, 0.6);
    }
    // camera: slow push-in on the podium
    var k = Math.min(1, P.t / 5), ease = 1 - Math.pow(1 - k, 3);
    // frame the winners in the upper half so the results sheet never covers them
    G.camera.position.set(Math.sin(P.t * 0.25) * 0.8, 2.2 + ease * 0.2, 13 - ease * 3);
    G.camera.fov = 52; G.camera.updateProjectionMatrix();
    G.camera.lookAt(0, 1.0, 0);
  };

  /* switch the 3D arena to match the sim (rebuilds only when it changes) */
  G._useArena = function (id) {
    var def = BBA.Arenas.get(id);
    BBA.Arena = def;
    if (G.arena && G.arena.id === def.id) return;
    if (G.arena) G.arena.dispose();
    G.arena = new BBA.ArenaView(G.scene, { arena: def, teamCss: G.teamCss, mobile: BBA.Settings.isMobile });
    G.renderer.setClearColor(def.theme && def.theme.dark ? '#05050f' : '#000000');
  };

  G._createViews = function () {
    G._useArena(G.sim.arena.id);
    var sim = G.sim, i;
    var localTeam = G.localId >= 0 ? sim.players[G.localId].team : 0;
    var tagLayer = root.document.getElementById('tags');
    tagLayer.innerHTML = '';
    for (i = 0; i < sim.players.length; i++) {
      var p = sim.players[i];
      var v = new BBA.PlayerView(G.scene, p, {
        local: p.id === G.localId, teamCss: G.teamCss, cosmetics: G.cosmetics[i], number: G.cosmetics[i].number,
        ally: p.team === localTeam, tagLayer: tagLayer
      });
      (function (view, pl) {
        view.stepCb = function () {
          if (G.mode === 'attract') return;
          var near = pl.id === G.localId;
          G.snd('step', view.pos.x, view.pos.y, view.pos.z, { vol: near ? 1 : 0.5, minGap: 0.02 });
          if (pl.sprinting && BBA.Settings.data.effects && Math.random() < 0.35) G.fx.burst('dust', view.pos.x, view.pos.y, view.pos.z, { n: 2 });
        };
      })(v, p);
      G.views.push(v);
    }
    G.ballView.setRadius(sim.ballRadius);
    G._warmShaders();
  };

  G.startAttract = function () {
    G._clear();
    G.mode = 'attract';
    var r = rng32(Date.now() & 0xffffff);
    var names = botNames(6, r), roster = [], i;
    G.cosmetics = [];
    for (i = 0; i < 6; i++) { roster.push({ team: i < 3 ? 0 : 1, name: names[i], isBot: true }); G.cosmetics.push(randomCosmetics(r)); }
    var ids = BBA.Arenas.ids, aId = G.menuArena || ids[Math.floor(r() * ids.length)];
    G.sim = new BBA.Sim({ roster: roster, mode: 'attract', seed: (r() * 1e9) | 0, countdown: 0.5, settings: { arena: aId } });
    G.ai = new BBA.AI(G.sim);
    for (i = 0; i < 6; i++) G.ai.addBot(i, 'normal');
    G._createViews();
    G.rig.mode = 'orbit';
    root.document.body.classList.add('in-menu');
    BBA.Controls.gameActive = false;
    BBA.Audio.setMusic('menu');
    BBA.Audio.setCrowd(0.25);
  };

  /* setup: {teamSize, duration, difficulty, modifier} */
  G.startMatch = function (setup) {
    G._clear();
    setup = setup || BBA.Settings.data.lastSetup;
    G.setup = setup;
    G.mode = 'match';
    G.freePractice = false;
    var wu = setup.warmup === undefined ? 45 : setup.warmup;
    if (wu < 0 || wu === null) wu = Infinity;
    var S = BBA.Settings.data;
    var r = rng32((Date.now() * 7) & 0xffffff);
    var size = clamp(setup.teamSize || 3, 1, 3);
    var names = botNames(size * 2, r), roster = [], i, ni = 0;
    G.cosmetics = [];
    roster.push({ team: 0, name: S.name || 'You', isBot: false });
    G.cosmetics.push(S.cosmetics);
    for (i = 1; i < size; i++) { roster.push({ team: 0, name: names[ni++], isBot: true }); G.cosmetics.push(randomCosmetics(r)); }
    for (i = 0; i < size; i++) { roster.push({ team: 1, name: names[ni++], isBot: true }); G.cosmetics.push(randomCosmetics(r)); }
    G.sim = new BBA.Sim({
      roster: roster, mode: 'match', seed: (r() * 1e9) | 0, countdown: 3.5, warmup: wu,
      settings: { duration: setup.duration || 240, difficulty: setup.difficulty || 'normal', modifier: setup.modifier || 'none', teamSize: size, arena: setup.arena || 'bean_bowl',
        mercyLead: setup.mercyLead === undefined ? 12 : setup.mercyLead, kickoffReset: setup.kickoffReset !== false }
    });
    G.ai = new BBA.AI(G.sim);
    for (i = 1; i < roster.length; i++) G.ai.addBot(i, setup.difficulty || 'normal');
    G.localId = 0;
    G._createViews();
    var lp = G.sim.players[0];
    G.rig.mode = 'follow';
    G.rig.snapBehind(lp.team === 0 ? 0 : Math.PI, lp);
    G.rig.pitch = 0.42;
    G.paused = false;
    root.document.body.classList.remove('in-menu');
    BBA.UI.showHUD(true);
    BBA.Controls.gameActive = true;
    BBA.Controls.wantPointerLock = true;
    BBA.Controls.requestLock();
    BBA.Audio.setMusic(wu > 0 ? 'menu' : 'match');
    BBA.Audio.setCrowd(0.5);
    G.acc = 0;
    if (wu > 0) BBA.UI.banner('WARM-UP', 'Practice with the ball. Scores don\'t count.', 'go');
  };

  /* Free practice: just you and the ball, no clock, no score. */
  G.startPractice = function () {
    G._clear();
    G.mode = 'match';
    G.freePractice = true;
    G.setup = null;
    var S = BBA.Settings.data;
    G.cosmetics = [S.cosmetics];
    G.sim = new BBA.Sim({ roster: [{ team: 0, name: S.name || 'You', isBot: false }], mode: 'practice', seed: 7, warmup: Infinity, settings: { arena: (S.lastSetup && S.lastSetup.arena) || 'bean_bowl' } });
    G.ai = new BBA.AI(G.sim);
    G.localId = 0;
    G._createViews();
    G.rig.mode = 'follow';
    G.rig.snapBehind(0, G.sim.players[0]);
    G.rig.pitch = 0.42;
    G.paused = false;
    root.document.body.classList.remove('in-menu');
    BBA.UI.showHUD(true);
    BBA.Controls.gameActive = true;
    BBA.Controls.wantPointerLock = true;
    BBA.Controls.requestLock();
    BBA.Audio.setMusic('menu');
    BBA.Audio.setCrowd(0.3);
    G.acc = 0;
    BBA.UI.banner('PRACTICE', 'Free play. Leave from the pause menu.', 'go');
  };

  G.warmupReady = function () {
    var sim = G.sim;
    if (!sim || sim.match.phase !== 'warmup' || G.freePractice) return;
    if (G.mode === 'online') {
      G.net.myReady = !G.net.myReady;
      BBA.Net.emit('warmupReady', { ready: G.net.myReady });
    } else {
      sim.setWarmupReady(G.localId, !sim.warmupReady[G.localId]);
    }
    BBA.Audio.play('ui');
  };

  G.startTutorial = function () {
    G._clear();
    G.mode = 'tutorial';
    var S = BBA.Settings.data;
    G.cosmetics = [S.cosmetics, randomCosmetics(rng32(5)), randomCosmetics(rng32(9))];
    var roster = [{ team: 0, name: S.name || 'You', isBot: false }, { team: 0, name: 'Coach Tofu', isBot: true }, { team: 1, name: 'Dummy', isBot: true }];
    G.sim = new BBA.Sim({ roster: roster, mode: 'practice', seed: 99, countdown: 0.3 });
    G.ai = new BBA.AI(G.sim);
    var coach = G.ai.addBot(1, 'normal'); coach.passive = true;
    var dummy = G.ai.addBot(2, 'easy'); dummy.passive = true;
    G.localId = 0;
    G._createViews();
    G.rig.mode = 'follow';
    G.rig.snapBehind(0, G.sim.players[0]);
    G.rig.pitch = 0.42;
    G.paused = false;
    root.document.body.classList.remove('in-menu');
    BBA.UI.showHUD(true);
    BBA.Controls.gameActive = true;
    BBA.Controls.wantPointerLock = true;
    BBA.Controls.requestLock();
    BBA.Audio.setMusic('menu');
    G.tutorial = new BBA.Tutorial(G);
  };

  G.quitToMenu = function () {
    G.paused = false;
    var ni = root.document.getElementById('netinfo'); if (ni) ni.textContent = '';
    BBA.Controls.releaseLock();
    BBA.Controls.wantPointerLock = false;
    BBA.UI.showHUD(false);
    G.startAttract();
    BBA.UI.show('main');
  };

  G.pause = function (on) {
    if (G.mode !== 'match' && G.mode !== 'tutorial' && G.mode !== 'online') return;
    if (G.resultsShown) return;
    G.paused = on;
    if (on) { BBA.Controls.releaseLock(); BBA.UI.show('pause'); }
    else { BBA.UI.hideMenus(); BBA.Controls.requestLock(); }
  };
  G.togglePause = function () {
    if (G.mode !== 'match' && G.mode !== 'tutorial' && G.mode !== 'online') { BBA.UI.back(); return; }
    if (G.resultsShown) return;
    // Esc that just released pointer lock already paused us
    if (G.lockLostT && performance.now() - G.lockLostT < 300) return;
    if (G.paused && BBA.UI.current !== 'pause') { BBA.UI.show('pause'); return; }
    G.pause(!G.paused);
  };

  /* ---------------- input ---------------- */
  G._localInput = function (ctl) {
    var inp = BBA.Sim.emptyInput();
    var yaw = G.rig.yaw;
    inp.look = yaw;
    if (!ctl || G.paused) return inp;
    var fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    inp.mx = fx * ctl.my + rx * ctl.mx;
    inp.mz = fz * ctl.my + rz * ctl.mx;
    var h = ctl.held;
    inp.jump = h.jump; inp.sprint = h.sprint; inp.dive = h.dive; inp.grab = h.grab;
    inp.pass = h.pass; inp.shoot = h.shoot; inp.aim = h.aim;
    return inp;
  };

  /* ---------------- frame ---------------- */
  G.frame = function (now) {
    root.requestAnimationFrame(G.frame);
    var dt = Math.min(0.1, Math.max(0, (now - G.last) / 1000));
    G.last = now;
    var lim = BBA.Settings.data.fpsLimit;
    if (lim > 0) {
      G.fpsAcc += dt;
      if (G.fpsAcc < 1 / lim - 0.004) return;
      dt = Math.min(0.1, G.fpsAcc); G.fpsAcc = 0;
    }
    var ctl = BBA.Controls.poll(dt);
    if (ctl.readyPress && G.sim && !G.paused) G.warmupReady();
    if (G.sim && (!G.paused || G.mode === 'online')) {
      G.acc += dt;
      var steps = 0;
      while (G.acc >= TICK && steps < 6) { G._step(ctl); G.acc -= TICK; steps++; }
      if (steps >= 6) G.acc = 0;
    }
    var alpha = clamp(G.acc / TICK, 0, 1);
    G._render(dt, alpha, ctl);
  };

  G._step = function (ctl) {
    if (G.mode === 'online') { G._stepOnline(ctl); return; }
    var sim = G.sim, i;
    for (i = 0; i < G.views.length; i++) G.views[i].capturePrev(sim.players[i]);
    G.prevBall = G.prevBall || {};
    var b = sim.ball;
    G.prevBall.x = b.x; G.prevBall.y = b.y; G.prevBall.z = b.z;
    var inputs = G.ai.update(TICK);
    if (G.localId >= 0) inputs[G.localId] = G._localInput(ctl);
    var ev = sim.step(inputs, TICK);
    G._events(ev);
    if (G.tutorial) G.tutorial.step(ev);
  };


  /* ================= ONLINE (server-authoritative) =================
   * The server runs the real match. Here we:
   *  - predict our own player immediately with the shared movement code,
   *  - reconcile to the server's state for our last acknowledged input,
   *  - draw everyone else (and the ball) ~100 ms in the past, interpolated.
   */
  var INTERP_DELAY = 0.1;
  var Protocol = BBA.Protocol;

  G.startOnline = function (info) {
    G._clear();
    G.mode = 'online';
    G.onlineEnded = false;
    var roster = info.roster, i;
    G.cosmetics = [];
    for (i = 0; i < roster.length; i++) {
      G.cosmetics.push(info.cosmetics[i] ? fillCos(info.cosmetics[i]) : randomCosmetics(rng32(info.seed + i * 7919)));
    }
    G.sim = new BBA.Sim({ roster: roster, mode: 'match', seed: info.seed, settings: info.settings, countdown: 4, warmup: info.warmup || 0 });
    G.sim.predictOnly = true;
    G.freePractice = false;
    G.ai = null;
    G.localId = info.you;
    G.net = { buf: [], pending: [], seq: 0, offset: null, corr: { x: 0, y: 0, z: 0 }, ackInput: null, lastSnapT: 0, myReady: false, wr: [0, 0] };
    G.onSnapshot(info.snapshot, true);
    G._createViews();
    var lp = G.localId >= 0 ? G.sim.players[G.localId] : G.sim.players[0];
    G.rig.mode = 'follow';
    G.rig.snapBehind(lp.team === 0 ? 0 : Math.PI, lp);
    G.rig.pitch = 0.42;
    G.paused = false;
    root.document.body.classList.remove('in-menu');
    BBA.UI.hideMenus();
    BBA.UI.showHUD(true);
    BBA.Controls.gameActive = true;
    BBA.Controls.wantPointerLock = true;
    BBA.Controls.requestLock();
    BBA.Audio.setMusic('match');
    BBA.Audio.setCrowd(0.5);
    G.acc = 0;
  };

  function fillCos(c) {
    var d = BBA.Settings.DEFAULTS.cosmetics, out = {}, k;
    for (k in d) out[k] = (c && c[k] !== undefined) ? c[k] : d[k];
    return out;
  }

  G._serverNow = function () {
    var n = G.net;
    return n && n.offset !== null ? performance.now() / 1000 + n.offset : 0;
  };

  G.onSnapshot = function (snap, initial) {
    if (!G.sim || (G.mode !== 'online' && !initial)) return;
    var n = G.net, sim = G.sim, now = performance.now() / 1000;
    // clock sync (smoothed, biased toward the freshest packets)
    var target = snap.t - now;
    if (n.offset === null) n.offset = target;
    else if (target > n.offset) n.offset += (target - n.offset) * 0.3;
    else n.offset += (target - n.offset) * 0.05;
    n.buf.push(snap);
    while (n.buf.length > 30) n.buf.shift();
    n.lastSnapT = now;
    // match state + events apply immediately
    Protocol.decodeMatch(snap.m, sim.match);
    sim.tick = snap.k;
    if (snap.wr) n.wr = snap.wr;
    if (snap.ev && snap.ev.length && !initial) {
      // decode the ball/players of this snapshot first so effects appear in the right place
      G._events(snap.ev);
    }
    // reconcile the local player
    if (G.localId >= 0 && snap.p[G.localId]) {
      var lp = sim.players[G.localId];
      var bx = lp.x, by = lp.y, bz = lp.z;
      Protocol.decodePlayer(snap.p[G.localId], lp);
      var ack = snap.acks ? snap.acks[G.localId] : 0;
      var keep = [], i, ackInp = null;
      for (i = 0; i < n.pending.length; i++) {
        if (n.pending[i].seq > ack) keep.push(n.pending[i]);
        else if (n.pending[i].seq === ack) ackInp = n.pending[i].inp;
      }
      n.pending = keep;
      if (ackInp) n.ackInput = ackInp;
      var pv = n.ackInput || BBA.Sim.emptyInput();
      for (i = 0; i < BBA.C.BUTTONS.length; i++) lp.prev[BBA.C.BUTTONS[i]] = !!pv[BBA.C.BUTTONS[i]];
      var t0 = sim.time;
      sim.time = snap.t;
      for (i = 0; i < keep.length; i++) { sim.predictPlayer(lp, keep[i].inp, TICK); sim.time += TICK; }
      sim.time = t0;
      if (!initial) {
        var ex = bx - lp.x, ey = by - lp.y, ez = bz - lp.z;
        if (ex * ex + ey * ey + ez * ez < 9) { n.corr.x += ex; n.corr.y += ey; n.corr.z += ez; }
        else { n.corr.x = 0; n.corr.y = 0; n.corr.z = 0; }
      }
    }
    if (initial) G._applyRemote(snap, snap, 1);
  };

  G._stepOnline = function (ctl) {
    var sim = G.sim, n = G.net;
    if (G.localId < 0) return;
    var lp = sim.players[G.localId];
    G.views[G.localId].capturePrev(lp);
    var inp = G._localInput(ctl);
    n.seq++;
    var copy = {}, k; for (k in inp) copy[k] = inp[k];
    n.pending.push({ seq: n.seq, inp: copy });
    if (n.pending.length > 120) n.pending.shift();
    BBA.Net.queueInput(n.seq, copy);
    sim.time = G._serverNow();
    sim.predictPlayer(lp, copy, TICK);
  };

  /* interpolate remote players + ball between snapshots a and b */
  var tmpP = {};
  G._applyRemote = function (a, b, alpha) {
    var sim = G.sim, i;
    for (i = 0; i < sim.players.length; i++) {
      if (i === G.localId) continue;
      var p = sim.players[i];
      Protocol.decodePlayer(a.p[i], tmpP);
      Protocol.decodePlayer(b.p[i], p);
      if (Math.abs(p.x - tmpP.x) + Math.abs(p.z - tmpP.z) < 6) {
        p.x = tmpP.x + (p.x - tmpP.x) * alpha;
        p.y = tmpP.y + (p.y - tmpP.y) * alpha;
        p.z = tmpP.z + (p.z - tmpP.z) * alpha;
        p.yaw = tmpP.yaw + BBA.Sim.wrapAngle(p.yaw - tmpP.yaw) * alpha;
      }
    }
    var ball = sim.ball, pa = {};
    Protocol.decodeBall(a.b, pa);
    Protocol.decodeBall(b.b, ball);
    if (pa.state === ball.state && Math.abs(ball.x - pa.x) + Math.abs(ball.y - pa.y) + Math.abs(ball.z - pa.z) < 8) {
      ball.x = pa.x + (ball.x - pa.x) * alpha; ball.y = pa.y + (ball.y - pa.y) * alpha; ball.z = pa.z + (ball.z - pa.z) * alpha;
    }
  };

  G._onlineRender = function (dt) {
    var n = G.net, sim = G.sim, i;
    if (!n.buf.length) return;
    var rt = G._serverNow() - INTERP_DELAY;
    var buf = n.buf, a = buf[0], b = buf[buf.length - 1], alpha = 1;
    for (i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= rt && buf[i + 1].t >= rt) { a = buf[i]; b = buf[i + 1]; alpha = (rt - a.t) / Math.max(0.001, b.t - a.t); break; }
    }
    if (rt < buf[0].t) { a = b = buf[0]; alpha = 1; }
    else if (rt > buf[buf.length - 1].t) { a = b = buf[buf.length - 1]; alpha = 1; }
    G._applyRemote(a, b, alpha);
    for (i = 0; i < G.views.length; i++) if (i !== G.localId) G.views[i].capturePrev(sim.players[i]);
    G.prevBall = G.prevBall || {};
    G.prevBall.x = sim.ball.x; G.prevBall.y = sim.ball.y; G.prevBall.z = sim.ball.z;
    // decay the local correction smoothly
    var k = Math.exp(-dt * 12);
    n.corr.x *= k; n.corr.y *= k; n.corr.z *= k;
    G.renderSimTime = rt;
    // network info
    var ni = root.document.getElementById('netinfo');
    if (ni) {
      var late = performance.now() / 1000 - n.lastSnapT;
      ni.textContent = 'ROOM ' + (BBA.Net.code || '') + ' · ' + Math.round(BBA.Net.rtt + BBA.Net.lag) + ' ms' + (late > 1.5 ? ' · CONNECTION LOST' : '');
    }
  };

  G.onEnded = function (res) {
    if (G.mode !== 'online' || !G.sim) return;
    var sim = G.sim, i;
    for (i = 0; i < sim.players.length && i < res.players.length; i++) sim.players[i].stats = res.players[i].stats;
    sim.match.score[0] = res.score[0]; sim.match.score[1] = res.score[1];
    sim.match.winner = res.winner; sim.match.phase = 'ended';
    G.onlineEnded = true;
    if (G.endT < 0) G.endT = 0;
  };

  G.backToLobby = function () {
    BBA.Controls.releaseLock();
    BBA.Controls.wantPointerLock = false;
    BBA.UI.showHUD(false);
    G.startAttract();
    BBA.UI.show('lobby');
  };

  /* ---------------- feedback for sim events ---------------- */
  G.snd = function (name, x, y, z, o) {
    o = o || {};
    if (x !== undefined && G.camera) {
      var cp = G.camera.position, dx = x - cp.x, dz = z - cp.z, dy = y - cp.y;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var yaw = G.rig.yaw, rx = -Math.cos(yaw), rz = Math.sin(yaw);
      o.pan = clamp((dx * rx + dz * rz) / d, -1, 1) * 0.75;
      o.vol = (o.vol === undefined ? 1 : o.vol) * Math.min(1, 14 / (d + 6));
    }
    BBA.Audio.play(name, o);
  };

  G._isLocal = function (id) { return id === G.localId && G.localId >= 0; };
  G._pname = function (id) { var p = G.sim.player(id); return p ? p.name : '?'; };

  G._events = function (ev) {
    var sim = G.sim, i, e, p, UI = BBA.UI, menu = G.mode === 'attract';
    var localTeam = G.localId >= 0 ? sim.players[G.localId].team : 0;
    for (i = 0; i < ev.length; i++) {
      e = ev[i];
      p = e.id !== undefined ? sim.player(e.id) : null;
      switch (e.t) {
        case 'countdown': if (!menu) { UI.banner(String(e.n), '', 'count'); BBA.Audio.play('countdown'); } break;
        case 'warmupEnd':
          if (!menu) {
            UI.banner('TO YOUR DECKS!', 'Match starting', 'warn');
            BBA.Audio.play('launch'); BBA.Audio.setMusic('match');
            if (G.localId >= 0) { var wl = sim.players[G.localId]; G.rig.snapBehind(wl.team === 0 ? 0 : Math.PI, wl); G.rig.pitch = 0.42; }
            if (G.net) G.net.myReady = false;
          }
          break;
        case 'kickoff':
          if (!menu) {
            UI.banner('BACK TO THE DECKS!', 'Next drop in 2…', 'warn');
            BBA.Audio.play('launch');
            if (G.localId >= 0) { var kl = sim.players[G.localId]; G.rig.snapBehind(kl.team === 0 ? 0 : Math.PI, kl); G.rig.pitch = 0.42; }
          }
          break;
        case 'practiceScore':
          if (!menu) {
            var hp = sim.hoops[1 - e.team];
            if (e.kind !== 'dunk') { G.fx.burst('confetti', hp.x, hp.y, hp.z, { n: 30 }); BBA.Audio.play('swish'); UI.toast(e.kind === 'long' ? 'NICE 3!' : 'NICE SHOT!'); }
            G.arena.flashHoop(1 - e.team);
          }
          break;
        case 'warmupReady':
          if (!menu && p && e.ready && !G._isLocal(p.id) && !p.isBot) UI.feed(esc(p.name) + ' is ready');
          break;
        case 'go': if (!menu) { UI.banner('GO!', 'Jump down and grab the ball!', 'go'); BBA.Audio.play('go'); BBA.Audio.setCrowd(0.6); } break;
        case 'jump': if (p && !menu) G.snd('jump', p.x, p.y, p.z, { vol: G._isLocal(p.id) ? 0.9 : 0.5 }); break;
        case 'land':
          if (p) {
            if (!menu) G.snd('land', p.x, p.y, p.z, { vol: Math.min(1, e.v / 14) });
            if (e.v > 7) G.fx.burst('dust', p.x, p.y, p.z, { n: e.v > 14 ? 14 : 7 });
            if (G._isLocal(p.id) && e.v > 16) { G.rig.addTrauma(0.25); BBA.Controls.rumble(0.3, 90); }
          }
          break;
        case 'dive': if (p && !menu) G.snd('dive', p.x, p.y, p.z); break;
        case 'tackle': {
          var tg = sim.player(e.target);
          if (tg) {
            G.fx.burst('stars', tg.x, tg.y + 1.2, tg.z);
            if (!menu) G.snd('tackle', tg.x, tg.y, tg.z, { vol: Math.min(1, 0.4 + e.strength / 15) });
            var involved = G._isLocal(e.id) || G._isLocal(e.target);
            G.rig.addTrauma(involved ? 0.45 : 0.12);
            if (involved) BBA.Controls.rumble(G._isLocal(e.target) ? 0.9 : 0.5, 200);
            if (e.fumble && !menu) UI.feed('<b style="color:' + G.teamCss[p.team] + '">' + esc(p.name) + '</b> knocked the ball loose!');
            G.arena.hype(0.3);
          }
          break;
        }
        case 'bump': { var ba = sim.player(e.a); if (ba && !menu) G.snd('bump', ba.x, ba.y, ba.z, { vol: 0.6 }); break; }
        case 'grab': if (p && !menu) G.snd('grab', p.x, p.y, p.z); if (G._isLocal(e.target)) BBA.Controls.rumble(0.3, 120); break;
        case 'whiff': if (p && !menu && G._isLocal(p.id)) G.snd('whiff', p.x, p.y, p.z); break;
        case 'steal':
          if (p && !menu) {
            G.snd('steal', p.x, p.y, p.z);
            UI.feed('<b style="color:' + G.teamCss[p.team] + '">' + esc(p.name) + '</b> stole it from ' + esc(G._pname(e.from)));
            if (G._isLocal(p.id)) UI.toast('STEAL!');
          }
          break;
        case 'catch':
          if (p && !menu) {
            G.snd(e.how === 'catch' ? 'catch' : 'pickup', p.x, p.y, p.z, { vol: G._isLocal(p.id) ? 1 : 0.6 });
            if (G._isLocal(p.id)) BBA.Controls.rumble(0.15, 50);
            if (e.intercept) {
              UI.feed('<b style="color:' + G.teamCss[p.team] + '">' + esc(p.name) + '</b> ' + (e.block ? 'blocked the shot!' : 'intercepted!'));
              if (p.team === localTeam) UI.toast(e.block ? 'BLOCKED!' : 'INTERCEPTED!');
              G.arena.hype(0.35);
            }
          }
          break;
        case 'pass': if (p && !menu) G.snd('pass', p.x, p.y, p.z); break;
        case 'shoot': if (p && !menu) { G.snd('throw', p.x, p.y, p.z); } break;
        case 'charge': if (p && G._isLocal(p.id)) BBA.Audio.play('charge'); break;
        case 'ballHit':
          if (menu) break;
          if (e.kind === 'floor') { G.snd('bounce', e.x, e.y, e.z, { speed: e.v, minGap: 0.05 }); if (e.v > 8) G.fx.burst('dust', e.x, e.y - 0.4, e.z, { n: 4, color: '#ffd2a0' }); }
          else if (e.kind === 'wall') G.snd('wall', e.x, e.y, e.z, { vol: Math.min(1, e.v / 12) });
          else if (e.kind === 'rim') { G.snd('rim', e.x, e.y, e.z, { vol: Math.min(1, e.v / 8 + 0.3) }); G.fx.burst('sparks', e.x, e.y, e.z); }
          else if (e.kind === 'board') G.snd('board', e.x, e.y, e.z, { vol: Math.min(1, e.v / 10 + 0.3) });
          else if (e.kind === 'bumper') G.snd('bumper', e.x, e.y, e.z, { vol: 0.6 });
          else if (e.kind === 'player') G.snd('bounce', e.x, e.y, e.z, { speed: e.v * 0.7 });
          break;
        case 'pad':
          G.arena.pulsePad(e.pad);
          if (p) {
            var pd = Arena.pads[e.pad];
            G.fx.burst('pad', pd.x, pd.y, pd.z, { color: pd.type === 'bounce' ? '#39e6ff' : '#ffd23f' });
            if (!menu) G.snd(e.kind === 'launch' ? 'launch' : 'pad', p.x, p.y, p.z);
            if (G._isLocal(p.id)) BBA.Controls.rumble(0.35, 120);
          }
          break;
        case 'padBall': G.arena.pulsePad(e.pad); break;
        case 'bumper': if (p && !menu) G.snd('bumper', p.x, p.y, p.z); if (p && G._isLocal(p.id)) { G.rig.addTrauma(0.15); BBA.Controls.rumble(0.35, 100); } break;
        case 'fumble': if (p && !menu) G.snd('fumble', p.x, p.y, p.z); break;
        case 'call':
          if (p && !menu && p.team === localTeam && !G._isLocal(p.id)) { G.snd('call', p.x, p.y, p.z); }
          break;
        case 'dunk': {
          var h = sim.hoops[e.hoop];
          G.arena.flashHoop(e.hoop);
          G.fx.burst('slam', h.x, h.y, h.z, { color: G.teamCss[1 - e.hoop] });
          G.fx.burst('confetti', h.x, h.y + 0.5, h.z - h.side * 1.5, { n: 70 });
          G.rig.addTrauma(G._isLocal(e.id) ? 0.75 : 0.35);
          if (G._isLocal(e.id)) BBA.Controls.rumble(1, 260);
          if (!menu) { BBA.Audio.play('dunk'); UI.banner('SLAM DUNK!', esc(p.name), 'dunk ' + (p.team === 0 ? 'blue' : 'red')); }
          G.arena.hype(1.2);
          break;
        }
        case 'score': {
          var hs = sim.hoops[1 - e.team];
          G.arena.flashHoop(1 - e.team);
          if (e.kind !== 'dunk') {
            G.fx.burst('confetti', hs.x, hs.y, hs.z, { n: 50, colors: [G.teamCss[e.team], '#ffffff', '#ffd23f'] });
            if (!menu) { BBA.Audio.play('swish'); BBA.Audio.play('score'); }
            var who = e.scorer >= 0 ? esc(G._pname(e.scorer)) : (e.kind === 'own' ? 'Own goal!' : '');
            var title = e.kind === 'long' ? 'LONG SHOT! +3' : (C.TEAM_NAMES[e.team] + ' SCORES! +' + e.pts);
            if (!menu) UI.banner(title, who, 'score ' + (e.team === 0 ? 'blue' : 'red'));
          } else if (!menu) BBA.Audio.play('score');
          G.arena.hype(1);
          if (!menu) {
            UI.scoreFlash(e.team);
            var line = '<b style="color:' + G.teamCss[e.team] + '">' + (e.scorer >= 0 ? esc(G._pname(e.scorer)) : C.TEAM_NAMES[e.team]) + '</b> +' + e.pts +
              (e.kind === 'dunk' ? ' (dunk)' : (e.kind === 'long' ? ' (long range)' : '')) + (e.assist >= 0 ? ' · assist ' + esc(G._pname(e.assist)) : '');
            UI.feed(line);
          }
          break;
        }
        case 'ballGone': break;
        case 'ballSpawn': if (!menu && sim.match.phaseT > 0.01) { G.fx.burst('pad', 0, 0.2, 0, { color: '#ffd23f' }); } break;
        case 'ballReset': if (!menu) UI.feed('Ball reset to midfield'); break;
        case 'final30': if (!menu) { UI.banner('30 SECONDS', 'Make it count!', 'warn'); BBA.Audio.play('countdown'); } break;
        case 'tick': if (!menu) { UI.bigTick(e.n); BBA.Audio.play('tick'); } break;
        case 'buzzer': if (!menu) { BBA.Audio.play('buzzer'); } break;
        case 'overtime':
          if (!menu) { UI.banner('OVERTIME', 'Next score wins!', 'ot'); BBA.Audio.play('overtime'); BBA.Audio.setMusic('overtime'); }
          G.arena.setOvertime(true);
          break;
        case 'end':
          if (!menu) {
            var won = e.winner === localTeam;
            UI.banner(e.winner < 0 ? 'DRAW!' : (C.TEAM_NAMES[e.winner] + ' WINS!'), (e.reason === 'mercy' ? 'MERCY RULE · ' : '') + e.score[0] + ' - ' + e.score[1], e.winner === 0 ? 'score blue' : 'score red');
            BBA.Audio.play(won ? 'victory' : 'defeat');
            BBA.Audio.setMusic('menu');
            G.endT = 0;
            BBA.Controls.releaseLock();
          }
          G.arena.hype(1.5);
          break;
        case 'fell': if (p) G.fx.burst('poof', p.x, Math.max(0, p.y), p.z); break;
        case 'respawn': if (p) G.fx.burst('poof', p.x, p.y, p.z, { color: G.teamCss[p.team] }); break;
        default: break;
      }
    }
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  G.esc = esc;

  /* ---------------- render ---------------- */
  G._render = function (dt, alpha, ctl) {
    var sim = G.sim;
    if (!sim) { G.renderer.render(G.scene, G.camera); return; }
    var i, b = sim.ball, m = sim.match;
    if (G.mode === 'online') G._onlineRender(dt);
    var winner = m.phase === 'ended' ? m.winner : -2;
    if (G.podium) G._updatePodium(dt);
    else for (i = 0; i < G.views.length; i++) G.views[i].update(dt, (G.mode === 'online' && i !== G.localId) ? 1 : alpha, sim.players[i], sim, G.camera, winner);
    if (G.mode === 'online' && G.localId >= 0 && !G.podium) {
      var cv = G.views[G.localId], cr = G.net.corr;
      cv.pos.x += cr.x; cv.pos.y += cr.y; cv.pos.z += cr.z;
      cv.ch.root.position.copy(cv.pos);
    }
    // ball (interpolated)
    var pb = G.prevBall || b;
    var bs = G._ballState || (G._ballState = {});
    bs.x = pb.x + (b.x - pb.x) * alpha; bs.y = pb.y + (b.y - pb.y) * alpha; bs.z = pb.z + (b.z - pb.z) * alpha;
    if (Math.abs(b.x - pb.x) + Math.abs(b.y - pb.y) + Math.abs(b.z - pb.z) > 5) { bs.x = b.x; bs.y = b.y; bs.z = b.z; }
    if (b.state === 'held' && b.holder >= 0) {
      // glue to the interpolated hands so it never lags the carrier
      var hv = G.views[b.holder], hp = sim.players[b.holder];
      var hold = sim.holdPos(hp);
      bs.x = hv.pos.x + (hold.x - hp.x); bs.y = hv.pos.y + (hold.y - hp.y); bs.z = hv.pos.z + (hold.z - hp.z);
    }
    bs.vx = b.vx; bs.vy = b.vy; bs.vz = b.vz; bs.state = b.state;
    bs.holderTeam = b.holder >= 0 ? sim.players[b.holder].team : -1;
    if (G.podium) bs.state = 'gone';
    G.ballView.update(dt, bs, G.teamCss, Arena.groundHeight);
    G.arena.update(dt, G.mode === 'online' ? (G.renderSimTime || 0) : sim.time + G.acc, sim.settings.obstacles);
    G.arena.setScoreboard(m.score, m.clock, m.overtime, m.phase === 'ended' ? 'FINAL' : (m.overtime ? 'OVERTIME' : ''));
    G.fx.update(dt);
    BBA.Audio.update(dt);

    // camera
    var ballVis = { x: bs.x, y: bs.y, z: bs.z, visible: b.state !== 'gone' };
    if (G.localId >= 0) {
      var lp = sim.players[G.localId], lv = G.views[G.localId];
      if (m.phase === 'ended' && G.endT >= 0) {
        G.endT += dt;
        if (G.endT > 1.2 && G.rig.mode !== 'end' && !G.podium) { G.rig.mode = 'end'; G.rig.pos.copy(G.camera.position); }
        if (G.endT > 2.2 && !G.podium && m.winner >= 0) G._startPodium();
        if (!G.podium) {
          var wt = m.winner >= 0 ? m.winner : lp.team, cx = 0, cy = 0, cz = 0, n = 0;
          for (i = 0; i < sim.players.length; i++) { var q = sim.players[i]; if (q.team === wt && !q.hidden) { cx += q.x; cy += q.y; cz += q.z; n++; } }
          if (n) { cx /= n; cy /= n; cz /= n; }
          G.rig.update(dt, { x: cx, y: cy, z: cz, vx: 0, vz: 0, speed: 0 }, null, ballVis);
        }
        var resAt = G.podium ? 2.6 : 3.2, resT = G.podium ? G.podium.t : G.endT;
        if (resT > resAt && !G.resultsShown) { G.resultsShown = true; BBA.UI.showResults(sim, G.localId, G.teamCss, !!G.podium); }
      } else {
        var aiming = lp.charging || (lp.passHeld && lp.passT > 0.2) || (ctl && ctl.held.aim);
        // aim assist (touch / controller): while charging a shot, ease the camera toward the hoop
        var aa = BBA.Settings.data.aimAssist, aimYaw, aimK = 0;
        if (lp.charging && b.holder === lp.id && ctl && ctl.device !== 'kbm' && aa && aa !== 'off') {
          var ahp = sim.attackHoop(lp.team);
          aimYaw = Math.atan2(ahp.x - lp.x, ahp.z - lp.z);
          aimK = aa === 'strong' ? 7 : 3.5;
        }
        G.rig.update(dt, {
          x: lv.pos.x, y: lv.pos.y, z: lv.pos.z, vx: lp.vx, vz: lp.vz, speed: hyp(lp.vx, lp.vz),
          sprinting: lp.sprinting, aiming: aiming, hasBall: b.holder === lp.id, airborne: !lp.grounded,
          aimYaw: aimYaw, aimK: aimK
        }, G.paused ? null : ctl, ballVis);
      }
      G._updateAimHelpers(lp);
      BBA.UI.updateHUD(G, sim, lp, ballVis, dt);
    } else {
      G.rig.update(dt, null, null, ballVis);
    }
    // safety net: never render from a broken camera (a NaN would draw an all-black frame)
    var cp = G.camera.position;
    if (!isFinite(cp.x) || !isFinite(cp.y) || !isFinite(cp.z) || !isFinite(G.camera.fov)) {
      G._recoverCamera();
    }
    if (G.contextLost) return;
    var sceneToRender = (BBA.UI.current === 'customize') ? G.pScene : G.scene;
    if (sceneToRender === G.pScene) G._updatePreview(dt);
    G.renderer.render(sceneToRender, sceneToRender === G.pScene ? G.pCam : G.camera);
  };

  /* ---------------- aiming helpers (shot arc + pass target) ---------------- */
  G._recoverCamera = function () {
    var R = G.rig, lp = G.localId >= 0 && G.sim ? G.sim.players[G.localId] : null;
    R.yaw = isFinite(R.yaw) ? R.yaw : 0; R.pitch = 0.35; R.dist = 7.5; R.fov = 64; R.trauma = 0; R.shoulder = 0;
    if (lp && isFinite(lp.x)) R.tgt.set(lp.x, lp.y + 1.6, lp.z); else R.tgt.set(0, 2, 0);
    R.pos.set(R.tgt.x, R.tgt.y + 4, R.tgt.z - 8);
    G.camera.position.copy(R.pos); G.camera.fov = 64; G.camera.updateProjectionMatrix();
    G.camera.lookAt(R.tgt);
    if (root.console) console.warn('Bean Ball: camera recovered from an invalid state');
  };

  /* compile shaders for everything in view up front so the first match frame never stalls */
  G._warmShaders = function () {
    try { G.renderer.compile(G.scene, G.camera); } catch (e) {}
  };

  G._buildArc = function () {
    var n = 48, pos = new Float32Array(n * 3);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var cols = new Float32Array(n * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    G.arc = new THREE.Line(geo, new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.95, depthTest: false }));
    G.arc.renderOrder = 10;
    G.arc.frustumCulled = false;
    G.arc.visible = false;
    G.scene.add(G.arc);
    // bold dot trail (WebGL lines are 1px - too thin to read on a phone)
    G.arcDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false }), 30);
    G.arcDots.setColorAt(0, new THREE.Color('#ffffff'));
    G.arcDots.renderOrder = 10; G.arcDots.frustumCulled = false; G.arcDots.visible = false;
    G.scene.add(G.arcDots);
    G.arcEnd = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 24), new THREE.MeshBasicMaterial({ color: '#3dff7a', transparent: true, opacity: 0.9, depthTest: false }));
    G.arcEnd.rotation.x = Math.PI / 2; G.arcEnd.visible = false; G.arcEnd.renderOrder = 11;
    G.scene.add(G.arcEnd);
    G.passRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false }));
    G.passRing.rotation.x = -Math.PI / 2; G.passRing.visible = false; G.passRing.renderOrder = 10;
    G.scene.add(G.passRing);
  };

  G._updateAimHelpers = function (lp) {
    var sim = G.sim;
    var SD = BBA.Settings.data, info = G.shotInfo || (G.shotInfo = {});
    info.active = false;
    if (lp.charging && sim.ball.holder === lp.id && SD.shotArc !== 'off') {
      var pr = sim.previewShot(lp, lp.charge, lp.input.look, 2.2);
      var pts = pr.points, n = 48, L = pr.launch;
      // full path by default (ends where it drops through the ring or lands); 'short' keeps the old skill mode
      var show = SD.shotArc === 'short' ? 0.62 : pts[pr.endIdx].t;
      var inWin = L.perfect >= 0 && Math.abs(lp.charge - L.perfect) < (L.window || 0.2);
      info.active = true; info.perfect = L.perfect; info.window = L.window || 0.2; info.makes = pr.makes; info.inWin = inWin;
      var pos = G.arc.geometry.attributes.position, col = G.arc.geometry.attributes.color;
      var j = 0, c = G._arcCol || (G._arcCol = new THREE.Color());
      for (var i = 0; i < n; i++) {
        var tt = show * i / (n - 1);
        while (j < pts.length - 1 && pts[j + 1].t < tt) j++;
        var p = pts[j], p2 = pts[Math.min(j + 1, pts.length - 1)];
        var f = p2.t > p.t ? Math.max(0, Math.min(1, (tt - p.t) / (p2.t - p.t))) : 0;
        pos.setXYZ(i, p.x + (p2.x - p.x) * f, p.y + (p2.y - p.y) * f, p.z + (p2.z - p.z) * f);
        var lt = 0.5 + 0.3 * (1 - i / n);
        if (pr.makes) c.setHSL(0.36, 1, lt);                 // green: this one's going in
        else if (inWin) c.setHSL(0.2, 1, lt);               // yellow-green: close, assist will help
        else c.setHSL(0.1 - 0.1 * lp.charge, 1, lt);       // orange/red: off target
        col.setXYZ(i, c.r, c.g, c.b);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
      G.arc.computeLineDistances();
      G.arc.visible = true;
      // dots along the same path, marching forward so the direction reads like an arrow
      var nd = 30, dm = G._dotM || (G._dotM = new THREE.Matrix4()), march = (performance.now() * 0.0012) % 1;
      for (var d = 0; d < nd; d++) {
        var fi = (d + march) / nd * (n - 1), i0 = Math.floor(fi), i1 = Math.min(n - 1, i0 + 1), ff = fi - i0;
        var px = pos.getX(i0) + (pos.getX(i1) - pos.getX(i0)) * ff, py = pos.getY(i0) + (pos.getY(i1) - pos.getY(i0)) * ff, pz = pos.getZ(i0) + (pos.getZ(i1) - pos.getZ(i0)) * ff;
        var ds = d < 2 ? 0.4 + d * 0.3 : 1 - d / nd * 0.35;   // skip the dots right at the hands
        dm.makeScale(ds, ds, ds); dm.setPosition(px, py, pz);
        G.arcDots.setMatrixAt(d, dm);
        c.setRGB(col.getX(i0), col.getY(i0), col.getZ(i0));
        G.arcDots.setColorAt(d, c);
      }
      G.arcDots.instanceMatrix.needsUpdate = true;
      if (G.arcDots.instanceColor) G.arcDots.instanceColor.needsUpdate = true;
      G.arcDots.visible = true;
      // landing marker at the end of the arc
      var e2 = pts[pr.endIdx];
      G.arcEnd.visible = SD.shotArc !== 'short';
      G.arcEnd.position.set(e2.x, e2.y + 0.05, e2.z);
      G.arcEnd.material.color.setHSL(pr.makes ? 0.36 : (inWin ? 0.2 : 0.07), 1, 0.55);
      var es = 1 + Math.sin(performance.now() * 0.015) * 0.12;
      G.arcEnd.scale.set(es, es, es);
    } else { G.arc.visible = false; G.arcEnd.visible = false; G.arcDots.visible = false; }
    var target = lp.passHeld && lp.passT > 0.2 ? lp.passAim : -1;
    if (target >= 0) {
      var tv = G.views[target];
      G.passRing.visible = true;
      G.passRing.position.set(tv.pos.x, tv.pos.y + 0.08, tv.pos.z);
      var s = 1 + Math.sin(performance.now() * 0.012) * 0.1;
      G.passRing.scale.set(s, s, s);
    } else G.passRing.visible = false;
  };

  /* ---------------- customize preview scene ---------------- */
  G._buildPreviewScene = function () {
    var s = new THREE.Scene();
    s.background = new THREE.Color('#2b2f7a');
    s.add(new THREE.HemisphereLight('#ffffff', '#6a4a9a', 0.9));
    var d = new THREE.DirectionalLight('#ffffff', 0.8); d.position.set(3, 6, 5); s.add(d);
    var ped = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.4, 32), new THREE.MeshLambertMaterial({ color: '#ffc93c' }));
    ped.position.y = -0.2; s.add(ped);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 40), new THREE.MeshBasicMaterial({ color: '#39e6ff' }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; s.add(ring);
    G.pScene = s;
    G.pCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    G.pCam.position.set(0, 1.5, 5.2);
    G.pCam.lookAt(0, 1.0, 0);
    G.pSpin = 0.4;
  };

  G.refreshPreview = function () {
    if (G.pChar) { G.pScene.remove(G.pChar.root); BBA.Character.dispose(G.pChar); }
    var cos = BBA.Settings.data.cosmetics;
    G.pChar = BBA.Character.build({ cosmetics: cos, teamColor: G.teamCss[0], number: cos.number, jerseyName: cos.jerseyName || BBA.Settings.data.name });
    G.pChar.ring.visible = false;
    G.pScene.add(G.pChar.root);
    G.pCelebrate = 0;
  };

  G._updatePreview = function (dt) {
    if (!G.pChar) G.refreshPreview();
    // offset the camera so the character sits right of the menu panel on wide screens
    var wide = root.innerWidth > root.innerHeight * 1.2;
    G.pCam.aspect = root.innerWidth / root.innerHeight; G.pCam.updateProjectionMatrix();
    var ox = wide ? 1.9 : 0;
    G.pCam.position.set(ox, 1.6, 6.4);
    G.pCam.lookAt(ox, 1.0, 0);
    G.pChar.root.position.x = 0;
    if (G.pHoldT > 0) G.pHoldT -= dt; else G.pSpin += dt * (G.pDrag ? 0 : 0.6);
    G.pChar.root.rotation.y = G.pSpin;
    if (G.pCelebrate > 0) G.pCelebrate -= dt;
    BBA.Anim.update(G.pChar, {
      speed: 0, vy: 0, grounded: true, state: 'normal', hasBall: false, charging: false, charge: 0, wobble: 0,
      throwAnim: 0, celebrateT: G.pCelebrate > 0 ? Math.min(1.4, G.pCelebrate) : 0, sprinting: false, accel: 0, yawRate: 0, landImpact: 0,
      celebration: BBA.Settings.data.cosmetics.celebration, victory: BBA.Settings.data.cosmetics.victory,
      ended: G.pVictory > 0 ? 'win' : null
    }, dt);
    if (G.pVictory > 0) G.pVictory -= dt;
  };

  /* Colorblind toggle: rebuild team-colored visuals without touching the sim */
  G.rebuildTeamColors = function () {
    G.teamCss = BBA.Settings.teamColors();
    if (G.pChar) { G.pScene.remove(G.pChar.root); BBA.Character.dispose(G.pChar); }
    if (G.podiumGroup) { G.scene.remove(G.podiumGroup); G.podiumGroup = null; }
    var aid = G.arena ? G.arena.id : 'bean_bowl';
    G.arena.dispose();
    G.arena = new BBA.ArenaView(G.scene, { arena: BBA.Arenas.get(aid), teamCss: G.teamCss, mobile: BBA.Settings.isMobile });
    if (G.sim) {
      for (var i = 0; i < G.views.length; i++) G.views[i].dispose();
      G.views = [];
      G._createViews();
    }
    G.pChar = null;
  };

  G.previewCelebrate = function () { G.pCelebrate = 1.4; };
  G.previewShowBack = function () { G.pSpin = Math.PI; G.pHoldT = 1.6; };
  G.previewVictory = function () { G.pVictory = 3.2; };

  BBA.Game = G;
})(this);
