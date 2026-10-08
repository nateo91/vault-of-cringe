// Raycasts, explosions, projectiles, shockwaves and pickups.
import * as THREE from 'three';
import { G, rand, pick, local, after, nearestPlayer, playerById } from './game.js';
import * as fx from './fx.js';
import { play, playAt, concuss } from './audio.js';
import { moveCollide } from './world.js';
import { textSprite, emojiSprite } from './textures.js';

const ray = new THREE.Ray(), tmp = new THREE.Vector3(), sph = new THREE.Sphere();

export function raycast(origin, dir, maxDist = 200, { enemies = true, world = true, ignore = null } = {}) {
  ray.set(origin, dir);
  let best = { dist: maxDist, point: null, enemy: null, crit: false };
  if (world) {
    for (const b of G.colliders) {
      if (b.noRay) continue;
      if (ray.intersectBox(b, tmp)) {
        const d = tmp.distanceTo(origin);
        if (d < best.dist) { best.dist = d; best.point = tmp.clone(); best.box = b; }
      }
    }
  }
  if (enemies) {
    for (const e of G.enemies) {
      if (!e.alive || e.untargetable || e === ignore) continue;
      for (const hb of e.hitboxes) {
        e.hbWorld(hb, sph.center); sph.radius = hb.r;
        if (ray.intersectSphere(sph, tmp)) {
          const d = tmp.distanceTo(origin);
          if (d < best.dist) best = { dist: d, point: tmp.clone(), enemy: e, crit: !!hb.crit };
        }
      }
    }
  }
  if (!best.point) best.point = origin.clone().addScaledVector(dir, maxDist);
  else if (!best.enemy && best.box) best.normal = boxNormal(best.box, best.point);
  return best;
}

// Which face of an AABB a point sits on.
function boxNormal(b, p) {
  const c = [[Math.abs(p.x - b.min.x), -1, 0, 0], [Math.abs(p.x - b.max.x), 1, 0, 0], [Math.abs(p.y - b.min.y), 0, -1, 0], [Math.abs(p.y - b.max.y), 0, 1, 0], [Math.abs(p.z - b.min.z), 0, 0, -1], [Math.abs(p.z - b.max.z), 0, 0, 1]];
  c.sort((a, z) => a[0] - z[0]);
  return new THREE.Vector3(c[0][1], c[0][2], c[0][3]);
}

const _d = new THREE.Vector3();
export function los(a, b) {
  _d.subVectors(b, a);
  const dist = _d.length();
  _d.divideScalar(dist || 1);
  const h = raycast(a, _d, dist, { enemies: false });
  return h.dist >= dist - 0.15;
}

const _c = new THREE.Vector3();
export function explode(pos, radius, dmg, { owner = 'player', color = 0xff8a2a, source = 'an explosion', knock = 1, big = 1, silent = false, localFx = false, ghost = false, element = null } = {}) {
  // projectile explosions are simulated on every machine, so their cosmetics stay local
  const cosmetic = () => {
    fx.explosion(pos, radius, color); if (!silent) playAt(pos, 'explosion', big);
    // close enough to feel it: muffled ears + ringing (local only, every machine judges its own camera)
    const d = G.camera.position.distanceTo(pos), r = radius * 2.2 + 2;
    if (d < r && big >= 0.7) concuss(Math.min(1, (1 - d / r) * 1.3 * big));
  };
  if (localFx) local(cosmetic); else cosmetic();
  G.shake += 0.25 * big * (ghost ? 0.4 : 1);
  if (ghost) return; // a teammate's rocket: their machine deals the damage
  const p = G.player;
  if (owner === 'player') {
    for (const e of G.enemies) {
      if (!e.alive || e.untargetable) continue;
      let dmin = Infinity;
      for (const hb of e.hitboxes) { e.hbWorld(hb, _c); dmin = Math.min(dmin, Math.max(0, _c.distanceTo(pos) - hb.r)); }
      if (dmin < radius) {
        e.takeDamage(dmg * (1 - 0.5 * dmin / radius), false, { splash: true, element });
        if (e.rank !== 'boss' && e.knockable !== false && knock) {
          _c.subVectors(e.pos, pos).setY(0).normalize();
          e.vel.addScaledVector(_c, 9 * knock); e.vel.y += 5 * knock;
        }
      }
    }
    // rocket jumping is a feature
    if (p.alive) {
      _c.copy(p.pos); _c.y += 0.9;
      const d = _c.distanceTo(pos);
      if (d < radius) {
        _c.sub(pos).normalize();
        p.vel.addScaledVector(_c, 13 * knock * (1 - d / radius));
        p.vel.y += 6 * knock * (1 - d / radius);
      }
    }
  } else if (p.alive) {
    _c.copy(p.pos); _c.y += 0.9;
    const d = _c.distanceTo(pos);
    if (d < radius + 0.4) p.hurt(dmg * (1 - 0.5 * d / (radius + 0.4)), source, pos);
  }
}

