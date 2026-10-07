// Enemy base class + the common meme roster.
import * as THREE from 'three';
import { G, rand, pick, clamp, damp, dampAngle, distXZ, distToSegment, nearestPlayer, hurtPlayer, playerById, local } from './game.js';
import * as fx from './fx.js';
import { play, playAt } from './audio.js';
import { moveCollide } from './world.js';
import { los, Projectile, Pickup, raycast } from './combat.js';
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
  spawnAt(x, y, z) { this.pos.set(x, y, z); fx.spawnFx(this.pos); playAt(this.pos, 'spawn'); return this; }
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
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg; this.pop = 1; this.aggro = true;
    this.flinch = Math.min(1.2, this.flinch + (crit ? 0.9 : 0.45));
    this.rig?.hit(crit);
    this.lastHitBy = info.from ?? null;
    if (mine) fx.dmgNumber(this.top(_t), dmg, crit ? 'crit' : '');
    if (crit && mine) G.stats.crits++;
    this.onHurt?.(dmg, crit, info);
    if (this.hp <= 0) { this.hp = 0; this.die(info); }
    return dmg;
  }

  die() {
    if (!this.alive) return;
    const c = this.center(_t);
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
    G.entities.remove(this.mesh);
    this.mesh.rotation.x = 0;
    fx.dissolve(this.mesh, this.ash, this.rank === 'boss' ? 2.2 : 0.75);
  }
  // Silent removal (despawn, encounter reset)
  remove() {
    if (!this.alive) return;
    this.alive = false;
    this.cleanupMesh();
  }
  cleanupMesh() {
    G.entities.remove(this.mesh);
    if (this.bar) G.fxGroup.remove(this.bar);
    this.beam?.dispose();
    this.mesh.traverse((o) => {
      if (o.geometry && o.geometry !== barGeo) o.geometry.dispose();
      if (o.material && !o.material.userData?.shared && !o.isInstancedMesh) o.material.dispose?.();
    });
  }

  update(dt) {
    this.t += dt;
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
    const s = 1 + this.pop * 0.06;
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
      this.actN || 0, this.actName || 0, this.actDur || 0, ps ? [ps.aim ? 1 : 0, ps.mew ? 1 : 0, ps.task ? 1 : 0, r2(ps.windup || 0)] : 0];
  }
  applyRow(a) {
    if (!this.netPos) { this.netPos = new THREE.Vector3(a[3], a[4], a[5]); this.pos.copy(this.netPos); this.yaw = a[6]; }
    this.netPos.set(a[3], a[4], a[5]); this.netYaw = a[6];
    this.hp = a[7]; this.maxHp = a[8];
    this.immune = !!(a[9] & 1); this.untargetable = !!(a[9] & 2); this.hostile = !!(a[9] & 4);
    if (a[10]) this.applyVis?.(a[10]);
    if (this.actSeen !== undefined && a[12] !== this.actSeen && a[13]) this.rig?.play(a[13], a[14]);
    this.actSeen = a[12];
    if (a[15]) this.netPose = { aim: !!a[15][0], mew: !!a[15][1], task: !!a[15][2], windup: a[15][3] };
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
    const d = this.steer(p.pos.x, p.pos.z, this.speed, dt, { stopDist: 1.1 });
    this.cd -= dt;
    if (d < 1.9 && Math.abs(p.pos.y - this.pos.y) < 1.6 && this.cd <= 0 && p.alive) {
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
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = rand(1, 3); this.burst = 0; this.burstT = 0;
  }
  pose() { return { aim: this.burst > 0 || this.aimT > 0 }; }
  think(dt) {
    const p = this.tgt();
    this.aimT = Math.max(0, (this.aimT || 0) - dt);
    if (this.goal) {
      this.steer(this.goal.x, this.goal.z, this.speed, dt, { stopDist: 0.6 });
    } else {
      const d = this.distToPlayer();
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(1.2, 3); }
      const dx = (p.pos.x - this.pos.x) / (d || 1), dz = (p.pos.z - this.pos.z) / (d || 1);
      let tx = this.pos.x - dz * this.strafe * 4, tz = this.pos.z + dx * this.strafe * 4;
      if (d > 24 || !this.canSee) { tx = p.pos.x; tz = p.pos.z; }
      else if (d < 11) { tx = this.pos.x - dx * 4; tz = this.pos.z - dz * 4; }
      this.steer(tx, tz, this.speed, dt, { stopDist: 0.3 });
    }
    this.facePlayer(dt);
    this.cd -= dt;
    if (this.cd <= 0 && this.canSee && this.distToPlayer() < 50 && p.alive) { this.burst = 3; this.cd = rand(2, 3); }
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
    this.useRig(new R.MoaiKnightRig());
    this.height = 3.2;
    this.hb(0, 1.2, 0, 0.8).hb(0, 0.5, 0, 0.5).hb(0, 2.45, 0.2, 0.62, true);
    this.windup = 0; this.cd = rand(2, 3.5);
  }
  pose() { return { windup: this.windup > 0 ? 1 - this.windup / 0.6 : 0 }; }
  animate(dt) {
    // heavy stone footsteps you can hear coming
    this.stepAcc = (this.stepAcc || 0) + dt * (this.animSpeed || 0);
    if (this.stepAcc > 1.6) { this.stepAcc = 0; local(() => playAt(this.pos, 'land', 0.9)); }
  }
  think(dt) {
    const p = this.tgt();
    const d = this.distToPlayer();
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
    this.useRig(new R.WizardRig());
    const label = textSprite('i came from the moon', 0.26, { color: '#d9b8ff' }); label.position.set(0, 2.9, 0); this.mesh.add(label);
    this.hb(0, 1.0, 0, 0.6).hb(0, 1.85, 0, 0.33, true);
    this.cd = rand(2, 3); this.wander = rand(0, 6);
  }
  think(dt) {
    const p = this.tgt();
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
export function registerNetType(Cls, make = () => new Cls()) { NET_TYPES[Cls.name] = make; }
[Doge, Stonks, Nyan, SusSniper, MoaiKnight, Wizard, Sigma].forEach((C) => registerNetType(C));

export function spawnEnemy(Type, x, z, y = null, ...args) {
  const e = new Type(...args);
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
