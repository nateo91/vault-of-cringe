// Other guardians in your fireteam, as seen on your screen.
import * as THREE from 'three';
import * as roast from './roasts.js';
import { G, dampAngle } from './game.js';
import { textSprite, emojiSprite } from './textures.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mat, rimify } from './rigs.js';

const CLASS_COLORS = { hunter: 0xd9822b, titan: 0x3d7fd9, warlock: 0x8e4fd9 };

export function buildGuardian(cls) {
  const g = new THREE.Group();
  const accent = CLASS_COLORS[cls] || 0xaaaaaa;
  const armor = mat(0x434955, { rough: 0.45, metal: 0.55 }), under = mat(0x24272e, { rough: 0.8 }), dark = mat(0x16181d, { rough: 0.5, metal: 0.4 });
  const trim = mat(accent, { rough: 0.4, metal: 0.4, emissive: accent, ei: 0.25 }), cloth = mat(new THREE.Color(accent).multiplyScalar(0.55).getHex(), { rough: 0.9 });
  const glow = mat(accent, { emissive: accent, ei: 2.2, detail: false });
  const RB = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
  const put = (parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o; };
  const bulk = cls === 'titan' ? 1.15 : 1;
  // legs: hip joint -> thigh, knee pad, shin, boot (legs[i] stays the hip so walking/emotes still drive it)
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group(); hip.position.set(s * 0.13 * bulk, 0.92, 0); g.add(hip);
    put(hip, new THREE.CapsuleGeometry(0.1 * bulk, 0.3, 4, 10), under, 0, -0.22, 0);
    put(hip, RB(0.19 * bulk, 0.3, 0.2, 0.05), armor, 0, -0.2, 0.03);
    put(hip, RB(0.16, 0.13, 0.08, 0.03), armor, 0, -0.44, 0.1);
    put(hip, new THREE.CapsuleGeometry(0.085 * bulk, 0.32, 4, 10), under, 0, -0.64, 0);
    put(hip, RB(0.17 * bulk, 0.26, 0.17, 0.04), armor, 0, -0.62, 0.02);
    put(hip, RB(0.17 * bulk, 0.11, 0.3, 0.04), dark, 0, -0.86, 0.05);
    return hip;
  });
  // torso: abdomen, sculpted chest, belt with a class buckle, shoulder pads
  put(g, RB(0.42 * bulk, 0.26, 0.26, 0.06), under, 0, 1.05, 0);
  put(g, RB(0.5 * bulk, 0.12, 0.3, 0.04), dark, 0, 0.95, 0);
  put(g, RB(0.1, 0.08, 0.04, 0.02), glow, 0, 0.95, 0.16);
  const chest = put(g, RB(0.58 * bulk, 0.42, 0.34 * bulk, 0.1), armor, 0, 1.36, 0.01);
  put(g, RB(0.36 * bulk, 0.2, 0.05, 0.04), trim, 0, 1.44, 0.18 * bulk);
  for (const s of [-1, 1]) put(g, RB(0.24 * bulk, 0.16, 0.3 * bulk, 0.07), cls === 'titan' ? trim : armor, s * 0.36 * bulk, 1.56, 0, 0, 0, s * -0.25);
  // head: neck, rounded helmet, glowing visor, class flair
  put(g, new THREE.CylinderGeometry(0.08, 0.1, 0.12, 10), under, 0, 1.62, 0);
  const helm = put(g, new THREE.SphereGeometry(0.2, 20, 14), armor, 0, 1.8, 0); helm.scale.set(1, 1.08, 1.1);
  put(g, RB(0.24, 0.12, 0.2, 0.05), armor, 0, 1.7, 0.06);
  const visor = put(g, RB(0.27, 0.07, 0.06, 0.03), glow, 0, 1.82, 0.19);
  if (cls === 'hunter') {
    const hood = put(g, new THREE.SphereGeometry(0.25, 16, 12, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.62), cloth, 0, 1.82, -0.02); hood.scale.set(1.05, 1.1, 1.15); hood.material = cloth.clone(); hood.material.side = THREE.DoubleSide; // open at the front
    // a tattered cloak: a plane with a ragged hem, hanging from the shoulders
    const cg = new THREE.PlaneGeometry(0.56, 1.1, 6, 8); const cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) { const y = cp.getY(i); if (y < -0.5) cp.setY(i, y - Math.random() * 0.12); cp.setZ(i, (0.55 - y) * 0.08); }
    cg.computeVertexNormals();
    const cloak = put(g, cg, cloth, 0, 1.05, -0.2); cloak.material = cloth.clone(); cloak.material.side = THREE.DoubleSide;
  } else if (cls === 'titan') {
    put(g, RB(0.05, 0.12, 0.3, 0.02), trim, 0, 2.0, -0.02);
    // the Titan mark: a sash hanging at the waist
    put(g, RB(0.3, 0.42, 0.03, 0.01), cloth, 0, 0.72, 0.17);
  } else {
    // Warlock robes + a cowl
    const robe = put(g, new THREE.CylinderGeometry(0.3, 0.46, 0.85, 14, 1, true), cloth, 0, 0.6, 0); robe.material = cloth.clone(); robe.material.side = THREE.DoubleSide;
    put(g, new THREE.TorusGeometry(0.2, 0.06, 6, 16), cloth, 0, 1.62, 0, Math.PI / 2);
  }
  // right arm (aims; arm/gun pitch with the player's look), left arm on a shoulder joint (supports the gun / emotes)
  const arm = new THREE.Group(); arm.position.set(0.3 * bulk, 1.5, 0.02); g.add(arm);
  put(arm, new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), under, 0.04, -0.15, 0.08, -0.6);
  put(arm, RB(0.15, 0.16, 0.3, 0.04), armor, 0.03, -0.2, 0.22, 0.2);
  put(arm, RB(0.13, 0.12, 0.14, 0.04), dark, 0.0, -0.18, 0.4);
  const gun = new THREE.Group(); gun.position.set(-0.05, -0.12, 0.45); arm.add(gun);
  put(gun, RB(0.07, 0.13, 0.55, 0.02), dark);
  put(gun, new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), dark, 0, 0.02, 0.4, Math.PI / 2);
  put(gun, RB(0.05, 0.06, 0.12, 0.015), trim, 0, 0.09, -0.02);
  put(gun, RB(0.05, 0.14, 0.06, 0.015), dark, 0, -0.1, 0.05, 0.3);
  const shL = new THREE.Group(); shL.position.set(-0.32 * bulk, 1.5, 0.02); g.add(shL);
  const armL = new THREE.Group(); shL.add(armL);
  put(armL, new THREE.CapsuleGeometry(0.075, 0.42, 4, 8), under, 0, -0.3, 0);
  put(armL, RB(0.15, 0.3, 0.16, 0.04), armor, 0, -0.38, 0);
  put(armL, RB(0.13, 0.12, 0.13, 0.04), dark, 0, -0.6, 0);
  if (cls === 'warlock') put(armL, new THREE.TorusGeometry(0.1, 0.02, 6, 16), glow, 0, -0.5, 0, Math.PI / 2);
  // rest pose: left hand reaching for the foregrip
  shL.rotation.set(-1.0, 0, -0.35);
  g.userData = { legs, arm, gun, visor, shL, restL: shL.rotation.clone() };
  rimify(g, accent, 0.18);
  return g;
}

