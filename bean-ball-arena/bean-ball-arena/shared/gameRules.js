/* BEAN BALL ARENA - shared/gameRules.js
 * Match settings (host-configurable), bot difficulty profiles, personalities.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) { module.exports = mod; }
  else { root.BBA = root.BBA || {}; root.BBA.Rules = mod; }
})(this, function () {
  var R = {};

  R.DEFAULTS = {
    arena: 'bean_bowl',
    teamSize: 3,
    duration: 240,        // seconds
    scoreLimit: 0,        // 0 = none
    overtime: true,
    difficulty: 'normal',
    autoFillBots: true,
    tackleStrength: 1,
    ballWeight: 1,
    gravity: 1,
    jumpHeight: 1,
    respawnTime: 3,
    obstacles: 1,          // rotating bumper speed multiplier (0 = stopped)
    modifier: 'none'
  };

  R.merge = function (base, over) {
    var out = {}, k;
    for (k in base) { if (base.hasOwnProperty(k)) out[k] = base[k]; }
    if (over) { for (k in over) { if (over.hasOwnProperty(k) && over[k] !== undefined) out[k] = over[k]; } }
    return out;
  };

  R.DIFFICULTY = {
    easy: {
      react: 0.42, shotErr: 0.2, yawErr: 0.12, passErr: 1.0,
      aggression: 0.35, block: 0.2, intercept: 0.3, sprintUse: 0.5,
      dodge: 0.1, passSense: 0.4, shotRangeMul: 0.8, callPass: 0.75
    },
    normal: {
      react: 0.24, shotErr: 0.12, yawErr: 0.06, passErr: 0.45,
      aggression: 0.65, block: 0.5, intercept: 0.6, sprintUse: 0.8,
      dodge: 0.3, passSense: 0.7, shotRangeMul: 1, callPass: 0.6
    },
    hard: {
      react: 0.11, shotErr: 0.065, yawErr: 0.025, passErr: 0.15,
      aggression: 0.9, block: 0.85, intercept: 0.9, sprintUse: 1,
      dodge: 0.55, passSense: 0.95, shotRangeMul: 1.1, callPass: 0.5
    }
  };

  // Personality tendencies: multipliers on decisions
  R.PERSONALITIES = {
    shooter:   { label: 'Shooter',   shoot: 1.6, pass: 0.8, tackle: 0.9, defend: 0.8, dunk: 0.8, range: 1.25 },
    playmaker: { label: 'Playmaker', shoot: 0.8, pass: 1.7, tackle: 0.9, defend: 1.0, dunk: 0.9, range: 1.0 },
    bruiser:   { label: 'Bruiser',   shoot: 0.9, pass: 0.9, tackle: 1.8, defend: 1.0, dunk: 1.1, range: 0.9 },
    defender:  { label: 'Defender',  shoot: 0.8, pass: 1.1, tackle: 1.2, defend: 1.8, dunk: 0.8, range: 0.9 },
    dunker:    { label: 'Dunker',    shoot: 0.6, pass: 0.9, tackle: 1.0, defend: 0.8, dunk: 1.9, range: 0.8 }
  };
  R.PERSONALITY_LIST = ['shooter', 'playmaker', 'bruiser', 'defender', 'dunker'];

  R.BOT_NAMES = ['Bolt', 'Pickle', 'Noodle', 'Biscuit', 'Waffles', 'Jellybean', 'Tofu', 'Sprocket',
    'Dumpling', 'Marbles', 'Gumdrop', 'Nacho', 'Pogo', 'Zippy', 'Mochi', 'Turbo', 'Bumble', 'Peanut',
    'Sprout', 'Wobbles', 'Clunk', 'Fizz', 'Doodle', 'Taco'];

  R.MATCH_LENGTHS = [180, 240, 300];

  return R;
});