// ---------- Projectiles ----------
const projGeo = new THREE.SphereGeometry(1, 10, 8);
// enemy bolts: a white-hot core inside an over-bright coloured shell (blooms), stretched along the flight path
const boltMats = new Map();
function boltMats_(color) {
  if (!boltMats.has(color)) {
    const shell = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.7).multiplyScalar(2.5), toneMapped: false });
    shell.userData.shared = core.userData.shared = true;
    boltMats.set(color, { shell, core });
  }
  return boltMats.get(color);
}
export class Projectile {
  constructor(o) {
    Object.assign(this, { dmg: 10, radius: 0.25, owner: 'enemy', life: 6, gravity: 0, homing: 0, splash: 0, splashDmg: null, color: 0xff00ff, size: 0.2, target: null, source: 'a meme', onHit: null, crit: false, trail: 0, explodeColor: null, speed: 0, look: null, ghost: false, critable: false, element: null }, o);
    this.pos = o.pos.clone(); this.vel = o.vel.clone();
    this.speed = this.vel.length();
    if (this.look === 'nova') {
      this.mesh = new THREE.Mesh(fx.sphGeo, new THREE.MeshBasicMaterial({ color: 0x9a4dff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
      this.mesh.scale.setScalar(0.9);
    } else if (this.owner === 'enemy' && !this.gravity && this.size <= 0.3) {
      const m = boltMats_(this.color);
      this.mesh = new THREE.Group();
      const len = 1.6 + this.speed * 0.045;
      const shell = new THREE.Mesh(projGeo, m.shell); shell.scale.set(this.size * 1.05, this.size * 1.05, this.size * len * 1.2); this.mesh.add(shell);
      const core = new THREE.Mesh(projGeo, m.core); core.scale.set(this.size * 0.4, this.size * 0.4, this.size * len); this.mesh.add(core);
      this.bolt = true;
    } else {
      this.mesh = new THREE.Mesh(projGeo, fx.basicMat(this.color));
      this.mesh.scale.setScalar(this.size);
    }
    // co-op: enemy shots are replicated to clients (who dodge them locally); your own shots show up for the team as ghosts
    if (G.net.active && !o.fromNet) {
      if (this.owner === 'enemy' && G.net.isHost) G.net.emit(['proj', this.serialize()]);
      else if (this.owner === 'player' && !this.ghost) G.net.playerEv(['proj', this.serialize()]);
    }
    this.mesh.position.copy(this.pos);
    G.fxGroup.add(this.mesh);
    this.alive = true; this.age = 0; this.trailT = 0;
    G.projectiles.push(this);
  }
  serialize() {
    const r = (v) => v.toArray().map((n) => +n.toFixed(3));
    const t = this.target;
    return { pos: r(this.pos), vel: r(this.vel), dmg: this.dmg, radius: this.radius, owner: this.owner, life: this.life, gravity: this.gravity, homing: this.homing,
      splash: this.splash, splashDmg: this.splashDmg, color: this.color, size: this.size, source: this.source, trail: this.trail, explodeColor: this.explodeColor,
      critable: this.critable, look: this.look, element: this.element, tgt: t ? (t.nid ?? t.netId ?? null) : null };
  }
  static fromNet(o, ghost) {
    let target = null;
    if (typeof o.tgt === 'number') target = G.enemies.find((e) => e.nid === o.tgt) || null;
    else if (o.tgt != null) target = playerById(o.tgt);
    return new Projectile({ ...o, pos: new THREE.Vector3(...o.pos), vel: new THREE.Vector3(...o.vel), target, ghost, fromNet: true });
  }
  update(dt) {
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { this.finish(null); return; }
    if (this.homing && this.target) {
      const tg = this.target;
      const tp = !tg.alive ? null : tg.isGuardian ? tmp.copy(tg.pos).setY(tg.pos.y + 1.0) : tg.center(tmp);
      if (tp) {
        const desired = tp.sub(this.pos).normalize().multiplyScalar(this.speed);
        this.vel.lerp(desired, Math.min(1, this.homing * dt));
        this.vel.setLength(this.speed);
      }
    }
    this.vel.y -= this.gravity * dt;
    const len = this.vel.length() * dt;
    const n = Math.max(1, Math.ceil(len / 0.4));
    for (let i = 0; i < n; i++) {
      this.pos.addScaledVector(this.vel, dt / n);
      if (this.checkHits()) return;
    }
    this.mesh.position.copy(this.pos);
    if (this.bolt) this.mesh.lookAt(tmp.copy(this.pos).add(this.vel));
    if (this.trail) {
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = 0.03; local(() => fx.burst(this.pos, this.trail, 1, 0.5, this.size * 0.8, 0.35, 0)); }
    }
  }
  // a point back along the flight path: where the shot came from, for the damage-direction arc
  from(out) { const v = this.vel.lengthSq() > 0.01 ? this.vel : null; return out.copy(this.pos).addScaledVector(v ? _d.copy(v).normalize() : _d.set(0, 0, 0), -6); }
  checkHits() {
    for (const b of G.colliders) if (!b.noRay && b.containsPoint(this.pos)) { this.finish(null); return true; }
    if (this.owner === 'enemy') {
      const p = G.player;
      if (p.alive) {
        const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z;
        if (dx * dx + dz * dz < (0.45 + this.radius) ** 2 && this.pos.y > p.pos.y - this.radius && this.pos.y < p.pos.y + 1.8 + this.radius) {
          if (!this.splash) p.hurt(this.dmg, this.source, this.from(_c));
          this.finish(null); return true;
        }
      }
    } else {
      for (const e of G.enemies) {
        if (!e.alive || e.untargetable) continue;
        for (const hb of e.hitboxes) {
          e.hbWorld(hb, sph.center);
          if (sph.center.distanceTo(this.pos) < hb.r + this.radius) {
            if (this.dmg && !this.ghost) e.takeDamage(this.dmg, !!hb.crit && this.critable, { projectile: true, element: this.element });
            this.finish(e); return true;
          }
        }
      }
    }
    return false;
  }
  finish(hitEnemy) {
    if (!this.alive) return;
    this.alive = false;
    G.fxGroup.remove(this.mesh);
    if (this.look === 'nova') {
      // the void ball collapses inward for a beat, then detonates
      const at = this.pos.clone();
      local(() => fx.implode(at, 3.5));
      after(0.28, () => {
        explode(at, this.splash, this.splashDmg ?? this.dmg, { owner: this.owner, color: this.explodeColor || this.color, source: this.source, big: 1.6, localFx: true, ghost: this.ghost, element: this.element });
        if (!this.ghost) this.onHit?.(at, hitEnemy);
      });
      return;
    }
    if (this.splash) explode(this.pos, this.splash, this.splashDmg ?? this.dmg, { owner: this.owner, color: this.explodeColor || this.color, source: this.source, big: this.splash > 6 ? 1.6 : 1, localFx: true, ghost: this.ghost, element: this.element });
    else local(() => fx.burst(this.pos, this.color, 5, 3, 0.1, 0.3));
    if (!this.ghost) this.onHit?.(this.pos, hitEnemy);
  }
}

// ---------- Shockwaves (jump over them!) ----------
export class Shockwave {
  constructor({ center, speed = 15, maxR = 40, dmg = 35, height = 0.8, color = 0xff4444, source = 'a shockwave', fromNet = false }) {
    Object.assign(this, { speed, maxR, dmg, height, source });
    if (G.net.isHost && !fromNet) G.net.emit(['shock', { center: center.toArray(), speed, maxR, dmg, height, color, source }]);
    this.center = center.clone(); this.r = 0.5; this.done = false; this.alive = true;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), mat);
    this.mesh.position.copy(this.center); this.mesh.position.y += height / 2;
    G.fxGroup.add(this.mesh);
    G.hazards.push(this);
  }
  update(dt) {
    const prev = this.r;
    this.r += this.speed * dt;
    this.mesh.scale.set(this.r, this.height, this.r);
    this.mesh.material.opacity = 0.55 * (1 - this.r / this.maxR) + 0.15;
    const p = G.player;
    if (!this.done && p.alive) {
      const d = Math.hypot(p.pos.x - this.center.x, p.pos.z - this.center.z);
      if (d >= prev - 0.5 && d <= this.r + 0.5 && p.pos.y - this.center.y < this.height - 0.05) {
        this.done = true;
        p.hurt(this.dmg, this.source, this.center);
        p.vel.y += 6;
      }
    }
    if (this.r >= this.maxR) this.dispose();
  }
  dispose() {
    if (!this.alive) return;
    this.alive = false;
    G.fxGroup.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}

// ---------- Pickups ----------
const PICKUPS = {
  special: { color: 0x3dff8a, label: 'SPECIAL AMMO' },
  heavy: { color: 0xb35cff, label: 'HEAVY AMMO' },
  orb: { color: 0xfff1a0, label: null },
  aura: { color: 0xffd23f, label: '+1000 AURA' },
  engram: { color: 0xb35cff, label: 'ENGRAM' },
};
export class Pickup {
  constructor(kind, pos, { onCollect = null, life = 40, proxy = false } = {}) {
    this.kind = kind; this.onCollect = onCollect; this.life = life; this.alive = true;
    this.nid = G.nextNid++; this.proxy = proxy;
    this.pos = pos.clone(); this.vel = new THREE.Vector3(rand(-2, 2), 5, rand(-2, 2));
    this.mesh = new THREE.Group();
    const def = PICKUPS[kind];
    if (kind === 'orb') {
      const m = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: def.color }));
      m.scale.setScalar(0.18); this.mesh.add(m);
    } else if (kind === 'engram') {
      // a spinning legendary engram, glowing purple like it should
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshStandardMaterial({ color: 0x9a4dff, emissive: 0x7a2dff, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.2, flatShading: true }));
      this.mesh.add(m); this.spin = m;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0xb070ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(1.6); this.mesh.add(glow);
      this.life = 90;
      // the loot beam: a tall shaft of light + a ring on the ground once it lands
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb070ff).multiplyScalar(1.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }));
      this.beam.position.y = 7; this.mesh.add(this.beam);
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb070ff).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
      this.ring.rotation.x = -Math.PI / 2; G.fxGroup.add(this.ring);
    } else if (kind === 'aura') {
      this.mesh.add(emojiSprite('✨', 1.2));
      const t = textSprite('+1000 AURA', 0.35, { color: '#ffd23f' }); t.position.y = 0.9; this.mesh.add(t);
    } else {
      const m = new THREE.Mesh(fx.boxGeo, new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.8 }));
      m.scale.set(0.5, 0.3, 0.3); this.mesh.add(m);
      this.spin = m;
    }
    this.inner = this.mesh.children[0];
    this.mesh.position.copy(this.pos);
    G.fxGroup.add(this.mesh);
    if (!proxy) G.pickups.push(this);
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return this.remove();
    const p = nearestPlayer(this.pos) || G.player;
    const d = tmp.copy(p.pos).setY(p.pos.y + 0.8).sub(this.pos);
    const dist = d.length();
    const magnet = this.kind === 'orb' ? 6 : 3.5;
    if (p.alive && dist < magnet) {
      this.pos.addScaledVector(d.normalize(), Math.min(dist, (magnet - dist + 4) * dt * 2.5));
      if (dist < 1.3) return this.collect(p);
    } else {
      this.vel.y -= 20 * dt;
      this.vel.x *= 0.96; this.vel.z *= 0.96;
      const r = moveCollide(this.pos, this.vel, dt, 0.15, 0.3);
      if (r.ground) { this.vel.x *= 0.5; this.vel.z *= 0.5; if (this.beam && !this.landed) { this.landed = true; local(() => playAt(this.pos, 'engram')); } }
      if (this.pos.y < -30) return this.remove();
    }
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += 0.4 + Math.sin(G.time * 4 + this.life) * 0.12;
    if (this.spin) this.spin.rotation.y += dt * 2;
    if (this.beam) {
      const k = this.landed ? Math.min(1, (this.beamK = (this.beamK || 0) + dt * 2)) : 0;
      this.beam.material.opacity = k * (0.32 + Math.sin(G.time * 3) * 0.06);
      this.ring.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
      const rr = 1 + ((G.time * 0.8) % 1) * 1.8;
      this.ring.scale.setScalar(rr); this.ring.material.opacity = k * (1 - (rr - 1) / 1.8) * 0.8;
    }
  }
  collect(p = G.player) {
    if (p === G.player) local(() => applyPickup(this.kind));
    else G.net.sendTo(p.id, ['pickup', this.kind]);
    const label = PICKUPS[this.kind].label;
    if (label) fx.floatText(this.pos.clone().setY(this.pos.y + 1), label, { height: 0.35, color: '#' + PICKUPS[this.kind].color.toString(16).padStart(6, '0'), life: 1 });
    this.onCollect?.(this);
    this.remove();
  }
  remove() {
    if (!this.alive) return;
    this.alive = false;
    G.fxGroup.remove(this.mesh);
    if (this.ring) G.fxGroup.remove(this.ring);
  }
}

