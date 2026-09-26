/* BEAN BALL ARENA - client/js/settings.js
 * Player settings + cosmetics, persisted in localStorage when available.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var KEY = 'bba_settings_v1';

  var isTouch = ('ontouchstart' in root) || (root.navigator && root.navigator.maxTouchPoints > 0);
  var isMobile = /iPhone|iPad|iPod|Android/i.test((root.navigator && root.navigator.userAgent) || '');

  var DEFAULTS = {
    name: 'Wesley',
    // graphics
    renderScale: isMobile ? 0.8 : 1,
    shadows: !isMobile,
    effects: true,
    antialias: !isMobile,
    fpsLimit: 0,           // 0 = unlimited (display rate), 30, 60
    autoRes: true,         // lower the resolution automatically when frames run slow
    // audio
    master: 0.8, music: 0.55, sfx: 0.9, crowd: 0.6,
    // controls
    mouseSens: 1, padSens: 1, invertY: false, deadzone: 0.18, vibration: true, autoCam: true,
    shotArc: 'full',                              // 'full' | 'short' | 'off'
    aimAssist: isTouch ? 'strong' : 'normal',     // touch / controller only: 'strong' | 'normal' | 'off'
    // mobile
    touchSize: 1, touchOpacity: 0.75, joySens: 1, touchLayout: null,
    touchLook: 0.8, stickSprint: true, dragButtonsLook: true,
    // accessibility
    colorblind: false, screenShake: true, reducedMotion: false, uiScale: 1, captions: false,
    showTutorialHint: true,
    // bindings
    keys: {
      forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], dive: ['KeyC', 'ControlLeft'], grab: ['Mouse0', 'KeyE'],
      shoot: ['Mouse2', 'KeyR'], pass: ['KeyQ'], ballcam: ['KeyF'], aim: ['KeyV'], pause: ['Escape', 'KeyP'], ready: ['Enter']
    },
    pad: {
      jump: 0, pass: 1, dive: 2, ballcam: 3, sprint: 4, shoot: 5, aim: 6, grab: 7, ready: 8, pause: 9, sprintAlt: 10
    },
    // match setup memory
    lastSetup: { teamSize: 3, duration: 240, difficulty: 'normal', modifier: 'none', warmup: 45 },
    cosmetics: {
      color: '#ffd23f', pattern: 'solid', color2: '#ffffff', face: 'classic', hat: 'none',
      upper: 'jersey', lower: 'shorts', celebration: 'hop', victory: 'backflip', number: 7, jerseyName: '', jerseyColor: 'team',
      jerseyColor2: '#ffffff', jerseyStyle: 'classic'
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function deepMerge(base, over) {
    var out = clone(base), k;
    if (!over || typeof over !== 'object') return out;
    for (k in over) {
      if (!over.hasOwnProperty(k)) continue;
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) out[k] = deepMerge(base[k], over[k]);
      else out[k] = over[k];
    }
    return out;
  }

  var Settings = {
    isTouch: isTouch,
    isMobile: isMobile,
    DEFAULTS: DEFAULTS,
    data: clone(DEFAULTS),
    load: function () {
      try {
        var raw = root.localStorage && root.localStorage.getItem(KEY);
        if (raw) this.data = deepMerge(DEFAULTS, JSON.parse(raw));
        // v0.5: the old on/off "full arc" toggle became the shotArc choice (full is now the default)
        if (this.data.fullArc !== undefined) { delete this.data.fullArc; this.data.shotArc = 'full'; }
      } catch (e) { this.data = clone(DEFAULTS); }
      return this.data;
    },
    save: function () {
      try { if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
    },
    reset: function (section) {
      var d = clone(DEFAULTS), keep = this.data, k;
      if (!section) { d.name = keep.name; d.cosmetics = keep.cosmetics; this.data = d; }
      else { for (k = 0; k < section.length; k++) this.data[section[k]] = d[section[k]]; }
      this.save();
    },
    teamColors: function () {
      return this.data.colorblind ? ['#2f7bff', '#ff9a1f'] : ['#2f7bff', '#ff3b4e'];
    },
    teamColorsHex: function () {
      var c = this.teamColors();
      return [parseInt(c[0].slice(1), 16), parseInt(c[1].slice(1), 16)];
    }
  };
  Settings.load();
  BBA.Settings = Settings;
})(this);
