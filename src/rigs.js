// Jointed, procedurally animated enemy models. Every rig faces +Z with its feet at y=0.
// rig.update(dt, { speed, aim, ... }) poses it; rig.play('attack') triggers a one-shot action;
// rig.hit(crit) makes it flinch.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rand, damp } from './game.js';
import { textSprite, IMPACT } from './textures.js';

// ---------------------------------------------------------------- materials
const matCache = new Map();
export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.05, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat });
}
// A soft fresnel rim so enemies read against dark arenas (D2's lighting does this for free; we cheat).
export function rimify(root, color = 0x8fa6ff, strength = 0.35, power = 2.6) {
  root.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (!m.isMeshStandardMaterial || m.userData.rim) continue;
      m.userData.rim = true;
      const c = new THREE.Color(color);
      m.onBeforeCompile = (sh) => {
        sh.uniforms.rimColor = { value: c }; sh.uniforms.rimStrength = { value: strength }; sh.uniforms.rimPower = { value: power };
        sh.fragmentShader = 'uniform vec3 rimColor; uniform float rimStrength; uniform float rimPower;\n' + sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), rimPower);\n  totalEmissiveRadiance += rimColor * rimF * rimStrength;');
      };
      m.customProgramCacheKey = () => `rim${color}_${strength}_${power}`;
    }
  });
  return root;
}

// ---------------------------------------------------------------- geometry helpers
const RB = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
const CAP = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
const SPH = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const CYL = (r, l, s = 14, r2 = r) => new THREE.CylinderGeometry(r, r2, l, s);
const CONE = (r, l, s = 12) => new THREE.ConeGeometry(r, l, s);
function mesh(parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o;
}
const ease = (x) => x * x * (3 - 2 * x);

// ---------------------------------------------------------------- base rig
export class Rig {
  constructor() {
    this.root = new THREE.Group();
    this.j = {}; this.t = rand(0, 10); this.phase = rand(0, 6); this.acts = {};
    this.flinch = 0; this.flinchSide = 1;
  }
  joint(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    (parent || this.root).add(g); this.j[name] = g; return g;
  }
  play(name, dur = 0.4) { this.acts[name] = { t: 0, dur }; }
  // 0..1 progress of an action, or -1 if it isn't running
  act(name) { const a = this.acts[name]; return a ? Math.min(1, a.t / a.dur) : -1; }
  hit(crit) { this.flinch = Math.min(1.2, this.flinch + (crit ? 0.9 : 0.45)); this.flinchSide = Math.random() < 0.5 ? -1 : 1; }
  update(dt, s = {}) {
    this.t += dt;
    for (const k in this.acts) { const a = this.acts[k]; a.t += dt; if (a.t > a.dur) delete this.acts[k]; }
    this.flinch = Math.max(0, this.flinch - dt * 3.5);
    this.pose(dt, s);
  }
  pose() {}
}