// The effect of grabbing a pickup, applied on whichever machine owns that guardian.
export function applyPickup(kind) {
  const p = G.player;
  if (kind === 'special') { p.addAmmo('special', 4); play('pickup'); }
  else if (kind === 'heavy') { p.addAmmo('heavy', 2); play('pickup'); }
  else if (kind === 'orb') { p.addSuper(6); play('orb'); }
  else if (kind === 'aura') { play('superReady'); }
  else if (kind === 'engram') G.onEngram?.();
}

export function updateCombat(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) { const p = G.projectiles[i]; if (p.alive) p.update(dt); if (!p.alive) G.projectiles.splice(i, 1); }
  for (let i = G.hazards.length - 1; i >= 0; i--) { const h = G.hazards[i]; if (h.alive) h.update(dt); if (!h.alive) G.hazards.splice(i, 1); }
  for (let i = G.pickups.length - 1; i >= 0; i--) { const p = G.pickups[i]; if (p.alive) p.update(dt); if (!p.alive) G.pickups.splice(i, 1); }
}

export function clearCombat() {
  for (const p of G.projectiles) p.alive = false;
  for (const h of G.hazards) h.dispose?.();
  for (const p of G.pickups) p.alive = false;
  G.projectiles.length = 0; G.hazards.length = 0; G.pickups.length = 0;
}
