// Enemy base class + the common meme roster.
import * as THREE from 'three';
import { G, rand, pick, clamp, damp, dampAngle, distXZ, distToSegment, nearestPlayer, hurtPlayer, playerById, local, ELEMENTS, ELEMENT_KEYS, modOn } from './game.js';
import * as fx from './fx.js';
import { play, playAt } from './audio.js';
import { moveCollide, pointInWorld } from './world.js';
import { los, Projectile, Pickup, raycast, Shockwave } from './combat.js';
import { HUD } from './hud.js';
import { textSprite } from './textures.js';
import * as M from './models.js';
import * as R from './rigs.js';

const barGeo = new THREE.PlaneGeometry(1, 1);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: false });
const barMinorMat = new THREE.MeshBasicMaterial({ color: 0xff4a4a, depthTest: false });
const barMajorMat = new THREE.MeshBasicMaterial({ color: 0xffb21e, depthTest: false });
const barImmuneMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, depthTest: false });
const _t = new THREE.Vector3(), _t2 = new THREE.Vector3(), _prev = new THREE.Vector3();
const r2 = (n) => Math.round(n * 100) / 100;

// ---- elemental shields: a fresnel bubble with a hex shimmer that flares when hit ----
const shieldGeo = new THREE.IcosahedronGeometry(1, 3);
function shieldMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uFlash: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uFlash, uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        // hex-ish cells from the sphere position
        vec2 q = vec2(atan(vP.z, vP.x) * 9.0, vP.y * 15.0 + uTime * 0.8);
        vec2 g = abs(fract(q + vec2(0.5 * floor(mod(q.y, 2.0)), 0.0)) - 0.5);
        float hex = smoothstep(0.46, 0.5, max(g.x * 1.15, g.y)) * (0.5 + 0.5 * sin(uTime * 3.0 + vP.y * 6.0));
        float a = f * (0.6 + uFlash * 1.1) + hex * (0.025 + uFlash * 0.3) * (0.3 + f) + uFlash * 0.06;
        gl_FragColor = vec4(uColor * (1.4 + uFlash * 2.0) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const shieldBarMats = {};
const shieldBarMat = (el) => (shieldBarMats[el] ||= new THREE.MeshBasicMaterial({ color: ELEMENTS[el].color, depthTest: false }));

export class Enemy {
  constructor(o = {}) {
    this.name = o.name || 'Meme';
    this.maxHp = this.hp = o.hp || 100;
    this.radius = o.radius || 0.5;
    this.height = o.height || 1.8;
    this.speed = o.speed || 4;
    this.rank = o.rank || 'minor';
    this.flying = !!o.flying;
    this.mesh = new THREE.Group();
    this.mesh.rotation.order = 'YXZ'; // so hit flinches tilt in the enemy's own frame
    this.flinch = 0;
    this.ash = o.ash ?? 0xff9440;
    this.pos = this.mesh.position;
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.hitboxes = [];
    this.alive = true; this.hostile = true; this.immune = false; this.untargetable = false;
    this.t = rand(0, 10); this.cd = rand(1, 2.5);
    this.onGround = false; this.pop = 0; this.canSee = false; this.losT = rand(0, 0.3);
    this.drops = o.drops ?? true;
    this.goal = null;
    this.gib = o.gib ?? 0xb06cff;
    this.deathLines = o.deathLines || ['was deleted'];
    // co-op: a stable id + how to rebuild this enemy on a client
    this.nid = G.nextNid++;
    this.netType = this.constructor.name;
    this.netArgs = 0;
    this.target = null; this.retargetT = 0;
    G.entities.add(this.mesh);
    if (this.rank !== 'boss' && this.rank !== 'neutral') {
      this.bar = new THREE.Group();
      const bg = new THREE.Mesh(barGeo, barBgMat); bg.scale.set(1.1, 0.13, 1); bg.renderOrder = 20;
      this.barFill = new THREE.Mesh(barGeo, this.rank === 'major' ? barMajorMat : barMinorMat); this.barFill.scale.set(1.04, 0.08, 1); this.barFill.position.z = 0.001; this.barFill.renderOrder = 21;
      this.bar.add(bg, this.barFill); this.bar.visible = false;
      G.fxGroup.add(this.bar);
    }
  }
  spawnAt(x, y, z) { this.pos.set(x, y, z); fx.spawnFx(this.pos); playAt(this.pos, 'spawn'); this.spawnIn = 0; return this; }
  hb(x, y, z, r, crit = false) { this.hitboxes.push({ off: new THREE.Vector3(x, y, z), r, crit }); return this; }
  hbWorld(hb, out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), o = hb.off;
    return out.set(this.pos.x + o.x * c + o.z * s, this.pos.y + o.y, this.pos.z - o.x * s + o.z * c);
  }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z); }
  top(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height + 0.3, this.pos.z); }

  takeDamage(dmg, crit = false, info = {}) {
    if (!this.alive) return 0;
    if (G.net.isClient) return G.net.clientHit(this, dmg, crit, info);
    const mine = !info.from; // damage numbers only for your own shots, like the real game
    if (this.immune || this.untargetable) { if (mine) fx.dmgNumber(this.top(_t), 'IMMUNE', 'immune'); return 0; }
    if (mine && modOn('glass')) dmg *= 1.5;
    if (this.shieldHp > 0) return this.hitShield(dmg, info, mine);
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg; this.pop = 1; this.aggro = true;
    this.flinch = Math.min(1.2, this.flinch + (crit ? 0.9 : 0.45));
    // which side took it (in the enemy's own frame), so it twists away from the shot
    let side = 0;
    if (info.point) { const dx = info.point.x - this.pos.x, dz = info.point.z - this.pos.z; side = Math.sign(dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw)) || 0; }
    this.rig?.hit(crit, side);
    this.lastHitBy = info.from ?? null;
    this.lastCrit = crit;
    if (mine) fx.dmgNumber(this.top(_t), dmg, crit ? 'crit' : '');
    if (crit && mine) G.stats.crits++;
    this.onHurt?.(dmg, crit, info);
    if (this.hp <= 0) { this.hp = 0; this.die(info); }
    return dmg;
  }

  // ---- elemental shield ----
  addShield(el, frac = 0.45) {
    this.shieldEl = el; this.shieldMax = this.shieldHp = Math.round(this.maxHp * frac);
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMaterial(ELEMENTS[el].color));
    this.shieldMesh.renderOrder = 6;
    G.fxGroup.add(this.shieldMesh);
    this.shieldFlash = 0;
    return this;
  }
  updateShield(dt) {
    const m = this.shieldMesh, up = this.alive && this.shieldHp > 0;
    m.visible = up;
    if (!up) return;
    this.shieldFlash = Math.max(0, (this.shieldFlash || 0) - dt * 4);
    const r = Math.max(this.height * 0.62, this.radius * 1.7);
    m.position.set(this.pos.x, this.pos.y + this.height * 0.52, this.pos.z);
    m.scale.set(r * 0.85, r, r * 0.85).multiplyScalar(1 + this.shieldFlash * 0.06);
    m.material.uniforms.uFlash.value = this.shieldFlash; m.material.uniforms.uTime.value = this.t;
  }
  hitShield(dmg, info, mine) {
    const match = info.element && info.element === this.shieldEl;
    const sd = Math.max(1, Math.round(dmg * (match ? 3 : 1)));
    this.shieldHp -= sd; this.shieldFlash = 1; this.pop = 0.6; this.aggro = true;
    this.lastHitBy = info.from ?? null;
    this.onShieldHit?.(sd);
    if (mine) fx.dmgNumber(this.top(_t), sd, 'shield el-' + this.shieldEl + (match ? ' match' : ''));
    if (Math.random() < 0.5) playAt(this.center(_t), match ? 'shieldHitMatch' : 'shieldHit');
    if (this.shieldHp <= 0) this.breakShield(info, match);
    return sd;
  }
  breakShield(info, match) {
    this.shieldHp = 0;
    const c = this.center(new THREE.Vector3()), col = ELEMENTS[this.shieldEl].color;
    fx.burst(c, col, 26, 9, 0.12, 0.6, 4); fx.burst(c, 0xffffff, 10, 6, 0.06, 0.35, 0);
    fx.ringFx(c, 4.5, col, 0.5);
    fx.floatText(this.top(new THREE.Vector3()), `${ELEMENTS[this.shieldEl].icon} SHIELD BROKEN`, { height: 0.4, color: ELEMENTS[this.shieldEl].css, life: 1.2 });
    playAt(c, 'shieldBreak');
    // the pop hurts everything around it, more when you broke it with the right element
    for (const e of G.enemies) if (e !== this && e.alive && e.hostile && !e.immune && e.rank !== 'boss' && e.pos.distanceTo(this.pos) < 4.5) e.takeDamage(match ? 70 : 30, false, { splash: true, from: info.from });
    this.stunT = match ? 1.6 : 0.9; this.flinch = 1.2;
    this.rig?.hit(true);
  }

  die() {
    if (!this.alive) return;
    const c = this.center(_t);
    // a precision kill pops (the head goes first, Destiny style)
    if (this.lastCrit && this.rank !== 'boss') {
      const h = this.top(new THREE.Vector3()); h.y -= 0.35;
      fx.burst(h, 0xffd23f, 10, 7, 0.06, 0.35, 4); fx.burst(h, this.gib, 8, 5, 0.1, 0.5, 8);
      playAt(h, 'crit');
    }
    this.dissolveOut();
    if (G.net.isHost) G.net.emit(['die', this.nid]);
    fx.burst(c, this.gib, 10, 6, 0.12, 0.7);
    fx.debrisM(c, this.gib, 5, 5, 0.14, 0.9);
    playAt(c, 'kill');
    // kill credit goes to whoever landed the last hit
    const superGain = this.rank === 'minor' ? 2.5 : 7;
    if (this.lastHitBy == null) { G.stats.kills++; G.player.addSuper(superGain); }
    else G.net.sendTo(this.lastHitBy, ['kill', superGain]);
    if (this.drops) {
      const r = Math.random();
      if (r < (this.rank === 'major' ? 0.35 : 0.1)) new Pickup('special', c);
      else if (r < (this.rank === 'major' ? 0.55 : 0.14)) new Pickup('heavy', c);
      if (Math.random() < 0.5) new Pickup('orb', c);
      if (Math.random() < (this.rank === 'major' ? 0.08 : 0.015)) new Pickup('engram', c);
    }
    HUD.killfeed(`${this.name} ${pick(this.deathLines)}`);
    this.onDeathFx?.(c);
    this.onDeath?.(this);
  }

  // Burn away into ash (local visual; clients get a 'die' event for their proxy)
  dissolveOut() {
    if (!this.alive) return;
    this.alive = false;
    if (this.bar) G.fxGroup.remove(this.bar);
    this.beam?.dispose(); this.aimBeam?.dispose?.();
    if (this.shieldMesh) { G.fxGroup.remove(this.shieldMesh); this.shieldMesh.material.dispose(); }
    G.entities.remove(this.mesh);
    this.mesh.rotation.x = 0;
    // fall away from whoever landed the killing blow
    let dir = null;
    if (this.rank !== 'boss') {
      const k = (this.lastHitBy != null && playerById(this.lastHitBy)) || nearestPlayer(this.pos) || G.player;
      dir = new THREE.Vector3(this.pos.x - k.pos.x, 0, this.pos.z - k.pos.z);
    }
    fx.dissolve(this.mesh, this.ash, this.rank === 'boss' ? 2.2 : dir ? 1.05 : 0.75, { dir, flying: this.flying });
  }
  // Silent removal (despawn, encounter reset)
  remove() {
    if (!this.alive) return;
    this.alive = false;
    this.cleanupMesh();
  }
  cleanupMesh() {
    G.entities.remove(this.mesh);
    if (this.shieldMesh) { G.fxGroup.remove(this.shieldMesh); this.shieldMesh.material.dispose(); }
    if (this.bar) G.fxGroup.remove(this.bar);
    this.beam?.dispose();
    this.mesh.traverse((o) => {
      if (o.geometry && o.geometry !== barGeo) o.geometry.dispose();
      if (o.material && !o.material.userData?.shared && !o.isInstancedMesh) o.material.dispose?.();
    });
  }

  update(dt) {
    this.t += dt;
    if (this.shieldMesh) this.updateShield(dt);
    if (this.stunT > 0 && !G.net.isClient) { this.stunT -= dt; this.vel.set(0, this.vel.y, 0); this.physics?.(dt); this.animSpeed = 0; this.animate?.(dt); this.rig?.update(dt, { speed: 0 }); this.mesh.rotation.y = this.yaw; return; }
    if (G.net.isClient) this.proxyUpdate(dt);
    else if (!G.cine && this.leash && !this.leashed()) { this.vel.set(0, 0, 0); this.animSpeed = 0; }
    else if (!G.cine) {
      this.retargetT -= dt;
      if (this.retargetT <= 0 || !this.target || !this.target.alive) { this.retargetT = 0.5; this.target = nearestPlayer(this.pos) || G.player; }
      this.losT -= dt;
      if (this.losT <= 0) {
        this.losT = 0.25;
        const p = this.target;
        this.canSee = p.alive && los(this.center(_t), _t2.set(p.pos.x, p.pos.y + 1.5, p.pos.z));
      }
      this.think(dt);
      this.animSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (this.pos.y < -40) this.die();
    }
    this.animate?.(dt);
    if (this.rig) this.rig.update(dt, { speed: this.animSpeed || 0, ...(G.net.isClient ? this.netPose : this.pose?.()) });
    if (this.pop > 0) { this.pop = Math.max(0, this.pop - dt * 6); }
    // grow out of the portal on arrival
    if (this.spawnIn !== undefined && this.spawnIn < 1) this.spawnIn = Math.min(1, this.spawnIn + dt * 2.6);
    const g = this.spawnIn === undefined ? 1 : Math.max(0.01, 1 - Math.pow(1 - this.spawnIn, 3));
    const s = (1 + this.pop * 0.06) * g;
    this.mesh.scale.set(s, s, s);
    this.mesh.rotation.y = this.yaw;
    this.flinch = Math.max(0, this.flinch - dt * 4);
    // rigged enemies flinch with their joints; the rest just tilt
    if (!this.rig) this.mesh.rotation.x = -Math.sin(Math.min(1, this.flinch) * Math.PI * 0.5) * (this.rank === 'boss' ? 0.04 : this.rank === 'major' ? 0.12 : 0.22);
    if (this.bar) {
      const show = this.hp < this.maxHp || this.rank === 'major';
      this.bar.visible = show;
      if (show) {
        this.bar.position.set(this.pos.x, this.pos.y + this.height + 0.45, this.pos.z);
        this.bar.quaternion.copy(G.camera.quaternion);
        const r = this.hp / this.maxHp;
        this.barFill.scale.x = 1.04 * r;
        this.barFill.position.x = -0.52 * (1 - r);
        this.barFill.material = this.immune ? barImmuneMat : (this.rank === 'major' ? barMajorMat : barMinorMat);
        if (this.shieldHp > 0) { const s = this.shieldHp / this.shieldMax; this.barFill.material = shieldBarMat(this.shieldEl); this.barFill.scale.x = 1.04 * s; this.barFill.position.x = -0.52 * (1 - s); }
      }
    }
  }
  think() {}
  tgt() { return this.target || G.player; }
  // leashed enemies hold their post until a guardian comes within range (or shoots them), then they're in for good
  leashed() {
    const q = nearestPlayer(this.pos);
    if (this.aggro || (q && distXZ(q.pos, this.pos) < this.leash)) { this.leash = 0; return true; }
    return false;
  }
  // one-shot animation (bite, fire, cast...) that teammates also see
  doAct(name, dur) { this.rig?.play(name, dur); this.actN = (this.actN || 0) + 1; this.actName = name; this.actDur = dur; }
  useRig(rig) { this.rig = rig; this.model = rig.root; this.mesh.add(rig.root); return rig; }

  // ---- co-op: client-side proxy ----
  proxyUpdate(dt) {
    if (!this.netPos) return;
    _prev.copy(this.pos);
    if (this.pos.distanceTo(this.netPos) > 6) this.pos.copy(this.netPos);
    else this.pos.lerp(this.netPos, 1 - Math.exp(-14 * dt));
    this.animSpeed = Math.hypot(this.pos.x - _prev.x, this.pos.z - _prev.z) / Math.max(dt, 1e-4);
    this.yaw = dampAngle(this.yaw, this.netYaw, 14, dt);
  }
  // snapshot row: [nid, type, args, x, y, z, yaw, hp, maxHp, flags, vis, rank, actN, actName, actDur, pose]
  netRow() {
    const ps = this.pose?.();
    return [this.nid, this.netType, this.netArgs, r2(this.pos.x), r2(this.pos.y), r2(this.pos.z), r2(this.yaw), Math.ceil(this.hp), this.maxHp,
      (this.immune ? 1 : 0) | (this.untargetable ? 2 : 0) | (this.hostile ? 4 : 0), this.netVis?.() ?? 0, this.rank,
      this.actN || 0, this.actName || 0, this.actDur || 0, ps ? [ps.aim ? 1 : 0, ps.mew ? 1 : 0, ps.task ? 1 : 0, r2(ps.windup || 0), r2(ps.crouch || 0)] : 0,
      this.shieldMax ? [Math.max(0, Math.ceil(this.shieldHp)), this.shieldMax, ELEMENT_KEYS.indexOf(this.shieldEl), this.stunT > 0 ? 1 : 0] : 0];
  }
  applyRow(a) {
    if (!this.netPos) { this.netPos = new THREE.Vector3(a[3], a[4], a[5]); this.pos.copy(this.netPos); this.yaw = a[6]; }
    this.netPos.set(a[3], a[4], a[5]); this.netYaw = a[6];
    this.hp = a[7]; this.maxHp = a[8];
    this.immune = !!(a[9] & 1); this.untargetable = !!(a[9] & 2); this.hostile = !!(a[9] & 4);
    if (a[10]) this.applyVis?.(a[10]);
    if (this.actSeen !== undefined && a[12] !== this.actSeen && a[13]) this.rig?.play(a[13], a[14]);
    this.actSeen = a[12];
    if (a[16]) {
      const el = ELEMENT_KEYS[a[16][2]];
      if (!this.shieldMesh) this.addShield(el);
      if (a[16][0] < this.shieldHp) this.shieldFlash = 1;
      this.shieldHp = a[16][0]; this.shieldMax = a[16][1];
    }
    if (a[15]) this.netPose = { aim: !!a[15][0], mew: !!a[15][1], task: !!a[15][2], windup: a[15][3], crouch: a[15][4] || 0 };
  }

  // --- helpers ---
  steer(tx, tz, speed, dt, { stopDist = 0, accel = 8 } = {}) {
    let dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    let wx = 0, wz = 0;
    if (d > stopDist && d > 0.01) { wx = dx / d * speed; wz = dz / d * speed; }
    // bumped into a wall recently: slide sideways for a moment (poor man's pathfinding)
    if (this.detourT > 0) {
      this.detourT -= dt;
      const s = this.detourSign;
      [wx, wz] = [-wz * s * 0.9 + wx * 0.3, wx * s * 0.9 + wz * 0.3];
    }
    // separation
    for (const o of G.enemies) {
      if (o === this || !o.alive || o.flying !== this.flying) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const od = Math.hypot(ox, oz), min = this.radius + o.radius + 0.3;
      if (od < min && od > 0.001) { wx += ox / od * (min - od) * 6; wz += oz / od * (min - od) * 6; }
    }
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;
    this.physics(dt);
    if (Math.hypot(this.vel.x, this.vel.z) > 0.5) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);
    return d;
  }
  physics(dt) {
    if (this.flying) { this.pos.addScaledVector(this.vel, dt); return; }
    this.vel.y -= 25 * dt;
    const r = moveCollide(this.pos, this.vel, dt, this.radius, this.height);
    this.onGround = r.ground;
    if (r.wall && r.ground) {
      if (Math.random() < 0.08) this.vel.y = 9;
      if (!(this.detourT > 0)) { this.detourT = rand(0.6, 1.2); this.detourSign = Math.random() < 0.5 ? 1 : -1; }
    }
  }
  facePlayer(dt, k = 8) {
    const p = this.tgt().pos;
    this.yaw = dampAngle(this.yaw, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), k, dt);
  }
  distToPlayer() { return distXZ(this.pos, this.tgt().pos); }
  fire(from, o = {}) {
    const p = o.at || this.tgt();
    const tgt = _t.set(p.pos.x, p.pos.y + (o.aimY ?? 1.1), p.pos.z);
    const dir = tgt.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    const spread = o.spread ?? 0.03;
    dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread);
    dir.normalize();
    const speed = o.speed ?? 24;
    const vel = dir.multiplyScalar(speed);
    if (o.gravity) vel.y += 0.5 * o.gravity * (dist / speed);
    return new Projectile({ pos: from, vel, owner: 'enemy', source: o.source || this.name, target: o.homing ? p : null, ...o });
  }
  muzzle(x = 0, y = 1.4, z = 0.6) { return this.hbWorld({ off: _t2.set(x, y, z) }, new THREE.Vector3()); }
}

