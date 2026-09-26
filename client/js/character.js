/* BEAN BALL ARENA - client/js/character.js
 * Builds original low-poly "bean" competitors from primitives + canvas
 * textures, with cosmetics: body color, pattern, face, hat, upper, lower.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;

  var COS = {
    colors: ['#ffd23f', '#ff7a2f', '#ff4f8b', '#b86bff', '#5b8cff', '#2fd3c4', '#6fdc4a', '#f2f2f2', '#3a3a4a', '#ff9ec8', '#8be0ff', '#c58a52'],
    patterns: [['solid', 'Solid'], ['stripes', 'Stripes'], ['dots', 'Polka Dots'], ['split', 'Two-Tone'], ['spots', 'Spotty'], ['zigzag', 'Zig-Zag'], ['stars', 'Stars']],
    faces: [['classic', 'Classic'], ['happy', 'Happy'], ['fierce', 'Fierce'], ['sleepy', 'Sleepy'], ['shades', 'Shades'], ['visor', 'Robo Visor'], ['derp', 'Derp']],
    hats: [['none', 'None'], ['cap', 'Ball Cap'], ['beanie', 'Pom Beanie'], ['crown', 'Gold Crown'], ['horns', 'Horned Helm'], ['propeller', 'Propeller'], ['cone', 'Traffic Cone'], ['tophat', 'Top Hat'], ['headphones', 'Headphones'], ['antenna', 'Antenna'], ['chef', 'Chef Hat'], ['spikes', 'Dino Spikes']],
    uppers: [['jersey', 'Team Jersey'], ['hoodie', 'Team Hoodie'], ['scarf', 'Jersey + Scarf'], ['bowtie', 'Jersey + Bow Tie'], ['cape', 'Jersey + Cape'], ['none', 'Sash Only']],
    lowers: [['shorts', 'Shorts'], ['none', 'None'], ['tutu', 'Tutu'], ['boots', 'Team Boots'], ['socks', 'Striped Socks']],
    celebrations: [['hop', 'Happy Hop'], ['spin', 'Spin'], ['flex', 'Flex'], ['wave', 'Wave']],
    victories: [['backflip', 'Backflip'], ['bounce', 'Bouncy'], ['dance', 'Wiggle Dance']],
    jerseyStyles: null  // filled below
  };

  var matCache = {};
  function mat(color, opts) {
    var key = color + (opts ? JSON.stringify(opts) : '');
    if (matCache[key]) return matCache[key];
    var o = { color: color, roughness: 0.55, metalness: 0.0 };
    if (opts) { for (var k in opts) o[k] = opts[k]; }
    matCache[key] = new THREE.MeshStandardMaterial(o);
    return matCache[key];
  }

  function makeCanvas(w, h) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function bodyTexture(c1, c2, pattern) {
    var cv = makeCanvas(256, 256), g = cv.getContext('2d'), i, j;
    g.fillStyle = c1; g.fillRect(0, 0, 256, 256);
    g.fillStyle = c2;
    if (pattern === 'stripes') { for (i = 0; i < 256; i += 36) g.fillRect(0, i, 256, 14); }
    else if (pattern === 'dots') { for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) { g.beginPath(); g.arc(i * 32 + (j % 2) * 16 + 8, j * 32 + 16, 7, 0, 7); g.fill(); } }
    else if (pattern === 'split') { g.fillRect(0, 0, 128, 256); }
    else if (pattern === 'spots') { var r = 1234; for (i = 0; i < 22; i++) { r = (r * 9301 + 49297) % 233280; var x = r / 233280 * 256; r = (r * 9301 + 49297) % 233280; var y = r / 233280 * 256; g.beginPath(); g.ellipse(x, y, 14 + (i % 3) * 5, 10 + (i % 2) * 4, i, 0, 7); g.fill(); } }
    else if (pattern === 'zigzag') { g.lineWidth = 12; g.strokeStyle = c2; for (j = 30; j < 256; j += 70) { g.beginPath(); for (i = 0; i <= 256; i += 32) g.lineTo(i, j + ((i / 32) % 2 ? 18 : -18)); g.stroke(); } }
    else if (pattern === 'stars') { for (i = 0; i < 5; i++) for (j = 0; j < 5; j++) star(g, i * 52 + (j % 2) * 26 + 13, j * 52 + 26, 11, 5); }
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function star(g, x, y, r, r2) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }

  function cleanJerseyName(n) {
    return String(n || '').toUpperCase().replace(/[^A-Z0-9 .'\-]/g, '').trim().slice(0, 10);
  }

  function hexRgb(c) {
    var h = String(c || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luma(c) { var r = hexRgb(c); return (0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]) / 255; }
  function colorDist(a, b) { var x = hexRgb(a), y = hexRgb(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]); }

  /* The jersey's accent (secondary) color: trim, stripes, number and emblem.
   * Falls back to white/black when it would vanish against the base color. */
  function jerseyAccent(base, accent, team) {
    var a = !accent || accent === 'auto' ? '#ffffff' : (accent === 'team' ? team : accent);
    if (colorDist(a, base) < 90) a = luma(base) > 0.6 ? '#1c1c28' : '#ffffff';
    return a;
  }

  var JERSEY_STYLES = [['classic', 'Classic'], ['pinstripe', 'Pinstripes'], ['panels', 'Side Panels'], ['sash', 'Sash'], ['chevron', 'Chevron'], ['hoops', 'Hoops'], ['split', 'Half & Half']];
  COS.jerseyStyles = JERSEY_STYLES;

  /* style / accent are optional (older callers pass only 4 args) */
  function jerseyTexture(teamColor, number, name, baseColor, accentColor, style) {
    var cv = makeCanvas(512, 128), g = cv.getContext('2d'), i;
    var custom = baseColor && baseColor !== 'team';
    var base = custom ? baseColor : teamColor;
    var acc = jerseyAccent(base, accentColor, teamColor);
    g.fillStyle = base; g.fillRect(0, 0, 512, 128);
    // style layer (u=0.5 is the chest, u=0/1 the back, u=0.25/0.75 the sides)
    g.save(); g.globalAlpha = 0.95; g.fillStyle = acc; g.strokeStyle = acc;
    style = style || 'classic';
    if (style === 'pinstripe') { g.globalAlpha = 0.55; for (i = 8; i < 512; i += 22) g.fillRect(i, 0, 3, 128); }
    else if (style === 'panels') { g.fillRect(104, 0, 48, 128); g.fillRect(360, 0, 48, 128); }
    else if (style === 'sash') { g.beginPath(); g.moveTo(180, 0); g.lineTo(226, 0); g.lineTo(332, 128); g.lineTo(286, 128); g.closePath(); g.fill(); }
    else if (style === 'chevron') { g.lineWidth = 14; g.beginPath(); g.moveTo(170, 24); g.lineTo(256, 64); g.lineTo(342, 24); g.stroke(); }
    else if (style === 'hoops') { g.fillRect(0, 36, 512, 10); g.fillRect(0, 82, 512, 10); }
    else if (style === 'split') { g.fillRect(256, 0, 256, 128); }
    g.restore();
    // custom jerseys keep thick team-colored trim so teams stay readable
    if (custom) {
      g.fillStyle = teamColor; g.fillRect(0, 0, 512, 18); g.fillRect(0, 110, 512, 18);
      g.fillStyle = acc; g.fillRect(0, 18, 512, 4); g.fillRect(0, 106, 512, 4);
    } else {
      g.fillStyle = acc; g.fillRect(0, 6, 512, 8); g.fillRect(0, 114, 512, 8);
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 512, 5);
    var num = (number < 10 ? '0' : '') + number;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // number / name / emblem in the accent color; on half & half (which straddles the
    // chest and back) use a bold contrasting outline so they read on both halves
    var split = style === 'split';
    var ink = split ? (luma(base) > 0.6 ? '#1c1c28' : '#ffffff') : acc;
    var outline = luma(ink) > 0.5 ? 'rgba(0,0,0,' + (split ? 0.85 : 0.35) + ')' : 'rgba(255,255,255,' + (split ? 0.85 : 0.45) + ')';
    g.strokeStyle = outline;
    g.fillStyle = ink;
    // front (u=0.5 with thetaStart = PI): crown emblem
    // outline the emblem so it stays readable over sashes / chevrons / stripes
    g.save(); g.lineWidth = split ? 6 : 9; g.lineJoin = 'round';
    if (!split) g.strokeStyle = base;
    drawCrownPath(g, 256, 66, 40); g.stroke(); g.restore();
    drawCrown(g, 256, 66, 40);
    // back (u=0 / 1, drawn on both edges so it wraps across the seam): name + number
    var nm = cleanJerseyName(name);
    var numY = nm ? 80 : 68;
    g.font = 'bold ' + (nm ? 58 : 72) + 'px Arial Black, Arial, sans-serif';
    g.lineWidth = 8;
    g.strokeText(num, 0, numY); g.fillText(num, 0, numY);
    g.strokeText(num, 512, numY); g.fillText(num, 512, numY);
    if (nm) {
      var fs = 30;
      g.font = 'bold ' + fs + 'px Arial Black, Arial, sans-serif';
      while (g.measureText(nm).width > 170 && fs > 16) { fs -= 2; g.font = 'bold ' + fs + 'px Arial Black, Arial, sans-serif'; }
      g.lineWidth = 5;
      g.strokeText(nm, 0, 34); g.fillText(nm, 0, 34);
      g.strokeText(nm, 512, 34); g.fillText(nm, 512, 34);
    }
    var t = new THREE.CanvasTexture(cv);
    return t;
  }

  function drawCrown(g, x, y, s) {
    drawCrownPath(g, x, y, s); g.fill();
  }
  function drawCrownPath(g, x, y, s) {
    g.beginPath();
    g.moveTo(x - s, y + s * 0.5);
    g.lineTo(x - s, y - s * 0.35);
    g.lineTo(x - s * 0.5, y + s * 0.05);
    g.lineTo(x, y - s * 0.6);
    g.lineTo(x + s * 0.5, y + s * 0.05);
    g.lineTo(x + s, y - s * 0.35);
    g.lineTo(x + s, y + s * 0.5);
    g.closePath();
  }

  var beanGeo = null, beanPts = null;
  function getBeanGeo() {
    if (beanGeo) return beanGeo;
    var prof = [[0.0, 0.26], [0.22, 0.27], [0.4, 0.32], [0.5, 0.42], [0.56, 0.6], [0.575, 0.85], [0.57, 1.1], [0.54, 1.3], [0.47, 1.5], [0.35, 1.64], [0.19, 1.72], [0.0, 1.745]];
    var pts = [], i;
    for (i = 0; i < prof.length; i++) pts.push(new THREE.Vector2(prof[i][0], prof[i][1]));
    var curve = new THREE.SplineCurve(pts);
    var sm = curve.getPoints(22);
    sm[0].x = 0; sm[sm.length - 1].x = 0;
    beanPts = sm;
    beanGeo = new THREE.LatheGeometry(sm, 22);
    beanGeo.computeVertexNormals();
    return beanGeo;
  }

  /* Body radius at height y (from the same smoothed profile the body mesh uses),
   * so outfits and hats are placed ON the surface instead of guessed. */
  var BEAN_TOP = 1.745;
  function bodyR(y) {
    getBeanGeo();
    var P = beanPts, i;
    if (y <= P[0].y) return P[0].x;
    for (i = 1; i < P.length; i++) {
      if (P[i].y >= y) {
        var a = P[i - 1], b = P[i], t = (y - a.y) / ((b.y - a.y) || 1);
        return a.x + (b.x - a.x) * t;
      }
    }
    return 0;
  }
  /* Outward surface normal (in the r/y plane) at height y. */
  function bodyN(y) {
    var d = 0.02, dr = (bodyR(y + d) - bodyR(y - d)) / (2 * d);
    var l = Math.sqrt(1 + dr * dr);
    return { r: 1 / l, y: -dr / l };
  }

  /* A shell that hugs the head: the bean profile from yFrom (to yTo, or the top)
   * pushed out along its normals by `off`. phiStart/phiLen give partial shells (hoods). */
  function headShell(yFrom, off, material, yTo, phiStart, phiLen, segs) {
    getBeanGeo();
    var P = beanPts, out = [], i, top = yTo || 99;
    function push(x, y, nx, ny) { out.push(new THREE.Vector2(Math.max(0, x + nx * off), y + ny * off)); }
    var n0 = bodyN(yFrom);
    push(bodyR(yFrom), yFrom, n0.r, n0.y);
    for (i = 1; i < P.length; i++) {
      var p = P[i];
      if (p.y <= yFrom + 0.005) continue;
      if (p.y >= top) break;
      var a = P[i - 1], b = P[Math.min(i + 1, P.length - 1)];
      var tx = b.x - a.x, ty = b.y - a.y, tl = Math.sqrt(tx * tx + ty * ty) || 1;
      var nx = ty / tl, ny = -tx / tl;
      if (p.x < 0.001) { nx = 0; ny = 1; }
      push(p.x, p.y, nx, ny);
    }
    if (yTo) { var n1 = bodyN(yTo); push(bodyR(yTo), yTo, n1.r, n1.y); }
    var geo = new THREE.LatheGeometry(out, segs || 22, phiStart || 0, phiLen || Math.PI * 2);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
  }

  function shadowAll(obj, cast) {
    obj.traverse(function (o) { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = false; } });
  }

  /* opts: { cosmetics, teamColor (css), number } */
  function build(opts) {
    var cos = opts.cosmetics || BBA.Settings.data.cosmetics;
    var team = opts.teamColor || '#2f7bff';
    var ch = { cos: cos, team: team, anim: null };
    var rootG = new THREE.Group();
    var pivot = new THREE.Group(); pivot.position.y = 0.85; rootG.add(pivot);
    var bodyG = new THREE.Group(); bodyG.position.y = -0.85; pivot.add(bodyG);

    // body
    var tex = bodyTexture(cos.color, cos.color2 || '#ffffff', cos.pattern);
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.5 });
    var body = new THREE.Mesh(getBeanGeo(), bodyMat);
    bodyG.add(body);
    ch.bodyMat = bodyMat;

    // face
    var faceG = new THREE.Group(); bodyG.add(faceG);
    buildFace(faceG, cos.face || 'classic');

    // arms
    function arm(side) {
      var p = new THREE.Group(); p.position.set(0.5 * side, 1.02, 0.02);
      var a = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.3, 8), bodyMat);
      a.position.y = -0.15;
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(cos.upper === 'none' ? cos.color : '#ffffff'));
      hand.position.y = -0.33;
      p.add(a); p.add(hand);
      p.rotation.z = 0.25 * side;
      bodyG.add(p);
      return p;
    }
    ch.armL = arm(1); ch.armR = arm(-1);

    // legs
    function leg(side) {
      var p = new THREE.Group(); p.position.set(0.2 * side, 0.34, 0);
      var shoeColor = cos.lower === 'boots' ? team : '#2b2b36';
      var l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 8), cos.lower === 'socks' ? mat('#ffffff') : bodyMat);
      l.position.y = -0.1;
      var foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(shoeColor));
      foot.scale.set(0.95, 0.6, 1.35); foot.position.set(0, -0.25, 0.05);
      p.add(l); p.add(foot);
      if (cos.lower === 'socks') {
        var sb = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.05, 8), mat(team)); sb.position.y = -0.06; p.add(sb);
      }
      bodyG.add(p);
      return p;
    }
    ch.legL = leg(1); ch.legR = leg(-1);

    // upper outfit
    var upper = cos.upper || 'jersey';
    var jc = cos.jerseyColor && cos.jerseyColor !== 'team' ? cos.jerseyColor : null;
    var jBase = jc || team;
    var jAcc = jerseyAccent(jBase, cos.jerseyColor2, team);
    if (upper === 'none') {
      var sash = new THREE.Mesh(new THREE.TorusGeometry(bodyR(0.9) + 0.035, 0.05, 6, 24), mat(team, { emissive: team, emissiveIntensity: 0.2 }));
      sash.rotation.x = Math.PI / 2; sash.rotation.y = 0.3; sash.position.y = 0.9;
      bodyG.add(sash);
    } else {
      var jn = opts.number !== undefined && opts.number !== null ? opts.number : (cos.number !== undefined ? cos.number : 7);
      var jt = jerseyTexture(team, jn, opts.jerseyName !== undefined ? opts.jerseyName : (cos.jerseyName || ''), jc, cos.jerseyColor2, cos.jerseyStyle);
      var jersey = new THREE.Mesh(new THREE.CylinderGeometry(0.59, 0.6, 0.55, 22, 1, true, Math.PI, Math.PI * 2),
        new THREE.MeshStandardMaterial({ map: jt, roughness: 0.7, side: THREE.DoubleSide }));
      jersey.position.y = 0.86;
      bodyG.add(jersey);
      // sleeves in the jersey color with an accent cuff
      var slv = mat(jBase), cuff = mat(jAcc);
      var arms2 = [ch.armL, ch.armR];
      for (var ai = 0; ai < 2; ai++) {
        var sl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), slv); sl.position.y = -0.05; arms2[ai].add(sl);
        var cf = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.03, 8), cuff); cf.position.y = -0.1; arms2[ai].add(cf);
      }
      if (upper === 'hoodie') {
        // hood hugs the back of the head, face stays open; stops below hats
        var hood = headShell(1.0, 0.07, mat(jBase, { side: THREE.DoubleSide }), 1.47, Math.PI * 0.5 - 0.35, Math.PI + 0.7, 16);
        bodyG.add(hood);
        var hrim = new THREE.Mesh(new THREE.TorusGeometry(bodyR(1.47) + 0.07, 0.04, 6, 16, Math.PI + 0.7), mat(jAcc));
        hrim.rotation.x = Math.PI / 2; hrim.rotation.z = Math.PI - 0.35; hrim.position.y = 1.47;
        bodyG.add(hrim);
        // drawstrings
        for (var ds = -1; ds <= 1; ds += 2) {
          var dsm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 5), mat(jAcc));
          dsm.position.set(0.12 * ds, 1.0, bodyR(1.0) + 0.03); bodyG.add(dsm);
        }
      } else if (upper === 'scarf') {
        var sy = 1.15, sr = bodyR(sy) + 0.03;
        var sc = new THREE.Mesh(new THREE.TorusGeometry(sr, 0.09, 8, 24), mat(jAcc));
        sc.rotation.x = Math.PI / 2; sc.position.y = sy; bodyG.add(sc);
        var tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.06), mat(jBase));
        tail.position.set(0.22, 0.95, bodyR(0.95) + 0.08); tail.rotation.z = 0.2; bodyG.add(tail);
      } else if (upper === 'bowtie') {
        var bt = mat('#e8283c'), bz = bodyR(1.14) + 0.05;
        var c1 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), bt); c1.rotation.z = Math.PI / 2; c1.position.set(0.08, 1.14, bz);
        var c2 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), bt); c2.rotation.z = -Math.PI / 2; c2.position.set(-0.08, 1.14, bz);
        bodyG.add(c1); bodyG.add(c2);
      } else if (upper === 'cape') {
        // hangs from the shoulders just outside the jersey; animation swings it backward only
        var cape = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0, 1, 4), new THREE.MeshStandardMaterial({ color: '#c01c3c', side: THREE.DoubleSide, roughness: 0.8 }));
        var capeP = new THREE.Group(); capeP.position.set(0, 1.3, -0.64); cape.position.y = -0.5; capeP.add(cape);
        capeP.rotation.x = 0.2;
        bodyG.add(capeP); ch.cape = capeP;
        var clasp = new THREE.Mesh(new THREE.TorusGeometry(bodyR(1.3) + 0.04, 0.035, 6, 20, Math.PI), mat('#c01c3c'));
        clasp.rotation.x = Math.PI / 2; clasp.rotation.z = Math.PI; clasp.position.y = 1.3; bodyG.add(clasp);
      }
    }

    // lower outfit
    var lower = cos.lower || 'shorts';
    if (lower === 'shorts') {
      var shTop = 0.58, shBot = 0.35;
      var sh = new THREE.Mesh(new THREE.CylinderGeometry(bodyR(shTop) + 0.025, bodyR(shBot) + 0.04, shTop - shBot, 20, 1, true), mat('#262633', { side: THREE.DoubleSide }));
      sh.position.y = (shTop + shBot) / 2; bodyG.add(sh);
      var st2 = new THREE.Mesh(new THREE.CylinderGeometry(bodyR(0.55) + 0.035, bodyR(0.55) + 0.035, 0.035, 20, 1, true), mat(team)); st2.position.y = 0.55; bodyG.add(st2);
    } else if (lower === 'tutu') {
      var tu = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.3, 18, 1, true), mat('#ff9ec8', { side: THREE.DoubleSide }));
      tu.position.y = 0.52; bodyG.add(tu);
    }

    // hat
    buildHat(bodyG, cos.hat || 'none', team, ch);

    // team ring on the floor (not rotated with body)
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 28), new THREE.MeshBasicMaterial({ color: team, transparent: true, opacity: 0.75, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    rootG.add(ring);
    ch.ring = ring;

    shadowAll(pivot, true);
    // merge static parts to cut draw calls (arms/legs/accessories stay animated)
    var dyn = [ch.armL, ch.armR, ch.legL, ch.legR, ch.cape, ch.propeller, ch.antenna];
    for (var di = 0; di < dyn.length; di++) if (dyn[di]) dyn[di].userData.dynamic = true;
    if (BBA.MeshUtil) {
      BBA.MeshUtil.mergeMeshes(bodyG);
      BBA.MeshUtil.mergeMeshes(ch.armL); BBA.MeshUtil.mergeMeshes(ch.armR);
    }
    ch.root = rootG; ch.pivot = pivot; ch.body = bodyG; ch.face = faceG;
    ch.anim = BBA.Anim ? BBA.Anim.create() : null;
    return ch;
  }

  function buildFace(g, face) {
    var skin = mat('#fff1dc', { roughness: 0.4 });
    var patch = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
    patch.scale.set(0.33, 0.27, 0.13); patch.position.set(0, 1.27, 0.46);
    if (face === 'visor') {
      var vis = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mat('#111522', { roughness: 0.2, metalness: 0.4 }));
      vis.scale.set(0.36, 0.2, 0.14); vis.position.set(0, 1.28, 0.47); g.add(vis);
      var glow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: '#46ff9a' }));
      glow.position.set(0, 1.29, 0.6); g.add(glow);
      return;
    }
    g.add(patch);
    var black = mat('#141418', { roughness: 0.3 });
    function eye(x, sy, sx) {
      var e = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), black);
      e.scale.set(0.055 * (sx || 1), 0.085 * sy, 0.035); e.position.set(x, 1.29, 0.575); g.add(e);
      var gl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }));
      gl.position.set(x + 0.018, 1.31 + 0.02 * sy, 0.605); g.add(gl);
      return e;
    }
    if (face === 'happy') {
      var arcM = black;
      for (var s = -1; s <= 1; s += 2) {
        var a = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 12, Math.PI), arcM);
        a.position.set(0.11 * s, 1.28, 0.58); g.add(a);
      }
      var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), black);
      mouth.rotation.z = Math.PI; mouth.position.set(0, 1.19, 0.58); g.add(mouth);
    } else if (face === 'fierce') {
      eye(0.11, 1); eye(-0.11, 1);
      var b1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.02), black); b1.position.set(0.11, 1.39, 0.585); b1.rotation.z = 0.35; g.add(b1);
      var b2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.02), black); b2.position.set(-0.11, 1.39, 0.585); b2.rotation.z = -0.35; g.add(b2);
    } else if (face === 'sleepy') {
      eye(0.11, 0.4); eye(-0.11, 0.4);
    } else if (face === 'shades') {
      var sm = mat('#0d0d12', { roughness: 0.15, metalness: 0.5 });
      var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.03), sm); l1.position.set(0.1, 1.3, 0.585); g.add(l1);
      var l2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.03), sm); l2.position.set(-0.1, 1.3, 0.585); g.add(l2);
      var br = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 0.02), sm); br.position.set(0, 1.335, 0.585); g.add(br);
    } else if (face === 'derp') {
      eye(0.12, 1.25, 1.2); eye(-0.1, 0.7, 0.8);
    } else {
      eye(0.11, 1); eye(-0.11, 1);
    }
  }

  /* Hats are built on the real head surface (bodyR / headShell) so nothing sinks
   * into the bean or floats above it. */
  function buildHat(g, hat, team, ch) {
    var TOP = BEAN_TOP, h, i;
    if (hat === 'cap') {
      var capY = 1.46;
      h = headShell(capY, 0.035, mat(team)); g.add(h);
      var cr = bodyR(capY) + 0.035;
      var band = new THREE.Mesh(new THREE.TorusGeometry(cr, 0.025, 6, 22), mat('#ffffff')); band.rotation.x = Math.PI / 2; band.position.y = capY + 0.01; g.add(band);
      var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 16, 1, false, -Math.PI / 2, Math.PI), mat(team));
      brim.position.set(0, capY + 0.01, cr - 0.08); brim.rotation.x = 0.12; g.add(brim);
      var btn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#ffffff')); btn.position.y = TOP + 0.045; g.add(btn);
    } else if (hat === 'beanie') {
      var bY = 1.44;
      h = headShell(bY, 0.05, mat('#ff6b6b')); g.add(h);
      var bnd = new THREE.Mesh(new THREE.TorusGeometry(bodyR(bY + 0.03) + 0.06, 0.055, 6, 22), mat('#ffffff'));
      bnd.rotation.x = Math.PI / 2; bnd.position.y = bY + 0.03; g.add(bnd);
      var pom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat('#ffffff')); pom.position.y = TOP + 0.05 + 0.08; g.add(pom);
    } else if (hat === 'crown') {
      var gold = mat('#ffc933', { metalness: 0.6, roughness: 0.3, emissive: '#553300', emissiveIntensity: 0.3, side: THREE.DoubleSide });
      var cy0 = 1.6, cy1 = 1.8, r0 = bodyR(cy0) + 0.025, r1 = r0 + 0.04;
      h = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, cy1 - cy0, 18, 1, true), gold); h.position.y = (cy0 + cy1) / 2; g.add(h);
      for (i = 0; i < 5; i++) {
        var a = i / 5 * Math.PI * 2;
        var sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 6), gold);
        sp.position.set(Math.sin(a) * r1, cy1 + 0.07, Math.cos(a) * r1); g.add(sp);
        var gem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(i % 2 ? '#39e6ff' : '#ff3b6b'));
        var gr = (r0 + r1) / 2 + 0.01;
        gem.position.set(Math.sin(a + 0.63) * gr, (cy0 + cy1) / 2, Math.cos(a + 0.63) * gr); g.add(gem);
      }
    } else if (hat === 'horns') {
      var hm = mat('#9aa3ad', { metalness: 0.5, roughness: 0.35 });
      var hY = 1.42;
      h = headShell(hY, 0.04, hm); g.add(h);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(bodyR(hY) + 0.045, 0.035, 6, 22), mat('#c9a13a', { metalness: 0.5, roughness: 0.4 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = hY; g.add(rim);
      for (var s = -1; s <= 1; s += 2) {
        var ky = 1.58, kr = bodyR(ky) + 0.04;
        var horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 8), mat('#fff3d6'));
        // base sits on the helmet surface, tip points up and out
        horn.rotation.z = -0.75 * s;
        horn.position.set(s * (kr + Math.sin(0.75) * 0.17), ky + Math.cos(0.75) * 0.17, 0); g.add(horn);
      }
    } else if (hat === 'propeller') {
      var pY = 1.54;
      h = headShell(pY, 0.035, mat('#ffd23f')); g.add(h);
      var pb = new THREE.Mesh(new THREE.TorusGeometry(bodyR(pY) + 0.035, 0.025, 6, 20), mat('#4f8bff')); pb.rotation.x = Math.PI / 2; pb.position.y = pY; g.add(pb);
      var rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), mat('#333333')); rod.position.y = TOP + 0.035 + 0.08; g.add(rod);
      var prop = new THREE.Group(); prop.position.y = TOP + 0.035 + 0.17;
      var b1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.1), mat('#ff4f4f')); prop.add(b1);
      var b2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.6), mat('#4f8bff')); prop.add(b2);
      g.add(prop); ch.propeller = prop;
    } else if (hat === 'cone') {
      var coneBase = 1.62, br = bodyR(coneBase) + 0.06;
      var base = new THREE.Mesh(new THREE.CylinderGeometry(br + 0.06, br + 0.06, 0.05, 4), mat('#ff7a1a'));
      base.rotation.y = Math.PI / 4; base.position.y = coneBase; g.add(base);
      var ch0 = 0.62, cr0 = bodyR(coneBase + 0.025) + 0.03;
      h = new THREE.Mesh(new THREE.ConeGeometry(cr0, ch0, 16), mat('#ff7a1a')); h.position.y = coneBase + 0.025 + ch0 / 2; g.add(h);
      var wy = coneBase + 0.025 + ch0 * 0.45, wr = cr0 * (1 - 0.45);
      var wb = new THREE.Mesh(new THREE.CylinderGeometry(wr - 0.02, wr + 0.03, 0.1, 16, 1, true), mat('#ffffff')); wb.position.y = wy; g.add(wb);
    } else if (hat === 'tophat') {
      var blk = mat('#1a1a22');
      var tY = 1.68;
      var br2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 18), blk); br2.position.y = tY; g.add(br2);
      var tr = Math.max(0.24, bodyR(tY + 0.02) + 0.02);
      h = new THREE.Mesh(new THREE.CylinderGeometry(tr, tr, 0.45, 18), blk); h.position.y = tY + 0.02 + 0.225; g.add(h);
      var rb = new THREE.Mesh(new THREE.CylinderGeometry(tr + 0.005, tr + 0.005, 0.08, 18, 1, true), mat(team)); rb.position.y = tY + 0.08; g.add(rb);
    } else if (hat === 'headphones') {
      var hp = mat('#2b2b36');
      // band is an arc of radius cupX around hpY; that clears the head everywhere above the cups
      var hpY = 1.25, cupX = bodyR(hpY) + 0.05;
      h = new THREE.Mesh(new THREE.TorusGeometry(cupX, 0.045, 6, 24, Math.PI), hp); h.position.y = hpY; g.add(h);
      for (var e2 = -1; e2 <= 1; e2 += 2) {
        var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 14), mat(team)); cup.rotation.z = Math.PI / 2; cup.position.set(cupX * e2, hpY, 0); g.add(cup);
        var pad = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), mat('#ffffff')); pad.rotation.z = Math.PI / 2; pad.position.set((cupX + 0.065) * e2, hpY, 0); g.add(pad);
      }
    } else if (hat === 'antenna') {
      var aBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 10), mat('#333333')); aBase.position.y = TOP; g.add(aBase);
      var st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), mat('#333333')); st.position.y = TOP + 0.18; g.add(st);
      var ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3df5' })); ball.position.y = TOP + 0.38; g.add(ball);
      ch.antenna = ball;
    } else if (hat === 'chef') {
      var w = mat('#ffffff');
      var fY = 1.56, fr = bodyR(fY) + 0.035;
      h = new THREE.Mesh(new THREE.CylinderGeometry(fr + 0.02, fr, 0.3, 18, 1, true), mat('#ffffff', { side: THREE.DoubleSide })); h.position.y = fY + 0.15; g.add(h);
      var lid = new THREE.Mesh(new THREE.CircleGeometry(fr + 0.02, 18), w); lid.rotation.x = -Math.PI / 2; lid.position.y = fY + 0.3; g.add(lid);
      for (var c = 0; c < 5; c++) {
        var ang = c / 5 * Math.PI * 2;
        var puff = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), w); puff.position.set(Math.cos(ang) * fr * 0.55, fY + 0.4, Math.sin(ang) * fr * 0.55); g.add(puff);
      }
      var puffT = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), w); puffT.position.y = fY + 0.5; g.add(puffT);
    } else if (hat === 'spikes') {
      // a ridge of spikes running down the back, each standing out along the surface normal
      for (var k = 0; k < 6; k++) {
        var yy = 1.66 - k * 0.19, rr = bodyR(yy), n = bodyN(yy);
        var sz = 0.26 - k * 0.025, sh = sz / 2 - 0.03;
        var spike = new THREE.Mesh(new THREE.ConeGeometry(0.1 - k * 0.008, sz, 5), mat('#6fdc4a'));
        // cone +y -> outward normal on the back (-z side)
        spike.rotation.x = Math.atan2(-n.r, n.y);
        spike.position.set(0, yy + n.y * sh, -(rr + n.r * sh)); g.add(spike);
      }
    }
  }

  function dispose(ch) {
    ch.root.traverse(function (o) {
      if (o.geometry && o.geometry !== beanGeo) o.geometry.dispose();
      if (o.material && o.material.map) o.material.map.dispose();
    });
  }

  BBA.Character = { build: build, dispose: dispose, COS: COS, jerseyTexture: jerseyTexture, jerseyAccent: jerseyAccent, bodyR: bodyR, cleanJerseyName: cleanJerseyName, drawCrown: drawCrown, star: star };
})(this);