// ---------------------------------------------------------------- humanoids (Stonks, Sigma)
export class Humanoid extends Rig {
  constructor({ suit = 0x223a6a, pants = suit, shirt = 0xf2f2f2, tie = 0xc0182a, shoes = 0x161616, skin = 0xe8cdb2, head, handItem, bulk = 1 } = {}) {
    super();
    const mSuit = mat(suit, { rough: 0.55 }), mPants = mat(pants, { rough: 0.6 }), mShirt = mat(shirt, { rough: 0.5 }), mTie = mat(tie, { rough: 0.4 }), mShoe = mat(shoes, { rough: 0.25, metal: 0.2 }), mSkin = mat(skin, { rough: 0.45 });
    this.mSkin = mSkin;
    const hips = this.joint('hips', null, 0, 0.98, 0);
    mesh(hips, RB(0.36 * bulk, 0.18, 0.22, 0.05), mPants, 0, 0, 0);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      const hip = this.joint('hip' + n, hips, s * 0.11, -0.04, 0);
      mesh(hip, CAP(0.085, 0.3), mPants, 0, -0.22, 0);
      const knee = this.joint('knee' + n, hip, 0, -0.44, 0);
      mesh(knee, CAP(0.075, 0.3), mPants, 0, -0.2, 0);
      mesh(knee, RB(0.13, 0.08, 0.27, 0.035), mShoe, 0, -0.44, 0.05);
    }
    const spine = this.joint('spine', hips, 0, 0.04, 0);
    const chest = this.joint('chest', spine, 0, 0.0, 0);
    mesh(chest, RB(0.48 * bulk, 0.58, 0.27, 0.07), mSuit, 0, 0.34, 0);
    mesh(chest, RB(0.15, 0.34, 0.02, 0.008), mShirt, 0, 0.46, 0.136);
    mesh(chest, RB(0.055, 0.34, 0.022, 0.01), mTie, 0, 0.42, 0.148);
    mesh(chest, RB(0.07, 0.05, 0.03, 0.01), mTie, 0, 0.6, 0.148);
    for (const s of [-1, 1]) mesh(chest, RB(0.07, 0.3, 0.02, 0.008), mSuit, s * 0.085, 0.5, 0.145, 0, 0, s * 0.32);
    for (let i = 0; i < 2; i++) mesh(chest, SPH(0.012, 6, 6), mat(0x111111), 0.0, 0.2 + i * 0.1, 0.14);
    const neck = this.joint('neck', chest, 0, 0.66, 0);
    mesh(neck, CYL(0.06, 0.1), mSkin, 0, 0.03, 0);
    const headJ = this.joint('head', neck, 0, 0.1, 0);
    head?.(headJ, this);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      const sh = this.joint('sh' + n, chest, s * 0.3 * bulk, 0.58, 0);
      mesh(sh, SPH(0.085), mSuit, 0, 0, 0);
      mesh(sh, CAP(0.07, 0.22), mSuit, 0, -0.17, 0);
      const el = this.joint('el' + n, sh, 0, -0.34, 0);
      mesh(el, CAP(0.062, 0.2), mSuit, 0, -0.15, 0);
      mesh(el, CYL(0.05, 0.04), mShirt, 0, -0.28, 0);
      const hand = this.joint('hand' + n, el, 0, -0.34, 0);
      mesh(hand, RB(0.075, 0.1, 0.06, 0.025), mSkin, 0, 0, 0);
      if (s > 0) handItem?.(hand, this);
    }
    this.aimK = 0; this.mewK = 0;
  }
  pose(dt, s) {
    const j = this.j, sp = s.speed || 0, k = Math.min(1, sp / 3);
    this.phase += dt * (2 + sp * 2.1);
    const p = this.phase;
    this.aimK = damp(this.aimK, s.aim ? 1 : 0, 10, dt);
    this.mewK = damp(this.mewK, s.mew ? 1 : 0, 8, dt);
    const fl = Math.sin(Math.min(1, this.flinch) * Math.PI * 0.5);
    // legs
    j.hipL.rotation.x = -Math.sin(p) * 0.55 * k; j.hipR.rotation.x = Math.sin(p) * 0.55 * k;
    j.kneeL.rotation.x = Math.max(0, Math.sin(p + 1.4)) * 0.85 * k; j.kneeR.rotation.x = Math.max(0, -Math.sin(p + 1.4)) * 0.85 * k;
    j.hips.position.y = 0.98 + Math.abs(Math.sin(p)) * 0.035 * k + Math.sin(this.t * 1.7) * 0.005;
    j.hips.rotation.y = Math.sin(p) * 0.06 * k;
    // torso: counter-twist, breathe, lean into a run, flinch back
    j.spine.rotation.y = -Math.sin(p) * 0.1 * k;
    j.spine.rotation.x = 0.08 * k - fl * 0.35;
    j.spine.rotation.z = fl * 0.12 * this.flinchSide;
    j.chest.scale.setScalar(1 + Math.sin(this.t * 1.7) * 0.012);
    j.head.rotation.x = -fl * 0.45 - this.mewK * 0.35 + (s.lookDown || 0);
    j.head.rotation.z = Math.sin(this.t * 0.9) * 0.04;
    // arms: swing when walking, right arm aims, mewing = finger to the jawline
    const swing = Math.sin(p) * 0.5 * k;
    j.shL.rotation.set(swing - fl * 0.6, 0, 0.1 + fl * 0.4);
    j.elL.rotation.x = -0.35 - 0.25 * k;
    const fire = this.act('fire');
    const recoil = fire >= 0 ? Math.sin(fire * Math.PI) * 0.35 : 0;
    const aimSh = -1.5 + recoil, aimEl = -0.05 - recoil * 0.5;
    const mewSh = -0.75, mewEl = -2.2;
    const baseSh = -swing - fl * 0.6, baseEl = -0.35 - 0.25 * k;
    const a = this.aimK, m = this.mewK;
    j.shR.rotation.set(baseSh * (1 - a - m) + aimSh * a + mewSh * m, 0.15 * m, -0.1 - fl * 0.4 + 0.25 * m);
    j.elR.rotation.x = baseEl * (1 - a - m) + aimEl * a + mewEl * m;
  }
}

