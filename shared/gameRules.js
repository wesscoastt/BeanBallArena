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
    mercyLead: 12,        // win instantly when leading by this many points (0 = off)
    kickoffReset: true,   // after every score, everyone goes back to their deck for a new drop
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
    // Tuned to feel like a casual party game (Crown Jam style): bots should be
    // beatable by new players, with Hard kept for people who want a fight.
    // humanEase: how much bots hold back on tackles/steals against a HUMAN carrier (0 = none)
    easy: {
      react: 0.55, shotErr: 0.24, yawErr: 0.14, passErr: 1.2,
      aggression: 0.2, block: 0.1, intercept: 0.12, sprintUse: 0.4,
      dodge: 0.08, passSense: 0.35, shotRangeMul: 0.8, callPass: 0.8, humanEase: 0.5
    },
    normal: {
      react: 0.4, shotErr: 0.17, yawErr: 0.09, passErr: 0.7,
      aggression: 0.36, block: 0.25, intercept: 0.26, sprintUse: 0.6,
      dodge: 0.2, passSense: 0.55, shotRangeMul: 0.95, callPass: 0.65, humanEase: 0.35
    },
    hard: {
      react: 0.11, shotErr: 0.065, yawErr: 0.025, passErr: 0.15,
      aggression: 0.9, block: 0.85, intercept: 0.9, sprintUse: 1,
      dodge: 0.55, passSense: 0.95, shotRangeMul: 1.1, callPass: 0.5, humanEase: 0
    }
  };

  /* Humanlike lobbies: each bot rolls its own skill around the chosen difficulty,
   * and now and then one bot in a match is a "sweat" who plays a level up.
   * sweatChance: per match; sweatAs: the difficulty that sweat plays at. */
  R.LOBBY = {
    easy:   { spread: 0.25, sweatChance: 0.15, sweatAs: 'normal' },
    normal: { spread: 0.25, sweatChance: 0.25, sweatAs: 'hard' },
    hard:   { spread: 0.1,  sweatChance: 0,    sweatAs: 'hard' }
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
