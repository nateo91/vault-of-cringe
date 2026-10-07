// Other guardians in your fireteam, as seen on your screen.
import * as THREE from 'three';
import { G, dampAngle } from './game.js';
import { textSprite, emojiSprite } from './textures.js';

const CLASS_COLORS = { hunter: 0xd9822b, titan: 0x3d7fd9, warlock: 0x8e4fd9 };

function buildGuardian(cls) {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.3, ...o });
  const accent = CLASS_COLORS[cls] || 0xaaaaaa;
  const armor = M(0x3a3f4a), trim = M(accent, { emissive: accent, emissiveIntensity: 0.25 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const legs = [add(new THREE.BoxGeometry(0.22, 0.85, 0.26), armor, -0.14, 0.43, 0), add(new THREE.BoxGeometry(0.22, 0.85, 0.26), armor, 0.14, 0.43, 0)];
  const bulk = cls === 'titan' ? 1.18 : 1;
  add(new THREE.BoxGeometry(0.62 * bulk, 0.75, 0.38 * bulk), armor, 0, 1.25, 0);
  add(new THREE.BoxGeometry(0.66 * bulk, 0.18, 0.42 * bulk), trim, 0, 1.5, 0);
  const helm = add(new THREE.SphereGeometry(0.24, 14, 10), armor, 0, 1.82, 0); helm.scale.set(1, 1.1, 1.05);
  const visor = add(new THREE.BoxGeometry(0.3, 0.08, 0.06), M(accent, { emissive: accent, emissiveIntensity: 1.2 }), 0, 1.84, 0.23);
  if (cls === 'hunter') { const cape = add(new THREE.BoxGeometry(0.5, 0.95, 0.04), trim, 0, 1.0, -0.22); cape.rotation.x = 0.12; }
  if (cls === 'warlock') add(new THREE.CylinderGeometry(0.3, 0.42, 0.75, 10), trim, 0, 0.65, 0);
  if (cls === 'titan') { add(new THREE.BoxGeometry(0.28, 0.22, 0.32), trim, -0.42, 1.55, 0); add(new THREE.BoxGeometry(0.28, 0.22, 0.32), trim, 0.42, 1.55, 0); }
  const arm = add(new THREE.BoxGeometry(0.16, 0.16, 0.6), armor, 0.32, 1.38, 0.3);
  const gun = add(new THREE.BoxGeometry(0.08, 0.14, 0.5), M(0x1e1e22), 0.32, 1.42, 0.62);
  g.userData = { legs, arm, gun, visor };
  return g;
}

export class Avatar {
  constructor(id, name, cls) {
    this.id = id; this.netId = id; this.isGuardian = true;
    this.name = name || 'Guardian'; this.cls = cls || 'hunter';
    this.pos = new THREE.Vector3(); this.netPos = null; this.vel = new THREE.Vector3();
    this.yaw = 0; this.netYaw = 0; this.pitch = 0;
    this.alive = true; this.revivePos = new THREE.Vector3(); this.t = 0;
    this.root = new THREE.Group();
    this.body = buildGuardian(this.cls); this.root.add(this.body);
    this.tag = textSprite(this.name, 0.32, { color: '#ffffff', font: 'Rajdhani, sans-serif' }); this.tag.position.y = 2.35; this.root.add(this.tag);
    this.ghost = emojiSprite('💠', 0.8); this.ghost.visible = false; G.avatarGroup.add(this.ghost);
    this.ghostTag = textSprite(`${this.name} — hold E to revive`, 0.28, { color: '#9fe2ff', font: 'Rajdhani, sans-serif', depthTest: false }); this.ghostTag.visible = false; G.avatarGroup.add(this.ghostTag);
    G.avatarGroup.add(this.root);
  }
  // state from the network: [x, y, z, yaw, pitch, alive, cls, name, lsx, lsy, lsz]
  setState(s) {
    if (!this.netPos) { this.netPos = new THREE.Vector3(s[0], s[1], s[2]); this.pos.copy(this.netPos); }
    this.netPos.set(s[0], s[1], s[2]); this.netYaw = s[3]; this.pitch = s[4];
    this.alive = !!s[5];
    if (s[6] && s[6] !== this.cls) { this.cls = s[6]; this.root.remove(this.body); this.body = buildGuardian(this.cls); this.root.add(this.body); }
    if (s[7] && s[7] !== this.name) this.rename(s[7]);
    // where teammates go to pick you up (your body, or your last safe spot if the void ate you)
    if (s[1] < -3 && s.length > 10) this.revivePos.set(s[8], s[9], s[10]); else this.revivePos.set(s[0], s[1], s[2]);
  }
  rename(n) {
    this.name = n;
    this.root.remove(this.tag); this.tag.material.dispose();
    this.tag = textSprite(n, 0.32, { color: '#ffffff', font: 'Rajdhani, sans-serif' }); this.tag.position.y = 2.35; this.root.add(this.tag);
  }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.0, this.pos.z); }
  update(dt) {
    this.t += dt;
    if (!this.netPos) return;
    const px = this.pos.x, pz = this.pos.z;
    if (this.pos.distanceTo(this.netPos) > 8) this.pos.copy(this.netPos);
    else this.pos.lerp(this.netPos, 1 - Math.exp(-15 * dt));
    this.vel.set((this.pos.x - px) / Math.max(dt, 1e-4), 0, (this.pos.z - pz) / Math.max(dt, 1e-4));
    this.yaw = dampAngle(this.yaw, this.netYaw, 15, dt);
    this.root.position.copy(this.pos);
    // our yaw convention: camera looks down -Z at yaw 0, models face +Z
    this.root.rotation.y = this.yaw + Math.PI;
    const sp = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 5);
    const L = this.body.userData.legs;
    L[0].rotation.x = Math.sin(this.t * 11) * 0.6 * sp; L[1].rotation.x = -L[0].rotation.x;
    this.body.userData.arm.rotation.x = -this.pitch * 0.6; this.body.userData.gun.rotation.x = -this.pitch * 0.6;
    // dead: lie down, show a Ghost to revive
    this.body.rotation.x = this.alive ? 0 : -Math.PI / 2;
    this.body.position.y = this.alive ? 0 : 0.25;
    this.tag.visible = this.alive;
    this.ghost.visible = this.ghostTag.visible = !this.alive;
    if (!this.alive) {
      this.ghost.position.set(this.revivePos.x, this.revivePos.y + 1.3 + Math.sin(this.t * 3) * 0.15, this.revivePos.z);
      this.ghostTag.position.set(this.revivePos.x, this.revivePos.y + 2.0, this.revivePos.z);
    }
  }
  dispose() {
    G.avatarGroup.remove(this.root, this.ghost, this.ghostTag);
  }
}
