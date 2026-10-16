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
    abilities: true,      // Hype meter + arena-themed abilities
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
      react: 0.62, shotErr: 0.28, yawErr: 0.16, passErr: 1.35,
      aggression: 0.15, block: 0.08, intercept: 0.08, sprintUse: 0.35,
      dodge: 0.06, passSense: 0.3, shotRangeMul: 0.8, callPass: 0.8, humanEase: 0.55
    },
    normal: {
      react: 0.47, shotErr: 0.2, yawErr: 0.1, passErr: 0.8,
      aggression: 0.3, block: 0.2, intercept: 0.2, sprintUse: 0.55,
      dodge: 0.18, passSense: 0.5, shotRangeMul: 0.92, callPass: 0.65, humanEase: 0.42
    },
    hard: {
      react: 0.11, shotErr: 0.065, yawErr: 0.025, passErr: 0.15,
      aggression: 0.9, block: 0.85, intercept: 0.9, sprintUse: 1,
      dodge: 0.55, passSense: 0.95, shotRangeMul: 1.1, callPass: 0.5, humanEase: 0
    }
  };

  /* ---- Abilities (Crown Jam style) ----
   * Fill your Hype meter by playing well, then press Ability. Every arena has a
   * power that fits its theme; Hero City hands each player one of four hero powers.
   * dur: seconds active (instant powers keep a short duration for the visuals). */
  R.ABILITIES = {
    bigbean: { name: 'BIG BEAN', short: 'Big', dur: 7, color: '#ffd23f', desc: 'Grow huge: bowl people over, can\'t be tackled' },
    jetpack: { name: 'JETPACK LEAP', short: 'Jet', dur: 3.5, color: '#ff9a3a', desc: 'Rocket into the air and glide' },
    magnet:  { name: 'MAGNET HANDS', short: 'Magnet', dur: 7, color: '#ff4f4f', desc: 'Loose balls fly to you' },
    dash:    { name: 'LIGHT DASH', short: 'Dash', dur: 4, color: '#39e6ff', desc: 'Zoom around and dive with no cooldown' },
    cannon:  { name: 'CANNON BLAST', short: 'Blast', dur: 0.7, color: '#c58a52', desc: 'Blast everyone nearby off their feet' },
    moon:    { name: 'MOON BOOTS', short: 'Moon', dur: 8, color: '#b86bff', desc: 'Huge floaty jumps' },
    freeze:  { name: 'FREEZE RAY', short: 'Freeze', dur: 0.7, color: '#8be0ff', desc: 'Freeze the opponent in front of you' },
    speed:   { name: 'SUPER SPEED', short: 'Speed', dur: 5, color: '#ffd23f', desc: 'Lightning fast, tackles bounce off' },
    flight:  { name: 'FLIGHT', short: 'Fly', dur: 4.5, color: '#5b8cff', desc: 'Take off and soar to the hoop' },
    pound:   { name: 'GROUND POUND', short: 'Pound', dur: 0.8, color: '#ff3b4e', desc: 'Super strength: smash the ground, knock everyone down' },
    shield:  { name: 'FORCE FIELD', short: 'Shield', dur: 6, color: '#6fdc4a', desc: 'Nobody can tackle you or steal the ball' }
  };
  R.ARENA_ABILITIES = {
    bean_bowl: ['bigbean'], titan: ['bigbean'], rooftop: ['jetpack'], factory: ['magnet'], neon: ['dash'],
    pirate: ['cannon'], space: ['moon'], snowy: ['freeze'], hero_city: ['speed', 'flight', 'pound', 'shield']
  };
  R.HYPE = { max: 100, perSec: 1.4, pass: 5, steal: 15, tackle: 12, block: 22, dunk: 20, score: 14, assist: 8, shoot: 3 };

  /* Humanlike lobbies: each bot rolls its own skill around the chosen difficulty,
   * (sweat bots are switched off: sweatChance 0 everywhere).
   * sweatChance: per match; sweatAs: the difficulty that sweat plays at. */
  R.LOBBY = {
    easy:   { spread: 0.25, sweatChance: 0, sweatAs: 'normal' },
    normal: { spread: 0.25, sweatChance: 0, sweatAs: 'hard' },
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