// ---------------- DOGE THRALL ----------------
const DOGE_WORDS = ['wow', 'such hostile', 'very bite', 'much run', 'so raid', 'amaze', 'such light', 'very guardian', 'wow'];
export class Doge extends Enemy {
  constructor() {
    super({ name: 'Doge Thrall', hp: 70, radius: 0.45, height: 1.5, speed: rand(7.5, 9), gib: 0xd9a55b, deathLines: [': such dead. wow.', 'has stopped being a good boy', ': very ded'] });
    this.useRig(new R.DogeRig());
    this.height = 1.3;
    this.hb(0, 0.66, 0.05, 0.42).hb(0, 0.66, -0.32, 0.32).hb(0, 1.04, 0.52, 0.27, true);
    this.wordT = rand(1, 4);
  }
  think(dt) {
    const p = this.tgt();
    // pack hunting: from range, each doge curves out to its own side so they arrive from different angles
    if (this.flank === undefined) { this.flank = (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1.1); this.lungeCd = rand(1, 3); this.lungeT = 0; }
    const dist = distXZ(this.pos, p.pos);
    let tx = p.pos.x, tz = p.pos.z;
    if (dist > 7) {
      const a = Math.atan2(this.pos.z - p.pos.z, this.pos.x - p.pos.x) + this.flank * Math.min(1, (dist - 7) / 10);
      const r = Math.max(5, dist * 0.6);
      tx = p.pos.x + Math.cos(a) * r; tz = p.pos.z + Math.sin(a) * r;
    }
    // close in, then leap
    this.lungeCd -= dt;
    if (this.lungeT > 0) { this.lungeT -= dt; this.physics(dt); }
    else this.steer(tx, tz, this.speed, dt, { stopDist: 1.1 });
    if (dist < 5.5 && dist > 2.2 && this.onGround && this.lungeCd <= 0 && p.alive && this.canSee) {
      const k = 1 / (dist || 1);
      this.vel.set((p.pos.x - this.pos.x) * k * 13, 5.5, (p.pos.z - this.pos.z) * k * 13);
      this.lungeT = 0.45; this.lungeCd = rand(2.5, 4.5);
      this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      this.doAct('bite', 0.4); playAt(this.pos, 'bark');
    }
    this.cd -= dt;
    if (dist < 1.9 && Math.abs(p.pos.y - this.pos.y) < 1.6 && this.cd <= 0 && p.alive) {
      hurtPlayer(p, 12, 'a Doge Thrall (such bite)'); this.cd = 0.9; playAt(this.pos, 'bark'); this.doAct('bite', 0.3);
      this.vel.x += (p.pos.x - this.pos.x) * 3; this.vel.z += (p.pos.z - this.pos.z) * 3;
    }
    this.wordT -= dt;
    if (this.wordT <= 0) { this.wordT = rand(3, 7); fx.floatText(this.top(_t).clone(), pick(DOGE_WORDS), { height: 0.45 }); }
  }
}

