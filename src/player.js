// The Guardian: movement, guns, grenades, melee and supers.
// The viewmodel (hands + gun) lives in G.vmScene, drawn on top of the world with its own camera.
import * as THREE from 'three';
import { addWear, bevelBox } from './surface.js';
import { G, clamp, damp, dampAngle, rand, pick, after, local } from './game.js';
import { Input, Pad, down, hit } from './input.js';
import { moveCollide, groundY } from './world.js';
import { raycast, explode, Projectile, Pickup, los } from './combat.js';
import { textSprite, IMPACT } from './textures.js';
import { unlock } from './triumphs.js';
import * as fxm from './fx.js';
import { buildGuardian, poseEmote, EMOTES } from './avatars.js';
import { play as rawPlay, say as rawSay } from './audio.js';
import { HUD } from './hud.js';
import { hurtPulse } from './render.js';
import { DEFS, PERKS, PerkEngine, equippedItem, buildModel, LEFT_HAND, applyShader } from './arsenal.js';
import { armorOn } from './armor.js';
import * as roast from './roasts.js';

// Your own guns/abilities are cosmetic-local: teammates see them via explicit 'shot'/'proj'/'pfx' events instead.
const play = (...a) => local(() => rawPlay(...a));
const say = (...a) => local(() => rawSay(...a));
const fx = new Proxy(fxm, { get: (m, k) => (typeof m[k] === 'function' ? (...a) => local(() => m[k](...a)) : m[k]) });
const lhud = (m, ...a) => local(() => HUD[m](...a));
const v3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
fxm.setClink(() => rawPlay('clink'));

export const CLASSES = {
  hunter: { name: 'Hunter', color: '#ffb347', armor: 0x5a4a3a, superName: 'GOLDEN GUN', superSub: "it's just a bigger hand cannon", jumps: 2, jumpV: 9.5 },
  titan: { name: 'Titan', color: '#7fd7ff', armor: 0x3d4a5e, superName: 'FIST OF YEET', superSub: 'punch the floor. very hard.', jumps: 1, jumpV: 10.5 },
  warlock: { name: 'Warlock', color: '#c58bff', armor: 0x4a3a5e, superName: 'NOVA BOMB', superSub: 'big purple ball', jumps: 0, jumpV: 9.5, glide: true },
};

// the guns themselves live in arsenal.js; these are the defaults if your inventory is empty
export const WEAPONS = [DEFS.hc, DEFS.sg, DEFS.rl];
const VM_SCALE = 0.6; // the rig is modelled big; this shrinks it to a D2-ish screen footprint
const GG = { dmg: 420, crit: 1.5, rof: 0.5, kick: [0.05, 0.01, 2], zoom: 60, adsZ: -0.46, hip: [0.12, -0.12, -0.34] };

const INSPECT_TIME = 2.6;
const INSPECT_KF = [
  [0.0, 0, 0, 0, 0, 0, 0],
  [0.16, -0.06, 0.05, 0.05, 0.25, 0.95, 0.25],
  [0.42, -0.06, 0.06, 0.05, 0.32, 1.15, 0.35],
  [0.58, -0.05, 0.07, 0.03, -0.25, -0.55, -0.75],
  [0.84, -0.04, 0.05, 0.03, -0.18, -0.45, -0.65],
  [1.0, 0, 0, 0, 0, 0, 0],
];
function inspectPose(u) {
  for (let i = 1; i < INSPECT_KF.length; i++) {
    const a = INSPECT_KF[i - 1], b = INSPECT_KF[i];
    if (u <= b[0]) { const t = (u - a[0]) / (b[0] - a[0]); const e = t * t * (3 - 2 * t); return a.map((v, k) => v + (b[k] - v) * e).slice(1); }
  }
  return [0, 0, 0, 0, 0, 0];
}


const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _o = new THREE.Vector3(), _c = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- viewmodel construction
function M(c, o = {}) { return addWear(new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.75, ...o })); }
function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}
const BX = (w, h, d) => bevelBox(w, h, d);
const CY = (r, l, s = 16, r2 = r) => new THREE.CylinderGeometry(r, r2, l, s);
// A cylinder from a to b (limbs)
function limb(parent, a, b, r, mat, r2 = r) {
  const d = b.clone().sub(a), len = d.length();
  const m = new THREE.Mesh(CY(r, len, 12, r2), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  parent.add(m); return m;
}
function glove(parent, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
  const h = new THREE.Group(); h.position.set(x, y, z); h.rotation.set(rx, ry, rz); parent.add(h);
  part(h, BX(0.06, 0.075, 0.085), mat, 0, 0, 0);
  for (let i = 0; i < 4; i++) part(h, BX(0.014, 0.022, 0.05), mat, -0.022 + i * 0.015, 0.032, -0.045 + (i % 2) * 0.004, 0.5, 0, 0);
  part(h, BX(0.02, 0.02, 0.05), mat, 0.035, 0.02, -0.02, 0, 0.5, 0);
  return h;
}

function buildArms(cls, kind) {
  const c = CLASSES[cls];
  const armor = M(c.armor, { metalness: 0.4, roughness: 0.6 });
  const cloth = M(0x22232a, { metalness: 0.05, roughness: 0.9 });
  const gloveM = M(0x1a1a1e, { metalness: 0.2, roughness: 0.7 });
  const acc = new THREE.Color(c.color).getHex();
  const trim = M(acc, { metalness: 0.6, roughness: 0.35, emissive: acc, emissiveIntensity: 0.25 });
  const pistol = kind === 'hc' || kind === 'gg';
  const g = new THREE.Group();
  // right (trigger) hand on the grip, forearm running off-screen
  const rWrist = new THREE.Vector3(0.012, -0.075, 0.075), rElbow = new THREE.Vector3(0.12, -0.32, 0.42);
  glove(g, rWrist.x, rWrist.y + 0.01, rWrist.z - 0.01, gloveM, -0.3);
  limb(g, rWrist, rElbow, 0.034, cloth, 0.045);
  limb(g, rWrist.clone().lerp(rElbow, 0.35), rElbow.clone().lerp(rWrist, 0.2), 0.046, armor, 0.052);
  const band = part(g, CY(0.049, 0.02), trim, ...rWrist.clone().lerp(rElbow, 0.33).toArray());
  band.quaternion.setFromUnitVectors(_up, rElbow.clone().sub(rWrist).normalize());
  // left hand: cupping the grip for the hand cannon, on the foregrip for long guns
  const lh = LEFT_HAND[kind];
  const lHand = pistol ? new THREE.Vector3(-0.03, -0.1, 0.06) : lh ? new THREE.Vector3(...lh) : kind === 'sg' ? new THREE.Vector3(0, -0.055, -0.3) : new THREE.Vector3(-0.01, -0.13, -0.2);
  const lElbow = pistol ? new THREE.Vector3(-0.24, -0.34, 0.4) : new THREE.Vector3(-0.3, -0.36, 0.18);
  const left = new THREE.Group(); g.add(left);
  glove(left, lHand.x, lHand.y, lHand.z, gloveM, pistol ? -0.6 : 0.2, 0, pistol ? 0.5 : 1.3);
  limb(left, lHand, lElbow, 0.034, cloth, 0.045);
  limb(left, lHand.clone().lerp(lElbow, 0.35), lElbow.clone().lerp(lHand, 0.2), 0.046, armor, 0.052);
  return { group: g, left };
}

export function buildGun(kind) {
  if (!['hc', 'gg', 'sg', 'rl'].includes(kind)) return buildModel(kind);
  const g = new THREE.Group();
  const parts = {};
  let muzzleZ = -0.45;
  const sight = new THREE.Object3D();
  if (kind === 'hc' || kind === 'gg') {
    const gold = kind === 'gg';
    const frame = gold ? M(0xffc531, { emissive: 0xff6a00, emissiveIntensity: 0.7, metalness: 1, roughness: 0.25 }) : M(0x2e3036, { roughness: 0.32 });
    const accent = gold ? frame : M(0xc9a24b, { metalness: 1, roughness: 0.28 });
    const wood = M(gold ? 0x7a3a10 : 0x5b3a22, { metalness: 0, roughness: 0.75 });
    // frame + barrel with a top rib
    part(g, BX(0.05, 0.075, 0.13), frame, 0, 0.0, -0.02);
    part(g, CY(0.022, 0.24), frame, 0, 0.025, -0.2, Math.PI / 2);
    part(g, BX(0.032, 0.018, 0.25), frame, 0, 0.05, -0.19);
    part(g, BX(0.014, 0.012, 0.24), accent, 0, 0.064, -0.19);
    part(g, BX(0.04, 0.03, 0.2), frame, 0, -0.008, -0.17);
    part(g, CY(0.026, 0.02), accent, 0, 0.025, -0.32, Math.PI / 2);
    // cylinder on a crane (swings out on reload)
    const crane = new THREE.Group(); crane.position.set(-0.02, -0.005, -0.07); g.add(crane);
    const cyl = part(crane, CY(0.038, 0.075, 12), accent, 0.02, 0.025, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(crane, CY(0.008, 0.08, 6), M(0x111111), 0.02 + Math.cos(a) * 0.022, 0.025 + Math.sin(a) * 0.022, 0, Math.PI / 2); }
    parts.crane = crane; parts.cyl = cyl;
    // hammer, trigger, guard, grip
    parts.hammer = part(g, BX(0.014, 0.03, 0.02), frame, 0, 0.055, 0.045, -0.3);
    part(g, BX(0.008, 0.03, 0.008), M(0x111111), 0, -0.05, -0.01, 0.3);
    part(g, new THREE.TorusGeometry(0.025, 0.004, 6, 12, Math.PI), frame, 0, -0.045, -0.012, 0, Math.PI / 2, Math.PI);
    part(g, BX(0.042, 0.12, 0.055), wood, 0, -0.085, 0.05, -0.32);
    // iron sights
    part(g, BX(0.006, 0.018, 0.012), accent, 0, 0.075, -0.3);
    part(g, BX(0.008, 0.016, 0.012), frame, -0.009, 0.065, 0.04); part(g, BX(0.008, 0.016, 0.012), frame, 0.009, 0.065, 0.04);
    sight.position.set(0, 0.075, 0.04);
    if (!gold) {
      // the spud charm, dangling off the grip
      const charm = new THREE.Group(); charm.position.set(0, -0.14, 0.075); g.add(charm);
      part(charm, CY(0.002, 0.04, 4), M(0x999999), 0, -0.02, 0);
      const potato = part(charm, new THREE.SphereGeometry(0.022, 10, 8), M(0xb08850, { metalness: 0, roughness: 1 }), 0, -0.05, 0);
      potato.scale.set(1.4, 0.9, 1);
      parts.charm = charm;
    } else {
      // it's on fire. obviously.
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxm.glowTex, color: 0xff8a20, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.scale.set(0.12, 0.16, 1); flame.position.set(0, 0.04, -0.12); g.add(flame); parts.flame = flame;
    }
    muzzleZ = -0.33;
  } else if (kind === 'sg') {
    const body = M(0x1f2a2e, { roughness: 0.35 }), teal = M(0x1fa89a, { metalness: 0.3, roughness: 0.4, emissive: 0x0c5a52, emissiveIntensity: 0.6 });
    const poly = M(0x2a2a2a, { metalness: 0.1, roughness: 0.8 });
    part(g, BX(0.055, 0.075, 0.24), body, 0, 0, -0.05);
    part(g, CY(0.02, 0.5), body, 0, 0.022, -0.38, Math.PI / 2);
    part(g, CY(0.016, 0.42), body, 0, -0.018, -0.34, Math.PI / 2);
    part(g, BX(0.058, 0.012, 0.2), teal, 0, 0.042, -0.05);
    parts.pump = part(g, BX(0.05, 0.045, 0.14), poly, 0, -0.02, -0.3);
    part(g, BX(0.04, 0.11, 0.05), poly, 0, -0.07, 0.05, -0.3);
    part(g, BX(0.045, 0.07, 0.2), poly, 0, -0.035, 0.18, 0.15);
    part(g, new THREE.SphereGeometry(0.006, 6, 6), M(0xffffff, { emissive: 0x88ffee, emissiveIntensity: 1 }), 0, 0.045, -0.62);
    part(g, BX(0.02, 0.008, 0.02), body, 0, 0.045, 0.0);
    sight.position.set(0, 0.048, 0.0);
    part(g, new THREE.CapsuleGeometry(0.008, 0.04, 4, 6), M(0xffffff, { metalness: 0 }), 0.032, 0.0, -0.05, 0, 0, Math.PI / 2); // dog bone
    muzzleZ = -0.64;
  } else if (kind === 'rl') {
    const tube = M(0x4b2f78, { roughness: 0.45, metalness: 0.5 }), gold = M(0xffd23f, { metalness: 1, roughness: 0.25 });
    part(g, CY(0.075, 0.9, 20), tube, 0, 0.05, -0.15, Math.PI / 2);
    part(g, CY(0.09, 0.08, 20, 0.08), gold, 0, 0.05, -0.62, Math.PI / 2);
    part(g, CY(0.085, 0.06, 20), gold, 0, 0.05, 0.3, Math.PI / 2);
    part(g, BX(0.04, 0.12, 0.05), M(0x222222), 0, -0.07, 0.06, -0.2);
    part(g, BX(0.035, 0.1, 0.04), M(0x222222), 0, -0.065, -0.2, 0.1);
    // optic
    part(g, BX(0.05, 0.05, 0.16), M(0x1c1c22), 0, 0.15, -0.05);
    part(g, new THREE.CircleGeometry(0.02, 16), M(0xff3355, { emissive: 0xff2244, emissiveIntensity: 2 }), 0, 0.152, 0.031);
    sight.position.set(0, 0.152, 0.03);
    parts.horn = part(g, new THREE.ConeGeometry(0.035, 0.13, 14), M(0xff4fd8, { emissive: 0x661155, metalness: 0.2 }), 0.085, 0.1, -0.35, -Math.PI / 2); // party horn. it's a horn. get it.
    muzzleZ = -0.68;
  }
  g.add(sight);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, kind === 'rl' ? 0.05 : 0.025, muzzleZ); g.add(muzzle);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxm.flashTex, color: 0xffe2b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.position.copy(muzzle.position); flash.visible = false; g.add(flash);
  const flash2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxm.glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash2.position.copy(muzzle.position); flash2.visible = false; g.add(flash2);
  return { group: g, muzzle, flash, flash2, sight, parts, kind };
}

