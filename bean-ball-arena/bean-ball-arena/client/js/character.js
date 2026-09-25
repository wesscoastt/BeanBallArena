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
    victories: [['backflip', 'Backflip'], ['bounce', 'Bouncy'], ['dance', 'Wiggle Dance']]
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

  function jerseyTexture(teamColor, number, hood) {
    var cv = makeCanvas(512, 128), g = cv.getContext('2d');
    g.fillStyle = teamColor; g.fillRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillRect(0, 6, 512, 8); g.fillRect(0, 114, 512, 8);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 512, 5);
    var num = (number < 10 ? '0' : '') + number;
    g.font = 'bold 72px Arial Black, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.25)';
    // front (u=0.5 with thetaStart = PI) : emblem ; back (u=0 / 1): number
    g.fillStyle = '#ffffff';
    // front crown emblem
    drawCrown(g, 256, 66, 40);
    g.strokeText(num, 0, 68); g.fillText(num, 0, 68);
    g.strokeText(num, 512, 68); g.fillText(num, 512, 68);
    var t = new THREE.CanvasTexture(cv);
    return t;
  }

  function drawCrown(g, x, y, s) {
    g.beginPath();
    g.moveTo(x - s, y + s * 0.5);
    g.lineTo(x - s, y - s * 0.35);
    g.lineTo(x - s * 0.5, y + s * 0.05);
    g.lineTo(x, y - s * 0.6);
    g.lineTo(x + s * 0.5, y + s * 0.05);
    g.lineTo(x + s, y - s * 0.35);
    g.lineTo(x + s, y + s * 0.5);
    g.closePath(); g.fill();
  }

  var beanGeo = null;
  function getBeanGeo() {
    if (beanGeo) return beanGeo;
    var prof = [[0.0, 0.26], [0.22, 0.27], [0.4, 0.32], [0.5, 0.42], [0.56, 0.6], [0.575, 0.85], [0.57, 1.1], [0.54, 1.3], [0.47, 1.5], [0.35, 1.64], [0.19, 1.72], [0.0, 1.745]];
    var pts = [], i;
    for (i = 0; i < prof.length; i++) pts.push(new THREE.Vector2(prof[i][0], prof[i][1]));
    var curve = new THREE.SplineCurve(pts);
    var sm = curve.getPoints(22);
    sm[0].x = 0; sm[sm.length - 1].x = 0;
    beanGeo = new THREE.LatheGeometry(sm, 22);
    beanGeo.computeVertexNormals();
    return beanGeo;
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
    if (upper === 'none') {
      var sash = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.05, 6, 24), mat(team, { emissive: team, emissiveIntensity: 0.2 }));
      sash.rotation.x = Math.PI / 2; sash.rotation.y = 0.3; sash.position.y = 0.9;
      bodyG.add(sash);
    } else {
      var jt = jerseyTexture(team, opts.number || cos.number || 7);
      var jersey = new THREE.Mesh(new THREE.CylinderGeometry(0.59, 0.6, 0.55, 22, 1, true, Math.PI, Math.PI * 2),
        new THREE.MeshStandardMaterial({ map: jt, roughness: 0.7, side: THREE.DoubleSide }));
      jersey.position.y = 0.86;
      bodyG.add(jersey);
      // sleeves
      var slv = mat(team);
      var s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), slv); s1.position.y = -0.05; ch.armL.add(s1);
      var s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), slv); s2.position.y = -0.05; ch.armR.add(s2);
      if (upper === 'hoodie') {
        var hood = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 8, 20, Math.PI * 1.2), mat(team));
        hood.position.set(0, 1.2, -0.1); hood.rotation.set(-0.3, 0, Math.PI * -0.1 - Math.PI * 0.0);
        hood.rotation.z = -Math.PI * 0.1 + Math.PI;
        bodyG.add(hood);
      } else if (upper === 'scarf') {
        var sc = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 8, 24), mat('#ffffff'));
        sc.rotation.x = Math.PI / 2; sc.position.y = 1.18; bodyG.add(sc);
        var tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.06), mat(team)); tail.position.set(0.25, 0.98, 0.45); tail.rotation.z = 0.2; bodyG.add(tail);
      } else if (upper === 'bowtie') {
        var bt = mat('#e8283c');
        var c1 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), bt); c1.rotation.z = Math.PI / 2; c1.position.set(0.08, 1.14, 0.56);
        var c2 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), bt); c2.rotation.z = -Math.PI / 2; c2.position.set(-0.08, 1.14, 0.56);
        bodyG.add(c1); bodyG.add(c2);
      } else if (upper === 'cape') {
        var cape = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0, 1, 4), new THREE.MeshStandardMaterial({ color: '#c01c3c', side: THREE.DoubleSide, roughness: 0.8 }));
        var capeP = new THREE.Group(); capeP.position.set(0, 1.3, -0.5); cape.position.y = -0.5; capeP.add(cape);
        bodyG.add(capeP); ch.cape = capeP;
      }
    }

    // lower outfit
    var lower = cos.lower || 'shorts';
    if (lower === 'shorts') {
      var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.45, 0.22, 20, 1, true), mat('#262633', { side: THREE.DoubleSide }));
      sh.position.y = 0.46; bodyG.add(sh);
      var st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.535, 0.535, 0.035, 20, 1, true), mat(team)); st2.position.y = 0.55; bodyG.add(st2);
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

  function buildHat(g, hat, team, ch) {
    var top = 1.62, h;
    if (hat === 'cap') {
      h = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(team));
      h.position.y = 1.5; h.scale.set(1, 0.75, 1); g.add(h);
      var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16, 1, false, -Math.PI / 2, Math.PI), mat(team));
      brim.position.set(0, 1.52, 0.3); g.add(brim);
    } else if (hat === 'beanie') {
      h = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff6b6b'));
      h.position.y = 1.45; h.scale.set(1, 0.9, 1); g.add(h);
      var band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 20), mat('#ffffff')); band.rotation.x = Math.PI / 2; band.position.y = 1.47; g.add(band);
      var pom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat('#ffffff')); pom.position.y = 1.85; g.add(pom);
    } else if (hat === 'crown') {
      var gold = mat('#ffc933', { metalness: 0.6, roughness: 0.3, emissive: '#553300', emissiveIntensity: 0.3 });
      h = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.16, 16, 1, true), gold); h.position.y = 1.72; g.add(h);
      for (var i = 0; i < 5; i++) {
        var a = i / 5 * Math.PI * 2;
        var sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 6), gold);
        sp.position.set(Math.sin(a) * 0.28, 1.87, Math.cos(a) * 0.28); g.add(sp);
      }
    } else if (hat === 'horns') {
      var hm = mat('#9aa3ad', { metalness: 0.5, roughness: 0.35 });
      h = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm); h.position.y = 1.46; h.scale.set(1, 0.8, 1); g.add(h);
      for (var s = -1; s <= 1; s += 2) {
        var horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 8), mat('#fff3d6'));
        horn.position.set(0.4 * s, 1.72, 0); horn.rotation.z = -0.7 * s; g.add(horn);
      }
    } else if (hat === 'propeller') {
      h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffd23f')); h.position.y = 1.62; g.add(h);
      var rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), mat('#333333')); rod.position.y = 1.97; g.add(rod);
      var prop = new THREE.Group(); prop.position.y = 2.06;
      var b1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.1), mat('#ff4f4f')); prop.add(b1);
      var b2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.6), mat('#4f8bff')); prop.add(b2);
      g.add(prop); ch.propeller = prop;
    } else if (hat === 'cone') {
      h = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 16), mat('#ff7a1a')); h.position.y = 1.95; g.add(h);
      var wb = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.1, 16, 1, true), mat('#ffffff')); wb.position.y = 1.95; g.add(wb);
      var base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.62), mat('#ff7a1a')); base.position.y = 1.66; g.add(base);
    } else if (hat === 'tophat') {
      var blk = mat('#1a1a22');
      h = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.45, 16), blk); h.position.y = 1.9; g.add(h);
      var br2 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 16), blk); br2.position.y = 1.69; g.add(br2);
      var rb = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.08, 16, 1, true), mat(team)); rb.position.y = 1.76; g.add(rb);
    } else if (hat === 'headphones') {
      var hp = mat('#2b2b36');
      h = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 6, 20, Math.PI), hp); h.position.y = 1.3; g.add(h);
      for (var e2 = -1; e2 <= 1; e2 += 2) {
        var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12), mat(team)); cup.rotation.z = Math.PI / 2; cup.position.set(0.53 * e2, 1.3, 0); g.add(cup);
      }
    } else if (hat === 'antenna') {
      var st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), mat('#333333')); st.position.y = 1.9; g.add(st);
      var ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3df5' })); ball.position.y = 2.12; g.add(ball);
      ch.antenna = ball;
    } else if (hat === 'chef') {
      var w = mat('#ffffff');
      h = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 16), w); h.position.y = 1.78; g.add(h);
      for (var c = 0; c < 4; c++) { var puff = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), w); puff.position.set(Math.cos(c * 1.57) * 0.14, 2.0, Math.sin(c * 1.57) * 0.14); g.add(puff); }
    } else if (hat === 'spikes') {
      for (var k = 0; k < 5; k++) {
        var ang = -0.4 + k * 0.35;
        var spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 5), mat('#6fdc4a'));
        var yy = 1.72 - k * 0.22, rr = 0.2 + k * 0.08;
        spike.position.set(0, Math.max(yy, 0.9), -rr - 0.12); spike.rotation.x = -ang - 0.5; g.add(spike);
      }
    }
  }

  function dispose(ch) {
    ch.root.traverse(function (o) {
      if (o.geometry && o.geometry !== beanGeo) o.geometry.dispose();
      if (o.material && o.material.map) o.material.map.dispose();
    });
  }

  BBA.Character = { build: build, dispose: dispose, COS: COS, jerseyTexture: jerseyTexture, drawCrown: drawCrown, star: star };
})(this);