// Meme Man (the Stonks guy): a smooth, slightly-too-glossy bald 3D head.
function memeManHead(h) {
  const skin = mat(0xe9d3bc, { rough: 0.32 });
  const skull = mesh(h, SPH(0.16, 24, 18), skin, 0, 0.15, 0.01); skull.scale.set(0.95, 1.18, 1.05);
  mesh(h, SPH(0.11, 16, 12), skin, 0, 0.06, 0.04).scale.set(1, 0.8, 1);
  for (const s of [-1, 1]) {
    mesh(h, SPH(0.035, 8, 8), skin, s * 0.15, 0.14, 0).scale.set(0.5, 1, 0.8);
    const eye = mesh(h, SPH(0.018, 8, 8), mat(0x1a1a1a, { rough: 0.2 }), s * 0.055, 0.17, 0.145); eye.scale.set(1.2, 0.7, 0.6);
    mesh(h, RB(0.06, 0.012, 0.02, 0.005), skin, s * 0.055, 0.205, 0.15, 0, 0, s * -0.1);
  }
  const nose = mesh(h, CAP(0.022, 0.05), skin, 0, 0.12, 0.17, 0.5); nose.scale.set(1, 1, 1.2);
  mesh(h, RB(0.06, 0.008, 0.01, 0.004), mat(0x6a4a3a), 0.008, 0.065, 0.16, 0, 0, 0.12);
}
// The 🗿, as an actual head.
export function moaiHead(h, s = 1, eyeGlow = null) {
  const stone = mat(0x86827a, { rough: 0.95, flat: true });
  const add = (w, hh, d, x, y, z, m = stone) => mesh(h, RB(w * s, hh * s, d * s, 0.01 * s), m, x * s, y * s, z * s);
  add(0.26, 0.42, 0.22, 0, 0.21, 0);
  add(0.28, 0.06, 0.09, 0, 0.33, 0.09);
  add(0.07, 0.19, 0.09, 0, 0.21, 0.13);
  add(0.16, 0.03, 0.04, 0, 0.09, 0.11);
  add(0.2, 0.09, 0.18, 0, 0.04, 0.03);
  for (const x of [-1, 1]) add(0.03, 0.24, 0.06, x * 0.145, 0.24, 0);
  const em = eyeGlow ? mat(0x220000, { emissive: eyeGlow, ei: 0.6 }) : mat(0x1a1816);
  for (const x of [-1, 1]) add(0.07, 0.035, 0.012, x * 0.065, 0.29, 0.112, em);
  return em;
}
function stonksGun(hand) {
  const g = mat(0x22dd55, { emissive: 0x11aa33, ei: 0.7, rough: 0.3 });
  const gun = new THREE.Group(); gun.position.set(0, -0.04, 0.03); gun.rotation.x = Math.PI; hand.add(gun); // barrel runs along the arm
  mesh(gun, RB(0.05, 0.2, 0.06, 0.015), g, 0, 0.08, 0);
  mesh(gun, CONE(0.06, 0.1, 4), g, 0, 0.22, 0, 0, Math.PI / 4, 0);
}
function sigmaShades(h) {
  const m = mat(0x050505, { metal: 0.9, rough: 0.08 });
  mesh(h, RB(0.3, 0.06, 0.02, 0.01), m, 0, 0.29, 0.128);
  for (const x of [-1, 1]) mesh(h, RB(0.11, 0.07, 0.025, 0.02), m, x * 0.07, 0.28, 0.13);
}