// One weapon = gun + arms in a rig we can animate.
function buildRig(kind, cls) {
  const rig = new THREE.Group();
  const gun = buildGun(kind);
  const arms = buildArms(cls, kind);
  rig.add(gun.group, arms.group);
  return { rig, ...gun, arms };
}

// ---------------------------------------------------------------- player
export class Player {
  constructor(cls) {
    this.cls = cls; this.clsDef = CLASSES[cls];
    this.isGuardian = true; this.lastSafe = new THREE.Vector3();
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.4; this.height = 1.8; this.eye = 1.62;
    this.maxHp = 100; this.maxShield = 100;
    this.perks = new PerkEngine(this);
    this.wpn = [0, 1, 2].map((s) => this.makeSlot(equippedItem(s) || { uid: 'x' + s, id: WEAPONS[s].id, perks: WEAPONS[s].fixedPerks || [] }));
    this.grenadeMax = 11; this.meleeMax = 0.9;
    this.setArmor(armorOn(cls));
    this.superCharge = 40;
    this.revives = 3;
    this.vm = new THREE.Group();
    this.vm.scale.setScalar(VM_SCALE);
    G.vmCamera.add(this.vm);
    this.rigs = {};
    for (const k of ['gg', ...this.wpn.map((w) => w.def.model)]) this.ensureRig(k);
    // spring state for the viewmodel
    this.kickP = new THREE.Vector3(); this.kickPV = new THREE.Vector3();
    this.kickR = new THREE.Vector3(); this.kickRV = new THREE.Vector3();
    this.sway = new THREE.Vector2(); this.adsK = 0; this.sprintK = 0;
    this.aimPunch = new THREE.Vector2(); this.aimPunchV = new THREE.Vector2();
    this.charmA = 0; this.charmV = 0; this.flashT = 0;
    this.reset(new THREE.Vector3(), 0);
  }
  reset(pos, yaw) {
    this.pos.copy(pos); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.hp = this.maxHp; this.shield = this.maxShield;
    this.alive = true; this.onGround = false; this.lastHurt = -10;
    this.jumpsLeft = 0; this.glideFuel = 1.6;
    this.cur = 0; this.nextFire = 0; this.reloadT = 0; this.reloadMax = 1; this.reloadKind = null; this.switchT = 0;
    this.grenadeCd = 0; this.meleeCd = 0;
    this.superActive = null; this.superTimer = 0;
    this.bobT = 0; this.ads = false; this.fov = 74; this.punchT = 0;
    this.deadT = 0; this.slideT = 0; this.slideCd = 0; this.landDip = 0; this.eyeOff = 0; this.stepT = 0;
    this.pumpT = 0; this.reloadFx = {}; this.inspectT = 0; this.bloomK = 0; this.scoped = false; this.range = 0;
    this.chargeT = 0; this.burstLeft = 0;
    for (const w of this.wpn) { w.mag = w.def.mag; if (w.def.ammo !== 'primary') w.reserve = Math.max(w.reserve, w.def.brick); }
    this.showGun();
  }
  get def() { return this.superActive === 'gg' ? GG : this.wpn[this.cur].def; }
  // recolour every gun you're carrying (Armory shader picker)
  applyShaderAll() { for (const k in this.rigs) applyShader(this.rigs[k].group); }
  get rig() { return this.rigs[this.superActive === 'gg' ? 'gg' : this.wpn[this.cur].def.model]; }
  showGun() { const r = this.rig; for (const k in this.rigs) this.rigs[k].rig.visible = this.rigs[k] === r; }
  ensureRig(model) {
    if (this.rigs[model]) return;
    const r = this.rigs[model] = buildRig(model, this.cls);
    applyShader(r.group);
    r.rig.visible = false; this.vm.add(r.rig);
  }
  makeSlot(item) {
    const def = DEFS[item.id];
    return { def, inst: item, mag: def.mag, reserve: def.ammo === 'primary' ? Infinity : Math.round(def.maxRes * 0.4), stonks: 0 };
  }
  // swap the weapon in a slot (from the inventory screen)
  equip(slot, item) {
    const old = this.wpn[slot];
    const w = this.makeSlot(item);
    if (old && old.def.ammo !== 'primary' && w.def.ammo !== 'primary') w.reserve = Math.round((old.reserve / old.def.maxRes) * w.def.maxRes);
    w.mag = 0; // fresh guns come in empty-ish: you reload when you pull them out
    if (w.def.ammo === 'primary') w.mag = w.def.mag; else { const take = Math.min(w.def.mag, w.reserve); w.mag = take; w.reserve -= take; }
    this.wpn[slot] = w;
    this.ensureRig(w.def.model);
    if (slot === this.cur) { this.reloadT = 0; this.reloadKind = null; this.switchT = 0.32; this.inspectT = 0; }
    this.showGun();
    HUD.buildWeapons(this);
  }
  // ammo bricks go to whichever gun in that slot you have equipped
  addAmmo(kind) {
    const w = this.wpn.find((x) => x.def.ammo === kind);
    if (!w) return;
    w.reserve = Math.min(w.def.maxRes, w.reserve + w.def.brick);
    this.perks.onAmmo(w);
  }
  // put rounds into the mag from reserves (perks, holster)
  refill(w, n = Infinity) {
    const need = Math.min(n, w.def.mag - w.mag);
    if (need <= 0) return;
    const take = w.def.ammo === 'primary' ? need : Math.min(need, w.reserve);
    w.mag += take; if (w.def.ammo !== 'primary') w.reserve -= take;
  }
  // exotic armor (see armor.js); the Armory calls this when you swap pieces mid-raid
  setArmor(id) {
    this.armor = id; this.stillT = 0;
    this.grenadeMax = id === 'galaxy' ? 6.6 : 11;
    this.grenadeCd = Math.min(this.grenadeCd || 0, this.grenadeMax);
  }
  addSuper(n) {
    if (this.superActive) return;
    if (this.armor === 'mask') n *= 1.4;
    const was = this.superCharge;
    this.superCharge = Math.min(100, this.superCharge + n);
    if (was < 100 && this.superCharge >= 100) { play('superReady'); lhud('killfeed', `Super ready: ${this.clsDef.superName} [F]`); }
  }

