/* BEAN BALL ARENA - client/js/audio.js
 * All sound is synthesized with Web Audio (no copyrighted assets):
 * effects, crowd bed + reactions, and a procedural game-show music loop.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};

  function Audio() {
    this.ctx = null;
    this.ready = false;
    this.musicMode = 'off';     // 'off' | 'menu' | 'match' | 'overtime'
    this.nextNote = 0; this.step = 0; this.bar = 0;
    this.crowdLevel = 0.25; this.crowdTarget = 0.25;
    this.onCaption = null;
    this.lastPlay = {};
  }

  Audio.prototype.unlock = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    var c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.comp.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.comp);
    this.musicBus = c.createGain(); this.musicBus.connect(this.comp);
    this.crowdBus = c.createGain(); this.crowdBus.connect(this.comp);
    // noise buffer
    var len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), i;
    for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this._startCrowd();
    this.applyVolumes();
    this.ready = true;
    var self = this;
    this.timer = setInterval(function () { self._schedule(); }, 25);
    // iOS: play a silent buffer to fully unlock
    var s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
  };

  Audio.prototype.applyVolumes = function () {
    if (!this.ctx) return;
    var S = BBA.Settings.data;
    this.master.gain.value = S.master;
    this.sfxBus.gain.value = S.sfx;
    this.musicBus.gain.value = S.music * 0.55;
    this.crowdBus.gain.value = S.crowd;
  };

  Audio.prototype.caption = function (txt) {
    if (this.onCaption && BBA.Settings.data.captions) this.onCaption(txt);
  };

  /* ---------- primitives ---------- */
  Audio.prototype._env = function (g, t, a, peak, dec, sus) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus || 0.0001, 0.0001), t + a + dec);
  };

  Audio.prototype.tone = function (o) {
    var c = this.ctx; if (!c) return;
    var t = (o.at || c.currentTime), osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f2, 20), t + (o.glide || o.dur || 0.2));
    var dest = o.bus || this.sfxBus, node = g;
    if (o.pan !== undefined && c.createStereoPanner) { var pn = c.createStereoPanner(); pn.pan.value = o.pan; g.connect(pn); pn.connect(dest); }
    else g.connect(dest);
    if (o.lp) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); f.connect(g); }
    else osc.connect(g);
    this._env(g, t, o.a || 0.005, o.v || 0.3, o.dur || 0.2);
    osc.start(t); osc.stop(t + (o.a || 0.005) + (o.dur || 0.2) + 0.05);
  };

  Audio.prototype.noiseHit = function (o) {
    var c = this.ctx; if (!c) return;
    var t = (o.at || c.currentTime), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; src.loop = true;
    f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.dur || 0.2));
    f.Q.value = o.q || 1;
    src.connect(f); f.connect(g);
    var dest = o.bus || this.sfxBus;
    if (o.pan !== undefined && c.createStereoPanner) { var pn = c.createStereoPanner(); pn.pan.value = o.pan; g.connect(pn); pn.connect(dest); }
    else g.connect(dest);
    this._env(g, t, o.a || 0.003, o.v || 0.3, o.dur || 0.15);
    src.start(t, Math.random() * 1.5); src.stop(t + (o.a || 0.003) + (o.dur || 0.15) + 0.05);
  };

  /* ---------- named sounds ---------- */
  Audio.prototype.play = function (name, opts) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    opts = opts || {};
    var now = this.ctx.currentTime;
    // simple rate limit per sound
    var lp = this.lastPlay[name] || 0;
    if (now - lp < (opts.minGap || 0.03)) return;
    this.lastPlay[name] = now;
    var v = opts.vol === undefined ? 1 : opts.vol, pan = opts.pan || 0, r = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'step': this.noiseHit({ f: 900 * r, q: 2, v: 0.05 * v, dur: 0.05, pan: pan }); break;
      case 'jump': this.tone({ type: 'square', f: 260 * r, f2: 620 * r, dur: 0.14, v: 0.08 * v, lp: 2200, pan: pan }); break;
      case 'land':
        this.tone({ f: 120, f2: 55, dur: 0.14, v: 0.35 * v, pan: pan });
        this.noiseHit({ f: 400, q: 0.8, v: 0.12 * v, dur: 0.1, pan: pan }); break;
      case 'dive': this.noiseHit({ f: 500, f2: 2500, q: 1.5, v: 0.22 * v, dur: 0.22, ft: 'bandpass', pan: pan }); break;
      case 'grab': this.tone({ type: 'triangle', f: 700 * r, f2: 1300 * r, dur: 0.08, v: 0.15 * v, pan: pan }); this.caption('[grab]'); break;
      case 'whiff': this.noiseHit({ f: 1400, f2: 700, q: 2, v: 0.08 * v, dur: 0.1, pan: pan }); break;
      case 'tackle':
        this.tone({ f: 160, f2: 40, dur: 0.25, v: 0.6 * v, pan: pan });
        this.noiseHit({ f: 700, f2: 200, q: 0.7, v: 0.45 * v, dur: 0.22, pan: pan });
        this.tone({ type: 'square', f: 1200, f2: 300, dur: 0.18, v: 0.05 * v, pan: pan }); this.caption('[tackle!]'); break;
      case 'bump': this.tone({ f: 140 * r, f2: 70, dur: 0.1, v: 0.25 * v, pan: pan }); break;
      case 'bumper': this.tone({ type: 'square', f: 240, f2: 480, dur: 0.12, v: 0.12 * v, lp: 1500, pan: pan }); this.tone({ f: 90, f2: 60, dur: 0.15, v: 0.3 * v, pan: pan }); break;
      case 'pad':
        this.tone({ type: 'sine', f: 180, f2: 900, dur: 0.3, v: 0.35 * v, pan: pan });
        this.tone({ type: 'triangle', f: 360, f2: 1800, dur: 0.3, v: 0.12 * v, pan: pan }); this.caption('[boing]'); break;
      case 'launch':
        this.noiseHit({ f: 300, f2: 3000, q: 1, v: 0.35 * v, dur: 0.45, pan: pan });
        this.tone({ type: 'sawtooth', f: 120, f2: 700, dur: 0.4, v: 0.1 * v, lp: 1400, pan: pan }); this.caption('[whoosh]'); break;
      case 'bounce': {
        var vv = Math.min(1, (opts.speed || 6) / 14);
        this.tone({ f: 190 * r, f2: 95, dur: 0.16, v: 0.45 * vv * v, pan: pan });
        this.tone({ type: 'triangle', f: 420 * r, f2: 260, dur: 0.07, v: 0.12 * vv * v, pan: pan });
        break;
      }
      case 'pickup': this.tone({ type: 'triangle', f: 520, f2: 880, dur: 0.09, v: 0.2 * v, pan: pan }); break;
      case 'catch': this.tone({ type: 'triangle', f: 660, f2: 990, dur: 0.1, v: 0.2 * v, pan: pan }); this.tone({ f: 150, f2: 90, dur: 0.08, v: 0.2 * v }); break;
      case 'pass': this.noiseHit({ f: 1200, f2: 2600, q: 2.5, v: 0.14 * v, dur: 0.14, pan: pan }); break;
      case 'throw':
        this.noiseHit({ f: 700, f2: 2800, q: 1.8, v: 0.22 * v, dur: 0.24, pan: pan });
        this.tone({ type: 'triangle', f: 300, f2: 700, dur: 0.18, v: 0.08 * v, pan: pan }); break;
      case 'charge': this.tone({ type: 'sine', f: 300, f2: 900, dur: 1.1, glide: 1.1, v: 0.05 * v, pan: pan }); break;
      case 'rim':
        this.tone({ type: 'square', f: 523, dur: 0.35, v: 0.07 * v, lp: 3000, pan: pan });
        this.tone({ type: 'sine', f: 1318, dur: 0.5, v: 0.12 * v, pan: pan });
        this.tone({ type: 'sine', f: 1976, dur: 0.3, v: 0.06 * v, pan: pan }); this.caption('[clang]'); break;
      case 'board': this.tone({ f: 110, f2: 80, dur: 0.18, v: 0.45 * v, pan: pan }); this.noiseHit({ f: 250, q: 1, v: 0.2 * v, dur: 0.12, pan: pan }); break;
      case 'wall': this.tone({ f: 150, f2: 90, dur: 0.1, v: 0.2 * v, pan: pan }); break;
      case 'swish': this.noiseHit({ f: 3000, f2: 1200, q: 1.2, v: 0.25 * v, dur: 0.35 }); break;
      case 'score': {
        var t0 = this.ctx.currentTime, notes = [523, 659, 784, 1047], i;
        for (i = 0; i < notes.length; i++) this.tone({ type: 'square', f: notes[i], dur: 0.16, v: 0.08, lp: 3500, at: t0 + i * 0.08 });
        this.tone({ type: 'triangle', f: 1047, dur: 0.6, v: 0.12, at: t0 + 0.32 });
        this.cheer(1); this.caption('[crowd cheers]');
        break;
      }
      case 'dunk':
        this.tone({ f: 90, f2: 30, dur: 0.6, v: 0.9 });
        this.noiseHit({ f: 400, f2: 80, q: 0.6, v: 0.7, dur: 0.5, ft: 'lowpass' });
        this.tone({ type: 'sawtooth', f: 220, f2: 880, dur: 0.35, v: 0.07, lp: 2000 });
        this.cheer(1.4); this.caption('[SLAM DUNK! crowd erupts]');
        break;
      case 'countdown': this.tone({ type: 'square', f: 660, dur: 0.16, v: 0.12, lp: 3000 }); this.caption('[beep]'); break;
      case 'go': this.tone({ type: 'square', f: 1320, dur: 0.45, v: 0.14, lp: 4000 }); this.tone({ type: 'sawtooth', f: 660, dur: 0.45, v: 0.06, lp: 2500 }); this.caption('[GO!]'); break;
      case 'tick': this.tone({ type: 'sine', f: 1000, dur: 0.08, v: 0.18 }); this.caption('[tick]'); break;
      case 'buzzer': this.tone({ type: 'sawtooth', f: 180, dur: 0.9, v: 0.2, lp: 1200 }); this.tone({ type: 'square', f: 182, dur: 0.9, v: 0.1, lp: 900 }); this.caption('[BUZZER]'); break;
      case 'overtime': {
        var t1 = this.ctx.currentTime;
        this.tone({ type: 'sawtooth', f: 220, dur: 0.3, v: 0.15, lp: 1800, at: t1 });
        this.tone({ type: 'sawtooth', f: 330, dur: 0.3, v: 0.15, lp: 1800, at: t1 + 0.25 });
        this.tone({ type: 'sawtooth', f: 440, dur: 0.8, v: 0.18, lp: 2200, at: t1 + 0.5 });
        this.cheer(0.9); this.caption('[overtime horn]');
        break;
      }
      case 'victory': {
        var t2 = this.ctx.currentTime, mel = [523, 659, 784, 1047, 784, 1047, 1319], k;
        for (k = 0; k < mel.length; k++) this.tone({ type: 'square', f: mel[k], dur: k === mel.length - 1 ? 0.8 : 0.14, v: 0.09, lp: 3500, at: t2 + k * 0.13 });
        this.cheer(1.5); this.caption('[victory fanfare]');
        break;
      }
      case 'defeat': {
        var t3 = this.ctx.currentTime, sad = [392, 370, 349, 262], j;
        for (j = 0; j < sad.length; j++) this.tone({ type: 'sawtooth', f: sad[j], f2: j === 3 ? 180 : undefined, dur: j === 3 ? 0.9 : 0.28, v: 0.08, lp: 1400, at: t3 + j * 0.3 });
        this.aww(); this.caption('[sad trombone]');
        break;
      }
      case 'ui': this.tone({ type: 'triangle', f: 880, dur: 0.05, v: 0.08 }); break;
      case 'uiBack': this.tone({ type: 'triangle', f: 520, dur: 0.06, v: 0.08 }); break;
      case 'call': this.tone({ type: 'square', f: 880, f2: 1100, dur: 0.1, v: 0.06, lp: 3000, pan: pan }); this.caption('[teammate: over here!]'); break;
      case 'steal': this.tone({ type: 'square', f: 400, f2: 1200, dur: 0.15, v: 0.1, lp: 3000, pan: pan }); this.caption('[steal]'); break;
      case 'fumble': this.tone({ type: 'triangle', f: 800, f2: 200, dur: 0.25, v: 0.15, pan: pan }); break;
      case 'miss': this.aww(); break;
      default: break;
    }
  };

  /* ---------- crowd ---------- */
  Audio.prototype._startCrowd = function () {
    var c = this.ctx;
    var src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    var f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2200;
    var g = c.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(f2); f2.connect(g); g.connect(this.crowdBus);
    src.start();
    this.crowdGain = g; this.crowdFilter = f;
  };

  Audio.prototype.setCrowd = function (level) { this.crowdTarget = level; };

  Audio.prototype.cheer = function (amt) {
    var c = this.ctx; if (!c) return;
    var t = c.currentTime;
    this.noiseHit({ f: 900, f2: 1400, q: 0.5, v: 0.35 * amt, a: 0.15, dur: 1.8, bus: this.crowdBus });
    // a few "woo"s
    for (var i = 0; i < 5; i++) {
      var f0 = 380 + Math.random() * 300;
      this.tone({ type: 'sawtooth', f: f0, f2: f0 * 1.5, glide: 0.4, dur: 0.5, v: 0.02 * amt, lp: 1600, at: t + 0.1 + Math.random() * 0.6, bus: this.crowdBus });
    }
  };
  Audio.prototype.aww = function () {
    var c = this.ctx; if (!c) return;
    this.noiseHit({ f: 700, f2: 350, q: 0.8, v: 0.25, a: 0.1, dur: 1.0, bus: this.crowdBus });
    this.caption('[crowd: awww]');
  };

  Audio.prototype.update = function (dt) {
    if (!this.ctx) return;
    this.crowdLevel += (this.crowdTarget - this.crowdLevel) * Math.min(1, dt * 1.5);
    var wob = 0.85 + 0.15 * Math.sin(this.ctx.currentTime * 0.7) * Math.sin(this.ctx.currentTime * 1.9);
    this.crowdGain.gain.value = 0.14 * this.crowdLevel * wob;
  };

  /* ---------- music ---------- */
  Audio.prototype.setMusic = function (mode) {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    if (this.ctx) this.nextNote = this.ctx.currentTime + 0.05;
    this.step = 0;
  };

  var PROG = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // C, Am, F, G (semitones from C)
  var ROOT = 261.63;
  function st(n) { return ROOT * Math.pow(2, n / 12); }

  Audio.prototype._schedule = function () {
    var c = this.ctx;
    if (!c || this.musicMode === 'off' || c.state !== 'running') return;
    var bpm = this.musicMode === 'overtime' ? 144 : (this.musicMode === 'menu' ? 112 : 128);
    var stepDur = 60 / bpm / 4;
    if (this.nextNote < c.currentTime - 0.2) this.nextNote = c.currentTime + 0.05;
    while (this.nextNote < c.currentTime + 0.12) {
      this._playStep(this.step, this.nextNote, stepDur);
      this.nextNote += stepDur;
      this.step++;
    }
  };

  Audio.prototype._playStep = function (s, t, sd) {
    var mode = this.musicMode, bus = this.musicBus;
    var bar = Math.floor(s / 16), pos = s % 16;
    var chord = PROG[bar % 4];
    var menu = mode === 'menu', ot = mode === 'overtime';
    // kick
    if (!menu && (pos % 4 === 0)) {
      this.tone({ f: 120, f2: 42, dur: 0.16, v: 0.5, at: t, bus: bus });
    }
    // clap / snare
    if (!menu && (pos === 4 || pos === 12)) {
      this.noiseHit({ f: 1800, q: 0.9, v: 0.18, dur: 0.12, at: t, bus: bus });
    }
    // hats
    if (pos % 2 === 1 || (ot && pos % 1 === 0)) {
      this.noiseHit({ f: 8000, ft: 'highpass', q: 0.7, v: menu ? 0.03 : 0.05, dur: 0.03, at: t, bus: bus });
    }
    // bass: bouncy octave pattern
    var bassPat = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1];
    if (bassPat[pos]) {
      var oct = (pos % 4 === 2) ? 2 : 1;
      this.tone({ type: 'triangle', f: st(chord[0] - 24) * oct, dur: sd * 0.9, v: menu ? 0.16 : 0.22, at: t, bus: bus });
    }
    // chord stabs on the off-beats
    if (pos === 2 || pos === 6 || pos === 10 || pos === 14 || (menu && pos === 0)) {
      for (var i = 0; i < 3; i++) {
        this.tone({ type: 'square', f: st(chord[i]), dur: sd * 1.4, v: 0.028, lp: menu ? 1400 : 2400, at: t, bus: bus });
      }
    }
    // lead arpeggio (every other bar, and constant in overtime)
    if ((ot || (bar % 2 === 1 && !menu)) && pos % 2 === 0) {
      var n = chord[(pos / 2) % 3] + 12 + (pos >= 8 ? 12 : 0);
      this.tone({ type: 'sawtooth', f: st(n), dur: sd * 0.8, v: 0.03, lp: 3200, at: t, bus: bus });
    }
    // game-show "brass" hits at the start of every 4 bars
    if (pos === 0 && bar % 4 === 0 && !menu) {
      for (var j = 0; j < 3; j++) this.tone({ type: 'sawtooth', f: st(chord[j]), dur: sd * 3, v: 0.04, lp: 1800, at: t, bus: bus });
    }
  };

  BBA.Audio = new Audio();
})(this);