// ---------------- STONKS ACOLYTE ----------------
export class Stonks extends Enemy {
  constructor() {
    super({ name: 'Stonks Acolyte', hp: 140, radius: 0.45, height: 2.0, speed: 4.5, gib: 0x22dd55, deathLines: [': NOT STONKS 📉', 'sold the dip', 'got margin called'] });
    this.useRig(R.stonksRig());
    this.hb(0, 1.2, 0, 0.45).hb(0, 0.6, 0, 0.3).hb(0, 1.93, 0.02, 0.24, true);
    this.hbBase = this.hitboxes.map((h) => h.off.y);
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = rand(1, 3); this.burst = 0; this.burstT = 0;
    this.cover = null; this.coverT = rand(1.5, 4); this.crouchK = 0; this.peekT = 0;
  }
  pose() { return { aim: this.burst > 0 || this.aimT > 0, crouch: this.crouchK }; }
  // crouching lowers the hitboxes too (clients use the synced pose), so cover actually covers
  animate() {
    const c = G.net.isClient ? (this.netPose?.crouch || 0) : this.crouchK;
    this.hitboxes.forEach((h, i) => { h.off.y = this.hbBase[i] - c * (i === 1 ? 0.25 : 0.5); });
    this.height = 2.0 - c * 0.5;
  }
  // A waist-to-chest-high box near us, with us on the far side of it from the target.
  findCover() {
    const t = this.tgt().pos;
    let best = null, bs = Infinity;
    for (const b of G.colliders) {
      const h = b.max.y - b.min.y;
      if (b.min.y > 0.3 || h < 1.1 || h > 3.2 || b.noRay) continue;
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      if (Math.hypot(cx - this.pos.x, cz - this.pos.z) > 20) continue;
      let dx = cx - t.x, dz = cz - t.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const ex = (b.max.x - b.min.x) / 2 + 0.85, ez = (b.max.z - b.min.z) / 2 + 0.85;
      const k = Math.min(ex / Math.max(Math.abs(dx), 1e-3), ez / Math.max(Math.abs(dz), 1e-3));
      const px = cx + dx * k, pz = cz + dz * k;
      const dT = Math.hypot(px - t.x, pz - t.z);
      if (dT < 8 || dT > 32) continue;
      if (pointInWorld(_t.set(px, 0.9, pz)) || pointInWorld(_t.set(px, 0.2, pz))) continue;
      if (G.enemies.some((e) => e !== this && e.alive && e.cover && Math.hypot(e.cover.x - px, e.cover.z - pz) < 1.6)) continue;
      const score = Math.hypot(px - this.pos.x, pz - this.pos.z) + Math.abs(dT - 16) * 0.5;
      if (score < bs) { bs = score; best = new THREE.Vector3(px, 0, pz); }
    }
    return best;
  }
  // does the box still sit between us (crouched) and the target?
  coverHolds() {
    const t = this.tgt().pos;
    return !los(_t.set(this.pos.x, this.pos.y + 0.9, this.pos.z), _t2.set(t.x, t.y + 1.2, t.z));
  }
  think(dt) {
    const p = this.tgt();
    this.aimT = Math.max(0, (this.aimT || 0) - dt);
    let crouch = 0;
    if (this.goal) {
      this.cover = null;
      this.steer(this.goal.x, this.goal.z, this.speed, dt, { stopDist: 0.6 });
    } else if (this.cover) {
      const d = this.steer(this.cover.x, this.cover.z, this.speed * 1.25, dt, { stopDist: 0.35 });
      this.coverLife -= dt;
      if (d < 0.8) {
        // in cover: duck, then pop up to shoot, repeat
        this.peekT -= dt;
        if (this.peekT <= 0) { this.peeking = !this.peeking; this.peekT = this.peeking ? rand(1.4, 2.2) : rand(1.0, 2.0); if (this.peeking) this.cd = Math.min(this.cd, 0.25); }
        crouch = this.peeking || this.burst > 0 ? 0 : 1;
        // flanked, or been here a while: move
        if (this.coverLife <= 0 || (!this.peeking && !this.coverHolds() && this.distToPlayer() < 30)) { this.cover = null; this.coverT = rand(3, 6); }
      } else if (this.coverLife < -4) { this.cover = null; this.coverT = rand(2, 4); }
    } else {
      const d = this.distToPlayer();
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(1.2, 3); }
      const dx = (p.pos.x - this.pos.x) / (d || 1), dz = (p.pos.z - this.pos.z) / (d || 1);
      let tx = this.pos.x - dz * this.strafe * 4, tz = this.pos.z + dx * this.strafe * 4;
      if (d > 24 || !this.canSee) { tx = p.pos.x; tz = p.pos.z; }
      else if (d < 11) { tx = this.pos.x - dx * 4; tz = this.pos.z - dz * 4; }
      this.steer(tx, tz, this.speed, dt, { stopDist: 0.3 });
      // look for something to hide behind every few seconds
      this.coverT -= dt;
      if (this.coverT <= 0) {
        this.coverT = rand(2.5, 5);
        if (Math.random() < 0.75) { const c = this.findCover(); if (c) { this.cover = c; this.coverLife = rand(9, 15); this.peeking = false; this.peekT = rand(0.6, 1.4); } }
      }
    }
    this.crouchK = damp(this.crouchK, crouch, 9, dt);
    // ducked down: hold fire
    if (this.crouchK > 0.5) { this.cd = Math.max(this.cd, 0.2); }
    this.facePlayer(dt);
    this.cd -= dt;
    // a glint at the barrel, then the burst (a fair warning to duck)
    if (this.cd <= 0 && this.canSee && this.distToPlayer() < 50 && p.alive && !(this.burstDelay > 0)) { this.burstDelay = 0.32; this.cd = rand(2, 3); fx.glint(this.muzzle(0.3, 1.55, 0.75), 0x7dff9a); }
    if (this.burstDelay > 0) { this.burstDelay -= dt; this.aimT = 0.6; if (this.burstDelay <= 0) this.burst = 3; }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burst--; this.burstT = 0.16; this.aimT = 0.6;
        this.doAct('fire', 0.14);
        this.fire(this.muzzle(0.3, 1.55, 0.75), { speed: 30, dmg: 7, color: 0x33ff66, size: 0.14, source: 'a Stonks Acolyte (the market crashed on you)' });
        playAt(this.pos, 'enemyShot');
      }
    }
  }
  onDeathFx(c) { fx.floatText(c.clone().setY(c.y + 1.2), 'NOT STONKS 📉', { color: '#ff4444', height: 0.5 }); }
}