export function stonksRig() {
  const r = new Humanoid({ suit: 0x1d3a78, shirt: 0xf4f4f4, tie: 0x2a6fd6, head: memeManHead, handItem: stonksGun });
  const label = textSprite('STONKS', 0.36, { font: IMPACT, color: '#ffffff', weight: 'normal' });
  label.position.set(0, 2.45, 0); r.root.add(label);
  // the arrow, now a jetpack-ish backpiece because why not
  const green = mat(0x22dd55, { emissive: 0x11aa33, ei: 0.8, rough: 0.3 });
  const arrow = new THREE.Group(); arrow.position.set(-0.15, 0.55, -0.2); arrow.rotation.z = -0.75; r.j.chest.add(arrow);
  mesh(arrow, RB(0.08, 0.75, 0.08, 0.02), green, 0, 0, 0);
  mesh(arrow, CONE(0.16, 0.26, 4), green, 0, 0.48, 0, 0, Math.PI / 4, 0);
  rimify(r.root, 0x9cc8ff, 0.3);
  return r;
}
export function sigmaRig() {
  const r = new Humanoid({ suit: 0x101012, shirt: 0x1c1c1c, tie: 0x050505, skin: 0x9a958c, shoes: 0x050505,
    head: (h) => { moaiHead(h, 1.0); sigmaShades(h); } });
  rimify(r.root, 0xffffff, 0.25);
  return r;
}

// ---------------------------------------------------------------- Doge (shiba quadruped)
export class DogeRig extends Rig {
  constructor() {
    super();
    const tan = mat(0xd99a4e, { rough: 0.85 }), cream = mat(0xf6e6c8, { rough: 0.9 }), dark = mat(0x1a1310, { rough: 0.3 }), white = mat(0xffffff, { rough: 0.3 });
    const body = this.joint('body', null, 0, 0.66, 0);
    mesh(body, CAP(0.27, 0.62), tan, 0, 0, -0.02, Math.PI / 2);
    const chestFluff = mesh(body, SPH(0.24), cream, 0, -0.06, 0.3); chestFluff.scale.set(0.9, 0.95, 0.8);
    mesh(body, CAP(0.17, 0.5), cream, 0, -0.14, 0.0, Math.PI / 2).scale.set(1, 1, 0.6);
    // legs: front pair and back pair, two segments each
    const legPos = { FL: [-0.15, 0.32], FR: [0.15, 0.32], BL: [-0.15, -0.33], BR: [0.15, -0.33] };
    for (const [n, [x, z]] of Object.entries(legPos)) {
      const hip = this.joint('leg' + n, body, x, -0.1, z);
      mesh(hip, CAP(0.07, 0.18), tan, 0, -0.14, 0);
      const knee = this.joint('knee' + n, hip, 0, -0.28, 0);
      mesh(knee, CAP(0.055, 0.14), n[0] === 'F' ? cream : tan, 0, -0.1, 0);
      mesh(knee, SPH(0.065, 10, 8), cream, 0, -0.22, 0.03).scale.set(1, 0.6, 1.3);
    }
    // head: the famous side-eye
    const neck = this.joint('neck', body, 0, 0.18, 0.42);
    mesh(neck, CAP(0.14, 0.12), tan, 0, 0.06, -0.02, -0.5);
    const head = this.joint('head', neck, 0, 0.2, 0.08);
    const skull = mesh(head, SPH(0.22, 20, 16), tan, 0, 0.02, 0); skull.scale.set(1.05, 0.92, 1);
    mesh(head, SPH(0.16, 16, 12), cream, 0, -0.07, 0.1).scale.set(1.15, 0.7, 0.9);
    mesh(head, CAP(0.085, 0.12), tan, 0, -0.01, 0.22, Math.PI / 2).scale.set(1.05, 0.9, 1);
    mesh(head, SPH(0.08, 12, 10), cream, 0, -0.06, 0.25).scale.set(1.2, 0.7, 1);
    mesh(head, SPH(0.035, 10, 8), dark, 0, 0.0, 0.34).scale.set(1.3, 1, 1);
    const jaw = this.joint('jaw', head, 0, -0.1, 0.12);
    mesh(jaw, RB(0.12, 0.04, 0.16, 0.02), cream, 0, -0.01, 0.07);
    mesh(jaw, RB(0.08, 0.02, 0.1, 0.01), mat(0xd04050), 0, 0.012, 0.06);
    for (const s of [-1, 1]) {
      const ear = mesh(head, CONE(0.075, 0.16, 4), tan, s * 0.12, 0.2, -0.03, 0, 0, -s * 0.25);
      mesh(ear, CONE(0.045, 0.1, 4), cream, 0, -0.01, 0.025);
      mesh(head, SPH(0.035, 10, 8), white, s * 0.085, 0.06, 0.17).scale.set(1, 0.75, 0.6);
      // pupils glance sideways: that's the whole meme
      mesh(head, SPH(0.019, 8, 8), dark, s * 0.085 + 0.018, 0.058, 0.19);
      mesh(head, SPH(0.022, 8, 8), cream, s * 0.075, 0.11, 0.16).scale.set(1.3, 0.8, 0.7);
    }
    // curly shiba tail
    const tail = this.joint('tail', body, 0, 0.12, -0.42);
    let t = tail;
    for (let i = 0; i < 4; i++) {
      mesh(t, CAP(0.06 - i * 0.008, 0.08), i === 3 ? cream : tan, 0, 0.06, 0);
      t = this.joint('tail' + i, t, 0, 0.12, 0); t.rotation.x = 0.75;
    }
    rimify(this.root, 0xffd9a0, 0.28);
  }
  pose(dt, s) {
    const j = this.j, sp = s.speed || 0, k = Math.min(1, sp / 4);
    this.phase += dt * (3 + sp * 1.6);
    const p = this.phase;
    const pairs = { FL: 0, BR: 0, FR: Math.PI, BL: Math.PI };
    for (const [n, off] of Object.entries(pairs)) {
      j['leg' + n].rotation.x = Math.sin(p + off) * 0.7 * k;
      j['knee' + n].rotation.x = (n[0] === 'F' ? -1 : 1) * Math.max(0, Math.cos(p + off)) * 0.6 * k;
    }
    j.body.position.y = 0.66 + Math.abs(Math.sin(p)) * 0.05 * k;
    j.body.rotation.x = Math.sin(p * 2) * 0.03 * k;
    const bite = this.act('bite');
    const lunge = bite >= 0 ? Math.sin(bite * Math.PI) : 0;
    const fl = Math.sin(Math.min(1, this.flinch) * Math.PI * 0.5);
    j.neck.rotation.x = -0.1 + lunge * 0.5 - fl * 0.5;
    j.head.rotation.set(Math.sin(p) * 0.05 * k - fl * 0.3, 0, Math.sin(this.t * 1.3) * 0.12 + fl * 0.3 * this.flinchSide);
    j.jaw.rotation.x = lunge * 0.7 + (sp < 1 ? Math.max(0, Math.sin(this.t * 6)) * 0.1 : 0.15); // panting
    j.tail.rotation.z = Math.sin(this.t * (8 + sp)) * 0.45;
  }
}

