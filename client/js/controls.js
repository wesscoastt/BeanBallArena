/* BEAN BALL ARENA - client/js/controls.js
 * Keyboard + mouse, gamepad (Xbox / PlayStation / Android handhelds), and
 * touch controls, unified into one per-frame control state.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var doc = root.document;

  var ACTIONS = ['jump', 'sprint', 'dive', 'grab', 'pass', 'shoot', 'aim', 'ballcam', 'ready'];
  var SPRINT_AT = 0.9;   // touch stick tilt that triggers sprint

  var C = {
    keys: {},            // code -> down
    mouseDX: 0, mouseDY: 0,
    locked: false,
    device: BBA.Settings.isTouch ? 'touch' : 'kbm',
    padType: 'xbox',
    padIndex: -1,
    padPrev: [],
    touch: { active: false, joyId: -1, joyX: 0, joyY: 0, ox: 0, oy: 0, camId: -1, camX: 0, camY: 0, camDX: 0, camDY: 0, held: {} },
    capture: null,       // rebind capture callback
    onNav: null,         // menu navigation callback(dir)
    onPause: null,
    wantPointerLock: false,
    navRepeat: 0, navDir: '',
    state: null,
    edgePrev: {}
  };

  function emptyState() {
    return { mx: 0, my: 0, lookX: 0, lookY: 0, held: { jump: false, sprint: false, dive: false, grab: false, pass: false, shoot: false, aim: false, ballcam: false, ready: false }, device: C.device, pause: false, ballcamPress: false };
  }

  function bound(action, code) {
    var list = BBA.Settings.data.keys[action];
    return list && list.indexOf(code) >= 0;
  }
  function anyDown(action) {
    var list = BBA.Settings.data.keys[action] || [], i;
    for (i = 0; i < list.length; i++) if (C.keys[list[i]]) return true;
    return false;
  }

  C.init = function (canvas) {
    C.canvas = canvas;
    root.addEventListener('keydown', function (e) {
      if (C.capture) {
        e.preventDefault();
        if (e.code !== 'Escape') C.capture({ type: 'key', code: e.code }); else C.capture(null);
        C.capture = null; return;
      }
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      C.keys[e.code] = true;
      if (C.device !== 'kbm') C.setDevice('kbm');
      if (bound('pause', e.code) && C.onPause) C.onPause();
      if (bound('ready', e.code) && !e.repeat) C.readyQueued = true; // never miss a quick tap between frames
      // menu nav via keyboard arrows is handled by the browser focus; we also map for consistency
      if (C.onNav && !C.gameActive) {
        if (e.code === 'ArrowUp') { C.onNav('up'); e.preventDefault(); }
        else if (e.code === 'ArrowDown') { C.onNav('down'); e.preventDefault(); }
        else if (e.code === 'ArrowLeft') { C.onNav('left'); }
        else if (e.code === 'ArrowRight') { C.onNav('right'); }
      }
      if (C.gameActive && (e.code === 'Space' || e.code.indexOf('Arrow') === 0 || e.code === 'Tab')) e.preventDefault();
    });
    root.addEventListener('keyup', function (e) { C.keys[e.code] = false; });
    root.addEventListener('blur', function () { C.keys = {}; });

    canvas.addEventListener('mousedown', function (e) {
      if (C.capture) { e.preventDefault(); C.capture({ type: 'key', code: 'Mouse' + e.button }); C.capture = null; return; }
      if (BBA.Settings.isTouch && C.device === 'touch') return;
      C.setDevice('kbm');
      if (C.gameActive && !C.locked && C.wantPointerLock) { C.requestLock(); return; }
      C.keys['Mouse' + e.button] = true;
    });
    root.addEventListener('mouseup', function (e) { C.keys['Mouse' + e.button] = false; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    root.addEventListener('mousemove', function (e) {
      if (C.locked) { C.mouseDX += e.movementX || 0; C.mouseDY += e.movementY || 0; }
    });
    doc.addEventListener('pointerlockchange', function () {
      C.locked = doc.pointerLockElement === canvas;
      if (!C.locked) { C.keys.Mouse0 = false; C.keys.Mouse2 = false; if (C.gameActive && C.onLockLost) C.onLockLost(); }
    });
    root.addEventListener('gamepadconnected', function (e) {
      C.padIndex = e.gamepad.index;
      C.detectPad(e.gamepad);
    });
    C.buildTouch();
  };

  C.requestLock = function () {
    if (!C.canvas || !C.canvas.requestPointerLock || BBA.Settings.isMobile) return;
    try { var r = C.canvas.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } catch (e) {}
  };
  C.releaseLock = function () { if (doc.exitPointerLock && C.locked) doc.exitPointerLock(); };

  C.setDevice = function (d) {
    if (C.device === d) return;
    C.device = d;
    if (C.onDeviceChange) C.onDeviceChange(d);
  };

  C.detectPad = function (gp) {
    var id = (gp && gp.id || '').toLowerCase();
    C.padType = (id.indexOf('054c') >= 0 || id.indexOf('playstation') >= 0 || id.indexOf('dualshock') >= 0 || id.indexOf('dualsense') >= 0 || id.indexOf('wireless controller') >= 0) ? 'ps' : 'xbox';
  };

  C.rumble = function (strong, dur) {
    if (!BBA.Settings.data.vibration) return;
    try {
      if (C.device === 'pad' && C.padIndex >= 0) {
        var gp = root.navigator.getGamepads()[C.padIndex];
        if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
          gp.vibrationActuator.playEffect('dual-rumble', { duration: dur || 120, strongMagnitude: strong, weakMagnitude: strong * 0.6 });
        }
      } else if (C.device === 'touch' && root.navigator.vibrate) {
        root.navigator.vibrate(Math.round((dur || 60) * 0.5));
      }
    } catch (e) {}
  };

  /* ---------------- gamepad ---------------- */
  var PAD_NAMES = {
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-Up', 'D-Down', 'D-Left', 'D-Right'],
    ps: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right']
  };
  C.padButtonName = function (i) { var n = PAD_NAMES[C.padType] || PAD_NAMES.xbox; return n[i] || ('B' + i); };

  function readPad() {
    var pads = root.navigator.getGamepads ? root.navigator.getGamepads() : [];
    if (!pads) return null;
    var gp = null, i;
    if (C.padIndex >= 0 && pads[C.padIndex]) gp = pads[C.padIndex];
    if (!gp) { for (i = 0; i < pads.length; i++) if (pads[i]) { gp = pads[i]; C.padIndex = i; C.detectPad(gp); break; } }
    return gp;
  }

  function deadzone(x, y, dz) {
    var m = Math.sqrt(x * x + y * y);
    if (m < dz) return [0, 0];
    var s = (m - dz) / (1 - dz) / m;
    var nx = x * s, ny = y * s, nm = Math.sqrt(nx * nx + ny * ny);
    if (nm > 1) { nx /= nm; ny /= nm; }
    return [nx, ny];
  }

  C.pollPad = function (st, dt) {
    var gp = readPad();
    if (!gp) return;
    var S = BBA.Settings.data, map = S.pad, b = gp.buttons, i;
    var pressedNow = [];
    for (i = 0; i < b.length; i++) pressedNow.push(!!(b[i] && (b[i].pressed || b[i].value > 0.35)));
    var active = false;
    for (i = 0; i < pressedNow.length; i++) if (pressedNow[i] && !C.padPrev[i]) active = true;
    var ls = deadzone(gp.axes[0] || 0, gp.axes[1] || 0, S.deadzone);
    var rs = deadzone(gp.axes[2] || 0, gp.axes[3] || 0, S.deadzone);
    if (Math.abs(ls[0]) + Math.abs(ls[1]) + Math.abs(rs[0]) + Math.abs(rs[1]) > 0.3) active = true;
    if (active && C.device !== 'pad') C.setDevice('pad');

    // rebinding capture
    if (C.capture) {
      for (i = 0; i < pressedNow.length; i++) if (pressedNow[i] && !C.padPrev[i]) { C.capture({ type: 'pad', index: i }); C.capture = null; break; }
      C.padPrev = pressedNow; return;
    }

    // menu nav
    if (!C.gameActive && C.onNav) {
      var dir = '';
      if (pressedNow[12] || ls[1] < -0.6) dir = 'up';
      else if (pressedNow[13] || ls[1] > 0.6) dir = 'down';
      else if (pressedNow[14] || ls[0] < -0.6) dir = 'left';
      else if (pressedNow[15] || ls[0] > 0.6) dir = 'right';
      if (dir) {
        if (dir !== C.navDir) { C.onNav(dir); C.navRepeat = 0.35; }
        else { C.navRepeat -= dt; if (C.navRepeat <= 0) { C.onNav(dir); C.navRepeat = 0.12; } }
      }
      C.navDir = dir;
      if (pressedNow[0] && !C.padPrev[0]) C.onNav('confirm');
      if (pressedNow[1] && !C.padPrev[1]) C.onNav('back');
    }
    if (pressedNow[map.pause] && !C.padPrev[map.pause] && C.onPause) C.onPause();

    if (C.device === 'pad') {
      st.mx = ls[0]; st.my = -ls[1];
      var sens = S.padSens * 3.2 * dt;
      st.lookX += rs[0] * sens;
      st.lookY += rs[1] * sens * 0.7 * (S.invertY ? -1 : 1);
      var h = st.held;
      h.jump = h.jump || pressedNow[map.jump];
      h.pass = h.pass || pressedNow[map.pass];
      h.dive = h.dive || pressedNow[map.dive];
      h.ballcam = h.ballcam || pressedNow[map.ballcam];
      h.sprint = h.sprint || pressedNow[map.sprint] || pressedNow[map.sprintAlt];
      h.shoot = h.shoot || pressedNow[map.shoot];
      h.aim = h.aim || pressedNow[map.aim];
      h.grab = h.grab || pressedNow[map.grab];
      h.ready = h.ready || pressedNow[map.ready === undefined ? 8 : map.ready];
    }
    C.padPrev = pressedNow;
  };

  /* ---------------- touch ---------------- */
  var TOUCH_BTNS = [
    { id: 'jump', label: 'Jump', icon: '⤒', r: 3, b: 3, size: 86 },
    { id: 'grab', label: 'Grab', icon: '✋', r: 3, b: 25, size: 70 },
    { id: 'pass', label: 'Pass', icon: '➶', r: 17, b: 16, size: 66 },
    { id: 'dive', label: 'Dive', icon: '➘', r: 20, b: 2, size: 62 },
    { id: 'shoot', label: 'Shoot', icon: '◎', r: 14, b: 33, size: 66 },
    { id: 'ballcam', label: 'Ball', icon: '◉', r: 3, b: 43, size: 50 }
  ];
  C.TOUCH_BTNS = TOUCH_BTNS;

  C.buildTouch = function () {
    var ui = doc.getElementById('touch-ui');
    if (!ui) return;
    C.touchUI = ui;
    ui.innerHTML = '';
    var joyBase = doc.createElement('div'); joyBase.className = 'joy-base';
    var joyKnob = doc.createElement('div'); joyKnob.className = 'joy-knob';
    joyBase.appendChild(joyKnob);
    ui.appendChild(joyBase);
    C.joyBase = joyBase; C.joyKnob = joyKnob;
    C.touchBtnEls = {};
    var i;
    for (i = 0; i < TOUCH_BTNS.length; i++) {
      var d = TOUCH_BTNS[i];
      var el = doc.createElement('div');
      el.className = 'tbtn tbtn-' + d.id;
      el.setAttribute('data-act', d.id);
      el.innerHTML = '<span class="ti">' + d.icon + '</span><span class="tl">' + d.label + '</span>';
      ui.appendChild(el);
      C.touchBtnEls[d.id] = el;
    }
    var pause = doc.createElement('div'); pause.className = 'tbtn-pause'; pause.textContent = 'II';
    pause.addEventListener('touchstart', function (e) { e.preventDefault(); if (C.onPause) C.onPause(); }, { passive: false });
    ui.appendChild(pause);
    C.applyTouchLayout();

    function findBtn(target) {
      while (target && target !== ui) { if (target.getAttribute && target.getAttribute('data-act')) return target; target = target.parentNode; }
      return null;
    }
    var T = C.touch;
    T.btnTouches = {};
    ui.addEventListener('touchstart', function (e) {
      if (C.editing) return;
      e.preventDefault();
      C.setDevice('touch');
      if (BBA.Audio) BBA.Audio.unlock();
      var i2;
      for (i2 = 0; i2 < e.changedTouches.length; i2++) {
        var t = e.changedTouches[i2];
        var btn = findBtn(doc.elementFromPoint(t.clientX, t.clientY));
        if (btn) {
          var act = btn.getAttribute('data-act');
          T.btnTouches[t.identifier] = act; T.held[act] = true; btn.classList.add('down');
          // a thumb on a button can also slide to look around (hold Shoot + drag to aim)
          if (T.camId < 0 && BBA.Settings.data.dragButtonsLook) { T.camId = t.identifier; T.camX = t.clientX; T.camY = t.clientY; T.camFromBtn = true; T.camMoved = 0; }
          continue;
        }
        if (t.clientX < root.innerWidth * 0.5 && T.joyId < 0) {
          T.joyId = t.identifier; T.ox = t.clientX; T.oy = t.clientY; T.joyX = 0; T.joyY = 0;
          joyBase.style.left = (t.clientX) + 'px'; joyBase.style.top = (t.clientY) + 'px';
          joyBase.classList.add('on'); joyKnob.style.transform = 'translate(-50%,-50%)';
        } else if (T.camId < 0 || T.camFromBtn) {
          // a free finger on the look side always wins over a button-drag look
          T.camId = t.identifier; T.camX = t.clientX; T.camY = t.clientY; T.camFromBtn = false;
        }
      }
    }, { passive: false });
    ui.addEventListener('touchmove', function (e) {
      if (C.editing) return;
      e.preventDefault();
      var i2, S = BBA.Settings.data;
      for (i2 = 0; i2 < e.changedTouches.length; i2++) {
        var t = e.changedTouches[i2];
        if (t.identifier === T.joyId) {
          var R = 62 * S.touchSize / Math.max(0.5, S.joySens);
          var dx = t.clientX - T.ox, dy = t.clientY - T.oy, m = Math.sqrt(dx * dx + dy * dy);
          if (m > R * 1.6) { // floating: drag origin along
            T.ox = t.clientX - dx / m * R * 1.6; T.oy = t.clientY - dy / m * R * 1.6;
            joyBase.style.left = T.ox + 'px'; joyBase.style.top = T.oy + 'px';
            dx = t.clientX - T.ox; dy = t.clientY - T.oy; m = Math.sqrt(dx * dx + dy * dy);
          }
          var k = Math.min(1, m / R);
          // small dead zone so a resting thumb doesn't drift, rescaled so full tilt is still 1
          k = k < 0.12 ? 0 : (k - 0.12) / 0.88;
          T.joyX = m > 0 ? dx / m * k : 0; T.joyY = m > 0 ? dy / m * k : 0;
          var vis = Math.min(m, R);
          joyKnob.style.transform = 'translate(calc(-50% + ' + (m > 0 ? dx / m * vis : 0) + 'px), calc(-50% + ' + (m > 0 ? dy / m * vis : 0) + 'px))';
          joyBase.classList.toggle('sprint', S.stickSprint && k >= SPRINT_AT);
        } else if (t.identifier === T.camId) {
          var mdx = t.clientX - T.camX, mdy = t.clientY - T.camY;
          T.camX = t.clientX; T.camY = t.clientY;
          if (T.camFromBtn) {
            // ignore the first few pixels so a normal button tap never nudges the camera
            T.camMoved += Math.abs(mdx) + Math.abs(mdy);
            if (T.camMoved < 14) continue;
          }
          T.camDX += mdx; T.camDY += mdy;
        }
      }
    }, { passive: false });
    function end(e) {
      if (C.editing) return;
      var i2;
      for (i2 = 0; i2 < e.changedTouches.length; i2++) {
        var t = e.changedTouches[i2];
        if (T.btnTouches[t.identifier]) {
          var act = T.btnTouches[t.identifier];
          T.held[act] = false; delete T.btnTouches[t.identifier];
          if (C.touchBtnEls[act]) C.touchBtnEls[act].classList.remove('down');
        }
        if (t.identifier === T.joyId) { T.joyId = -1; T.joyX = 0; T.joyY = 0; joyBase.classList.remove('on'); joyBase.classList.remove('sprint'); }
        if (t.identifier === T.camId) { T.camId = -1; T.camFromBtn = false; }
      }
    }
    ui.addEventListener('touchend', end);
    ui.addEventListener('touchcancel', end);
  };

  C.applyTouchLayout = function () {
    var S = BBA.Settings.data, lay = S.touchLayout || {}, i;
    if (!C.touchUI) return;
    C.touchUI.style.opacity = S.touchOpacity;
    for (i = 0; i < TOUCH_BTNS.length; i++) {
      var d = TOUCH_BTNS[i], el = C.touchBtnEls[d.id];
      var size = Math.round(d.size * S.touchSize);
      el.style.width = size + 'px'; el.style.height = size + 'px';
      var L = lay[d.id];
      if (L) { el.style.left = L.x + '%'; el.style.top = L.y + '%'; el.style.right = 'auto'; el.style.bottom = 'auto'; }
      else { el.style.left = 'auto'; el.style.top = 'auto'; el.style.right = 'calc(' + d.r + '% + env(safe-area-inset-right))'; el.style.bottom = 'calc(' + d.b + '% + env(safe-area-inset-bottom))'; }
    }
    var js = Math.round(124 * S.touchSize);
    C.joyBase.style.width = js + 'px'; C.joyBase.style.height = js + 'px';
  };

  /* Drag-to-reposition editor for the touch buttons. */
  C.startTouchEdit = function (onDone) {
    var ui = C.touchUI; if (!ui) return;
    C.editing = true;
    ui.classList.add('editing'); ui.style.display = 'block';
    var drag = null;
    function down(e) {
      var t = e.touches ? e.touches[0] : e;
      var el = t.target && t.target.closest ? t.target.closest('.tbtn') : null;
      if (!el) return;
      e.preventDefault();
      drag = { el: el, id: el.getAttribute('data-act') };
    }
    function move(e) {
      if (!drag) return;
      e.preventDefault();
      var t = e.touches ? e.touches[0] : e;
      var w = root.innerWidth, h = root.innerHeight, sz = drag.el.offsetWidth;
      var x = Math.max(0, Math.min(100, (t.clientX - sz / 2) / w * 100)), y = Math.max(0, Math.min(100, (t.clientY - sz / 2) / h * 100));
      drag.el.style.left = x + '%'; drag.el.style.top = y + '%'; drag.el.style.right = 'auto'; drag.el.style.bottom = 'auto';
      var lay = BBA.Settings.data.touchLayout || {};
      lay[drag.id] = { x: +x.toFixed(1), y: +y.toFixed(1) };
      BBA.Settings.data.touchLayout = lay;
    }
    function up() { drag = null; }
    ui.addEventListener('touchstart', down, { passive: false });
    ui.addEventListener('touchmove', move, { passive: false });
    ui.addEventListener('touchend', up);
    ui.addEventListener('mousedown', down); root.addEventListener('mousemove', move); root.addEventListener('mouseup', up);
    C.stopTouchEdit = function () {
      ui.removeEventListener('touchstart', down); ui.removeEventListener('touchmove', move); ui.removeEventListener('touchend', up);
      ui.removeEventListener('mousedown', down); root.removeEventListener('mousemove', move); root.removeEventListener('mouseup', up);
      ui.classList.remove('editing'); C.editing = false;
      BBA.Settings.save();
      if (onDone) onDone();
    };
  };

  /* ---------------- per-frame poll ---------------- */
  C.poll = function (dt) {
    var st = emptyState(), S = BBA.Settings.data, h = st.held, i;
    // keyboard + mouse
    var kx = (anyDown('right') ? 1 : 0) - (anyDown('left') ? 1 : 0);
    var ky = (anyDown('forward') ? 1 : 0) - (anyDown('back') ? 1 : 0);
    if (kx || ky) { var km = Math.sqrt(kx * kx + ky * ky); st.mx = kx / km; st.my = ky / km; }
    for (i = 0; i < ACTIONS.length; i++) h[ACTIONS[i]] = anyDown(ACTIONS[i]);
    var ms = 0.0024 * S.mouseSens;
    st.lookX = C.mouseDX * ms; st.lookY = C.mouseDY * ms * (S.invertY ? -1 : 1);
    C.mouseDX = 0; C.mouseDY = 0;
    // touch
    var T = C.touch;
    if (C.device === 'touch') {
      if (T.joyId >= 0) {
        st.mx = T.joyX; st.my = -T.joyY;
        var jm = Math.sqrt(T.joyX * T.joyX + T.joyY * T.joyY);
        if (S.stickSprint && jm >= SPRINT_AT) h.sprint = true;      // sprint by pushing the stick all the way
      }
      for (i = 0; i < ACTIONS.length; i++) if (T.held[ACTIONS[i]]) h[ACTIONS[i]] = true;
      // touch look: smoothed, with a gentle curve so small thumb moves are precise and big swipes still turn fast
      var tdx = T.camDX, tdy = T.camDY;
      T.camDX = 0; T.camDY = 0;
      T.smX = (T.smX || 0) + (tdx - (T.smX || 0)) * 0.6;
      T.smY = (T.smY || 0) + (tdy - (T.smY || 0)) * 0.6;
      var curve = function (v) { var a = Math.abs(v); return v * (0.55 + 0.45 * Math.min(1, a / 18)); };
      var tl = (S.touchLook || 0.8) * S.mouseSens;
      st.lookX += curve(T.smX) * 0.0062 * tl; st.lookY += curve(T.smY) * 0.0045 * tl * (S.invertY ? -1 : 1);
      if (T.camId < 0 && Math.abs(T.smX) + Math.abs(T.smY) < 0.05) { T.smX = 0; T.smY = 0; }
    }
    // gamepad
    C.pollPad(st, dt);
    st.device = C.device;
    st.ballcamPress = h.ballcam && !C.edgePrev.ballcam;
    C.edgePrev.ballcam = h.ballcam;
    st.readyPress = (h.ready && !C.edgePrev.ready) || !!C.readyQueued;
    C.readyQueued = false;
    C.edgePrev.ready = h.ready;
    C.state = st;
    return st;
  };

  /* Short glyph for prompts, depending on active device */
  C.glyph = function (action) {
    var S = BBA.Settings.data;
    if (C.device === 'pad') return C.padButtonName(S.pad[action]);
    if (C.device === 'touch') {
      var map = { jump: 'Jump', dive: 'Dive', grab: 'Grab', pass: 'Pass', shoot: 'Shoot', ballcam: 'Ball', sprint: 'Push stick', aim: 'Shoot' };
      return map[action] || action;
    }
    var k = (S.keys[action] || [])[0] || '?';
    return C.keyName(k);
  };
  C.keyName = function (code) {
    if (code === 'Mouse0') return 'LMB';
    if (code === 'Mouse2') return 'RMB';
    if (code === 'Mouse1') return 'MMB';
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
    if (code === 'Space') return 'Space';
    if (code === 'Escape') return 'Esc';
    return code.replace('Arrow', '');
  };

  C.ACTIONS = ACTIONS;
  BBA.Controls = C;
})(this);