// ---------------- NYAN SHANK ----------------
export class Nyan extends Enemy {
  constructor() {
    super({ name: 'Nyan Shank', hp: 60, radius: 0.6, height: 1.0, speed: 10, flying: true, gib: 0xff8fd6, deathLines: ['ran out of pop-tart', ': nyan.exe has stopped responding'] });
    this.useRig(new R.NyanRig());
    this.hb(0, 0.5, 0, 0.6).hb(0, 0.4, 0.75, 0.35, true);
    this.ang = rand(0, Math.PI * 2); this.orbitR = rand(8, 14); this.alt = rand(3, 6); this.dir = Math.random() < 0.5 ? 1 : -1;
  }
  think(dt) {
    const p = this.tgt();
    this.ang += dt * 0.6 * this.dir;
    const tx = p.pos.x + Math.cos(this.ang) * this.orbitR, tz = p.pos.z + Math.sin(this.ang) * this.orbitR, ty = p.pos.y + this.alt;
    _t.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
    const len = _t.length();
    if (len > 0.01) _t.multiplyScalar(Math.min(this.speed, len * 1.5) / len);
    this.vel.lerp(_t, 1 - Math.exp(-3 * dt));
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < 1) this.pos.y = 1;
    this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 6, dt);
    this.cd -= dt;
    if (this.cd <= 0 && this.canSee) {
      this.cd = rand(1.4, 2.4);
      this.fire(this.center(new THREE.Vector3()), { speed: 40, dmg: 5, color: 0xff6ad5, size: 0.12, spread: 0.04, source: 'a Nyan Shank (nyan nyan nyan)' });
      playAt(this.pos, 'laser');
    }
  }
}