// ---------------------------------------------------------------- Crewmates (and the snipers)
export class CrewRig extends Rig {
  constructor(color, visor = 0x9fd8ef, { rifle = false } = {}) {
    super();
    const body = mat(color, { rough: 0.45 });
    this.visorMat = mat(visor, { metal: 0.9, rough: 0.06, emissive: visor, ei: 0.12 });
    this.bodyMat = body;
    const torso = this.joint('torso', null, 0, 0.4, 0);
    mesh(torso, CAP(0.42, 0.5), body, 0, 0.55, 0);
    const v = mesh(torso, SPH(0.26, 24, 16), this.visorMat, 0, 0.76, 0.32); v.scale.set(1.25, 0.75, 0.6);
    mesh(torso, SPH(0.06, 8, 8), mat(0xffffff, { emissive: 0xffffff, ei: 0.6 }), 0.12, 0.84, 0.46).scale.set(1.4, 0.6, 0.4);
    mesh(torso, RB(0.5, 0.58, 0.3, 0.12), body, 0, 0.55, -0.43);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      const leg = this.joint('leg' + n, null, s * 0.2, 0.42, 0);
      mesh(leg, CAP(0.16, 0.18), body, 0, -0.2, 0);
    }
    if (rifle) {
      const rm = mat(0x26262c, { metal: 0.7, rough: 0.35 });
      const r = this.joint('rifle', torso, 0.46, 0.6, 0.15);
      mesh(r, RB(0.08, 0.1, 0.9, 0.02), rm, 0, 0, 0.25);
      mesh(r, CYL(0.025, 0.5), rm, 0, 0.02, 0.9, Math.PI / 2);
      mesh(r, CYL(0.04, 0.22), rm, 0, 0.1, 0.2, Math.PI / 2);
      mesh(r, new THREE.CircleGeometry(0.035, 12), mat(0xff2020, { emissive: 0xff2020, ei: 2 }), 0, 0.1, 0.311);
    }
    rimify(this.root, 0xffffff, 0.22);
  }
  pose(dt, s) {
    const j = this.j, sp = s.speed || 0, k = Math.min(1, sp / 2);
    this.phase += dt * (3 + sp * 3);
    const p = this.phase;
    // the iconic waddle
    j.legL.rotation.x = Math.sin(p) * 0.7 * k; j.legR.rotation.x = -Math.sin(p) * 0.7 * k;
    const fl = Math.sin(Math.min(1, this.flinch) * Math.PI * 0.5);
    j.torso.rotation.z = Math.sin(p) * 0.09 * k + fl * 0.2 * this.flinchSide;
    j.torso.rotation.x = -fl * 0.3 + (s.task ? Math.sin(this.t * 6) * 0.05 : 0);
    j.torso.position.y = 0.4 + Math.abs(Math.cos(p)) * 0.05 * k + (s.idleBob ? Math.sin(this.t * 2) * 0.01 : 0);
    if (j.rifle) { const aim = s.aim ? 1 : 0; j.rifle.rotation.x = damp(j.rifle.rotation.x, aim ? 0 : 0.5, 8, dt); }
  }
}

