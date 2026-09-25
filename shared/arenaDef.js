/* BEAN BALL ARENA - shared/arenaDef.js
 * Arena registry. Every arena shares the same 3v3 core (40 x 68 court,
 * hoops at z = +/-26, elevated team spawn decks, hoop towers) and adds its own
 * features as data: blocks, ramps, pits (water/void), conveyor + ice surfaces,
 * bumper posts, spinning bars, swinging pendulums, bounce/launch pads,
 * bouncy walls and a gravity multiplier.
 *
 * The same data drives collision (sim, server) and visuals (client).
 * Node:    require('./arenaDef.js').get('factory')
 * Browser: BBA.Arenas.get('factory'); BBA.Arena = the active arena.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) { module.exports = mod; }
  else { root.BBA = root.BBA || {}; root.BBA.Arenas = mod; root.BBA.Arena = mod.get('bean_bowl'); }
})(this, function () {
  var HALF_W = 20, HALF_L = 34, PIT = -20;
  var G = 30; // player gravity for launch solves (scaled by arena gravity)

  /* ---------- helpers ---------- */
  function box(x0, x1, z0, z1, h, tag) { return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h: h, tag: tag || '' }; }
  // ramp rising along 'z' or 'x' from coordinate a (height ha) to b (height hb)
  function ramp(dir, x0, x1, z0, z1, a, ha, b, hb, tag) {
    var r = box(x0, x1, z0, z1, Math.max(ha, hb), tag);
    r.dir = dir; r.a = a; r.ha = ha; r.b = b; r.hb = hb;
    return r;
  }
  function mirrorX(list) { var out = []; list.forEach(function (p) { out.push(p); out.push(flip(p, -1, 1)); }); return out; }
  function mirrorZ(list) { var out = []; list.forEach(function (p) { out.push(p); out.push(flip(p, 1, -1)); }); return out; }
  function mirror4(list) { return mirrorZ(mirrorX(list)); }
  function flip(p, sx, sz) {
    var q = {}, k;
    for (k in p) q[k] = p[k];
    if (p.x0 !== undefined) {
      var ax = [p.x0 * sx, p.x1 * sx], az = [p.z0 * sz, p.z1 * sz];
      q.x0 = Math.min(ax[0], ax[1]); q.x1 = Math.max(ax[0], ax[1]); q.z0 = Math.min(az[0], az[1]); q.z1 = Math.max(az[0], az[1]);
    }
    if (p.dir === 'z' && sz < 0) { q.a = -p.a; q.b = -p.b; }
    if (p.dir === 'x' && sx < 0) { q.a = -p.a; q.b = -p.b; }
    if (p.x !== undefined) q.x = p.x * sx;
    if (p.z !== undefined) q.z = p.z * sz;
    if (p.vx !== undefined) q.vx = p.vx * sx;
    if (p.vz !== undefined) q.vz = p.vz * sz;
    if (p.tx !== undefined) q.tx = p.tx * sx;
    if (p.tz !== undefined) q.tz = p.tz * sz;
    if (p.w !== undefined && sx * sz < 0) q.w = -p.w;
    return q;
  }
  function inside(p, x, z) { return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1; }
  function rampHeight(r, x, z) {
    var c = r.dir === 'z' ? z : x;
    var t = (c - r.a) / (r.b - r.a);
    if (t < 0) t = 0; if (t > 1) t = 1;
    return r.ha + (r.hb - r.ha) * t;
  }

  /* ---------- shared core ---------- */
  var HOOPS = [
    { team: 0, x: 0, y: 5.0, z: -26, side: -1, ringR: 1.5, tube: 0.13, boardZ: -27.6, boardThick: 0.25, boardHalfW: 3.2, boardBottom: 4.2, boardTop: 8.2, threeDist: 12 },
    { team: 1, x: 0, y: 5.0, z: 26, side: 1, ringR: 1.5, tube: 0.13, boardZ: 27.6, boardThick: 0.25, boardHalfW: 3.2, boardBottom: 4.2, boardTop: 8.2, threeDist: 12 }
  ];
  var DECK = { xIn: 7.5, xOut: 20, zFront: 28.5, zBack: 34, h: 7, conveyor: 2.6 };
  var TOWER = { halfW: 3.5, z: 30.2, h: 11 };
  var SPAWNS = [
    [{ x: -14, z: -31.2 }, { x: 14, z: -31.2 }, { x: -10.5, z: -32.2 }, { x: 10.5, z: -32.2 }, { x: -17, z: -32.2 }, { x: 17, z: -32.2 }],
    [{ x: 14, z: 31.2 }, { x: -14, z: 31.2 }, { x: 10.5, z: 32.2 }, { x: -10.5, z: 32.2 }, { x: 17, z: 32.2 }, { x: -17, z: 32.2 }]
  ];
  var HOOP_PADS = mirror4([{ type: 'bounce', x: 3.4, z: 20.8, y: 0, r: 1.1, vy: 15 }]);

  function launchPad(x, z, y, tx, tz, ty, T) {
    return { type: 'launch', x: x, z: z, y: y, r: 1.0, tx: tx, ty: ty, tz: tz, T: T, launchT: T * 0.85 };
  }

  /* Build a complete arena object from a spec. */
  function build(spec) {
    var A = {
      id: spec.id, name: spec.name, blurb: spec.blurb || '', theme: spec.theme || {},
      halfW: HALF_W, halfL: HALF_L, wallH: 16, ceiling: 19,
      DECK: DECK, TOWER: TOWER, hoops: HOOPS, spawns: SPAWNS,
      ballSpawn: spec.ballSpawn || { x: 0, y: 7, z: 0 },
      gravity: spec.gravity || 1,
      bounceWalls: !!spec.bounceWalls,
      wallRest: spec.bounceWalls ? 0.95 : 0.72,
      posts: spec.posts || [],
      arms: spec.arms || [],
      swingers: spec.swingers || [],
      pads: (spec.pads || []).slice(),
      pits: spec.pits || [],
      pitKind: spec.pitKind || 'void',
      blocks: [], ramps: [], conveyors: [], ice: spec.ice || [],
      decor: spec.decor || {}
    };
    // core solids: decks + towers
    var core = mirrorX([box(DECK.xIn, DECK.xOut, DECK.zFront, DECK.zBack, DECK.h, 'deck'), box(DECK.xIn, DECK.xOut, -DECK.zBack, -DECK.zFront, DECK.h, 'deck')]);
    core.push(box(-TOWER.halfW, TOWER.halfW, TOWER.z, HALF_L, TOWER.h, 'tower'));
    core.push(box(-TOWER.halfW, TOWER.halfW, -HALF_L, -TOWER.z, TOWER.h, 'tower'));
    A.blocks = core.concat(spec.blocks || []);
    A.ramps = spec.ramps || [];
    // deck conveyors push toward the court
    A.conveyors = [
      { x0: DECK.xIn, x1: DECK.xOut, z0: DECK.zFront, z1: DECK.zBack, vx: 0, vz: -DECK.conveyor, deck: true },
      { x0: -DECK.xOut, x1: -DECK.xIn, z0: DECK.zFront, z1: DECK.zBack, vx: 0, vz: -DECK.conveyor, deck: true },
      { x0: DECK.xIn, x1: DECK.xOut, z0: -DECK.zBack, z1: -DECK.zFront, vx: 0, vz: DECK.conveyor, deck: true },
      { x0: -DECK.xOut, x1: -DECK.xIn, z0: -DECK.zBack, z1: -DECK.zFront, vx: 0, vz: DECK.conveyor, deck: true }
    ].concat(spec.conveyors || []);
    // launch pads with a target and no explicit T get a default
    A.pads.forEach(function (p) { if (p.type === 'launch' && !p.T) { p.T = 1.05; p.launchT = 0.9; } });

    A.groundHeight = function (x, z) {
      var h = 0, i, p;
      for (i = 0; i < A.pits.length; i++) { if (inside(A.pits[i], x, z)) { h = PIT; break; } }
      for (i = 0; i < A.blocks.length; i++) { p = A.blocks[i]; if (inside(p, x, z) && p.h > h) h = p.h; }
      for (i = 0; i < A.ramps.length; i++) { p = A.ramps[i]; if (inside(p, x, z)) { var rh = rampHeight(p, x, z); if (rh > h) h = rh; } }
      return h;
    };
    A.rampAt = function (x, z) {
      var best = null, bh = -1e9, i;
      for (i = 0; i < A.ramps.length; i++) { var p = A.ramps[i]; if (inside(p, x, z)) { var rh = rampHeight(p, x, z); if (rh > bh) { bh = rh; best = p; } } }
      if (!best) return null;
      // a block on top wins
      for (i = 0; i < A.blocks.length; i++) { if (inside(A.blocks[i], x, z) && A.blocks[i].h >= bh) return null; }
      return best;
    };
    A.isRamp = function (x, z) { return !!A.rampAt(x, z); };
    A.rampNormal = function (x, z) {
      var r = A.rampAt(x, z);
      if (!r) return { x: 0, y: 1, z: 0 };
      var slope = (r.hb - r.ha) / (r.b - r.a);
      var nx = r.dir === 'x' ? -slope : 0, nz = r.dir === 'z' ? -slope : 0;
      var l = Math.sqrt(nx * nx + 1 + nz * nz);
      return { x: nx / l, y: 1 / l, z: nz / l };
    };
    A.isPit = function (x, z) { return A.groundHeight(x, z) < -1; };
    A.onDeck = function (x, z) {
      var ax = x < 0 ? -x : x, az = z < 0 ? -z : z;
      return ax >= DECK.xIn && az >= DECK.zFront;
    };
    /* surface under a point: conveyor velocity + ice flag */
    A.surface = function (x, z, out) {
      out = out || {};
      out.vx = 0; out.vz = 0; out.ice = false; out.moving = false;
      var i, c;
      for (i = 0; i < A.conveyors.length; i++) { c = A.conveyors[i]; if (inside(c, x, z)) { out.vx = c.vx; out.vz = c.vz; out.moving = true; break; } }
      for (i = 0; i < A.ice.length; i++) { if (inside(A.ice[i], x, z)) { out.ice = true; break; } }
      return out;
    };
    A.conveyor = function (x, z, out) {
      var s = A.surface(x, z, out);
      if (!s.moving) return null;
      s.x = s.vx; s.z = s.vz;
      return s;
    };
    A.armAngle = function (arm, t, speedMul) {
      return arm.phase + arm.w * t * (speedMul === undefined ? 1 : speedMul);
    };
    /* pendulum position at time t */
    A.swingPos = function (s, t, speedMul, out) {
      out = out || {};
      var th = s.amp * Math.sin(s.w * t * (speedMul === undefined ? 1 : speedMul) + s.phase);
      var off = Math.sin(th) * s.len;
      out.x = s.x + (s.axis === 'x' ? off : 0);
      out.z = s.z + (s.axis === 'z' ? off : 0);
      out.y = s.py - Math.cos(th) * s.len;
      var dth = s.amp * Math.cos(s.w * t * (speedMul === undefined ? 1 : speedMul) + s.phase) * s.w * (speedMul === undefined ? 1 : speedMul);
      var v = Math.cos(th) * s.len * dth;
      out.vx = s.axis === 'x' ? v : 0; out.vz = s.axis === 'z' ? v : 0;
      return out;
    };
    /* nearest safe standing spot (for warm-up / respawn helpers) */
    A.safeSpot = function (x, z) {
      var r, a, tx, tz;
      if (A.groundHeight(x, z) === 0) return { x: x, z: z };
      for (r = 1; r < 12; r += 1) for (a = 0; a < 16; a++) {
        tx = x + Math.cos(a / 16 * Math.PI * 2) * r; tz = z + Math.sin(a / 16 * Math.PI * 2) * r;
        if (Math.abs(tx) < HALF_W - 1 && Math.abs(tz) < HALF_L - 6 && A.groundHeight(tx, tz) === 0) return { x: tx, z: tz };
      }
      return { x: 0, z: 0 };
    };

    // bot navigation nodes: around every raised block / pit, plus ramp ends
    var nodes = [], off = 1.0;
    function addNode(x, z) {
      if (Math.abs(x) > HALF_W - 0.8 || Math.abs(z) > HALF_L - 0.8) return;
      var h = A.groundHeight(x, z);
      if (h < -1 || h > 6) return;
      for (var i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].x - x) < 0.6 && Math.abs(nodes[i].z - z) < 0.6) return;
      nodes.push({ x: x, z: z });
    }
    A.blocks.concat(A.pits).forEach(function (b) {
      if (b.tag === 'tower' || b.tag === 'deck') return;
      if (b.h !== undefined && b.h < 0.45 && b.h >= 0) return;
      addNode(b.x0 - off, b.z0 - off); addNode(b.x1 + off, b.z0 - off);
      addNode(b.x0 - off, b.z1 + off); addNode(b.x1 + off, b.z1 + off);
    });
    A.ramps.forEach(function (r) {
      var cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      var sgn = r.b > r.a ? 1 : -1;
      if (r.dir === 'z') { addNode(cx, r.a - sgn * 0.8); addNode(cx, r.b + sgn * 0.8); }
      else { addNode(r.a - sgn * 0.8, cz); addNode(r.b + sgn * 0.8, cz); }
    });
    (spec.nav || []).forEach(function (n) { addNode(n.x, n.z); });
    A.navNodes = nodes;
    A.warmSpots = function (team, k) {
      var side = team === 0 ? -1 : 1;
      return A.safeSpot(-6 + (k % 3) * 6 + (k >= 3 ? 3 : 0), side * (7 + (k >= 3 ? 3 : 0)));
    };
    return A;
  }

  /* =================== ARENAS =================== */
  var SPECS = [];

  /* ---- 1. Bean Bowl Stadium (the original) ---- */
  (function () {
    var P = { xIn: 11, xOut: 20, zRamp: 3.5, zTop: 9, zEnd: 16, h: 2.5, railW: 0.35, railH: 0.6, gapA: 11.8, gapB: 13.4 };
    var blocks = mirror4([
      box(P.xIn, P.xOut, P.zTop, P.zEnd, P.h, 'plat'),
      box(P.xIn, P.xIn + P.railW, P.zTop, P.gapA, P.h + P.railH, 'rail'),
      box(P.xIn, P.xIn + P.railW, P.gapB, P.zEnd, P.h + P.railH, 'rail')
    ]);
    var ramps = mirror4([ramp('z', P.xIn, P.xOut, P.zRamp, P.zTop, P.zRamp, 0, P.zTop, P.h, 'ramp')]);
    SPECS.push({
      id: 'bean_bowl', name: 'Bean Bowl Stadium', blurb: 'The classic: ramps, launch pads and spinning bars.',
      theme: { kind: 'stadium', floor: ['#5572ff', '#f28d3c', '#ffa04a', '#ff5470'], plat: '#8c6cff', platSide: '#4a3bb3', trim: '#ffc93c', sky: ['#2f6fe0', '#8fd0ff', '#ffd9a8'], fog: '#a9dcff', tile: 'rgba(255,255,255,0.07)' },
      blocks: blocks, ramps: ramps,
      posts: [{ x: -5.5, z: 0, r: 0.9, h: 1.8 }, { x: 5.5, z: 0, r: 0.9, h: 1.8 }],
      arms: [
        { x: 0, z: -11, len: 4.2, r: 0.38, y: 0.6, top: 1.0, w: 1.15, phase: 0, hubR: 0.6, hubH: 1.4 },
        { x: 0, z: 11, len: 4.2, r: 0.38, y: 0.6, top: 1.0, w: -1.15, phase: 0.8, hubR: 0.6, hubH: 1.4 }
      ],
      pads: HOOP_PADS.concat(mirror4([launchPad(15.5, 14.2, 2.5, 0.4, 24.6, 3.6, 1.05)])),
      nav: mirror4([{ x: 12.2, z: 12.6 }, { x: 15.5, z: 2.6 }, { x: 15.5, z: 9.8 }, { x: 10.2, z: 3.8 }, { x: 10.2, z: 16.9 }, { x: 15.5, z: 17.2 }])
    });
  })();

  /* ---- 2. Rooftop Rumble: roof gaps, raised side paths, center stage ---- */
  (function () {
    var blocks = mirrorX([box(14, 20, -20, 20, 1.2, 'path')]).concat([box(-3, 3, -3, 3, 0.8, 'stage')]);
    var ramps = mirror4([
      ramp('z', 14, 20, 20, 24, 24, 0, 20, 1.2, 'ramp'),      // side path down to the hoop ends
      ramp('x', 11.5, 14, -2, 2, 11.5, 0, 14, 1.2, 'bridge')  // bridges from the court up to the side paths
    ]);
    SPECS.push({
      id: 'rooftop', name: 'Rooftop Rumble', blurb: 'High above the city. Mind the gaps!',
      theme: { kind: 'rooftop', floor: ['#3f6dff', '#f7a95a', '#ffc27a', '#ff6f7a'], plat: '#ff9f43', platSide: '#8a4a1f', trim: '#ffe066', sky: ['#1f64e0', '#7ec8ff', '#ffe0b8'], fog: '#bfe3ff', tile: 'rgba(255,255,255,0.1)' },
      blocks: blocks, ramps: ramps,
      pits: mirror4([box(11.5, 14, 2, 20, 0, 'gap')]),
      pitKind: 'city',
      posts: mirror4([{ x: 7.5, z: 12.5, r: 0.9, h: 1.6 }]),
      pads: HOOP_PADS.concat(mirror4([launchPad(17, 16.5, 1.2, 0.4, 24.6, 3.6, 1.05)])).concat(mirrorX([{ type: 'bounce', x: 8, z: 0, y: 0, r: 1.1, vy: 15 }])),
      nav: mirror4([{ x: 10.5, z: 1 }, { x: 15, z: 0.5 }, { x: 17, z: 19 }, { x: 17, z: 25 }, { x: 10.5, z: 21 }])
    });
  })();

  /* ---- 3. Factory Floor: conveyor belts, spinning bars, catwalks, crates ---- */
  (function () {
    var blocks = mirror4([box(13, 20, 6, 15, 2.2, 'catwalk')]).concat(mirrorX([box(9.5, 11.5, -1.5, 1.5, 1.4, 'crate')]));
    var ramps = mirror4([ramp('z', 13, 20, 15, 19.5, 19.5, 0, 15, 2.2, 'ramp')]);
    SPECS.push({
      id: 'factory', name: 'Factory Floor', blurb: 'Conveyor belts move you and the ball.',
      theme: { kind: 'factory', floor: ['#4a6fd8', '#8a8f9c', '#a0a4ad', '#d8604a'], plat: '#e0a13a', platSide: '#5a5f6e', trim: '#ffd23f', sky: ['#3a4a6a', '#8a9ab8', '#d8c8a8'], fog: '#9aa6bb', tile: 'rgba(0,0,0,0.08)' },
      blocks: blocks, ramps: ramps,
      conveyors: [
        { x0: -9, x1: -6, z0: -21, z1: 21, vx: 0, vz: 4.2 },
        { x0: 6, x1: 9, z0: -21, z1: 21, vx: 0, vz: -4.2 },
        { x0: -4.5, x1: 4.5, z0: -1.4, z1: 1.4, vx: 3.2, vz: 0 }
      ],
      arms: [
        { x: 0, z: -12, len: 4.4, r: 0.4, y: 0.6, top: 1.0, w: 1.3, phase: 0, hubR: 0.6, hubH: 1.4 },
        { x: 0, z: 12, len: 4.4, r: 0.4, y: 0.6, top: 1.0, w: -1.3, phase: 1.1, hubR: 0.6, hubH: 1.4 }
      ],
      pads: HOOP_PADS.concat(mirror4([launchPad(16.5, 7.5, 2.2, 0.4, 24.6, 3.6, 1.1)])),
      nav: mirror4([{ x: 12, z: 5 }, { x: 12, z: 16 }, { x: 16.5, z: 20.5 }])
    });
  })();

  /* ---- 4. Neon Dome: bouncy walls, light bridges, spinning discs ---- */
  (function () {
    var blocks = mirrorX([box(14, 17, -17, 17, 1.8, 'bridge')]);
    var ramps = mirror4([ramp('z', 14, 17, 17, 22, 22, 0, 17, 1.8, 'ramp')]);
    SPECS.push({
      id: 'neon', name: 'Neon Dome', blurb: 'Bouncy walls and light bridges under the dome.',
      theme: { kind: 'neon', floor: ['#3a2bd8', '#2a1060', '#3a1a80', '#d82a8a'], plat: '#20e0ff', platSide: '#2a1060', trim: '#ff3df5', sky: ['#0b0620', '#2a1060', '#6a1a9a'], fog: '#2a1060', tile: 'rgba(120,200,255,0.1)', grid: '#45e8ff', dark: true },
      bounceWalls: true,
      blocks: blocks, ramps: ramps,
      arms: [
        { x: -7, z: 0, len: 3.2, r: 0.36, y: 0.6, top: 1.0, w: 1.6, phase: 0, hubR: 0.6, hubH: 1.2 },
        { x: 7, z: 0, len: 3.2, r: 0.36, y: 0.6, top: 1.0, w: -1.6, phase: 0.5, hubR: 0.6, hubH: 1.2 }
      ],
      pads: HOOP_PADS.concat(mirror4([{ type: 'bounce', x: 5, z: 8, y: 0, r: 1.1, vy: 15 }])).concat(mirrorZ([launchPad(15.5, 12, 1.8, 0.4, 24.6, 3.6, 1.05), launchPad(-15.5, 12, 1.8, -0.4, 24.6, 3.6, 1.05)])),
      nav: mirror4([{ x: 12.5, z: 18 }, { x: 18.5, z: 18 }, { x: 15.5, z: 23 }])
    });
  })();

  /* ---- 5. Pirate Pit: water channels, bridges, swinging cannonballs, ship decks, cannons ---- */
  (function () {
    // water channels across the court at |z| 9..13, broken by three bridges
    var pits = mirrorZ([box(-20, -10.5, 9.5, 12.5), box(-5, -2.5, 9.5, 12.5), box(2.5, 5, 9.5, 12.5), box(10.5, 20, 9.5, 12.5)]);
    var blocks = mirror4([box(12, 20, 17, 23.5, 2.0, 'ship')]);
    var ramps = mirror4([ramp('z', 12, 20, 13.2, 17, 13.2, 0, 17, 2.0, 'ramp')]);
    SPECS.push({
      id: 'pirate', name: 'Pirate Pit', blurb: 'Cross the bridges. Dodge the cannonballs. Don\'t fall in.',
      theme: { kind: 'pirate', floor: ['#4a7fd8', '#d9a864', '#e8bd7a', '#d86a4a'], plat: '#8a5a36', platSide: '#5a3a1e', trim: '#f0d48a', sky: ['#2a8ae0', '#8ed6ff', '#fff0c8'], fog: '#bfeaff', tile: 'rgba(90,50,20,0.12)', planks: true },
      blocks: blocks, ramps: ramps, pits: pits, pitKind: 'water',
      swingers: mirrorZ([
        { x: -7.75, z: 11, py: 7.5, len: 6.5, axis: 'x', amp: 0.6, w: 1.5, phase: 0, r: 0.95 },
        { x: 0, z: 11, py: 7.5, len: 6.5, axis: 'x', amp: 0.6, w: 1.5, phase: 2.1, r: 0.95 },
        { x: 7.75, z: 11, py: 7.5, len: 6.5, axis: 'x', amp: 0.6, w: 1.5, phase: 4.2, r: 0.95 }
      ]),
      posts: mirrorX([{ x: 6, z: 0, r: 0.8, h: 1.4 }]),
      pads: HOOP_PADS.concat(mirror4([launchPad(16, 21.5, 2.0, 0.4, 24.8, 3.6, 0.85)])),
      nav: mirror4([{ x: 7.75, z: 8 }, { x: 7.75, z: 14 }, { x: 0, z: 8 }, { x: 0, z: 14 }])
    });
  })();

  /* ---- 6. Space Court: low gravity, floating platforms, jump pads, void holes ---- */
  (function () {
    var blocks = mirror4([box(7, 11, 4, 8, 2.8, 'float')]).concat(mirrorZ([box(-2.5, 2.5, 14.5, 17.5, 2.8, 'float')]));
    SPECS.push({
      id: 'space', name: 'Space Court', blurb: 'Low gravity. Huge jumps. Don\'t float into the void.',
      theme: { kind: 'space', floor: ['#3a5aff', '#2a2f6a', '#343a82', '#d83a8a'], plat: '#8a6cff', platSide: '#2a2060', trim: '#39e6ff', sky: ['#05050f', '#10103a', '#2a1a5a'], fog: '#10103a', tile: 'rgba(140,160,255,0.08)', grid: '#6a7cff', dark: true, stars: true },
      gravity: 0.62,
      blocks: blocks,
      pits: mirror4([box(16, 20, 8, 18, 0, 'void')]),
      pitKind: 'void',
      posts: mirrorX([{ x: 4.5, z: 0, r: 1.1, h: 1.6 }]),
      pads: HOOP_PADS.concat(mirrorX([{ type: 'bounce', x: 13, z: 0, y: 0, r: 1.1, vy: 15 }])).concat(mirror4([{ type: 'bounce', x: 13, z: 21, y: 0, r: 1.1, vy: 15 }])),
      nav: mirror4([{ x: 14.8, z: 13 }, { x: 14.8, z: 7 }, { x: 14.8, z: 19 }])
    });
  })();

  /* ---- 7. Snowy Summit: icy midfield, icy ramps, snow bumpers, bridges ---- */
  (function () {
    var blocks = mirror4([box(12, 20, 10, 17, 2.4, 'bridge')]);
    var ramps = mirror4([ramp('z', 12, 20, 5, 10, 5, 0, 10, 2.4, 'ramp')]);
    SPECS.push({
      id: 'snowy', name: 'Snowy Summit', blurb: 'Slippery ice in the middle. Plan your stops!',
      theme: { kind: 'snow', floor: ['#5a86f0', '#a9d2f5', '#c8e4fb', '#f07a90'], plat: '#7fb2e6', platSide: '#4a78b0', trim: '#ffffff', sky: ['#6aa8e8', '#cfe8ff', '#ffffff'], fog: '#e8f4ff', tile: 'rgba(60,110,190,0.10)', snow: true },
      blocks: blocks, ramps: ramps,
      ice: [box(-20, 20, -6.5, 6.5, 0, 'ice')].concat(mirror4([box(12, 20, 5, 10, 0, 'ice')])),
      posts: [{ x: -6, z: 0, r: 1.1, h: 1.6 }, { x: 6, z: 0, r: 1.1, h: 1.6 }, { x: 0, z: -13, r: 1.0, h: 1.5 }, { x: 0, z: 13, r: 1.0, h: 1.5 }],
      pads: HOOP_PADS.concat(mirror4([launchPad(16, 15.5, 2.4, 0.4, 24.6, 3.6, 1.05)])),
      nav: mirror4([{ x: 16, z: 4 }, { x: 16, z: 11 }, { x: 10.8, z: 18 }])
    });
  })();

  var REG = {}, LIST = [];
  SPECS.forEach(function (s) { var a = build(s); REG[a.id] = a; LIST.push({ id: a.id, name: a.name, blurb: a.blurb }); });

  return {
    list: LIST,
    ids: LIST.map(function (l) { return l.id; }),
    get: function (id) { return REG[id] || REG.bean_bowl; },
    DEFAULT: 'bean_bowl',
    PIT: PIT
  };
});