// ---------------- SUS SNIPER (hobgoblin) ----------------
export class SusSniper extends Enemy {
  constructor(perches = G.encounter?.perches || []) {
    super({ name: 'Sus Sniper', hp: 220, radius: 0.45, height: 1.5, speed: 3, rank: 'major', gib: 0xc51111, deathLines: ['was ejected', 'was not the impostor (but was very sus)'] });
    this.useRig(new R.CrewRig(0x1a1a1a, 0xff2020, { rifle: true }));
    this.hb(0, 0.9, 0, 0.55).hb(0, 1.15, 0.32, 0.27, true);
    this.perches = perches; this.state = 'idle'; this.aimT = 0; this.vented = false;
    this.beam = new fx.Beam(0xff1010, 0.03, 0.7);
    this.lockPt = new THREE.Vector3();
    this.cd = rand(2, 4);
  }
  pose() { return { aim: this.state === 'aim' }; }
  netVis() {
    const b = this.beam.m;
    return [r2(this.model.position.y), b.visible ? 1 : 0, ...(b.visible ? [r2(this.eyeV?.x ?? 0), r2(this.eyeV?.y ?? 0), r2(this.eyeV?.z ?? 0), r2(this.lockPt.x), r2(this.lockPt.y), r2(this.lockPt.z), b.scale.x] : [])];
  }
  applyVis(v) {
    this.model.position.y = v[0];
    if (v[1]) this.beam.set(_t.set(v[2], v[3], v[4]), _t2.set(v[5], v[6], v[7]), v[8]); else this.beam.hide();
  }
  think(dt) {
    const p = this.tgt();
    if (this.state === 'vent') {
      this.ventT -= dt;
      if (this.ventT > 0.6) this.model.position.y = -1.6 * (1 - (this.ventT - 0.6) / 0.6);
      else if (this.ventT > 0) { if (!this.teleported) { this.teleported = true; const np = pick(this.perches.filter((q) => distXZ(q, this.pos) > 2)) || this.pos; this.pos.copy(np); this.home = np.clone(); fx.floatText(this.top(_t).clone(), '*vent noises*', { color: '#ff5555', height: 0.5 }); playAt(this.pos, 'vent'); } this.model.position.y = -1.6 * (this.ventT / 0.6); }
      else { this.model.position.y = 0; this.state = 'idle'; this.immune = false; this.cd = 1.5; }
      return;
    }
    if (!this.home) this.home = this.pos.clone();
    this.steer(this.home.x, this.home.z, this.speed, dt, { stopDist: 0.3 });
    this.facePlayer(dt, 5);
    const eye = this.eyeV = this.hbWorld(this.hitboxes[1], new THREE.Vector3());
    if (this.state === 'idle') {
      this.beam.hide();
      this.cd -= dt;
      if (this.cd <= 0 && this.canSee && p.alive) { this.state = 'aim'; this.aimT = 1.5; playAt(this.pos, 'sus'); }
    } else if (this.state === 'aim') {
      this.aimT -= dt;
      if (this.aimT > 0.3) this.lockPt.set(p.pos.x, p.pos.y + 1.2, p.pos.z);
      this.beam.set(eye, this.lockPt, this.aimT < 0.3 ? 0.08 : 0.03);
      if (this.aimT <= 0) {
        this.state = 'idle'; this.cd = rand(2.5, 4); this.beam.hide();
        const dir = this.lockPt.clone().sub(eye).normalize();
        const h = raycast(eye, dir, 150, { enemies: false });
        fx.tracer(eye, h.point, 0xff3030, 0.12, 0.15);
        playAt(eye, 'sn');
        _t.set(p.pos.x, p.pos.y + 1.0, p.pos.z);
        if (p.alive && distToSegment(_t, eye, h.point) < 0.75) hurtPlayer(p, 38, 'a Sus Sniper (they saw you vent)');
      }
    }
  }
  onHurt() {
    if (!this.vented && this.hp < this.maxHp * 0.5 && this.perches.length > 1) {
      this.vented = true; this.state = 'vent'; this.ventT = 1.2; this.immune = true; this.teleported = false; this.beam.hide();
      playAt(this.pos, 'vent');
    }
  }
}