// ---------------------------------------------------------------- Moai Knight (walking, angry Easter Island)
export class MoaiKnightRig extends Rig {
  constructor() {
    super();
    const stone = mat(0x7d7a73, { rough: 0.95, flat: true }), dark = mat(0x4e4b46, { rough: 1, flat: true });
    const hips = this.joint('hips', null, 0, 0.8, 0);
    mesh(hips, RB(0.9, 0.35, 0.6, 0.06), dark, 0, 0, 0);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      const leg = this.joint('leg' + n, hips, s * 0.27, -0.12, 0);
      mesh(leg, RB(0.3, 0.42, 0.34, 0.05), stone, 0, -0.2, 0);
      const knee = this.joint('knee' + n, leg, 0, -0.4, 0);
      mesh(knee, RB(0.26, 0.32, 0.3, 0.05), stone, 0, -0.14, 0);
      mesh(knee, RB(0.34, 0.12, 0.46, 0.04), dark, 0, -0.3, 0.06);
    }
    const chest = this.joint('chest', hips, 0, 0.15, 0);
    mesh(chest, RB(1.05, 0.8, 0.7, 0.08), stone, 0, 0.4, 0);
    for (const s of [-1, 1]) mesh(chest, RB(0.42, 0.22, 0.6, 0.06), dark, s * 0.62, 0.78, 0, 0, 0, -s * 0.3);
    const head = this.joint('head', chest, 0, 0.8, 0.02);
    this.eyeMat = moaiHead(head, 3.4, 0xff2200);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      const sh = this.joint('sh' + n, chest, s * 0.66, 0.62, 0);
      mesh(sh, RB(0.26, 0.5, 0.28, 0.05), stone, 0, -0.25, 0);
      const el = this.joint('el' + n, sh, 0, -0.5, 0);
      mesh(el, RB(0.24, 0.45, 0.26, 0.05), stone, 0, -0.2, 0);
      mesh(el, RB(0.32, 0.28, 0.32, 0.06), dark, 0, -0.5, 0.02);
    }
    rimify(this.root, 0xffb090, 0.22);
  }
  pose(dt, s) {
    const j = this.j, sp = s.speed || 0, k = Math.min(1, sp / 2);
    this.phase += dt * (1.5 + sp * 1.4);
    const p = this.phase;
    j.legL.rotation.x = -Math.sin(p) * 0.4 * k; j.legR.rotation.x = Math.sin(p) * 0.4 * k;
    j.kneeL.rotation.x = Math.max(0, Math.sin(p + 1.3)) * 0.5 * k; j.kneeR.rotation.x = Math.max(0, -Math.sin(p + 1.3)) * 0.5 * k;
    j.hips.position.y = 0.8 + Math.abs(Math.sin(p)) * 0.06 * k;
    j.chest.rotation.z = Math.sin(p) * 0.06 * k;
    const w = s.windup || 0; // 0..1 as it charges the boulder
    const fl = Math.sin(Math.min(1, this.flinch) * Math.PI * 0.5);
    const slam = this.act('slam'); const sl = slam >= 0 ? Math.sin(slam * Math.PI) : 0;
    j.chest.rotation.x = -w * 0.35 + sl * 0.4 - fl * 0.15;
    j.head.rotation.x = -w * 0.2 + sl * 0.15;
    for (const n of ['L', 'R']) {
      j['sh' + n].rotation.x = Math.sin(p + (n === 'L' ? 0 : Math.PI)) * 0.4 * k - w * 2.6 + sl * 1.2;
      j['el' + n].rotation.x = -0.3 - w * 0.6;
    }
    this.eyeMat.emissiveIntensity = 0.6 + w * 6 + sl * 3;
  }
}

