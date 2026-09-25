# Bean Ball Arena

This is a 3v3 party-sports game that runs in the browser, built with Three.js r128 and plain ES5 JavaScript. You can play it with a keyboard and mouse, an Xbox or PlayStation controller, or touch controls on a phone.

**Current build: milestone 2.** You can play offline vs bots anywhere, and play online private rooms when the game is opened from the Node server (see `server/README.md` for the Render setup).

## What's in this build
- **Arena:** Bean Bowl Stadium.
  - Each team starts on a raised spawn deck behind its own hoop and drops onto the court when the countdown ends, like Crown Jam.
  - A conveyor on each deck pushes players off, so nobody can camp up there.
  - The court has ramps up to side platforms, with rails and a walk-off gap.
  - There are 4 bounce pads beside the hoops, 4 launch pads on the platforms that fling you toward the enemy hoop, 2 spinning bumper bars and 2 bumper posts.
  - Hoop towers can't be climbed, and the stands have an animated crowd.
- **Movement:** walk, sprint (turns wider), jump, dive (then a slide and a recovery), stumble.
- **Player contact:**
  - Grabbing slows both players and releases automatically after about 1.25 s. It has a cooldown, and the grabbed player gets short immunity afterwards.
  - Hold a grab on the ball carrier to steal the ball.
  - A dive tackle scales with speed and angle and knocks the ball loose. After a stun, players get about 1 s of protection so they can't be stun-locked.
- **Ball:** one authoritative ball with bounces and rolling. It collides with the rims, backboards, walls, platforms, bumpers and players. It auto-catches on touch, you can grab it from further away, and it resets itself if it gets stuck.
- **Passing:**
  - Tap for a quick pass with mild aim assist and lead on moving teammates.
  - Hold for an aimed pass with a target ring. With nobody to aim at, you get a long desperation throw.
  - Aim + pass throws a low pass.
  - Anyone can intercept a pass.
  - Press pass without the ball to call for it.
- **Shooting:**
  - Hold to charge and release to shoot. A low charge lobs, a full charge throws long.
  - A partial trajectory arc shows your aim. Aim assist is mild, so timing still matters.
  - Shots from outside the arc are worth 3 points.
- **Dunks:** jump near the enemy hoop with the ball and press Shoot (or Jump) in the air. This triggers a slam with camera shake, particles, a hoop flash, a crowd roar and 2 points.
- **Match rules:**
  - Scoring gives a 2–3 second celebration, then a new ball drops at midfield.
  - Timer options are 3, 4 or 5 minutes.
  - The last 30 seconds get a callout and the last 10 get a countdown.
  - A shot in the air or a dunk in progress still counts after the buzzer.
  - A tie goes to overtime, where the next score wins, the music speeds up, the arena lights pulse and respawns are faster.
- **Bots:**
  - Roles change during play: carrier, support, safety, pressure, defend, mark, recover, receive.
  - Difficulties: Easy, Normal, Hard. Hard bots follow the same physics as you.
  - 5 personalities: Shooter, Playmaker, Bruiser, Defender, Dunker.
  - Bots respond when you call for a pass, call for it themselves when they're open, and route around platforms to the ramps.
- **Controls:**
  - Keyboard + mouse with pointer lock.
  - Gamepad with the standard mapping, which covers Xbox, PlayStation and the Logitech G Cloud.
  - Floating touch joystick (push past about 80% to sprint) and touch buttons.
  - Full keyboard and gamepad rebinding.
  - Touch buttons can be resized, faded and dragged into a new layout.
- **Camera:** third-person follow that widens when you sprint and zooms when you aim. A ball-cam button turns toward the ball, an arrow points to it when it's off-screen, and teammate markers stay pinned to the screen edge.
- **Audio:** all sound is synthesized: effects, crowd reactions, and procedural game-show music with an overtime mode.
- **Menus:**
  - Main menu with the live arena playing behind it.
  - Play vs Bots setup: team size, length, difficulty, plus optional modifiers (Super Bounce, Low Gravity, Heavy Ball, Mega Ball, Turbo).
  - Customize: color, pattern, face, hat, upper and lower outfits, celebration, victory animation, jersey number.
  - Settings: graphics, audio, controls, mobile, accessibility (colorblind team colors, screen shake, reduced motion, UI scale, sound captions).
  - A 10-step interactive tutorial, a pause menu, and a results screen with MVP and stats.

## Online multiplayer (milestone 2)
- One Node.js + Socket.IO server that serves the game and runs matches.
- Private rooms with 5-character codes and a copyable invite link (`?room=CODE` joins automatically).
- Lobby: pick a team, ready up, and the host adds or removes bots or turns on auto-fill.
- The host controls every setting: team size, length, score limit, bot difficulty, overtime, modifier, tackle strength, ball weight, gravity, jump height, respawn time, obstacle intensity, plus Restore Defaults.
- Up to 6 humans, in any mix with bots (1 human + 5 bots up to 6 humans).
- The server is the authority. It runs the same `shared/sim.js` at 60 Hz, clients only send inputs, and the server decides the ball, possession, grabs, tackles, scoring, the timer, overtime and results.
- Snapshots go out at 20 Hz, under 1 KB each.
- Your own player moves instantly through client-side prediction. The client reconciles to the server with input sequence numbers, and other players are interpolated about 100 ms behind.
- Disconnects: a bot takes over the seat for 45 s, and rejoining (even after a page refresh) gives the seat back. If the player doesn't return, the seat stays a bot.
- Tests: `tests/net_test.js` (25 end-to-end checks) and `tests/browser_online.py` (two real browsers).

## Not in this build yet
- Additional arenas, plus the Multiball and Chaos modifiers.

## Layout
```
client/   index.html, styles.css, js/ (game, ui, controls, camera, audio, arena, character, animations, ball, effects, player, tutorial, settings, meshutil)
shared/   constants, gameRules, arenaDef (collision), sim (authoritative game), ai (bots), protocol
server/   server.js (http + Socket.IO), rooms.js (codes, lobby, bots, reconnect), match.js (authoritative match loop)
tests/    net_test.js (online end-to-end), harness.js (full bot matches + invariants), mechanics.js (movement/pass/shot/dunk/tackle tests), browser_test.py
tools/    build.js -> dist/
```

## Run locally (offline + online)
```
npm install
npm start          # http://localhost:3000, online rooms work
```

## Run locally (static, offline only)
Serve the repo root with any static server and open `client/index.html`, for example:
```
python3 -m http.server 8080   # then open http://localhost:8080/client/index.html
```
Or run `node tools/build.js` and deploy the `dist/` folder (index.html + js/ + shared/ + styles.css) to GitHub Pages or Cloudflare Pages.

## Tests
```
node tests/mechanics.js          # 24 mechanics checks
node tests/harness.js 6 normal 3 # full bot-vs-bot matches with invariant checks
```