// ---------------- MOAI KNIGHT ----------------
export class MoaiKnight extends Enemy {
  constructor() {
    super({ name: 'Moai Knight', hp: 650, radius: 0.8, height: 2.9, speed: 2.6, rank: 'major', gib: 0x7d7a73, deathLines: ['🗿', 'has returned to Easter Island', 'was out-mogged'] });
    this.addShield('arc');
    this.useRig(new R.MoaiKnightRig());
    this.height = 3.2;
    this.hb(0, 1.2, 0, 0.8).hb(0, 0.5, 0, 0.5).hb(0, 2.45, 0.2, 0.62, true);
    this.windup = 0; this.cd = rand(2, 3.5);
    this.chargeCd = rand(4, 7); this.chargeState = null;
  }
  pose() {
    if (this.chargeState === 'wind') return { windup: 1 - this.chargeT / 0.8 };
    return { windup: this.windup > 0 ? 1 - this.windup / 0.6 : 0 };
  }
  animate(dt) {
    // heavy stone footsteps you can hear coming
    this.stepAcc = (this.stepAcc || 0) + dt * (this.animSpeed || 0);
    if (this.stepAcc > 1.6) { this.stepAcc = 0; local(() => playAt(this.pos, 'land', 0.9)); }
  }
  // The charge: stamp + eyes flare (0.8 s), then a straight-line run. Hits hard; miss and hit a wall and it staggers.
  charge(dt, p) {
    if (this.chargeState === 'wind') {
      this.chargeT -= dt;
      this.facePlayer(dt, 6);
      this.vel.set(0, this.vel.y, 0); this.physics(dt);
      if (Math.random() < 0.3) fx.burst(this.pos.clone().setY(0.2), 0x9a958c, 2, 3, 0.12, 0.5, 4);
      if (this.chargeT <= 0) {
        this.chargeState = 'run'; this.chargeT = 1.5;
        this.chargeDir = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
        playAt(this.pos, 'roar'); this.hitThisCharge = false;
      }
      return true;
    }
    if (this.chargeState === 'run') {
      this.chargeT -= dt;
      this.vel.x = this.chargeDir.x * 15; this.vel.z = this.chargeDir.z * 15;
      this.yaw = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      const r = moveCollide(this.pos, this.vel, dt, this.radius, this.height);
      this.vel.y = r.ground ? 0 : this.vel.y - 25 * dt;
      this.stepAcc = (this.stepAcc || 0) + dt * 15;
      for (const q of [G.player, ...G.avatars.values()]) {
        if (!q?.alive || this.hitThisCharge) continue;
        if (distXZ(q.pos, this.pos) < this.radius + 0.9 && Math.abs(q.pos.y - this.pos.y) < 2.5) {
          this.hitThisCharge = true;
          hurtPlayer(q, 45, 'a Moai Knight (charged)');
          if (q === G.player) { q.vel.x += this.chargeDir.x * 16; q.vel.z += this.chargeDir.z * 16; q.vel.y += 6; }
          playAt(q.pos, 'bigBonk'); G.shake += 0.4;
        }
      }
      if (r.wall) {
        // straight into the wall: the stone rings, the knight is dazed
        this.chargeState = null; this.stunT = 2.0; this.flinch = 1.2;
        new Shockwave({ center: this.pos.clone().setY(0.1), speed: 10, maxR: 8, dmg: 20, height: 0.8, color: 0xbfb6a8, source: 'a Moai Knight hitting a wall (it was your fault)' });
        playAt(this.pos, 'vineBoom', 0.7); fx.burst(this.center(_t), 0xbfb6a8, 18, 6, 0.15, 0.7, 8);
        fx.floatText(this.top(_t).clone(), 'BONK', { height: 0.8, color: '#ffffff' });
      } else if (this.chargeT <= 0) this.chargeState = null;
      return true;
    }
    return false;
  }
  think(dt) {
    const p = this.tgt();
    const d = this.distToPlayer();
    if (this.charge(dt, p)) return;
    this.chargeCd -= dt;
    if (this.chargeCd <= 0 && this.windup <= 0 && d > 6 && d < 16 && this.canSee && p.alive && Math.abs(p.pos.y - this.pos.y) < 1.5) {
      this.chargeCd = rand(7, 11); this.chargeState = 'wind'; this.chargeT = 0.8;
      playAt(this.pos, 'land', 0.6); fx.floatText(this.top(_t).clone(), '🗿💢', { height: 0.6 });
      return;
    }
    if (d > 13 || !this.canSee) this.steer(p.pos.x, p.pos.z, this.speed, dt, { stopDist: 2 });
    else this.steer(this.pos.x, this.pos.z, 0, dt);
    this.facePlayer(dt, 3);
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        this.doAct('slam', 0.4);
        this.fire(this.muzzle(0, 2.3, 1.0), { speed: 15, dmg: 30, color: 0x8a867e, size: 0.55, splash: 3, spread: 0.01, source: 'a Moai Knight (vine boom)', trail: 0x555555 });
        playAt(this.pos, 'vineBoom', 1.1);
        G.shake += 0.15;
      }
      return;
    }
    this.cd -= dt;
    if (this.cd <= 0 && this.canSee && p.alive) { this.windup = 0.6; this.cd = rand(3, 4.2); }
    else this.windup = Math.max(0, this.windup);
  }
  onDeathFx(c) { playAt(c, 'vineBoom', 0.8); fx.floatEmoji(c.clone().setY(c.y + 1), '🗿', 2, 2, 1); }
}