// ---------------------------------------------------------------- Wizard (came from the moon)
export class WizardRig extends Rig {
  constructor() {
    super();
    const robe = mat(0x3d2275, { rough: 0.8, emissive: 0x14082a }), trim = mat(0xffd23f, { metal: 0.8, rough: 0.3 });
    const skin = mat(0xe8c4a8, { rough: 0.6 }), beard = mat(0xf2f2f2, { rough: 1 });
    const glow = mat(0xc68bff, { emissive: 0xb070ff, ei: 3 });
    const body = this.joint('body', null, 0, 0, 0);
    this.robes = [];
    for (let i = 0; i < 3; i++) {
      const seg = this.joint('robe' + i, body, 0, 1.6 - i * 0.55, 0);
      mesh(seg, CYL(0.25 + i * 0.12, 0.62, 14, 0.35 + i * 0.14), robe, 0, -0.3, 0);
      if (i === 2) mesh(seg, CYL(0.62, 0.05, 14), trim, 0, -0.6, 0);
      this.robes.push(seg);
    }
    const head = this.joint('head', body, 0, 1.85, 0);
    mesh(head, SPH(0.17, 16, 12), skin, 0, 0, 0);
    mesh(head, CONE(0.16, 0.5, 12), beard, 0, -0.3, 0.1, Math.PI);
    for (const s of [-1, 1]) mesh(head, SPH(0.022, 8, 8), mat(0x6080ff, { emissive: 0x4060ff, ei: 1.5 }), s * 0.06, 0.03, 0.15);
    const hat = this.joint('hat', head, 0, 0.1, 0);
    mesh(hat, CYL(0.34, 0.04, 18), robe, 0, 0.0, 0);
    mesh(hat, CONE(0.2, 0.6, 14), robe, 0, 0.3, 0);
    for (let i = 0; i < 4; i++) mesh(hat, SPH(0.025, 6, 6), trim, Math.cos(i * 1.7) * 0.12, 0.15 + i * 0.08, Math.sin(i * 1.7) * 0.12);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      const sh = this.joint('sh' + n, body, s * 0.32, 1.5, 0);
      mesh(sh, CONE(0.13, 0.6, 10), robe, 0, -0.3, 0, Math.PI);
      const hand = this.joint('hand' + n, sh, 0, -0.62, 0);
      mesh(hand, SPH(0.06, 10, 8), skin, 0, 0, 0);
      const orb = mesh(hand, SPH(0.08, 12, 10), glow, 0, -0.1, 0.05);
      this['orb' + n] = orb;
    }
    // staff
    const staff = this.joint('staff', this.j.handR, 0, 0, 0.02);
    mesh(staff, CYL(0.025, 1.6, 8), mat(0x5a3a1a, { rough: 0.9 }), 0, 0.2, 0);
    mesh(staff, SPH(0.1, 12, 10), glow, 0, 1.05, 0);
    rimify(this.root, 0xc68bff, 0.4);
  }
  pose(dt, s) {
    const j = this.j;
    const cast = this.act('cast'); const c = cast >= 0 ? Math.sin(cast * Math.PI) : 0;
    j.body.position.y = Math.sin(this.t * 2) * 0.12;
    this.robes.forEach((r, i) => { r.rotation.z = Math.sin(this.t * 2.2 - i * 0.7) * 0.06 * (i + 1); r.rotation.x = Math.sin(this.t * 1.7 - i * 0.6) * 0.05 * (i + 1); });
    j.shL.rotation.set(-0.3 - c * 2.4, 0, 0.3 + c * 0.4);
    j.shR.rotation.set(-0.2 - c * 1.8, 0, -0.25 - c * 0.3);
    j.head.rotation.x = -c * 0.25 + Math.sin(this.t) * 0.05;
    j.hat.rotation.z = Math.sin(this.t * 1.3) * 0.08;
    const pulse = 2 + Math.sin(this.t * 6) * 0.8 + c * 5;
    this.orbL.material.emissiveIntensity = pulse;
  }
}

