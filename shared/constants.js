/* BEAN BALL ARENA - shared/constants.js
 * Shared by the browser client and (later) the Node server.
 * ES5 only. UMD-style export: window.BBA.C in the browser, module.exports in Node.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) { module.exports = mod; }
  else { root.BBA = root.BBA || {}; root.BBA.C = mod; }
})(this, function () {
  return {
    VERSION: '0.4.1',
    TICK: 1 / 60,

    TEAM_BLUE: 0,
    TEAM_RED: 1,
    TEAM_NAMES: ['BLUE', 'RED'],

    PLAYER: {
      radius: 0.55,
      height: 1.7,
      walk: 7.4,
      sprint: 10.4,
      accelGround: 52,
      accelSprint: 30,
      accelAir: 17,
      friction: 38,
      turnWalk: 15,
      turnSprint: 6.5,
      turnAim: 20,
      jumpVel: 11.5,
      gravity: 30,
      stepUp: 0.45,
      coyote: 0.1,
      jumpBuffer: 0.12,
      holdMul: 0.93,
      chargeMul: 0.72,
      grabberMul: 0.55,
      grabbedMul: 0.38,

      diveSpeed: 14,
      diveMax: 16.5,
      diveUp: 5.2,
      diveAirUp: 2.2,
      diveCooldown: 0.95,
      slideTime: 0.34,
      recoverTime: 0.18,

      grabRange: 1.95,
      grabDuration: 1.25,
      grabCooldown: 1.0,
      grabWhiffCooldown: 0.35,
      grabImmunity: 0.8,
      stealTime: 0.5,

      reach: 2.15,
      catchRadius: 1.2,
      catchRadiusTarget: 1.7,
      fumbleNoCatch: 0.55,

      stunImmunity: 1.0,
      tackleMinImpact: 3.0
    },

    BALL: {
      radius: 0.5,
      gravity: 24,
      restFloor: 0.62,
      restWall: 0.72,
      restRim: 0.55,
      restBoard: 0.6,
      restPlayer: 0.45,
      rollFriction: 1.6,
      maxSpeed: 38,
      throwIgnore: 0.3
    },

    SHOT: {
      chargeTime: 1.15,
      angleLow: 1.22,
      angleHigh: 0.74,
      speedLow: 11,
      speedHigh: 28,
      carryH: 0.35,
      carryV: 0.3,
      assistYaw: 0.45,
      assistYawStrength: 0.8,
      assistWindow: 0.15,
      assistStrength: 0.65
    },

    DUNK: {
      range: 2.9,
      below: 3.3,
      pullTime: 0.22,
      totalTime: 0.42
    },

    SCORE: {
      basket: 2,
      longRange: 3,
      dunk: 2,
      celebrate: 2.6,
      ballHide: 1.2
    },

    // Input button names (shared with network protocol)
    BUTTONS: ['jump', 'sprint', 'dive', 'grab', 'pass', 'shoot', 'aim']
  };
});