// ---------------- WIZARD (came from the moon) ----------------
export class Wizard extends Enemy {
  constructor() {
    super({ name: 'Wizard', hp: 380, radius: 0.6, height: 2.4, speed: 5, flying: true, rank: 'major', gib: 0xc68bff, deathLines: ['went back to the moon', 'had no time to explain'] });
    this.addShield('void');
    this.useRig(new R.WizardRig());
    const label = textSprite('i came from the moon', 0.26, { color: '#d9b8ff' }); label.position.set(0, 2.9, 0); this.mesh.add(label);
    this.hb(0, 1.0, 0, 0.6).hb(0, 1.85, 0, 0.33, true);
    this.cd = rand(2, 3); this.wander = rand(0, 6);
    this.blinkDmg = 0; this.blinkCd = 2;
  }
  onHurt(d) { this.blinkDmg += d; }
  onShieldHit(d) { this.blinkDmg += d * 0.6; }
  // took a beating: vanish in a puff of moon-smoke and reappear somewhere else in the air
  blink(p) {
    const from = this.center(new THREE.Vector3());
    let best = null;
    for (let i = 0; i < 12 && !best; i++) {
      const a = rand(0, Math.PI * 2), r = rand(10, 17);
      const q = new THREE.Vector3(p.pos.x + Math.cos(a) * r, p.pos.y + rand(2.5, 5), p.pos.z + Math.sin(a) * r);
      if (!pointInWorld(q) && !pointInWorld(_t2.copy(q).setY(q.y + 1.5)) && los(q, _t.set(p.pos.x, p.pos.y + 1.5, p.pos.z))) best = q;
    }
    if (!best) return;
    fx.burst(from, 0xc68bff, 22, 5, 0.14, 0.6, -2); fx.floatEmoji(from, '🌙', 1.4, 1, 1);
    this.pos.copy(best).setY(best.y - this.height * 0.5); this.vel.set(0, 0, 0);
    fx.burst(this.center(_t).clone(), 0xc68bff, 22, 5, 0.14, 0.6, -2);
    playAt(this.pos, 'superCast');
    this.cd = Math.min(this.cd, 0.9); // and it answers right away
  }
  think(dt) {
    const p = this.tgt();
    this.blinkCd -= dt;
    if (this.blinkDmg > 110 && this.blinkCd <= 0) { this.blinkDmg = 0; this.blinkCd = 4; this.blink(p); }
    this.wander += dt * 0.3;
    const tx = p.pos.x + Math.cos(this.wander) * 16, tz = p.pos.z + Math.sin(this.wander) * 16;
    _t.set(tx - this.pos.x, (p.pos.y + 2.5 + Math.sin(this.t * 2) * 0.6) - this.pos.y, tz - this.pos.z);
    const len = _t.length();
    if (len > 0.01) _t.multiplyScalar(Math.min(this.speed, len) / len);
    this.vel.lerp(_t, 1 - Math.exp(-2 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.facePlayer(dt);
    this.cd -= dt;
    if (this.cd <= 0 && this.canSee) {
      this.cd = rand(3.5, 5);
      this.doAct('cast', 0.7);
      for (let i = 0; i < 3; i++) {
        const pr = this.fire(this.muzzle(-0.32, 1.0, 0.1), { speed: 11, dmg: 11, color: 0xc68bff, size: 0.22, spread: 0.5, homing: 1.6, life: 5, source: 'a Wizard (it came from the moon)', trail: 0x8a4fff });
        pr.vel.y += rand(2, 5);
      }
      playAt(this.pos, 'laser');
    }
  }
}

// ---------------- SIGMA ----------------
export class Sigma extends Enemy {
  constructor() {
    super({ name: 'Sigma', hp: 260, radius: 0.45, height: 2.0, speed: 5, rank: 'major', gib: 0x222222, deathLines: ['lost the grindset', 'got mogged', 'forgot to mew'] });
    this.addShield('solar');
    this.useRig(R.sigmaRig());
    this.hb(0, 1.2, 0, 0.45).hb(0, 0.6, 0, 0.3).hb(0, 1.98, 0.02, 0.27, true);
    this.mewT = rand(4, 8); this.mewing = 0; this.strafe = 1; this.strafeT = 2;
  }
  pose() { return { mew: this.mewing > 0, aim: this.aimT > 0 }; }
  think(dt) {
    const p = this.tgt();
    const d = this.distToPlayer();
    this.aimT = Math.max(0, (this.aimT || 0) - dt);
    if (this.mewing > 0) {
      this.mewing -= dt;
      this.steer(this.pos.x, this.pos.z, 0, dt);
      this.facePlayer(dt);
      if (this.mewing <= 0) this.immune = false;
      return;
    }
    this.mewT -= dt;
    if (this.mewT <= 0) { this.mewT = rand(6, 10); this.mewing = 1.4; this.immune = true; fx.floatText(this.top(_t).clone(), '*mewing* 🤫🧏', { color: '#ffffff', height: 0.45 }); return; }
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(1, 2.5); }
    const dx = (p.pos.x - this.pos.x) / (d || 1), dz = (p.pos.z - this.pos.z) / (d || 1);
    let tx = this.pos.x - dz * this.strafe * 4, tz = this.pos.z + dx * this.strafe * 4;
    if (d > 16 || !this.canSee) { tx = p.pos.x; tz = p.pos.z; }
    this.steer(tx, tz, this.speed, dt, { stopDist: 0.3 });
    this.facePlayer(dt);
    this.cd -= dt;
    if (this.cd <= 0 && this.canSee && p.alive) {
      this.cd = rand(1.3, 2.2);
      this.aimT = 0.7; this.doAct('fire', 0.14);
      this.fire(this.muzzle(0.3, 1.55, 0.75), { speed: 26, dmg: 10, color: 0x40a0ff, size: 0.16, source: 'a Sigma (ratio\'d)' });
      playAt(this.pos, 'enemyShot');
    }
  }
}

// co-op: how clients rebuild each enemy type. Encounters register their own bosses/mechanic actors.
export const NET_TYPES = {};
// ---------------- SMUG TROLL ----------------
// Cloaked (a faint shimmer), it circles round behind you. Close and unseen, it decloaks with a snicker
// ("u mad?") and strikes. Turn and look at it and it panics and backs off; shooting it knocks the cloak off.
const _fw = new THREE.Vector3();
export class Troll extends Enemy {
  constructor() {
    super({ name: 'Smug Troll', hp: 170, radius: 0.45, height: 2.0, speed: 6.2, gib: 0xf0f0f0, ash: 0xd0e8ff, deathLines: ['problem?', 'got trolled', 'logged off mad', 'was the one who got mad'] });
    this.useRig(R.trollRig());
    this.hb(0, 1.2, 0, 0.42).hb(0, 0.6, 0, 0.3).hb(0, 2.08, 0.02, 0.28, true);
    this.mats = []; this.mesh.traverse((o) => { if (o.material && !this.mats.includes(o.material)) { o.material.transparent = true; this.mats.push(o.material); } });
    this.cloak = 1; this.revealT = 0; this.state = 'stalk'; this.st = 0; this.side = Math.random() < 0.5 ? -1 : 1; this.cd = 0;
  }
  netVis() { return [r2(this.cloak)]; }
  applyVis(v) { this.cloak = v[0]; }
  onHurt() { this.revealT = 1.6; }
  onShieldHit() { this.revealT = 1.6; }
  pose() { return { aim: this.state === 'strike' }; }
  animate(dt) {
    // fade to a shimmer while cloaked
    const vis = 1 - this.cloak * 0.93, shimmer = this.cloak > 0.5 ? (Math.sin(this.t * 13) * 0.5 + 0.5) * 0.06 : 0;
    for (const m of this.mats) { m.opacity = vis + shimmer; m.depthWrite = vis > 0.9; }
    if (this.bar) this.bar.visible = this.bar.visible && this.cloak < 0.5;
  }
  // is that guardian looking at us?
  watched(p) {
    const yaw = p.yaw; // (avatars carry the same yaw convention as the local player)
    _fw.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const to = _t.set(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z); const d = to.length();
    return d < 30 && _fw.dot(to.normalize()) > 0.82 && this.canSee;
  }
  think(dt) {
    const p = this.tgt();
    this.revealT = Math.max(0, this.revealT - dt); this.cd -= dt;
    const want = this.revealT > 0 || this.state === 'strike' ? 0 : 1;
    this.cloak += (want - this.cloak) * Math.min(1, dt * (want ? 2 : 8));
    const yaw = p.yaw;
    _fw.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    if (this.state === 'stalk') {
      // aim for a spot behind (and a bit to the side of) the target
      const bx = p.pos.x - _fw.x * 2.4 + _fw.z * this.side * 1.2, bz = p.pos.z - _fw.z * 2.4 - _fw.x * this.side * 1.2;
      const d = this.steer(bx, bz, this.speed, dt, { stopDist: 0.4 });
      if (this.watched(p) && this.cloak > 0.6) { this.state = 'flee'; this.st = rand(1.2, 1.8); fx.floatText(this.top(_t).clone(), pick(['!', 'wait no', 'not like this']), { height: 0.4 }); }
      else if (d < 1.2 && distXZ(this.pos, p.pos) < 4 && this.cd <= 0 && p.alive) {
        this.state = 'strike'; this.st = 0.55; this.facePlayer(dt, 30);
        playAt(this.pos, 'troll'); fx.floatText(this.top(_t).clone(), pick(['u mad?', 'problem?', 'gottem']), { height: 0.55, color: '#ffffff' });
      }
    } else if (this.state === 'flee') {
      this.st -= dt;
      const ax = this.pos.x - p.pos.x, az = this.pos.z - p.pos.z, l = Math.hypot(ax, az) || 1;
      this.steer(this.pos.x + ax / l * 5 + az / l * this.side * 3, this.pos.z + az / l * 5 - ax / l * this.side * 3, this.speed * 1.2, dt);
      if (this.st <= 0) { this.state = 'stalk'; this.side *= -1; }
    } else if (this.state === 'strike') {
      // the lunge: close the gap during the snicker
      this.st -= dt; this.facePlayer(dt, 20); this.steer(p.pos.x, p.pos.z, this.st < 0.3 ? 10 : 2, dt, { stopDist: 0.9 });
      if (this.st <= 0) {
        if (distXZ(this.pos, p.pos) < 2.6 && p.alive) {
          hurtPlayer(p, 28, 'a Smug Troll (problem?)');
          if (p === G.player) { p.vel.x += (p.pos.x - this.pos.x) * 4; p.vel.z += (p.pos.z - this.pos.z) * 4; p.vel.y += 3; }
          this.doAct('fire', 0.2);
        }
        this.state = 'flee'; this.st = rand(2.5, 3.5); this.cd = rand(3, 5);
      }
    }
  }
}

// ---------------- RICK ROLLER ----------------
// A mirrored disco ball that rolls at you trailing music notes. Let it reach you and you're rickrolled:
// forced to dance for a moment, gun down. Shoot it first.
export class RickRoller extends Enemy {
  constructor() {
    super({ name: 'Rick Roller', hp: 110, radius: 0.7, height: 1.4, speed: rand(6.5, 7.5), gib: 0xd8e4ff, ash: 0xffffff, deathLines: ['was let down', 'gave you up', 'deserted you', 'ran around'] });
    this.model = new THREE.Group(); this.mesh.add(this.model);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 3), new THREE.MeshStandardMaterial({ color: 0xdfe6f2, metalness: 1, roughness: 0.08, flatShading: true }));
    ball.position.y = 0.7; ball.castShadow = true; this.model.add(ball); this.ball = ball;
    // a little sparkle on random facets
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glint.scale.setScalar(0.5); this.model.add(glint); this.glint = glint;
    this.light = new THREE.PointLight(0xff4fd8, 6, 7, 2); this.light.position.y = 0.8; this.model.add(this.light);
    this.hb(0, 0.7, 0, 0.72).hb(0, 1.15, 0, 0.3, true);
    this.noteT = 0; this.roll = new THREE.Quaternion();
  }
  animate(dt) {
    // roll with the ground speed, flash colours like a dancefloor
    const v = this.vel, sp = Math.hypot(v.x, v.z);
    if (sp > 0.1) { _t.set(v.z, 0, -v.x).normalize(); this.ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(_t, sp * dt / 0.7)); }
    else this.ball.rotation.y += dt * 1.5;
    const hue = (this.t * 0.6) % 1;
    this.light.color.setHSL(hue, 1, 0.6); this.light.intensity = 5 + Math.sin(this.t * 16) * 2;
    this.glint.position.set(Math.sin(this.t * 7) * 0.45, 0.7 + Math.cos(this.t * 5) * 0.45, 0.55);
    this.glint.material.opacity = 0.5 + Math.sin(this.t * 23) * 0.5;
    if ((this.noteT -= dt) <= 0) { this.noteT = rand(0.3, 0.6); local(() => fx.floatText(this.top(_t).clone(), pick(['♪', '♫', '♬']), { height: 0.4, color: '#' + new THREE.Color().setHSL(hue, 1, 0.65).getHexString(), life: 1 })); }
  }
  think(dt) {
    const p = this.tgt();
    const d = this.steer(p.pos.x, p.pos.z, this.speed, dt, { stopDist: 0.2, accel: 3 });
    if (d < 1.4 && p.alive && Math.abs(p.pos.y - this.pos.y) < 1.8) {
      // gotcha
      if (p === G.player) G.player.rickroll(); else G.net.sendTo(p.id, ['rick']);
      hurtPlayer(p, 8, 'a Rick Roller (never gonna live this down)');
      fx.burst(this.center(_t).clone(), 0xff4fd8, 30, 7, 0.1, 0.8, 6); fx.burst(this.center(_t).clone(), 0x7fd7ff, 20, 6, 0.1, 0.8, 6);
      this.drops = false; this.die();
    }
  }
}