// ---------------------------------------------------------------- Nyan (pop-tart cat with legs and a face)
export class NyanRig extends Rig {
  constructor() {
    super();
    const crust = mat(0xe8c9a0, { rough: 0.8 }), pink = mat(0xff8fd6, { rough: 0.5, emissive: 0xff4fb0, ei: 0.35 });
    const gray = mat(0x9a9a9a, { rough: 0.8 }), black = mat(0x111111), blush = mat(0xff8fb0, { emissive: 0xff6090, ei: 0.4 });
    const body = this.joint('body', null, 0, 0.5, 0);
    mesh(body, RB(0.25, 0.9, 1.2, 0.08), crust, 0, 0, 0);
    mesh(body, RB(0.27, 0.72, 1.0, 0.1), pink, 0, 0, 0);
    const sprCol = [0xff2277, 0x22aaff, 0xffee22];
    for (let i = 0; i < 9; i++) mesh(body, RB(0.29, 0.05, 0.05, 0.02), mat(sprCol[i % 3]), 0, rand(-0.3, 0.3), rand(-0.42, 0.42), 0, 0, 0).rotation.x = rand(0, 3);
    const head = this.joint('head', body, 0, -0.08, 0.72);
    mesh(head, RB(0.34, 0.46, 0.56, 0.12), gray, 0, 0, 0);
    for (const s of [-1, 1]) {
      mesh(head, CONE(0.08, 0.16, 4), gray, s * 0.11, 0.28, -0.05);
      mesh(head, RB(0.06, 0.07, 0.02, 0.02), black, s * 0.08, 0.06, 0.285);
      mesh(head, SPH(0.035, 8, 8), blush, s * 0.13, -0.06, 0.28).scale.set(1, 0.7, 0.3);
    }
    mesh(head, RB(0.12, 0.025, 0.02, 0.01), black, 0, -0.1, 0.285);
    for (const n of ['FL', 'FR', 'BL', 'BR']) {
      const leg = this.joint('leg' + n, body, n[1] === 'L' ? -0.08 : 0.08, -0.45, n[0] === 'F' ? 0.4 : -0.4);
      mesh(leg, CAP(0.06, 0.1), gray, 0, -0.08, 0);
    }
    const tail = this.joint('tail', body, 0, 0.0, -0.65);
    mesh(tail, CAP(0.05, 0.2), gray, 0, 0, -0.1, Math.PI / 2);
    // rainbow trail: segmented so it ripples
    this.trail = [];
    const cols = [0xff0000, 0xff9900, 0xffff00, 0x33ff00, 0x0099ff, 0x6633ff];
    cols.forEach((c, i) => {
      const m = new THREE.MeshBasicMaterial({ color: c });
      for (let k = 0; k < 8; k++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.4), m);
        seg.position.set(0, 0.33 - i * 0.13, -0.85 - k * 0.38);
        body.add(seg); this.trail.push({ seg, k, i });
      }
    });
    rimify(this.root, 0xffffff, 0.3);
  }
  pose(dt) {
    const j = this.j;
    j.body.position.y = 0.5 + Math.sin(this.t * 7) * 0.08;
    for (const n of ['FL', 'FR', 'BL', 'BR']) j['leg' + n].rotation.x = Math.sin(this.t * 14 + (n === 'FL' || n === 'BR' ? 0 : Math.PI)) * 0.7;
    j.head.rotation.x = Math.sin(this.t * 7 + 1) * 0.08;
    j.tail.rotation.x = Math.sin(this.t * 10) * 0.5;
    for (const { seg, k, i } of this.trail) seg.position.y = 0.33 - i * 0.13 + (Math.floor(this.t * 8 + k) % 2 ? 0.05 : -0.05);
  }
}
