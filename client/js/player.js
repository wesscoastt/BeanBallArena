/* BEAN BALL ARENA - client/js/player.js
 * Client-side view of one competitor: 3D character, interpolation between
 * sim ticks, animation inputs, name tag / teammate indicator.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;

  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  var tmpV = null;

  function PlayerView(scene, p, opts) {
    this.scene = scene;
    this.id = p.id;
    this.team = p.team;
    this.local = !!opts.local;
    this.teamCss = opts.teamCss;
    this.cos = opts.cosmetics;
    this.ch = BBA.Character.build({ cosmetics: opts.cosmetics, teamColor: opts.teamCss[p.team], number: opts.number,
      jerseyName: (opts.cosmetics && opts.cosmetics.jerseyName) ? opts.cosmetics.jerseyName : p.name });
    scene.add(this.ch.root);
    if (this.local) { this.ch.ring.material.opacity = 1; this.ch.ring.scale.setScalar(1.15); }
    this.prev = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    this.cur = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    this.lastSpeed = 0; this.lastYaw = p.yaw;
    this.pos = new THREE.Vector3(p.x, p.y, p.z);
    this.stepCb = null;
    this.wasHidden = false;
    this.stunStarT = 0;
    // tag
    var tag = root.document.createElement('div');
    tag.className = 'ptag ' + (opts.ally ? 'ally' : 'enemy') + (this.local ? ' me' : '');
    tag.innerHTML = '<span class="pcall">!</span><span class="pball"></span><span class="pname"></span>';
    tag.querySelector('.pname').textContent = p.name + (p.isBot ? '' : '');
    tag.style.setProperty('--tc', opts.teamCss[p.team]);
    opts.tagLayer.appendChild(tag);
    this.tag = tag;
    this.ally = !!opts.ally;
    this.isBot = !!p.isBot;
    if (!tmpV) tmpV = new THREE.Vector3();
  }

  PlayerView.prototype.capturePrev = function (p) {
    this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z; this.prev.yaw = p.yaw;
  };

  PlayerView.prototype.update = function (dt, alpha, p, sim, camera, winnerTeam) {
    var ch = this.ch;
    var hidden = p.hidden;
    ch.root.visible = !hidden;
    if (hidden) { this.wasHidden = true; this.tag.style.display = 'none'; return; }
    if (this.wasHidden) { this.wasHidden = false; ch.anim.spawnPop = 0; this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z; }
    var x = this.prev.x + (p.x - this.prev.x) * alpha;
    var y = this.prev.y + (p.y - this.prev.y) * alpha;
    var z = this.prev.z + (p.z - this.prev.z) * alpha;
    var yaw = this.prev.yaw + wrap(p.yaw - this.prev.yaw) * alpha;
    // big teleports (respawn) should not lerp
    if (Math.abs(p.x - this.prev.x) + Math.abs(p.z - this.prev.z) > 6) { x = p.x; y = p.y; z = p.z; }
    this.pos.set(x, y, z);
    ch.root.position.set(x, y, z);
    ch.root.rotation.y = yaw;
    // team ring hugs the ground
    var gh = BBA.Arena.groundHeight(x, z);
    ch.ring.position.y = gh - y + 0.05;
    ch.ring.visible = y - gh < 6;
    var rs = 1 + Math.min(0.8, (y - gh) * 0.08);
    ch.ring.scale.set(rs * (this.local ? 1.15 : 1), rs * (this.local ? 1.15 : 1), 1);
    this._abilityFx(dt, p);

    var speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    var accel = dt > 0 ? (speed - this.lastSpeed) / dt : 0;
    var yawRate = dt > 0 ? wrap(yaw - this.lastYaw) / dt : 0;
    this.lastSpeed = speed; this.lastYaw = yaw;
    var ended = null;
    if (sim.match.phase === 'ended') ended = (winnerTeam === p.team) ? 'win' : (winnerTeam >= 0 ? 'lose' : null);
    var v = {
      speed: speed, vy: p.vy, grounded: p.grounded, state: p.state, hasBall: sim.ball.holder === p.id,
      charging: p.charging, charge: p.charge, passAiming: p.passHeld && p.passT > 0.2,
      grabbing: p.grabTarget >= 0, grabbed: p.grabbedBy >= 0, wobble: p.wobble,
      throwAnim: p.throwAnim, throwKind: p.throwKind, celebrateT: p.celebrateT, sprinting: p.sprinting,
      accel: accel, yawRate: yawRate, landImpact: p.landImpact, dunkT: p.state === 'dunk' ? p.stateT : 0,
      celebration: this.cos.celebration, victory: this.cos.victory, ended: ended,
      onStep: this.stepCb
    };
    BBA.Anim.update(ch, v, dt);

    // name tag / indicators
    var tag = this.tag;
    tmpV.set(x, y + 2.35, z);
    tmpV.project(camera);
    var W = root.innerWidth, H = root.innerHeight;
    var behind = tmpV.z > 1;
    var sx = (tmpV.x * 0.5 + 0.5) * W, sy = (-tmpV.y * 0.5 + 0.5) * H;
    var off = behind || sx < 0 || sx > W || sy < 0 || sy > H;
    var show = true;
    if (this.local) show = p.callT > 0 || sim.ball.holder === p.id && false;
    tag.classList.toggle('calling', p.callT > 0);
    tag.classList.toggle('hasball', sim.ball.holder === p.id);
    tag.classList.toggle('stun', p.state === 'stun');
    if (off) {
      if (this.ally && !this.local) {
        // clamp teammate indicator to the screen edge
        if (behind) { sx = W - sx; sy = H - 20; }
        sx = Math.max(24, Math.min(W - 24, sx)); sy = Math.max(60, Math.min(H - 40, sy));
        tag.classList.add('edge');
      } else show = false;
    } else tag.classList.remove('edge');
    if (!show) { tag.style.display = 'none'; return; }
    tag.style.display = '';
    tag.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px) translate(-50%,-100%)';
    var dist = camera.position.distanceTo(this.pos);
    tag.style.opacity = off ? 0.9 : (dist > 40 ? 0.55 : 1);
  };

  PlayerView.prototype.hideForPodium = function () {
    this.ch.root.visible = false;
    this.tag.style.display = 'none';
  };

  /* Stand on a podium spot and loop the celebration emote. */
  PlayerView.prototype.podiumUpdate = function (dt, x, y, z, yaw, camera, style, t, first) {
    var ch = this.ch;
    ch.root.visible = true;
    ch.root.position.set(x, y, z);
    ch.root.rotation.y = yaw;
    ch.ring.visible = false;
    this.pos.set(x, y, z);
    var loop = 1.4 - (t % 1.4);
    BBA.Anim.update(ch, {
      speed: 0, vy: 0, grounded: true, state: 'normal', hasBall: false, charging: false, charge: 0, wobble: 0,
      throwAnim: 0, celebrateT: Math.max(0.01, loop), sprinting: false, accel: 0, yawRate: 0, landImpact: 0,
      celebration: style, victory: this.cos.victory, ended: null
    }, dt);
    var tag = this.tag;
    tmpV.set(x, y + 2.3 + (first ? 0.8 : 0), z);
    tmpV.project(camera);
    var sx = (tmpV.x * 0.5 + 0.5) * root.innerWidth, sy = (-tmpV.y * 0.5 + 0.5) * root.innerHeight;
    tag.style.display = '';
    tag.classList.remove('edge'); tag.classList.remove('calling'); tag.classList.remove('hasball');
    tag.classList.add('podium');
    tag.style.opacity = 1;
    tag.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px) translate(-50%,-100%)';
  };

  /* Ability visuals: Big Bean grows, active powers glow in their color, the Force
   * Field is a visible bubble, and a frozen player is stuck in an ice block. */
  PlayerView.prototype._abilityFx = function (dt, p) {
    var ch = this.ch, ab = p.abilityT > 0 ? p.ability : '', A = ab ? (BBA.Rules.ABILITIES[ab] || null) : null;
    this.scl = this.scl || 1;
    var want = ab === 'bigbean' ? 1.6 : 1;
    this.scl += (want - this.scl) * Math.min(1, dt * 7);
    if (Math.abs(this.scl - 1) > 0.001 || ch.root.scale.x !== 1) ch.root.scale.setScalar(this.scl);   // grows from the feet
    var showAura = !!A && ab !== 'cannon' && ab !== 'pound' && ab !== 'freeze';
    if (showAura && !this.aura) {
      this.aura = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.aura.position.y = 0.9; this.aura.scale.set(0.95, 1.2, 0.95);
      ch.root.add(this.aura);
    }
    if (this.aura) {
      this.aura.visible = showAura;
      if (showAura) {
        this.aura.material.color.set(A.color);
        var t = performance.now() * 0.006, shield = ab === 'shield';
        this.aura.material.opacity = (shield ? 0.32 : 0.16) + Math.sin(t) * 0.06;
        var s = shield ? 1.25 : 1.0;
        this.aura.scale.set(0.95 * s, 1.2 * s, 0.95 * s);
        this.aura.position.y = 0.9;
      }
    }
    var frozen = p.frozenT > 0;
    if (frozen && !this.ice) {
      this.ice = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 1.5), new THREE.MeshLambertMaterial({ color: '#bfefff', transparent: true, opacity: 0.55, emissive: '#3a8ab0', emissiveIntensity: 0.4, depthWrite: false }));
      this.ice.position.y = 1.0; ch.root.add(this.ice);
    }
    if (this.ice) this.ice.visible = frozen;
  };

  PlayerView.prototype.dispose = function () {
    this.scene.remove(this.ch.root);
    BBA.Character.dispose(this.ch);
    if (this.tag.parentNode) this.tag.parentNode.removeChild(this.tag);
  };

  BBA.PlayerView = PlayerView;
})(this);
