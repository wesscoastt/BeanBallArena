/* BEAN BALL ARENA - shared/arenaDef.js
 * Collision/gameplay definition of the first arena, "Bean Bowl Stadium".
 * Pure data + analytic height field so the exact same collision runs on
 * client (offline) and server (online). Visuals live in client/js/arena.js.
 *
 * Layout (top-down, +z is toward RED's hoop):
 *
 *            BLUE HOOP (z=-26)      <- Blue defends, Red attacks
 *      platform/ramp  bounce  platform/ramp
 *                 spinning arm
 *        post      MIDFIELD      post
 *                 spinning arm
 *      platform/ramp  bounce  platform/ramp
 *            RED HOOP (z=+26)       <- Red defends, Blue attacks
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) { module.exports = mod; }
  else { root.BBA = root.BBA || {}; root.BBA.Arena = mod; }
})(this, function () {
  var A = {};
  A.id = 'bean_bowl';
  A.name = 'Bean Bowl Stadium';

  A.halfW = 20;
  A.halfL = 34;

  /* Elevated team spawn decks (Crown-Jam style drop-in): every team starts
   * high up behind its own hoop and jumps down onto the court when the
   * countdown ends. A gentle conveyor pushes anyone (and the ball) toward the
   * edge so nobody camps up there; the decks can't be reached from below. */
  A.DECK = { xIn: 7.5, xOut: 20, zFront: 28.5, zBack: 34, h: 7, conveyor: 2.6, lip: 0.25 };
  A.wallH = 16;     // ball bounces off the (glass) walls up to this height
  A.ceiling = 19;

  // Side platforms against the long walls, with ramps rising from midfield.
  A.PLAT = {
    xIn: 11, xOut: 20,
    zRamp: 3.5, zTop: 9, zEnd: 16,
    h: 2.5,
    railW: 0.35, railH: 0.6,
    gapA: 11.8, gapB: 13.4     // walk-off gap in the inner rail
  };

  // Hoop support tower behind each backboard (solid, unclimbable)
  A.TOWER = { halfW: 3.5, z: 30.2, h: 11 };

  A.hoops = [
    { team: 0, x: 0, y: 5.0, z: -26, side: -1, ringR: 1.5, tube: 0.13,
      boardZ: -27.6, boardThick: 0.25, boardHalfW: 3.2, boardBottom: 4.2, boardTop: 8.2, threeDist: 12 },
    { team: 1, x: 0, y: 5.0, z: 26, side: 1, ringR: 1.5, tube: 0.13,
      boardZ: 27.6, boardThick: 0.25, boardHalfW: 3.2, boardBottom: 4.2, boardTop: 8.2, threeDist: 12 }
  ];

  A.posts = [
    { x: -5.5, z: 0, r: 0.9, h: 1.8 },
    { x: 5.5, z: 0, r: 0.9, h: 1.8 }
  ];

  // Rotating bumper bars (full bar spins around hub). angle = phase + w * t
  A.arms = [
    { x: 0, z: -11, len: 4.2, r: 0.38, y: 0.6, top: 1.0, w: 1.15, phase: 0, hubR: 0.6, hubH: 1.4 },
    { x: 0, z: 11, len: 4.2, r: 0.38, y: 0.6, top: 1.0, w: -1.15, phase: 0.8, hubR: 0.6, hubH: 1.4 }
  ];

  var G = 30; // player gravity used for launch pad solve

  function launchPad(x, z, y, tx, tz, ty, T) {
    return {
      type: 'launch', x: x, z: z, y: y, r: 1.0, tx: tx, ty: ty, tz: tz, T: T,
      vx: (tx - x) / T, vz: (tz - z) / T, vy: (ty - y + 0.5 * G * T * T) / T, launchT: T * 0.85
    };
  }

  A.pads = [
    { type: 'bounce', x: -3.4, z: -20.8, y: 0, r: 1.1, vy: 15 },
    { type: 'bounce', x: 3.4, z: -20.8, y: 0, r: 1.1, vy: 15 },
    { type: 'bounce', x: -3.4, z: 20.8, y: 0, r: 1.1, vy: 15 },
    { type: 'bounce', x: 3.4, z: 20.8, y: 0, r: 1.1, vy: 15 },
    // launch pads on the platforms fling players toward the enemy hoop front
    launchPad(-15.5, 14.2, 2.5, -0.4, 24.6, 3.6, 1.05),
    launchPad(15.5, 14.2, 2.5, 0.4, 24.6, 3.6, 1.05),
    launchPad(-15.5, -14.2, 2.5, -0.4, -24.6, 3.6, 1.05),
    launchPad(15.5, -14.2, 2.5, 0.4, -24.6, 3.6, 1.05)
  ];

  A.ballSpawn = { x: 0, y: 7, z: 0 };

  // Team spawns on the decks: team 0 (blue) behind z=-26, team 1 (red) mirrored
  A.spawns = [
    [{ x: -14, z: -31.2 }, { x: 14, z: -31.2 }, { x: -10.5, z: -32.2 }, { x: 10.5, z: -32.2 }, { x: -17, z: -32.2 }, { x: 17, z: -32.2 }],
    [{ x: 14, z: 31.2 }, { x: -14, z: 31.2 }, { x: 10.5, z: 32.2 }, { x: -10.5, z: 32.2 }, { x: 17, z: 32.2 }, { x: -17, z: 32.2 }]
  ];

  A.onDeck = function (x, z) {
    var D = A.DECK, ax = x < 0 ? -x : x, az = z < 0 ? -z : z;
    return ax >= D.xIn && az >= D.zFront;
  };

  /* Conveyor push on the spawn decks (toward the court). */
  A.conveyor = function (x, z, out) {
    if (!A.onDeck(x, z)) return null;
    out = out || {};
    out.x = 0; out.z = z > 0 ? -A.DECK.conveyor : A.DECK.conveyor;
    return out;
  };

  /* Analytic ground height. */
  A.groundHeight = function (x, z) {
    var P = A.PLAT, ax = x < 0 ? -x : x, az = z < 0 ? -z : z, h = 0;
    if (ax >= P.xIn) {
      if (az >= P.zTop && az <= P.zEnd) {
        h = P.h;
        // inner rail with a walk-off gap
        if (ax < P.xIn + P.railW && (az < P.gapA || az > P.gapB)) h = P.h + P.railH;
      } else if (az > P.zRamp && az < P.zTop) {
        h = P.h * (az - P.zRamp) / (P.zTop - P.zRamp);
      }
    }
    // team spawn decks
    var D = A.DECK;
    if (ax >= D.xIn && az >= D.zFront) h = D.h;
    // hoop support towers
    if (ax < A.TOWER.halfW && az >= A.TOWER.z) h = A.TOWER.h;
    return h;
  };

  /* Is a point part of a ramp (used for gentle-slope normals). */
  A.isRamp = function (x, z) {
    var P = A.PLAT, ax = x < 0 ? -x : x, az = z < 0 ? -z : z;
    return ax >= P.xIn && az > P.zRamp && az < P.zTop;
  };

  A.rampNormal = function (x, z) {
    var P = A.PLAT, slope = P.h / (P.zTop - P.zRamp);
    var sz = z < 0 ? -1 : 1;
    // height rises with |z|: dh/dz = slope*sz
    var nx = 0, ny = 1, nz = -slope * sz;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return { x: nx / l, y: ny / l, z: nz / l };
  };

  A.armAngle = function (arm, t, speedMul) {
    return arm.phase + arm.w * t * (speedMul === undefined ? 1 : speedMul);
  };

  /* Nav graph nodes for bots (ground routes around platforms). */
  A.navNodes = (function () {
    var n = [], sx, sz, i, j, sxs = [-1, 1], szs = [-1, 1];
    for (i = 0; i < 2; i++) {
      for (j = 0; j < 2; j++) {
        sx = sxs[i]; sz = szs[j];
        n.push({ x: sx * 15.5, z: sz * 2.6 });     // ramp foot
        n.push({ x: sx * 15.5, z: sz * 9.8 });     // ramp top
        n.push({ x: sx * 15.5, z: sz * 15.2 });    // platform end
        n.push({ x: sx * 10.2, z: sz * 3.8 });     // inner corner (mid side)
        n.push({ x: sx * 10.2, z: sz * 16.9 });    // inner corner (goal side)
        n.push({ x: sx * 15.5, z: sz * 17.2 });    // behind platform, ground
        n.push({ x: sx * 12.2, z: sz * 12.6 });    // rail gap on platform
      }
    }
    return n;
  })();

  return A;
});