export function registerNetType(Cls, make = () => new Cls()) { NET_TYPES[Cls.name] = make; }
[Doge, Stonks, Nyan, SusSniper, MoaiKnight, Wizard, Sigma].forEach((C) => registerNetType(C));

// Apply the enemy-side raid modifiers to a freshly made enemy (host spawns + client proxies)
export function applyMods(e) {
  if (e.rank === 'boss' || e.rank === 'neutral' || e.modded) return e;
  e.modded = true;
  if (modOn('speedy')) e.speed *= 1.3;
  if (modOn('bighead')) {
    for (const hb of e.hitboxes) if (hb.crit) hb.r *= 1.6;
    const head = e.rig?.j?.head; if (head) head.scale.multiplyScalar(1.6);
  }
  if (modOn('shielded') && e.rank === 'minor' && !e.shieldMax && e.hostile !== false) e.addShield(pick(ELEMENT_KEYS), 0.35);
  return e;
}
export function spawnEnemy(Type, x, z, y = null, ...args) {
  const e = applyMods(new Type(...args));
  e.spawnAt(x, y ?? (e.flying ? 5 : 0.05), z);
  G.enemies.push(e);
  return e;
}

export function updateEnemies(dt) {
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.alive) e.update(dt);
    if (!e.alive) G.enemies.splice(i, 1);
  }
}
export function clearEnemies() {
  for (const e of G.enemies) e.remove();
  G.enemies.length = 0;
  G.entities.clear();
}
registerNetType(RickRoller);
registerNetType(Troll);