  hurt(amount, cause = 'a meme', from = null) {
    if (G.settings.mods?.glass) amount *= 2;
    if (this.noticed) amount *= 1.5;
    if (G.settings.mods?.master) amount *= 1.4;
    if (!this.alive || G.godMode || G.state !== 'playing' || G.cine) return;
    if (this.finisherT > 0) return;
    if (this.superActive === 'slam') amount *= 0.3;
    if (this.superActive === 'gg') amount *= 0.6;
    if (this.armor === 'unbothered' && (this.sprinting || this.slideT > 0)) amount *= 0.75;
    this.lastHurt = G.time;
    let a = amount;
    if (this.shield > 0) {
      const s = Math.min(this.shield, a); this.shield -= s; a -= s;
      if (this.shield <= 0) play('shieldBreak');
    }
    this.hp -= a;
    this.perks?.onHurt?.(amount);
    HUD.damageFlash(amount);
    if (from) HUD.damageDir(from, amount);
    hurtPulse(amount);
    play('hurt');
    G.shake += Math.min(0.4, amount * 0.008);
    // getting shot flinches your aim a little, like the real thing
    const k = Math.min(1, amount / 25);
    this.aimPunchV.x += rand(-0.3, 0.6) * k;
    this.aimPunchV.y += rand(-0.4, 0.4) * k;
    if (this.hp <= 0) this.die(cause);
  }
  die(cause = 'a meme') {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.shield = 0;
    this.deadT = 0; this.superActive = null;
    document.querySelector('#superfx .sf-gold')?.classList.remove('on');
    G.stats.deaths++; G.stats.bruh++;
    say('bruh', 'bruh');
    roast.onDeath(G.stats.deaths);
    HUD.death(true, `Killed by ${cause}. ${roast.deathQuip(cause)}` + (G.net.active ? '\nWaiting for a teammate to revive you (they hold E on your Ghost).' : ''));
    G.onPlayerDeath?.(cause);
  }
  get netId() { return G.net.myId; }
  // Picked back up by a teammate (co-op). Fell into the void? You come back where you last stood.
  revive() {
    if (this.alive) return;
    const at = this.pos.y < -3 ? this.lastSafe.clone() : this.pos.clone();
    const sc = this.superCharge;
    this.reset(at, this.yaw);
    this.superCharge = sc;
    HUD.death(false);
    fx.rally(at.clone(), true); G.net.playerEv(['pfx', 'rally', v3(at)]);
    lhud('bigText', 'REVIVED', 'thank your fireteam', 1.5, 'good');
    play('superReady');
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const cam = G.camera;
    if (!this.alive) {
      this.deadT += dt;
      cam.position.set(this.pos.x, this.pos.y + Math.max(0.3, this.eye - this.deadT * 2), this.pos.z);
      cam.rotation.set(this.pitch, this.yaw, Math.min(0.6, this.deadT), 'YXZ');
      this.vm.visible = false;
      return;
    }
    this.vm.visible = !this.scoped && !this.carry && !this.emote;
    // look (aim slows a touch over enemies: "reticle friction")
    const friction = this.overTarget && (G.settings.aimAssist ?? true) ? (Pad.active ? 0.5 : 0.72) : 1; // sticks get more, like console
    const sens = 0.0022 * G.settings.sens * (this.ads ? 0.65 : 1) * friction;
    const dyaw = -Input.dx * sens, dpitch = -Input.dy * sens;
    this.yaw += dyaw;
    this.pitch = clamp(this.pitch + dpitch, -1.5, 1.5);
    this.sway.x = damp(this.sway.x, clamp(-dyaw * 6, -0.08, 0.08), 10, dt);
    this.sway.y = damp(this.sway.y, clamp(dpitch * 6, -0.06, 0.06), 10, dt);

    this.move(dt);
    // recoil "aim punch" springs back toward zero
    this.aimPunchV.addScaledVector(this.aimPunch, -160 * dt).multiplyScalar(Math.exp(-18 * dt));
    this.aimPunch.addScaledVector(this.aimPunchV, dt);
    // camera goes before shooting so shots use this frame's aim
    G.shake = Math.max(0, G.shake - dt * 1.8);
    const sh = Math.min(0.5, G.shake) * 0.22;
    this.landDip = damp(this.landDip, 0, 9, dt);
    this.eyeOff = damp(this.eyeOff, this.slideT > 0 ? -0.65 : 0, 12, dt);
    cam.position.set(this.pos.x + rand(-sh, sh), this.pos.y + this.eye + this.eyeOff - this.landDip + rand(-sh, sh), this.pos.z + rand(-sh, sh));
    cam.rotation.set(this.pitch + this.aimPunch.x, this.yaw + this.aimPunch.y, this.slideT > 0 ? 0.06 : 0, 'YXZ');
    this.updateEmote(dt, cam);
    cam.updateMatrixWorld();
    this.combat(dt);
    this.abilities(dt);

    // regen: health first, then shields (like the real thing, roughly)
    if (G.time - this.lastHurt > 3.2) {
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 45 * dt);
      else this.shield = Math.min(this.maxShield, this.shield + (this.armor === 'unbothered' ? 140 : 70) * dt);
    }
    // Touch Grass Treads: a pocket rift while you stand still on the ground
    if (this.armor === 'treads') {
      const still = this.alive && this.onGround && Math.hypot(this.vel.x, this.vel.z) < 0.6;
      this.stillT = still ? this.stillT + dt : 0;
      if (this.stillT > 1) {
        if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 30 * dt);
        else this.shield = Math.min(this.maxShield, this.shield + 45 * dt);
        if (Math.random() < dt * 3) fx.burst(this.pos.clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0.1, rand(-0.8, 0.8))), 0x7dff8a, 1, 1.2, 0.06, 0.6, 2);
      }
    }
    if (!this.superActive) this.addSuper(dt * 0.75);
    this.perks.tick(dt);
    if (this.pos.y < -25) this.die('the void (gravity is also a meme)');

    this.bloomK = damp(this.bloomK, 0, 5, dt);
    this.scoped = this.ads && !!this.def.scope && this.adsK > 0.85;
    this.scopeType = this.def.scope;
    if (this.scoped) this.range = raycast(cam.position, this.aimDir(0), 300).dist;
    // the FOV slider sets the base; sprint / slide kick out from it, ADS keeps the same magnification
    const base = G.settings.fov ?? 74;
    const targetFov = this.scoped ? (this.def.kind === 'sniper' ? 16 : 30) : this.ads ? this.def.zoom * base / 74 : this.sprinting ? base + 8 : this.slideT > 0 ? base + 10 : base;
    this.fov = damp(this.fov, targetFov, 14, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.animateViewmodel(dt);
  }

  move(dt) {
    const c = this.clsDef;
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let mx = 0, mz = 0;
    if (down('KeyW') || down('ArrowUp')) mz += 1;
    if (down('KeyS') || down('ArrowDown')) mz -= 1;
    if (down('KeyD') || down('ArrowRight')) mx += 1;
    if (down('KeyA') || down('ArrowLeft')) mx -= 1;
    const len = Math.hypot(mx, mz) || 1;
    this.ads = Input.right && this.alive && this.reloadKind !== 'hc' && !this.carry;
    // sprint: Shift toggles it on, and it stays on until you stop pushing forward, aim or shoot (or hold it, in Settings)
    const shift = down('ShiftLeft') || down('ShiftRight');
    if (G.settings.sprintHold) this.sprintOn = shift;
    else {
      if (hit('ShiftLeft') || hit('ShiftRight')) this.sprintOn = true;
      if (mz <= 0 || this.ads || Input.left || !this.alive || this.carry) this.sprintOn = false;
    }
    this.sprinting = !!this.sprintOn && mz > 0 && !this.ads && !Input.left && this.slideT <= 0;
    // slide: crouch while sprinting
    this.slideCd -= dt;
    if ((hit('KeyC') || hit('ControlLeft')) && this.sprinting && this.onGround && this.slideCd <= 0) {
      this.slideT = 0.75; this.slideCd = 1.1;
      this.vel.x = _f.x * 13.5; this.vel.z = _f.z * 13.5;
      play('slide');
      if (this.armor === 'drip') {
        this.slideCd = 0.6; this.perks.buff('drip', 3);
        const w = this.wpn[this.cur]; if (w && w.mag < w.def.mag && !this.superActive) { this.reloadT = 0; this.reloadKind = null; this.refill(w); play('shellIn'); }
      }
    }
    if (this.slideT > 0) {
      this.slideT -= dt;
      const k = 1 - Math.exp(-1.6 * dt);
      this.vel.x -= this.vel.x * k; this.vel.z -= this.vel.z * k;
      if (Math.random() < 0.5) fx.burst(this.pos.clone().setY(this.pos.y + 0.05), 0xbfb6a8, 1, 1.5, 0.05, 0.3, -1);
    } else {
      const speed = this.ads ? 4.2 : this.sprinting ? 11 : 7.2;
      _v.set(0, 0, 0).addScaledVector(_f, mz / len * speed).addScaledVector(_r, mx / len * speed);
      const accel = this.onGround ? 14 : 3.5;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (_v.x - this.vel.x) * k;
      this.vel.z += (_v.z - this.vel.z) * k;
    }

    // coyote time (jump just after running off a ledge) + jump buffer (press just before landing)
    this.coyoteT = this.onGround ? 0.13 : (this.coyoteT || 0) - dt;
    this.jumpBuf = hit('Space') ? 0.13 : (this.jumpBuf || 0) - dt;
    if (this.jumpBuf > 0 && (this.onGround || this.coyoteT > 0) && this.vel.y <= 0.5) {
      this.vel.y = c.jumpV; this.jumpsLeft = c.jumps; play('jump'); this.slideT = 0; this.kickPV.y -= 0.6;
      this.jumpBuf = 0; this.coyoteT = 0;
    } else if (hit('Space')) {
      if (this.jumpsLeft > 0) {
        this.jumpsLeft--; this.vel.y = c.jumpV * 0.9; play('jump');
        fx.burst(this.pos, 0xffffff, 6, 3, 0.08, 0.3, 0);
      }
    }
    if (c.glide && !this.onGround && down('Space') && this.vel.y < 0 && this.glideFuel > 0) {
      this.glideFuel -= dt;
      this.vel.y = Math.max(this.vel.y + 30 * dt, -1.2);
      if (Math.random() < 0.3) fx.burst(this.pos, 0xc58bff, 1, 1, 0.08, 0.4, 0);
    }
    this.vel.y -= 26 * dt;
    const fallV = this.vel.y;
    const wasGround = this.onGround;
    const r = moveCollide(this.pos, this.vel, dt, this.radius, this.height);
    this.onGround = r.ground;
    if (this.onGround) {
      this.glideFuel = 1.6;
      if (this.pos.y > -1) this.lastSafe.copy(this.pos);
      if (!wasGround) this.onLand(fallV);
      // footsteps
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 2 && this.slideT <= 0) { this.stepT -= dt * sp; if (this.stepT <= 0) { this.stepT = 3.2; this.foot = -(this.foot || 1); play('step', G.encounter?.floor || 'stone', this.foot); } }
    }
  }

  onLand(fallV) {
    const k = clamp(-fallV / 18, 0, 1);
    if (k > 0.15) { this.landDip += 0.18 * k; this.kickPV.y -= 1.5 * k; play('land', k, G.encounter?.floor || 'stone'); }
    if (this.superActive === 'slam') {
      this.superActive = null;
      const p = this.pos.clone(); p.y += 0.3;
      explode(p, 10, 850, { color: 0x7fd7ff, big: 2, knock: 0, localFx: true });
      fx.ringFx(this.pos, 11, 0x7fd7ff, 0.6);
      fx.superRing(this.pos.clone(), 0x7fd7ff, 12); fx.crater(this.pos.clone(), 7, 0x7fd7ff);
      this.fov += 10;
      G.net.playerEv(['pfx', 'crater', v3(this.pos)]);
      G.net.playerEv(['pfx', 'boom', v3(p), 10, 0x7fd7ff]);
      for (const e of G.enemies) {
        if (e.alive && e.rank !== 'boss' && e.knockable !== false && e.pos.distanceTo(this.pos) < 12) { e.vel.y += 16; fx.floatText(e.top().clone(), 'YEET', { color: '#7fd7ff', height: 0.6 }); }
      }
      play('airhorn');
      G.shake += 1;
    }
  }

  // ---------------------------------------------------------------- aiming
  aimDir(spread) {
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(G.camera.quaternion);
    return spread > 0 ? jitter(d, spread) : d;
  }
  // Bullet magnetism: if you're *nearly* on a meme, the shot bends onto it (crits win ties).
  magnetize(origin, dir, def) {
    const [deg, range] = def.aa || [0, 0];
    if (!deg || !(G.settings.aimAssist ?? true)) return dir;
    const maxA = THREE.MathUtils.degToRad(deg * (this.ads ? 1.25 : 1));
    let best = null, bestScore = Infinity;
    for (const e of G.enemies) {
      if (!e.alive || e.untargetable || e.hostile === false) continue;
      for (const hb of e.hitboxes) {
        e.hbWorld(hb, _c);
        const to = _c.clone().sub(origin); const dist = to.length();
        if (dist > range || dist < 0.5) continue;
        const ang = to.normalize().angleTo(dir) - Math.atan(hb.r / dist);
        if (ang > maxA) continue;
        const score = Math.max(0, ang) - (hb.crit ? 0.012 : 0);
        if (score < bestScore) { bestScore = score; best = _c.clone(); }
      }
    }
    if (!best) return dir;
    // already on target? don't touch the shot
    if (raycast(origin, dir, range).enemy) return dir;
    if (!los(origin, best)) return dir;
    return best.sub(origin).normalize();
  }
  checkFriction(origin, dir) {
    this.overTarget = false;
    for (const e of G.enemies) {
      if (!e.alive || e.untargetable || e.hostile === false) continue;
      for (const hb of e.hitboxes) {
        e.hbWorld(hb, _c);
        const to = _c.sub(origin); const dist = to.length();
        if (dist > (this.wpn[this.cur]?.def.aa?.[1] ?? 80) || dist < 0.1) continue;
        if (to.normalize().angleTo(dir) < Math.atan((hb.r + 0.5) / dist)) { this.overTarget = true; return; }
      }
    }
  }
  // the viewmodel lives in vmCamera space; map a point there into the world (close enough for tracers/projectiles)
  vmToWorld(obj) {
    obj.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    return p.applyMatrix4(G.camera.matrixWorld);
  }
  muzzleWorld() { return this.vmToWorld(this.rig.muzzle); }
  flashMuzzle(big = 1) {
    const r = this.rig;
    r.flash.visible = r.flash2.visible = true;
    const fs = rand(0.2, 0.3) * big; r.flash.scale.set(fs * rand(0.85, 1.15), fs * rand(0.85, 1.15), 1); r.flash.material.rotation = rand(0, 6);
    r.flash2.scale.setScalar(rand(0.06, 0.09) * big);
    this.flashT = 0.045;
    const mw = this.muzzleWorld();
    fxm.flashLight(mw, 0xffc070, 14 * big, 9, 0.06);
    if (Math.random() < 0.35) fxm.muzzleSmoke(mw.addScaledVector(this.aimDir(0), 0.6));
  }

  // ---------------------------------------------------------------- shooting
  combat(dt) {
    if (this.carry || this.emote) { this.inspectT = 0; return; }
    let want = -1;
    if (hit('Digit1')) want = 0;
    if (hit('Digit2')) want = 1;
    if (hit('Digit3')) want = 2;
    if (Input.wheel) want = (this.cur + (Input.wheel > 0 ? 1 : 2)) % 3;
    if (want >= 0 && want !== this.cur && this.superActive !== 'gg') {
      this.cur = want; this.switchT = 0.32; this.reloadT = 0; this.reloadKind = null; this.inspectT = 0; this.showGun(); play('click');
    }
    // inspect: admire your gun. very important gameplay.
    if (hit('KeyT') && !this.ads && this.reloadT <= 0 && this.switchT <= 0 && this.superActive !== 'gg') { this.inspectT = INSPECT_TIME; play('hcOpen'); }
    if (this.inspectT > 0 && (this.ads || this.sprinting || Input.left || this.reloadT > 0)) this.inspectT = 0;
    if (this.inspectT > 0) this.inspectT -= dt;
    if (this.switchT > 0) this.switchT -= dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { const r = this.rig; r.flash.visible = r.flash2.visible = false; } }
    const w = this.wpn[this.cur], d = w.def;
    this.updateReload(dt, w, d);
    if (hit('KeyR') && this.superActive !== 'gg') this.startReload();
    const origin = G.camera.position;
    this.checkFriction(origin, this.aimDir(0));

    // the trace rifle's beam: a solid laser while it's firing (hidden the moment it isn't, whatever you swapped to)
    if (!this.traceBeam?.m.parent) this.traceBeam = new fxm.Beam(0xff2a3a, 0.04, 0.9);
    if (d.kind === 'trace' && this.traceHit && G.time - (this.traceAt || -1) < 0.09) {
      this.traceBeam.set(this.muzzleWorld(), this.traceHit, 0.035 + Math.min(1, (w.traceHeld || 0) / 1.5) * 0.03 + Math.random() * 0.01);
    } else this.traceBeam.hide();
    // bows: hold to draw, release to loose. A full draw is the real shot; a quick flick is weak and wide.
    if (d.kind === 'bow') {
      const ready = this.switchT <= 0 && this.reloadT <= 0 && w.mag > 0 && this.slideT <= 0.5 && this.superActive !== 'gg';
      if (Input.left && ready && G.time >= this.nextFire) {
        if (!this.drawT) play('bowDraw');
        this.drawT = Math.min(d.charge, (this.drawT || 0) + dt * (this.perks.has(w, 'archer') && this.perks.n('archer') ? 1.6 : 1));
        if (this.drawT >= d.charge && !this.drawFull) { this.drawFull = true; play('click'); } // the "perfect draw" tick
      } else if (this.drawT > 0) {
        w.drawK = this.drawT / d.charge; this.drawT = 0; this.drawFull = false;
        if (ready) this.shoot(w, d);
      }
      if (w.mag <= 0 && this.reloadT <= 0) this.startReload();
      return;
    }
    // trace rifles ramp up the longer the beam stays on, and the beam itself is a solid laser while it fires
    if (d.kind === 'trace') w.traceHeld = Input.left && w.mag > 0 && this.reloadT <= 0 ? (w.traceHeld || 0) + dt : 0;
    // fusion rifles charge while you hold the trigger (and linear fusions: one precise rail shot)
    if (d.kind === 'fusion' || d.kind === 'linear') {
      const ready = this.switchT <= 0 && this.reloadT <= 0 && G.time >= this.nextFire && w.mag > 0 && this.slideT <= 0.5 && this.superActive !== 'gg';
      if (Input.left && ready) {
        if (this.chargeT === 0) play('frCharge');
        this.chargeT += dt;
        if (this.chargeT >= d.charge) { this.chargeT = 0; this.shoot(w, d); }
      } else this.chargeT = 0;
      if (!Input.left && w.mag <= 0) this.startReload();
      if (Input.left && w.mag <= 0 && this.reloadT <= 0) this.startReload();
      return;
    }
    if (!Input.left) return;
    if (this.superActive === 'gg') return this.fireGG();
    // firing interrupts a shotgun's shell-by-shell reload
    if (this.reloadKind === 'sg' && w.mag > 0) { this.reloadT = 0; this.reloadKind = null; }
    if (this.switchT > 0 || this.reloadT > 0 || G.time < this.nextFire || this.slideT > 0.5) return;
    if (w.mag <= 0) { this.startReload(); if (this.reloadT <= 0 && G.time > this.nextFire) { play('dry'); this.nextFire = G.time + 0.3; } return; }
    this.shoot(w, d);
  }
  // One trigger pull (a burst or a fusion volley counts as one pull)
  shoot(w, d) {
    this.nextFire = G.time + d.rof;
    if (d.kind === 'burst') {
      for (let i = 0; i < d.burst; i++) after(i * d.burstGap, () => { if (w.mag > 0 && this.alive && this.wpn[this.cur] === w) this.fireRound(w, d); });
      return;
    }
    if (d.kind === 'linear') { this.fireRound(w, d); G.shake += 0.2; return; }
    if (d.kind === 'fusion') {
      w.mag--; this.perks.onFire(w); G.stats.shots++;
      play('fr');
      G.net.playerEv(['snd3', v3(this.muzzleWorld()), 'fr', []]);
      for (let i = 0; i < d.bolts; i++) after(i * d.boltGap, () => { if (this.alive) this.fireRound(w, d, true); });
      after(0.3, () => { if (w.mag === 0) this.startReload(); });
      return;
    }
    this.fireRound(w, d);
  }
  // A single round (or a shotgun blast / fusion bolt)
  fireRound(w, d, bolt = false) {
    const origin = G.camera.position;
    if (!bolt) { w.mag--; this.perks.onFire(w); G.stats.shots++; }
    this.recoilKick(bolt ? [d.kick[0] / 4, d.kick[1] / 3, d.kick[2] / 4] : d.kick);
    this.flashMuzzle(d.kind === 'pellets' ? 1.5 : d.kind === 'rocket' || d.kind === 'gl' ? 1.8 : d.kind === 'sniper' ? 1.6 : d.kind === 'fusion' ? 0.9 : d.kind === 'auto' ? 0.8 : 1);
    if (!bolt && !(d.kind === 'trace' && this.traceSndT)) play(d.sound);
    const muzzle = this.muzzleWorld();
    if (d.kind === 'rocket') {
      const aim = raycast(origin, this.aimDir(0), 200);
      const dir = aim.point.clone().sub(muzzle).normalize();
      let target = null;
      if (this.perks.has(w, 'tracking')) target = this.coneTarget(origin, this.aimDir(0), 0.45, 120);
      new Projectile({ pos: muzzle, vel: dir.multiplyScalar(38), owner: 'player', element: d.element, weapon: d.id, dmg: d.dmg, splash: d.splash, splashDmg: d.splashDmg * this.perks.dmgMult(w, null, false), color: 0xffaa55, size: 0.16, trail: 0xbbbbbb, life: 5,
        homing: target ? 3 : 0, target,
        onHit: (pos) => { if (this.perks.has(w, 'wolfpack')) this.wolfpack(pos, d.id); if (this.perks.has(w, 'cluster')) this.cluster(pos, d.id); } });
      fx.burst(muzzle, 0xffcc88, 8, 4, 0.08, 0.3, 0);
      G.net.playerEv(['snd3', v3(muzzle), d.sound, []]);
      G.shake += 0.12;
    } else if (d.kind === 'gl') {
      const dir = this.aimDir(0); dir.y += 0.06; dir.normalize();
      const impact = d.dmg * (this.perks.has(w, 'spike') ? 1.5 : 1) * this.perks.dmgMult(w, null, false);
      new Projectile({ pos: muzzle, vel: dir.multiplyScalar(d.speed), owner: 'player', element: d.element, weapon: d.id, dmg: impact, splash: d.splash, splashDmg: d.splashDmg * this.perks.dmgMult(w, null, false), gravity: d.gravity, color: 0xff9a40, size: 0.12, trail: 0xffd0a0, life: 4 });
      if (this.rig.parts.drum) this.drumSpin = 1;
      G.net.playerEv(['snd3', v3(muzzle), d.sound, []]);
      fx.burst(muzzle, 0xffcc88, 6, 3, 0.07, 0.3, 0);
    } else {
      // hitscan: hand cannon, auto, burst, scout, sniper, shotgun, fusion bolt
      const airMlg = this.perks.has(w, 'mlg') && !this.onGround;
      let spread = d.spread * (1 + (d.kind === 'auto' ? this.bloomK * 1.4 : 0));
      if (d.kind === 'sniper') spread = this.ads || airMlg ? 0 : d.spread;
      else if (d.kind === 'bow') spread = w.drawK >= 1 ? (this.ads ? 0 : d.spread) : 0.03 * (1 - w.drawK * 0.6);
      else if (d.kind === 'trace' || d.kind === 'linear') spread = 0;
      else spread *= this.ads ? (d.pellets ? 0.7 : 0.12) : 1;
      if (airMlg) spread = 0;
      const base = this.magnetize(origin, this.aimDir(0), d);
      const hits = new Map();
      let anyHit = false;
      for (let i = 0; i < (d.pellets || 1); i++) {
        const dir = spread > 0 ? jitter(base, spread) : base;
        const h = raycast(origin, dir, d.range);
        const wide = d.kind === 'sniper' || d.kind === 'linear' ? 0.05 : d.kind === 'bow' ? 0.03 : d.kind === 'trace' ? 0.035 : d.pellets ? 0.012 : d.kind === 'fusion' ? 0.03 : 0.022;
        if (d.kind === 'trace') { this.traceHit = h.point.clone(); this.traceAt = G.time; }
        if (!d.pellets || i < 4) fx.tracer(muzzle, h.point, d.color, wide, d.kind === 'sniper' || d.kind === 'linear' ? 0.22 : d.kind === 'bow' ? 0.12 : d.kind === 'trace' ? 0.06 : 0.05);
        if (i < 3) G.net.playerEv(['shot', v3(muzzle), v3(h.point), d.color, wide, i === 0 && !bolt ? d.sound : 0]);
        if (h.enemy) {
          anyHit = true;
          let dmg = d.dmg;
          if (h.dist > d.falloff[0]) dmg *= 1 - (1 - d.falloff[2]) * clamp((h.dist - d.falloff[0]) / (d.falloff[1] - d.falloff[0]), 0, 1);
          if (h.crit) dmg *= d.crit;
          if (d.kind === 'bow') dmg *= w.drawK >= 1 ? 1 : 0.3 + 0.4 * w.drawK;
          if (d.kind === 'trace') dmg *= 1 + Math.min(1, (w.traceHeld || 0) / 1.5);
          const e = hits.get(h.enemy) || { dmg: 0, crit: false, point: h.point };
          e.dmg += dmg; e.crit = e.crit || h.crit; hits.set(h.enemy, e);
        } else if (h.dist < d.range - 0.1) {
          if (!d.pellets || i < 4) local(() => fxm.impact(h.point, h.normal, dir, { sparks: d.pellets ? 3 : d.kind === 'sniper' ? 12 : 6, size: d.kind === 'sniper' ? 1.4 : 1 }));
          fx.decal(h.point, h.normal, d.pellets ? 0.09 : d.kind === 'sniper' ? 0.22 : 0.14);
          if (Math.random() < 0.4) fx.debris(h.point, 0x777777, 2, 3, 0.03, 0.5);
        }
      }
      if (!anyHit) this.perks.onMiss(w);
      this.applyHits(hits, w);
      if (d.kind === 'pellets') { this.pumpT = 0.55; after(0.22, () => { play('pump'); this.ejectShell(0xb02020); }); }
      else if (['auto', 'burst'].includes(d.kind) || d.id === 'sr' || d.kind === 'sniper') this.ejectShell();
      if (this.rig.parts.hammer) this.rig.parts.hammer.rotation.x = 0.4;
      if (d.kind === 'sniper') G.shake += 0.15;
    }
    if (w.mag === 0 && !bolt && d.kind !== 'fusion') after(0.18, () => this.startReload());
    if (d.kind === 'trace' && !this.traceSndT) { this.traceSndT = 1; after(0.1, () => (this.traceSndT = 0)); }
  }
  // nearest enemy inside a cone (tracking rockets)
  coneTarget(origin, dir, maxAngle, range) {
    let best = null, ba = maxAngle;
    for (const e of G.enemies) {
      if (!e.alive || e.untargetable || e.hostile === false) continue;
      const to = e.center().sub(origin); if (to.length() > range) continue;
      const a = to.normalize().angleTo(dir); if (a < ba) { ba = a; best = e; }
    }
    return best;
  }
  cluster(pos, weapon = null) {
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0.8, 1.6), rand(-1, 1)).normalize().multiplyScalar(rand(6, 10));
      new Projectile({ pos: pos.clone().add(new THREE.Vector3(0, 0.4, 0)), vel: v, owner: 'player', dmg: 0, splash: 1.6, splashDmg: 35, gravity: 18, color: 0xffdd55, size: 0.06, life: 1.4, trail: 0xffaa55, weapon });
    }
  }
  recoilKick([pitch, yaw, vm]) {
    this.bloomK = Math.min(1, this.bloomK + 0.3 * vm);
    this.aimPunchV.x += pitch * 14 * (this.ads ? 0.8 : 1);
    this.aimPunchV.y += rand(-yaw, yaw) * 14;
    this.kickPV.z += 2.6 * vm; this.kickPV.y += 0.5 * vm;
    this.kickRV.x += 9 * vm; this.kickRV.z += rand(-2, 2) * vm;
    G.shake += 0.02 * vm;
  }
  applyHits(hits, w = null) {
    let anyCrit = false, kill = false, any = false, shieldEl = null;
    for (const [e, h] of hits) {
      const wasAlive = e.alive, hpBefore = e.hp;
      if (e.shieldHp > 0) shieldEl = e.shieldEl;
      const dmg = w ? h.dmg * this.perks.dmgMult(w, e, h.crit) : h.dmg;
      const dealt = e.takeDamage(dmg, h.crit, { hitscan: true, element: w?.def.element, point: h.point, weapon: w ? w.def.id : 'gg' });
      if (dealt > 0) { any = true; G.stats.hits++; if (w) this.perks.onHit(w, e, h.crit); }
      anyCrit = anyCrit || (h.crit && dealt > 0);
      // on clients the proxy doesn't die locally; predict it so kill perks still feel instant
      const killed = wasAlive && (!e.alive || (e.proxy && dealt > 0 && hpBefore - dealt <= 0 && e.hostile !== false));
      if (killed) {
        kill = true; if (w) this.perks.onKill(w, e, h.crit, e.center());
      }
      fx.burst(h.point, h.crit ? 0xffd23f : 0xffb070, h.crit ? 7 : 4, 4, 0.05, 0.25, 6);
    }
    if (any || kill) { HUD.hitmarker(anyCrit, kill, shieldEl); play(anyCrit ? 'crit' : 'hit'); if (kill) play('kill'); }
  }
  ejectShell(color) {
    const p = this.vmToWorld(this.rig.sight);
    _r.set(1, 0, 0).applyQuaternion(G.camera.quaternion);
    fx.casing(p, _r.clone().multiplyScalar(rand(2, 3.2)).add(new THREE.Vector3(0, rand(1.5, 2.5), 0)), color);
  }

  // the spent mag leaves the gun and tumbles out of view (in viewmodel space, so it falls past the camera)
  dropMag() {
    const m = this.rig?.parts.mag; if (!m) return;
    const c = m.clone(); c.visible = true;
    m.updateWorldMatrix(true, false);
    m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    this.vm.worldToLocal(c.position);
    c.quaternion.premultiply(this.vm.getWorldQuaternion(new THREE.Quaternion()).invert());
    c.scale.divideScalar(VM_SCALE);
    this.vm.add(c);
    (this.droppedMags ||= []).push({ m: c, v: new THREE.Vector3(rand(-0.2, 0.1), -0.4, rand(0, 0.3)), spin: new THREE.Vector3(rand(-6, 6), rand(-3, 3), rand(-8, -3)), t: 0 });
  }
  updateDroppedMags(dt) {
    if (!this.droppedMags?.length) return;
    for (let i = this.droppedMags.length - 1; i >= 0; i--) {
      const d = this.droppedMags[i];
      d.t += dt; d.v.y -= 9 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt; d.m.rotation.z += d.spin.z * dt;
      if (d.t > 0.9) { this.vm.remove(d.m); this.droppedMags.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- reloading
  startReload() {
    const w = this.wpn[this.cur], d = w.def;
    if (this.reloadT > 0 || w.mag >= d.mag || this.superActive === 'gg') return;
    if (d.ammo !== 'primary' && w.reserve <= 0) return;
    this.reloadKind = ['hc', 'sg', 'rl', 'gl'].includes(d.model) ? d.model : 'mag'; this.reloadFx = {};
    this.reloadEmpty = w.mag <= 0 && this.reloadKind === 'mag' && !!this.rig?.parts.mag;
    this.reloadT = this.reloadMax = (d.kind === 'pellets' ? d.shellTime + 0.15 : d.reload) * this.perks.reloadMult(w);
    play('click');
  }
  updateReload(dt, w, d) {
    if (this.reloadT <= 0) return;
    this.reloadT -= dt;
    const u = 1 - this.reloadT / this.reloadMax;
    const f = this.reloadFx;
    if (d.id === 'hc') {
      if (u > 0.22 && !f.open) { f.open = true; play('hcOpen'); }
      if (u > 0.32 && !f.eject) { f.eject = true; for (let i = 0; i < 6; i++) this.ejectShell(); }
      if (u > 0.78 && !f.close) { f.close = true; play('hcClose'); }
    } else if (d.id === 'rl') {
      if (u > 0.55 && !f.load) { f.load = true; play('rlLoad'); }
    } else if (this.rig?.parts.mag && this.reloadKind === 'mag') {
      if (u > 0.3 && !f.out) { f.out = true; play('magOut'); this.dropMag(); }
      if (u > 0.64 && !f.in) { f.in = true; play('magIn'); this.kickRV.x -= 5; this.kickPV.y += 0.5; }
      if (this.reloadEmpty && u > 0.82 && !f.rack) { f.rack = true; play('rack'); this.kickRV.z += 4; }
    } else {
      if (u > 0.25 && !f.out) { f.out = true; play('hcOpen'); }
      if (u > 0.7 && !f.in) { f.in = true; play('hcClose'); this.kickRV.x -= 3; }
    }
    if (this.reloadT > 0) return;
    if (d.kind === 'pellets') {
      // one shell at a time; keep going while you need more and aren't shooting
      if (w.reserve > 0 && w.mag < d.mag) { w.mag++; w.reserve--; play('shellIn'); }
      if (w.mag < d.mag && w.reserve > 0 && !Input.left) this.reloadT = this.reloadMax = d.shellTime * this.perks.reloadMult(w);
      else { this.reloadKind = null; play('pump'); this.perks.onReloadDone(w); }
      return;
    }
    this.refill(w);
    this.reloadKind = null;
    this.perks.onReloadDone(w);
  }

  // ---------------------------------------------------------------- viewmodel animation
  animateViewmodel(dt) {
    const d = this.def, r = this.rig;
    const spring = (p, v, k, c) => { v.addScaledVector(p, -k * dt); v.multiplyScalar(Math.exp(-c * dt)); p.addScaledVector(v, dt); };
    spring(this.kickP, this.kickPV, 180, 16);
    spring(this.kickR, this.kickRV, 220, 18);
    this.adsK = damp(this.adsK, this.ads ? 1 : 0, this.perks.has(this.wpn[this.cur], 'snapshot') ? 34 : 16, dt);
    const a = this.adsK;
    const speedXZ = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && speedXZ > 1 && this.slideT <= 0) this.bobT += dt * speedXZ * 1.15;
    const bobAmt = (1 - a * 0.85) * Math.min(1, speedXZ / 7);
    const bx = Math.cos(this.bobT * 0.5) * 0.009 * bobAmt, by = Math.abs(Math.sin(this.bobT * 0.5)) * 0.012 * bobAmt;
    // hip vs ADS pose: ADS puts the sight on the screen centre
    const s = r.sight.position;
    const S = VM_SCALE, hip = d.hip, ads = [-s.x * S, -s.y * S, d.adsZ - s.z * S];
    this.sprintK = damp(this.sprintK, this.sprinting ? 1 : 0, 8, dt);
    const sw = this.switchT > 0 ? Math.sin((this.switchT / 0.32) * Math.PI / 2) : 0;
    const punch = this.punchT > 0 ? Math.sin((this.punchT / 0.3) * Math.PI) : 0;
    const swayK = 1 - a * 0.7;
    let px = THREE.MathUtils.lerp(hip[0], ads[0], a) + bx + this.sway.x * 0.35 * swayK - this.sprintK * 0.04 - punch * 0.12;
    let py = THREE.MathUtils.lerp(hip[1], ads[1], a) - by + this.sway.y * 0.35 * swayK - sw * 0.25 - this.sprintK * 0.05 + this.landDip * 0.3 + this.kickP.y * 0.012;
    const pz = THREE.MathUtils.lerp(hip[2], ads[2], a) + this.kickP.z * 0.025 - punch * 0.18;
    let rx = this.kickR.x * 0.02 + this.sway.y * 0.6 * swayK - this.sprintK * 0.3 - sw * 0.6;
    // canted slightly inward at the hip so you see the gun's flank, straight when aiming
    let ry = 0.09 * (1 - a) + this.sway.x * 0.8 * swayK + this.sprintK * 0.55 + punch * 0.5;
    let rz = 0.04 * (1 - a) + this.kickR.z * 0.01 + this.sway.x * 0.5 * swayK + (this.slideT > 0 ? 0.25 : 0);
    // breathing when still, lean into strafes, the gun lags behind jumps and falls
    const still = 1 - Math.min(1, speedXZ / 2);
    const br = this.t2 = (this.t2 || 0) + dt;
    py += Math.sin(br * 1.6) * 0.0035 * still * (1 - a * 0.7); rx += Math.sin(br * 1.6 + 0.6) * 0.006 * still * (1 - a * 0.7);
    const lateral = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    this.strafeK = damp(this.strafeK || 0, Math.max(-1, Math.min(1, lateral / 7)), 8, dt);
    rz -= this.strafeK * 0.07 * (1 - a * 0.6); px -= this.strafeK * 0.008 * (1 - a);
    this.airK = damp(this.airK || 0, this.onGround ? 0 : Math.max(-1, Math.min(1, this.vel.y / 10)), 7, dt);
    py -= this.airK * 0.025 * (1 - a * 0.7); rx -= this.airK * 0.06 * (1 - a * 0.7);
    // reload choreography
    const rk = this.reloadKind;
    if (r.parts.crane) r.parts.crane.rotation.z = 0;
    const left = r.arms.left.position;
    left.set(0, 0, 0);
    if (rk && this.reloadT > 0) {
      const u = 1 - this.reloadT / this.reloadMax;
      const ease = (x) => x * x * (3 - 2 * x);
      if (rk === 'hc') {
        const tilt = u < 0.2 ? ease(u / 0.2) : u > 0.85 ? ease((1 - u) / 0.15) : 1;
        rz += tilt * 0.9; rx += tilt * 0.35; px -= tilt * 0.06; py += tilt * 0.02;
        const open = u < 0.22 ? 0 : u < 0.32 ? ease((u - 0.22) / 0.1) : u < 0.75 ? 1 : u < 0.82 ? 1 - ease((u - 0.75) / 0.07) : 0;
        if (r.parts.crane) r.parts.crane.rotation.z = open * 1.3;
        if (r.parts.cyl && u > 0.75) r.parts.cyl.rotation.y += dt * 22;
        // off hand: down for a speedloader, up into the open cylinder, push, back to the grip
        const fetch = u < 0.3 ? 0 : u < 0.42 ? ease((u - 0.3) / 0.12) : u < 0.5 ? 1 : u < 0.62 ? 1 - ease((u - 0.5) / 0.12) : 0;
        const feed = u < 0.5 ? 0 : u < 0.62 ? ease((u - 0.5) / 0.12) : u < 0.74 ? 1 : u < 0.84 ? 1 - ease((u - 0.74) / 0.1) : 0;
        left.set(-fetch * 0.05 + feed * 0.07, -fetch * 0.3 + feed * 0.1, fetch * 0.12 - feed * 0.04);
        if (u > 0.66 && u < 0.72) left.z -= Math.sin(((u - 0.66) / 0.06) * Math.PI) * 0.03; // the push
      } else if (rk === 'sg') {
        rz += 0.5; rx += 0.14; px -= 0.03;
        const up = u < 0.55 ? ease(u / 0.55) : 1, push = u > 0.55 ? Math.sin(((u - 0.55) / 0.45) * Math.PI) : 0;
        left.set(-0.01, -0.16 + up * 0.12, 0.2 - up * 0.08 - push * 0.06);
      } else if (rk === 'rl') {
        const dip = Math.sin(u * Math.PI);
        rx -= dip * 0.5; py -= dip * 0.12; rz += dip * 0.3;
        left.set(0, -dip * 0.08, dip * 0.1);
      } else if ((rk === 'mag' || rk === 'gl') && r.parts.mag) {
        // tilt the gun, off hand to the mag, the old one drops away, a fresh one comes up and gets slapped in,
        // and (if you ran it dry) a rack of the charging handle before the gun comes back level
        const end = this.reloadEmpty ? 0.9 : 0.8;
        const tilt = u < 0.14 ? ease(u / 0.14) : u > end ? ease((1 - u) / (1 - end)) : 1;
        rz += tilt * 0.55; rx += tilt * 0.18; px -= tilt * 0.035; py += tilt * 0.01;
        const mag = r.parts.mag, ud = mag.userData;
        ud.y0 ??= mag.position.y; ud.z0 ??= mag.position.z;
        const lh = LEFT_HAND[d.model] || [-0.01, -0.13, -0.2];
        const toMag = [-lh[0], ud.y0 - 0.04 - lh[1], ud.z0 - lh[2]]; // from the foregrip to the bottom of the mag
        const k = (a0, a1) => (u < a0 ? 0 : u > a1 ? 1 : ease((u - a0) / (a1 - a0)));
        const reach = k(0.12, 0.26) * (1 - k(0.64, 0.76));       // hand on the mag
        const fetch = k(0.32, 0.44) * (1 - k(0.5, 0.64));        // hand down below the screen for a fresh one
        left.set(toMag[0] * reach - fetch * 0.04, toMag[1] * reach - fetch * 0.3, toMag[2] * reach + fetch * 0.1);
        // the mag: pulled out an inch (0.26-0.3), gone, then rides up in the hand and seats (0.58-0.64)
        ud.x0 ??= mag.position.x;
        const f = u >= 0.5 ? fetch : 0, pulled = u < 0.3 ? k(0.26, 0.3) * 0.05 : 0;
        mag.visible = !(u >= 0.3 && u < 0.5);
        mag.position.set(ud.x0 - f * 0.04, ud.y0 - pulled - f * 0.3, ud.z0 + f * 0.1);
        if (u > 0.64 && u < 0.7) rx -= Math.sin(((u - 0.64) / 0.06) * Math.PI) * 0.1; // the slap
        // the rack: off hand up to the side of the receiver, a sharp pull back, let go
        if (this.reloadEmpty) {
          const rk1 = k(0.74, 0.8) * (1 - k(0.86, 0.92)), pull = u > 0.8 && u < 0.86 ? Math.sin(((u - 0.8) / 0.06) * Math.PI) : 0;
          left.x += rk1 * 0.07; left.y += rk1 * 0.16; left.z += rk1 * 0.12 + pull * 0.07;
          rz += rk1 * 0.12; ry -= rk1 * 0.12;
        }
        if (r.parts.drum) r.parts.drum.rotation.y += dt * 9 * tilt;
      } else if (rk === 'mag' || rk === 'gl') {
        // no magazine to swap (bows, fusions, traces): a quick tilt and a slap on the battery
        const tilt = u < 0.15 ? ease(u / 0.15) : u > 0.85 ? ease((1 - u) / 0.15) : 1;
        rz += tilt * 0.5; rx += tilt * 0.15; px -= tilt * 0.03;
        const magOut = u < 0.25 ? 0 : u < 0.4 ? ease((u - 0.25) / 0.15) : u < 0.62 ? 1 : u < 0.72 ? 1 - ease((u - 0.62) / 0.1) : 0;
        if (r.parts.drum) r.parts.drum.rotation.y += dt * 9 * tilt;
        left.set(0, -magOut * 0.12, magOut * 0.15);
        if (u > 0.72 && u < 0.8) { rx -= 0.08; } // the slap
      }
    } else if (r.parts.mag?.userData.y0 != null) { const ud = r.parts.mag.userData; r.parts.mag.position.set(ud.x0 ?? r.parts.mag.position.x, ud.y0, ud.z0 ?? r.parts.mag.position.z); r.parts.mag.visible = true; }
    this.updateDroppedMags(dt);
    if (r.parts.charge) {
      const c = this.chargeT / (d.charge || 1);
      r.parts.charge.scale.setScalar(1 + c * 0.7); r.parts.charge.material.emissiveIntensity = 0.8 + c * 1.6;
      px += rand(-1, 1) * 0.003 * c; py += rand(-1, 1) * 0.003 * c;
    }
    if (r.parts.drum && this.drumSpin > 0) { this.drumSpin = Math.max(0, this.drumSpin - dt * 4); r.parts.drum.rotation.y += dt * 12 * this.drumSpin; }
    // the bow: the nock (and the arrow on it) comes back as you draw; the two string halves follow it
    if (r.parts.nock) {
      const k = this.wpn[this.cur].def.kind === 'bow' ? Math.min(1, (this.drawT || 0) / (this.wpn[this.cur].def.charge || 1)) : 0;
      r.parts.nock.position.z = 0.02 + k * 0.17;
      r.parts.arrow.visible = this.wpn[this.cur].mag > 0 && this.reloadT <= 0;
      r.parts.strings.forEach((m, i) => {
        const tip = r.parts.bowTips[i], nz = r.parts.nock.position.z;
        const dy = -tip.y, dz = nz - tip.z, len = Math.hypot(dy, dz);
        m.position.set(0, tip.y + dy / 2, tip.z + dz / 2); m.scale.set(1, len, 1); m.rotation.set(Math.atan2(dz, dy), 0, 0);
      });
    }
    // the linear fusion's coils light up as it charges
    if (r.parts.coils) { const k = Math.min(1, this.chargeT / (this.wpn[this.cur].def.charge || 1)); r.parts.coils.forEach((c, i) => { c.material.emissiveIntensity = 0.8 + k * 3 * (k > i / 3 ? 1 : 0.2); }); }
    // pump action
    if (r.parts.pump) {
      this.pumpT = Math.max(0, this.pumpT - dt);
      const pk = this.pumpT > 0.2 && this.pumpT < 0.45 ? Math.sin(((0.45 - this.pumpT) / 0.25) * Math.PI) : 0;
      r.parts.pump.position.z = -0.3 + pk * 0.08;
      if (rk !== 'sg') left.z = pk * 0.08;
    }
    if (r.parts.hammer) r.parts.hammer.rotation.x = damp(r.parts.hammer.rotation.x, -0.3, 12, dt);
    if (r.parts.flame) { r.parts.flame.material.rotation += dt * 3; r.parts.flame.scale.set(0.1 + Math.random() * 0.04, 0.15 + Math.random() * 0.05, 1); }
    let inspectSpin = 0;
    if (this.inspectT > 0) {
      const u = 1 - this.inspectT / INSPECT_TIME;
      const [ix, iy, iz, irx, iry, irz] = inspectPose(u);
      inspectSpin = (iry - (this.lastInspectRy || 0)) / Math.max(dt, 1e-3);
      this.lastInspectRy = iry;
      px += ix; py += iy; rx += irx; ry += iry; rz += irz;
      this.vmInspectZ = iz;
      // hand cannon flourish: spin the cylinder while it's showing its other side
      if (r.parts.cyl && u > 0.6 && u < 0.82) r.parts.cyl.rotation.y += dt * 28;
      if (r.parts.pump && u > 0.62 && u < 0.7) r.parts.pump.position.z = -0.3 + Math.sin(((u - 0.62) / 0.08) * Math.PI) * 0.08;
      if (r.parts.horn) r.parts.horn.rotation.z = Math.sin(u * 40) * 0.2 * Math.sin(u * Math.PI);
    } else { this.lastInspectRy = 0; this.vmInspectZ = 0; }
    // potato charm pendulum
    if (r.parts.charm) {
      this.charmV += (-this.charmA * 60 - this.sway.x * 40 - this.kickRV.x * 0.3 - inspectSpin * 0.6) * dt;
      this.charmV *= Math.exp(-3 * dt); this.charmA += this.charmV * dt;
      r.parts.charm.rotation.z = this.charmA; r.parts.charm.rotation.x = this.kickR.x * 0.01;
    }
    this.vm.position.set(px, py, pz + (this.vmInspectZ || 0));
    this.vm.rotation.set(rx, ry, rz);
    if (this.punchT > 0) this.punchT -= dt;
  }

  // ---------------------------------------------------------------- abilities & supers
  wolfpack(pos, weapon = null) {
    // Wolfpack rounds: mini rockets that seek nearby memes
    const targets = G.enemies.filter((e) => e.alive && !e.untargetable && e.hostile !== false && e.pos.distanceTo(pos) < 25);
    for (let i = 0; i < 3; i++) {
      const t = targets.length ? targets[i % targets.length] : null;
      const v = new THREE.Vector3(rand(-1, 1), rand(0.6, 1.4), rand(-1, 1)).normalize().multiplyScalar(14);
      new Projectile({ pos: pos.clone().add(new THREE.Vector3(0, 0.4, 0)), vel: v, owner: 'player', dmg: 0, splash: 2, splashDmg: 45, color: 0xff7744, size: 0.08, homing: t ? 4 : 0, target: t, life: 2.2, trail: 0xff9966, weapon });
    }
  }
  fireGG() {
    if (G.time < this.nextFire) return;
    this.nextFire = G.time + GG.rof;
    this.recoilKick(GG.kick); this.flashMuzzle(2); play('gg');
    const origin = G.camera.position.clone();
    const dir = this.magnetize(origin, this.aimDir(0), { aa: [2.5, 120] });
    const h = raycast(origin, dir, 200);
    fx.tracer(this.muzzleWorld(), h.point, 0xffb030, 0.12, 0.25);
    G.net.playerEv(['shot', v3(this.muzzleWorld()), v3(h.point), 0xffb030, 0.12]);
    if (h.enemy) this.applyHits(new Map([[h.enemy, { dmg: GG.dmg * (h.crit ? GG.crit : 1), crit: h.crit, point: h.point }]]));
    explode(h.point, 2.5, 90, { color: 0xffa020, knock: 0.3, silent: true, localFx: true });
    fx.burst(h.point, 0xffd060, 18, 7, 0.08, 0.7, 6); fx.burst(h.point, 0xffffff, 6, 4, 0.05, 0.3, 0); // golden embers
    this.ggShots--;
    if (this.ggShots <= 0) this.endSuper();
  }
  endSuper() { this.superActive = null; this.showGun(); document.querySelector('#superfx .sf-gold')?.classList.remove('on'); }

  // Finishers: a weakened (non-boss) enemy in reach gets a marker; melee lunges you onto it for a takedown.
  finisherTarget() {
    if (!this.alive || this.superActive || this.carry || this.emote) return null;
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let best = null, bd = 3.2;
    for (const e of G.enemies) {
      if (!e.alive || e.untargetable || e.hostile === false || e.immune || (e.rank !== 'minor' && e.rank !== 'major')) continue;
      if (e.hp / e.maxHp > (e.rank === 'major' ? 0.2 : 0.3) || e.shieldHp > 0) continue;
      const to = _c.set(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z); const d = to.length() - e.radius;
      if (d < bd && Math.abs(e.pos.y - this.pos.y) < 2 && to.normalize().dot(_f) > 0.5) { bd = d; best = e; }
    }
    return best;
  }
  updateFinisher(dt) {
    const e = this.finTarget;
    this.finisherT -= dt;
    // lunge to just in front of it, facing it
    if (e) {
      const away = _c.set(this.pos.x - e.pos.x, 0, this.pos.z - e.pos.z); if (away.lengthSq() < 1e-4) away.set(0, 0, 1); away.normalize();
      const k = Math.min(1, dt * 14);
      this.pos.x += (e.pos.x + away.x * (e.radius + 0.9) - this.pos.x) * k;
      this.pos.z += (e.pos.z + away.z * (e.radius + 0.9) - this.pos.z) * k;
      this.yaw = dampAngle(this.yaw, Math.atan2(away.x, away.z), 18, dt);
    }
    this.vel.x = 0; this.vel.z = 0;
    this.switchT = Math.max(this.switchT, 0.15); // no shooting mid-takedown
    if (!this.finHit && this.finisherT <= 0.38) {
      this.finHit = true; this.punchT = 0.35;
      if (e && e.alive) {
        const c = e.center();
        e.takeDamage(e.hp + 99999, true, { melee: true, finisher: true });
        play('bigBonk'); G.shake += 0.6; this.kickRV.x -= 14;
        HUD.hitmarker(true, true);
        fx.floatText(e.top().clone(), pick(['FINISHED', 'BONKED', 'L + RATIO', 'GET MOGGED', 'SIT.', 'DELETED']), { color: '#ffd23f', height: 0.75 });
        for (let i = 0; i < 2; i++) new Pickup('orb', c.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0.3, rand(-0.6, 0.6))));
        this.addSuper(5);
        G.stats.finishers = (G.stats.finishers || 0) + 1;
        if (G.stats.finishers >= 5) unlock('finisher');
      }
    }
    if (this.finisherT <= 0) { this.finTarget = null; }
  }
  abilities(dt) {
    // grenade / melee back: a little chime, like the real thing
    if (this.grenadeCd > 0 && this.grenadeCd - dt <= 0) play('abilityReady', 0);
    if (this.meleeCd > 0 && this.meleeCd - dt <= 0) play('abilityReady', 1);
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    if (this.finisherT > 0) { this.updateFinisher(dt); return; }
    // the finisher marker over whatever you could finish right now
    const fin = this.finisherTarget();
    if (!this.finMark?.parent) { this.finMark = textSprite('◆ [V] FINISH', 0.26, { font: IMPACT, weight: 'normal', color: '#ffd23f', fog: false, depthTest: false }); G.fxGroup.add(this.finMark); }
    this.finMark.visible = !!fin;
    if (fin) { fin.top(this.finMark.position); this.finMark.position.y += 0.35 + Math.sin(G.time * 6) * 0.05; }
    if (fin && hit('KeyV')) {
      this.finTarget = fin; this.finisherT = 0.62; this.finHit = false; this.finMark.visible = false;
      play('whoosh');
      return;
    }
    if (this.superActive === 'gg') { this.superTimer -= dt; if (this.superTimer <= 0) this.endSuper(); }

    if (hit('KeyQ') && this.grenadeCd <= 0) {
      this.grenadeCd = this.grenadeMax;
      const dir = this.aimDir(0); dir.y += 0.25;
      const pos = G.camera.position.clone().addScaledVector(dir, 0.6);
      const el = { hunter: 'solar', titan: 'arc', warlock: 'void' }[this.cls];
      new Projectile({ pos, vel: dir.normalize().multiplyScalar(22), owner: 'player', element: el, dmg: 20, splash: 4.5, splashDmg: 110, gravity: 18, color: { hunter: 0xff8a2a, titan: 0x7fd7ff, warlock: 0xc58bff }[this.cls], size: 0.14, life: 2.5, trail: 0xffffff,
        onHit: (at) => this.grenadeField(el, at.clone()) });
      play('click');
      this.kickRV.x -= 6;
      this.perks.onGrenade();
      if (this.armor === 'galaxy') this.addSuper(6);
    }
    if (hit('KeyV') && this.meleeCd <= 0) {
      this.meleeCd = this.meleeMax; this.punchT = 0.3;
      _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      let best = null, bd = 3.4;
      for (const e of G.enemies) {
        if (!e.alive || e.untargetable) continue;
        const c = e.center(); const to = c.clone().sub(this.pos); to.y = 0;
        const d = to.length() - e.radius;
        if (d < bd && to.normalize().dot(_f) > 0.45 && Math.abs(c.y - this.pos.y - 1) < 2.5) { bd = d; best = e; }
      }
      if (best) {
        const wasAlive = best.alive;
        const oneTwo = this.perks.n('one_two') > 0;
        const punch = (oneTwo ? 2.5 : 1) * (this.armor === 'gigachad' ? 3 : 1); // One-Two Punch, Gigachad Gauntlets
        best.takeDamage(120 * punch, false, { melee: true });
        if (oneTwo) { this.perks.buffs.one_two.t = 0; fx.floatText(best.top().clone(), 'ONE-TWO', { height: 0.5, color: '#ffd23f' }); }
        if (wasAlive && !best.alive) { this.perks.onMeleeKill(); if (this.armor === 'gigachad' && this.grenadeCd > 0) { this.grenadeCd = 0; play('abilityReady', 0); } }
        if (best.rank !== 'boss' && best.knockable !== false && !best.proxy) { best.vel.addScaledVector(_f, 10); best.vel.y += 4; }
        this.vel.addScaledVector(_f, 5);
        play('bonk'); HUD.hitmarker(false, wasAlive && !best.alive);
        G.shake += 0.15;
        if (Math.random() < 0.4) fx.floatText(best.top().clone(), 'BONK', { color: '#ffffff', height: 0.6 });
      } else play('jump');
    }
    if (hit('KeyF') && this.superCharge >= 100 && !this.superActive) this.castSuper();
  }

  // Class grenades leave something behind: an incendiary patch (Hunter), a pulse field (Titan), a vortex (Warlock).
  // The thrower's machine ticks the damage; teammates get the visual.
  grenadeField(el, at) {
    const floorY = groundYAt(at);
    const P = at.clone().setY(el === 'void' ? at.y : floorY);
    fx.grenadeField(el, P, 3);
    G.net.playerEv(['pfx', 'gren', v3(P), el]);
    const R = el === 'solar' ? 3.6 : el === 'arc' ? 4.5 : 5;
    const ticks = el === 'arc' ? 4 : 6, dmg = el === 'solar' ? 22 : el === 'arc' ? 45 : 28;
    for (let i = 1; i <= ticks; i++) after(i * 3 / ticks, () => {
      for (const e of G.enemies) {
        if (!e.alive || e.untargetable || e.hostile === false) continue;
        const d = e.center().distanceTo(P);
        if (d > R + e.radius) continue;
        e.takeDamage(dmg, false, { splash: true, element: el });
        // the vortex drags things in (only where the enemy is simulated)
        if (el === 'void' && !G.net.isClient && e.rank !== 'boss' && e.knockable !== false) e.vel.addScaledVector(P.clone().sub(e.center()).setY(0).normalize(), 6);
      }
    });
  }
  // Emotes: B dances, N sits. The camera swings out to third person so you can see yourself; moving, jumping
  // or shooting cancels. Teammates see it on your avatar (it rides in the pose you send them).
  // got rickrolled: you dance, whether you like it or not
  rickroll() {
    if (!this.alive) return;
    this.rickT = 1.6; this.emote = EMOTES.dance; this.emoteT = 0;
    lhud('bigText', 'RICKROLLED', 'never gonna let you live this down', 1.6, 'meme');
    play('rick');
  }
  // your own guardian, seen in third person while you emote. The loading screen builds it ahead of time (hidden) so
  // its shaders compile there instead of on your first dance.
  ensureSelfBody() {
    if (this.selfBody?.userData.cls === this.cls) return;
    if (this.selfBody) G.avatarGroup.remove(this.selfBody);
    this.selfBody = buildGuardian(this.cls); this.selfBody.userData.cls = this.cls; this.selfBody.visible = false;
    G.avatarGroup.add(this.selfBody);
  }
  updateEmote(dt, cam) {
    if (this.rickT > 0) { this.rickT -= dt; this.emote = this.alive ? EMOTES.dance : 0; if (this.rickT <= 0) this.emote = 0; }
    else {
    if (hit('KeyB')) this.emote = this.emote === EMOTES.dance ? 0 : EMOTES.dance;
    if (hit('KeyN')) this.emote = this.emote === EMOTES.sit ? 0 : EMOTES.sit;
    if (hit('KeyJ')) { this.emote = this.emote === EMOTES.dab ? 0 : EMOTES.dab; this.emoteT = 0; }
    if (hit('KeyK')) this.emote = this.emote === EMOTES.L ? 0 : EMOTES.L;
    if (this.emote && (down('KeyW') || down('KeyA') || down('KeyS') || down('KeyD') || down('Space') || Input.left || Input.right || !this.alive || this.superActive || this.carry)) this.emote = 0;
    }
    if (this.emote) this.ensureSelfBody();
    if (this.selfBody && this.selfBody.userData.cls !== this.cls) { G.avatarGroup.remove(this.selfBody); this.selfBody = null; }
    this.emoteK = damp(this.emoteK || 0, this.emote ? 1 : 0, 6, dt);
    if (this.selfBody) {
      this.selfBody.visible = this.emoteK > 0.05;
      if (!this.selfBody.visible) return;
      this.emoteT = (this.emoteT || 0) + dt;
      const holder = this.selfBody;
      poseEmote(holder, this.emote, this.emoteT);
      holder.position.add(this.pos); holder.rotation.y += this.yaw + Math.PI;
      // orbit a camera out in front of you, pulled in if a wall is in the way
      const a = this.yaw + Math.sin(this.emoteT * 0.3) * 0.6;
      const head = _c.set(this.pos.x, this.pos.y + 1.4, this.pos.z);
      const want = _o.set(-Math.sin(a), 0.14, -Math.cos(a)).normalize();
      const h = raycast(head, want, 3.6, { enemies: false });
      const d = Math.max(0.8, Math.min(3.6, h.dist - 0.3));
      const k = this.emoteK;
      cam.position.lerp(_v.copy(head).addScaledVector(want, d), k);
      if (k > 0.5) cam.lookAt(head.x, head.y - 0.2, head.z);
    }
  }
  castSuper() {
    this.superCharge = 0;
    if (this.armor === 'mask') { this.grenadeCd = 0; this.meleeCd = 0; }
    play('superCast');
    lhud('bigText', this.clsDef.superName, this.clsDef.superSub, 1.6, 'meme');
    G.shake += 0.4;
    // the moment: a flash in your class colour, a FOV punch, and a ring of energy around you
    const col = { hunter: 0xffb030, titan: 0x7fd7ff, warlock: 0xb06cff }[this.cls];
    const flash = document.querySelector('#superfx .sf-flash');
    if (flash) { flash.style.setProperty('--sfc', '#' + col.toString(16).padStart(6, '0')); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
    this.fov += 14;
    fx.superRing(this.pos.clone(), col, 7);
    G.net.playerEv(['pfx', 'ring', v3(this.pos), col]);
    if (this.cls === 'hunter') {
      this.superActive = 'gg'; this.ggShots = 6; this.superTimer = 14; this.nextFire = G.time + 0.3; this.reloadT = 0; this.reloadKind = null; this.showGun();
      document.querySelector('#superfx .sf-gold')?.classList.add('on');
    } else if (this.cls === 'titan') {
      this.superActive = 'slam'; this.slamArmed = false; this.vel.y = 13; this.onGround = false;
      after(0.35, () => { this.slamArmed = true; if (this.superActive === 'slam') this.vel.y = Math.min(this.vel.y, -20); });
    } else {
      const dir = this.aimDir(0);
      const pos = G.camera.position.clone().addScaledVector(dir, 1.2);
      new Projectile({ pos, vel: dir.multiplyScalar(24), owner: 'player', dmg: 0, splash: 9, splashDmg: 1000, color: 0x9a4dff, look: 'nova', radius: 0.8, life: 4, trail: 0x6a1dff, onHit: (at) => { play('airhorn'); fx.ringFx(at, 10, 0x9a4dff, 0.7); } });
    }
  }
}

function groundYAt(p) { return groundY(p.x, p.z, p.y + 0.5); }
function jitter(dir, spread) {
  const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * spread;
  const right = new THREE.Vector3().crossVectors(dir, _up);
  if (right.lengthSq() < 1e-4) right.set(1, 0, 0); else right.normalize();
  const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
  return dir.clone().addScaledVector(right, Math.cos(a) * m).addScaledVector(upv, Math.sin(a) * m).normalize();
}