// Emotes (1 = dance, 2 = sit, 3 = dab, 4 = take the L), applied to a guardian body built above.
export const EMOTES = { dance: 1, sit: 2, dab: 3, L: 4 };
export function poseEmote(body, emote, t) {
  const u = body.userData;
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
  u.shL.rotation.copy(u.restL); u.arm.rotation.set(0, 0, 0); u.gun.visible = true;
  for (const l of u.legs) l.rotation.set(0, 0, 0);
  if (emote === 1) {
    // the default dance (it's the only dance)
    const b = Math.sin(t * 9);
    body.position.y = Math.abs(b) * 0.12;
    body.rotation.z = Math.sin(t * 4.5) * 0.18; body.rotation.y = Math.sin(t * 2.25) * 0.5;
    u.legs[0].rotation.x = Math.max(0, b) * -0.9; u.legs[1].rotation.x = Math.max(0, -b) * -0.9;
    u.shL.rotation.z = -1.6 - Math.sin(t * 9) * 0.9; u.shL.rotation.x = Math.sin(t * 4.5) * 0.6;
    u.arm.rotation.x = -0.6 + Math.sin(t * 9 + 1) * 0.5; u.gun.visible = false;
  } else if (emote === 2) {
    // sit down and contemplate the memes
    body.position.y = -0.62;
    u.legs[0].rotation.x = -1.5; u.legs[1].rotation.x = -1.5;
    u.shL.rotation.x = -0.9; u.arm.rotation.x = 0.4; u.gun.visible = false;
    body.rotation.x = Math.sin(t * 0.8) * 0.03;
  } else if (emote === 3) {
    // the dab: snap into it, hold it
    const k = Math.min(1, t * 6);
    body.rotation.set(0.25 * k, 0.3 * k, 0.12 * k);
    u.shL.rotation.set(-0.5 * k, 0, -2.4 * k);
    u.arm.rotation.set(-0.45 * k, 1.35 * k, 0.15 * k); // forearm across the face
    u.gun.visible = false;
    body.position.y = Math.sin(t * 2) * 0.01;
  } else if (emote === 4) {
    // take the L: hand on the forehead, hop side to side
    const s = Math.sin(t * 6);
    body.position.set(s * 0.12, Math.abs(Math.cos(t * 6)) * 0.08, 0);
    body.rotation.z = -s * 0.08;
    u.shL.rotation.set(-2.7, 0.2, -0.25);
    u.legs[0].rotation.x = Math.max(0, s) * -0.6; u.legs[1].rotation.x = Math.max(0, -s) * -0.6;
    u.arm.rotation.x = 0.5; u.gun.visible = false;
  }
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
    if (this.alive && !s[5]) roast.onTeammateDown(this.name);
    this.alive = !!s[5];
    this.emote = s[11] || 0;
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
    if (this.emote && this.alive) poseEmote(this.body, this.emote, this.t);
    else {
      poseEmote(this.body, 0, this.t);
      L[0].rotation.x = Math.sin(this.t * 11) * 0.6 * sp; L[1].rotation.x = -L[0].rotation.x;
      this.body.userData.arm.rotation.x = -this.pitch * 0.6; this.body.userData.gun.rotation.x = -this.pitch * 0.6;
      // dead: lie down, show a Ghost to revive
      this.body.rotation.x = this.alive ? 0 : -Math.PI / 2;
      this.body.position.y = this.alive ? 0 : 0.25;
    }
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
