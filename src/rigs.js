// Jointed, procedurally animated enemy models. Every rig faces +Z with its feet at y=0.
// rig.update(dt, { speed, aim, ... }) poses it; rig.play('attack') triggers a one-shot action;
// rig.hit(crit, side) makes it flinch (side: -1 hit on its left, +1 on its right, or random).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rand, damp } from './game.js';
import { textSprite, IMPACT } from './textures.js';
import { addCharacterDetail, addFur } from './surface.js';

// ---------------------------------------------------------------- materials
const matCache = new Map();
export function mat(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.05, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat });
  // surface detail rides along with the model; rough flat-shaded stuff is stone
  if (o.detail !== false) addCharacterDetail(m, { stone: !!o.flat && (o.rough ?? 0.6) > 0.9 });
  return m;
}
// A soft fresnel rim so enemies read against dark arenas (D2's lighting does this for free; we cheat).
export function rimify(root, color = 0x8fa6ff, strength = 0.35, power = 2.6) {
  root.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (!m.isMeshStandardMaterial || m.userData.rim) continue;
      m.userData.rim = true;
      const c = new THREE.Color(color);
      // stack on top of any detail shader the material already has
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
      m.onBeforeCompile = (sh, r) => {
        prev.call(m, sh, r);
        sh.uniforms.rimColor = { value: c }; sh.uniforms.rimStrength = { value: strength }; sh.uniforms.rimPower = { value: power };
        sh.fragmentShader = 'uniform vec3 rimColor; uniform float rimStrength; uniform float rimPower;\n' + sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), rimPower);\n  totalEmissiveRadiance += rimColor * rimF * rimStrength;');
      };
      m.customProgramCacheKey = () => `${prevKey}|rim${color}_${strength}_${power}`;
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
  hit(crit, side) { this.flinch = Math.min(1.2, this.flinch + (crit ? 0.9 : 0.45)); this.flinchSide = side || (Math.random() < 0.5 ? -1 : 1); this.flinchCrit = crit ? 1 : Math.max(0, (this.flinchCrit || 0) - 0.5); }
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
    const cr = s.crouch || 0; // ducking behind cover
    const fl = Math.sin(Math.min(1, this.flinch) * Math.PI * 0.5);
    // legs
    j.hipL.rotation.x = -Math.sin(p) * 0.55 * k * (1 - cr) - cr * 1.25; j.hipR.rotation.x = Math.sin(p) * 0.55 * k * (1 - cr) - cr * 1.0;
    j.kneeL.rotation.x = Math.max(0, Math.sin(p + 1.4)) * 0.85 * k * (1 - cr) + cr * 2.1; j.kneeR.rotation.x = Math.max(0, -Math.sin(p + 1.4)) * 0.85 * k * (1 - cr) + cr * 1.8;
    j.hips.position.y = 0.98 - cr * 0.48 + Math.abs(Math.sin(p)) * 0.035 * k + Math.sin(this.t * 1.7) * 0.005;
    j.hips.rotation.y = Math.sin(p) * 0.06 * k;
    // torso: counter-twist, breathe, lean into a run, flinch back
    j.spine.rotation.y = -Math.sin(p) * 0.1 * k;
    j.spine.rotation.x = 0.08 * k - fl * 0.35 + cr * 0.35;
    j.spine.rotation.z = fl * 0.12 * this.flinchSide;
    j.spine.rotation.y += fl * 0.28 * this.flinchSide;
    j.chest.scale.setScalar(1 + Math.sin(this.t * 1.7) * 0.012);
    j.head.rotation.x = -fl * (0.45 + (this.flinchCrit || 0) * 0.55) - this.mewK * 0.35 + (s.lookDown || 0);
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
// The 🗿, as an actual head: one subdivided block, sculpted. A heavy brow, deep sockets, the long nose that
// widens toward the bottom, pursed lips, a jutting chin, long carved ears.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (x, c, w) => Math.max(0, 1 - ((x - c) / w) ** 2);
let moaiGeo = null;
function sculptMoai() {
  if (moaiGeo) return moaiGeo;
  const W = 0.27, H = 0.46, D = 0.24;
  const g = new THREE.BoxGeometry(W, H, D, 14, 22, 10);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const yn = (y + H / 2) / H; // 0 chin .. 1 crown
    // a long, slightly tapered block: narrower at the chin and the crown
    const taper = 1 - 0.18 * (yn - 0.5) ** 2 * 4 - 0.08 * (1 - yn);
    x *= taper;
    if (yn > 0.9) z *= 1 - (yn - 0.9) * 1.5; // the crown slopes back
    if (z > D * 0.3) {
      const cx = Math.abs(x) / (W / 2);
      let dz = 0;
      dz += 0.045 * bump(yn, 0.71, 0.06);                                           // brow ridge
      dz -= 0.03 * bump(yn, 0.6, 0.06) * smooth(0.15, 0.3, cx) * (1 - smooth(0.75, 0.9, cx)); // eye sockets
      const noseW = 0.18 + (0.7 - yn) * 0.25;                                      // widens downward
      if (yn > 0.3 && yn < 0.72) dz += 0.075 * (1 - smooth(noseW * 0.6, noseW, cx)) * smooth(0.72, 0.6, yn) * (0.6 + (0.72 - yn));
      dz += 0.025 * bump(yn, 0.2, 0.05) * (1 - cx);                                 // pursed lips
      dz -= 0.012 * bump(yn, 0.25, 0.015) * (1 - cx);                               // the mouth line
      dz += 0.03 * smooth(0.12, 0.0, yn) * (1 - cx * 0.6);                          // chin
      z += dz * smooth(D * 0.3, D * 0.5, z);
    }
    pa.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return (moaiGeo = g);
}
export function moaiHead(h, s = 1, eyeGlow = null) {
  const stone = mat(0x86827a, { rough: 0.95, flat: true });
  const head = mesh(h, sculptMoai(), stone, 0, 0.23 * s, 0); head.scale.setScalar(s);
  for (const x of [-1, 1]) mesh(h, RB(0.035 * s, 0.25 * s, 0.07 * s, 0.012 * s), stone, x * 0.142 * s, 0.25 * s, -0.01 * s); // ears
  const em = eyeGlow ? mat(0x220000, { emissive: eyeGlow, ei: 0.6 }) : mat(0x1a1816);
  // the eyes sit in the sockets
  for (const x of [-1, 1]) mesh(h, RB(0.06 * s, 0.03 * s, 0.01 * s, 0.006 * s), em, x * 0.06 * s, 0.276 * s, 0.108 * s);
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
  mesh(h, RB(0.3, 0.05, 0.02, 0.01), m, 0, 0.3, 0.17);
  for (const x of [-1, 1]) mesh(h, RB(0.11, 0.07, 0.025, 0.02), m, x * 0.07, 0.28, 0.17);
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
// The Sigma: broad shoulders, a long open overcoat whose tails swing, a slicked-back pompadour, gold chain + watch.
// The smug troll: a pale, too-wide head with a face drawn on (squinting eyes, an enormous toothy grin, wrinkles).
let smugTex = null;
function smugFace() {
  if (smugTex) return smugTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.strokeStyle = '#111'; x.lineCap = 'round'; x.lineJoin = 'round';
  // squinting, scheming eyes + brows
  x.lineWidth = 7;
  for (const s of [-1, 1]) {
    x.beginPath(); x.ellipse(128 + s * 52, 92, 30, 13, s * -0.2, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
    x.beginPath(); x.moveTo(128 + s * 22, 68); x.quadraticCurveTo(128 + s * 52, 50, 128 + s * 84, 66); x.stroke();
    x.fillStyle = '#111'; x.beginPath(); x.arc(128 + s * 46, 92, 6, 0, Math.PI * 2); x.fill();
  }
  // the grin: a huge crescent full of teeth
  x.fillStyle = '#fff'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(36, 128); x.quadraticCurveTo(128, 250, 220, 128); x.quadraticCurveTo(128, 175, 36, 128); x.closePath(); x.fill(); x.stroke();
  x.lineWidth = 3;
  for (let i = 1; i < 10; i++) { const t = i / 10, px = 36 + t * 184; const yTop = 128 + Math.sin(t * Math.PI) * 47, yBot = 128 + Math.sin(t * Math.PI) * 120 * 0.5 + Math.sin(t * Math.PI) * 10; x.beginPath(); x.moveTo(px, yTop); x.lineTo(px, yBot + 8); x.stroke(); }
  x.beginPath(); x.moveTo(50, 140); x.quadraticCurveTo(128, 205, 206, 140); x.stroke();
  // cheek + chin wrinkles
  x.lineWidth = 4;
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(128 + s * 104, 110); x.quadraticCurveTo(128 + s * 118, 135, 128 + s * 102, 160); x.stroke(); }
  x.beginPath(); x.moveTo(100, 226); x.quadraticCurveTo(128, 236, 156, 226); x.stroke();
  smugTex = new THREE.CanvasTexture(c); smugTex.colorSpace = THREE.SRGBColorSpace;
  return smugTex;
}
export function trollRig() {
  const r = new Humanoid({ suit: 0xc9c9cc, pants: 0x8a8a92, shirt: 0xf4f4f4, tie: 0x111111, skin: 0xf2f2ee, shoes: 0x222222,
    head: (h) => {
      const skin = mat(0xf4f4f0, { rough: 0.5 });
      const skull = mesh(h, SPH(0.2, 24, 18), skin, 0, 0.17, 0.02); skull.scale.set(1.35, 1.12, 1.05);
      mesh(h, SPH(0.12, 16, 12), skin, 0, 0.04, 0.06).scale.set(1.3, 0.8, 1); // jaw
      const face = mesh(h, new THREE.SphereGeometry(0.212, 32, 20, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.22, Math.PI * 0.62),
        new THREE.MeshStandardMaterial({ map: smugFace(), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.15, 0.03);
      face.scale.set(1.36, 1.14, 1.08); face.castShadow = false;
      for (const s of [-1, 1]) mesh(h, SPH(0.05, 10, 8), skin, s * 0.27, 0.15, 0).scale.set(0.5, 1, 0.8); // ears
    } });
  rimify(r.root, 0xd0e8ff, 0.3);
  return r;
}

// The Distracted Boyfriend: plaid shirt, jeans, side-parted hair, and a head that's always turned.
let plaidTex = null;
function plaid() {
  if (plaidTex) return plaidTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#3d63a8'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(20,30,70,.55)'; for (let i = 0; i < 64; i += 16) { x.fillRect(i, 0, 6, 64); x.fillRect(0, i, 64, 6); }
  x.fillStyle = 'rgba(230,235,255,.5)'; for (let i = 8; i < 64; i += 16) { x.fillRect(i, 0, 2, 64); x.fillRect(0, i, 64, 2); }
  plaidTex = new THREE.CanvasTexture(c); plaidTex.colorSpace = THREE.SRGBColorSpace; plaidTex.wrapS = plaidTex.wrapT = THREE.RepeatWrapping; plaidTex.repeat.set(3, 3);
  return plaidTex;
}
export function boyfriendRig() {
  const r = new Humanoid({ suit: 0xffffff, pants: 0x34507e, shirt: 0xf4f4f4, tie: 0xffffff, skin: 0xe2b896, shoes: 0x3a2a20,
    head: (h) => {
      const skin = mat(0xe2b896, { rough: 0.5 }), hair = mat(0x2a1a10, { rough: 0.85 });
      const skull = mesh(h, SPH(0.15, 22, 16), skin, 0, 0.15, 0.01); skull.scale.set(0.95, 1.12, 1.02);
      const hairCap = mesh(h, new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), hair, 0, 0.18, -0.01); hairCap.scale.set(1, 1.05, 1.08);
      mesh(h, RB(0.17, 0.05, 0.1, 0.02), hair, 0.03, 0.29, 0.08, 0, 0, -0.15); // the side part
      for (const s of [-1, 1]) {
        mesh(h, SPH(0.022, 10, 8), mat(0x241810, { rough: 0.3 }), s * 0.055, 0.17, 0.135);
        mesh(h, RB(0.05, 0.012, 0.015, 0.005), hair, s * 0.055, 0.21, 0.14, 0, 0, s * -0.25); // raised brows: interested
        mesh(h, SPH(0.035, 8, 8), skin, s * 0.15, 0.15, 0).scale.set(0.5, 1, 0.8);
      }
      mesh(h, CAP(0.02, 0.04), skin, 0, 0.12, 0.155, 0.4);
      const mouth = mesh(h, RB(0.05, 0.012, 0.012, 0.005), mat(0x7a3a30), 0, 0.07, 0.14); mouth.rotation.z = 0.15; // a little "ooh"
    } });
  // swap the suit for a plaid shirt
  const shirt = mat(0xffffff, { rough: 0.85 }); shirt.map = plaid();
  r.root.traverse((o) => { if (o.material && o.material.color?.getHex() === 0xffffff && !o.material.map && o.material !== shirt) o.material = shirt; });
  rimify(r.root, 0xffc0d0, 0.25);
  return r;
}

export function sigmaRig() {
  const gold = mat(0xd9b04a, { metal: 0.95, rough: 0.22 });
  const r = new Humanoid({ suit: 0x101012, shirt: 0x1c1c1c, tie: 0x050505, skin: 0x9a958c, shoes: 0x050505, bulk: 1.15,
    head: (h) => {
      moaiHead(h, 1.0); sigmaShades(h);
      const hair = mat(0x0b0b0d, { rough: 0.15, metal: 0.3 });
      const pomp = mesh(h, CAP(0.1, 0.16), hair, 0, 0.44, 0.0, Math.PI / 2 - 0.25); pomp.scale.set(1.35, 1, 0.7);
      mesh(h, RB(0.27, 0.06, 0.2, 0.025), hair, 0, 0.42, -0.04);
    } });
  // the overcoat: open at the front, hangs from the chest, tails sway below the waist
  r.uTime = { value: 0 };
  const coatM = swayCloth(mat(0x34343c, { rough: 0.5, metal: 0.1 }), r.uTime, 0.0, 0.8, 0.05);
  coatM.side = THREE.DoubleSide;
  const prof = [[0.36, -0.78], [0.31, -0.4], [0.27, 0.0], [0.29, 0.3], [0.32, 0.6], [0.2, 0.68]].map(([x, y]) => new THREE.Vector2(x, y));
  const coat = mesh(r.j.chest, new THREE.LatheGeometry(prof, 40, 0.55, Math.PI * 2 - 1.1), coatM, 0, 0, -0.01);
  coat.scale.set(1.05, 1, 0.72);
  // collar points
  for (const sx of [-1, 1]) mesh(r.j.chest, RB(0.1, 0.18, 0.03, 0.01), mat(0x18181c, { rough: 0.7 }), sx * 0.12, 0.62, 0.17, -0.3, 0, sx * 0.4);
  // drip
  const chain = mesh(r.j.chest, new THREE.TorusGeometry(0.12, 0.011, 6, 28), gold, 0, 0.5, 0.12); chain.rotation.x = 1.25;
  mesh(r.j.chest, RB(0.05, 0.06, 0.015, 0.006), gold, 0, 0.39, 0.165);
  mesh(r.j.elL, new THREE.TorusGeometry(0.055, 0.014, 6, 16), gold, 0, -0.27, 0).rotation.x = Math.PI / 2;
  const pose = r.pose.bind(r);
  r.pose = (dt, st) => { r.uTime.value = r.t; pose(dt, st); };
  rimify(r.root, 0xffffff, 0.25);
  return r;
}

// ---------------------------------------------------------------- Doge (shiba quadruped)
export class DogeRig extends Rig {
  constructor() {
    super();
    const tan = mat(0xd99a4e, { rough: 0.85 }), cream = mat(0xf6e6c8, { rough: 0.9 }), dark = mat(0x1a1310, { rough: 0.3 }), white = mat(0xffffff, { rough: 0.3 });
    const body = this.joint('body', null, 0, 0.66, 0);
    addFur(mesh(body, CAP(0.27, 0.62), tan, 0, 0, -0.02, Math.PI / 2), { shells: 4, len: 0.03, density: 130 });
    const chestFluff = addFur(mesh(body, SPH(0.24), cream, 0, -0.06, 0.3), { shells: 4, len: 0.04, density: 120 }); chestFluff.scale.set(0.9, 0.95, 0.8);
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
    const skull = addFur(mesh(head, SPH(0.22, 20, 16), tan, 0, 0.02, 0), { shells: 4, len: 0.02, density: 150 }); skull.scale.set(1.05, 0.92, 1);
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
      // a rune band glowing in each forearm
      mesh(el, RB(0.27, 0.04, 0.29, 0.01), this.runeMat ||= mat(0x111111, { emissive: 0x5fd8ff, ei: 1.6, detail: false }), 0, -0.3, 0.0);
    }
    // carved runes on the chest, moss on the shoulders and head
    const rune = this.runeMat;
    for (const [x, y, w, h, r] of [[0, 0.45, 0.05, 0.42, 0], [-0.14, 0.52, 0.22, 0.04, 0.6], [0.14, 0.52, 0.22, 0.04, -0.6], [0, 0.26, 0.3, 0.04, 0], [-0.09, 0.62, 0.04, 0.16, 0], [0.09, 0.62, 0.04, 0.16, 0]]) {
      const g = mesh(this.j.chest, RB(w, h, 0.02, 0.008), rune, x, y, 0.36); g.rotation.z = r; g.castShadow = false;
    }
    const moss = mat(0x4d6a2a, { rough: 1 });
    for (const [p, x, y, z, sx] of [[this.j.chest, -0.6, 0.9, 0, 0.32], [this.j.chest, 0.62, 0.9, 0.05, 0.28], [this.j.chest, 0.2, 0.8, 0.3, 0.2], [this.j.head, 0, 1.45, 0, 0.42]]) {
      const m = mesh(p, SPH(1, 10, 6), moss, x, y, z); m.scale.set(sx, sx * 0.25, sx * 0.85);
    }
    // the boulder it hoists overhead while winding up a throw
    this.boulder = mesh(this.j.chest, new THREE.DodecahedronGeometry(0.42, 1), mat(0x6e6a62, { rough: 1, flat: true }), 0, 2.75, 0.15);
    this.boulder.scale.setScalar(0.001);
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
    this.runeMat.emissiveIntensity = 1.2 + w * 3 + Math.sin(this.t * 2) * 0.3;
    this.boulder.scale.setScalar(Math.max(0.001, w * 1.0));
    this.boulder.rotation.y += dt * 2;
  }
}

// ---------------------------------------------------------------- Wizard (came from the moon)
// Cloth sway in the vertex shader: the further down the robe, the more it swings (y measured from the shoulders).
function swayCloth(m, uTime, top = 1.62, len = 1.6, amp = 0.07) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uClothT = uTime;
    sh.vertexShader = 'uniform float uClothT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float k = clamp((${top.toFixed(2)} - transformed.y) / ${len.toFixed(2)}, 0.0, 1.0); k *= k;
        transformed.x += (sin(uClothT * 2.2 + transformed.y * 2.5) * 0.7 + sin(uClothT * 3.7 + transformed.z * 4.0) * 0.3) * ${amp.toFixed(3)} * k;
        transformed.z += (sin(uClothT * 1.7 + transformed.y * 2.0 + 1.3) * 0.7 + sin(uClothT * 3.1 + transformed.x * 4.0) * 0.3) * ${amp.toFixed(3)} * k; }`);
  };
  m.customProgramCacheKey = () => `${prevKey}|sway${top}_${len}_${amp}`;
  return m;
}
// Lathe a profile given bottom-to-top as [radius, y] pairs.
const LATHE = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function starGeo(r = 0.05, depth = 0.01) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * 0.45 : r; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: r * 0.08, bevelSegments: 1 });
}

export class WizardRig extends Rig {
  constructor() {
    super();
    this.uTime = { value: 0 };
    const robe = swayCloth(mat(0x3d2275, { rough: 0.85, emissive: 0x14082a }), this.uTime);
    robe.side = THREE.DoubleSide;
    const trimSway = swayCloth(mat(0xffd23f, { metal: 0.85, rough: 0.28 }), this.uTime);
    const trim = mat(0xffd23f, { metal: 0.85, rough: 0.28 });
    const sleeveM = mat(0x3d2275, { rough: 0.85, emissive: 0x14082a }); sleeveM.side = THREE.DoubleSide;
    const skin = mat(0xe8c4a8, { rough: 0.55 }), beard = mat(0xf0f0f0, { rough: 0.95 });
    const glow = mat(0xc68bff, { emissive: 0xb070ff, ei: 3, detail: false });
    const wood = mat(0x4a2e16, { rough: 0.9 });
    const body = this.joint('body', null, 0, 0, 0);

    // robe: one lathed shell from a flared, wavy hem up to narrow shoulders; folds deepen toward the floor
    const R = (t) => 0.21 + 0.09 * Math.sin(Math.min(1, t * 3) * Math.PI / 2) + Math.pow(t, 1.6) * 0.46; // t: 0 shoulders .. 1 hem
    const prof = [];
    for (let i = 16; i >= 0; i--) { const t = i / 16; prof.push([R(t), 1.62 - t * 1.6]); }
    prof.push([0.14, 1.66]);
    const robeGeo = LATHE(prof, 56);
    const pa = robeGeo.attributes.position;
    const fold = (a, t) => 1 + (Math.sin(a * 9) * 0.05 + Math.sin(a * 5 + 1.3) * 0.03) * t;
    const hemWave = (a) => Math.sin(a * 7) * 0.035 + Math.sin(a * 3 + 2) * 0.02;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), a = Math.atan2(z, x), t = Math.max(0, (1.62 - y) / 1.6), f = fold(a, t);
      pa.setXYZ(i, x * f, t > 0.97 ? y + hemWave(a) : y, z * f);
    }
    robeGeo.computeVertexNormals();
    mesh(body, robeGeo, robe);
    // gold trim that follows the wavy hem (sways with the robe), a belt, a collar
    const hemPts = [];
    for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2, r = R(1) * fold(a, 1) * 1.01; hemPts.push(new THREE.Vector3(Math.cos(a) * r, 0.02 + hemWave(a), Math.sin(a) * r)); }
    mesh(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hemPts, true), 128, 0.024, 6, true), trimSway);
    const beltT = (1.62 - 1.02) / 1.6;
    mesh(body, new THREE.TorusGeometry(R(beltT) * 1.04, 0.03, 8, 40), trim, 0, 1.02, 0, Math.PI / 2);
    mesh(body, starGeo(0.07, 0.02), trim, 0, 1.02, R(beltT) * 1.06);
    mesh(body, new THREE.TorusGeometry(0.2, 0.035, 8, 32), trim, 0, 1.6, 0, Math.PI / 2);
    // a few stars embroidered on the robe
    for (const [a, t] of [[0.4, 0.55], [-0.6, 0.72], [2.6, 0.62], [3.6, 0.8], [1.2, 0.85]]) {
      const r = R(t) * fold(a, t) + 0.004, y = 1.62 - t * 1.6;
      const st = mesh(body, starGeo(0.045, 0.006), trimSway, Math.sin(a) * r, y, Math.cos(a) * r);
      st.rotation.y = a;
    }

    // head: face, bushy brows, glowing eyes, a long wavy beard and a mustache
    const head = this.joint('head', body, 0, 1.84, 0.02);
    mesh(head, SPH(0.15, 24, 18), skin, 0, 0, 0).scale.set(0.95, 1.08, 1);
    const nose = mesh(head, CAP(0.03, 0.06), skin, 0, -0.01, 0.15, 0.35); nose.scale.set(1, 1, 1.15);
    for (const s of [-1, 1]) {
      mesh(head, SPH(0.022, 10, 8), mat(0x6080ff, { emissive: 0x4060ff, ei: 1.8, detail: false }), s * 0.055, 0.035, 0.13);
      const brow = mesh(head, SPH(0.05, 10, 8), beard, s * 0.062, 0.085, 0.12, 0, 0, s * 0.35); brow.scale.set(1.3, 0.45, 0.6);
      const mus = mesh(head, CAP(0.022, 0.1), beard, s * 0.05, -0.055, 0.14, 0.2, 0, s * 1.15); mus.scale.set(1, 1, 0.8);
    }
    const bprof = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; bprof.push([0.13 * Math.pow(1 - t, 0.8) * (1 + Math.sin(t * 9) * 0.06) + 0.004, -t * 0.62]); }
    const beardGeo = LATHE(bprof.reverse(), 24);
    const ba = beardGeo.attributes.position;
    for (let i = 0; i < ba.count; i++) { const y = ba.getY(i), t = -y / 0.62; ba.setZ(i, ba.getZ(i) * 0.6 + Math.sin(t * 3.5) * 0.04 * t + t * 0.05); }
    beardGeo.computeVertexNormals();
    this.beard = addFur(mesh(head, beardGeo, beard, 0, -0.07, 0.1), { shells: 5, len: 0.03, density: 170 }); // wispy, not a solid cone

    // hat: a drooping brim + a tall cone that bends over at the tip, with stars and a moon
    const hat = this.joint('hat', head, 0, 0.1, -0.01);
    mesh(hat, LATHE([[0.4, -0.03], [0.36, 0.0], [0.24, 0.015], [0.18, 0.02]], 40), robe);
    const cone = LATHE(Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [0.19 * (1 - t) + 0.004, t * 0.8]; }), 28);
    const ca = cone.attributes.position;
    for (let i = 0; i < ca.count; i++) { const y = ca.getY(i), t = y / 0.8; ca.setX(i, ca.getX(i) - Math.pow(t, 2.4) * 0.32); ca.setY(i, y - Math.pow(t, 3) * 0.08); }
    cone.computeVertexNormals();
    mesh(hat, cone, robe, 0, 0.01, 0);
    mesh(hat, new THREE.TorusGeometry(0.185, 0.022, 8, 32), trim, 0, 0.04, 0, Math.PI / 2);
    for (const [y, a, s] of [[0.22, 0.3, 0.05], [0.4, -0.9, 0.04], [0.15, 2.4, 0.045]]) {
      const r = 0.19 * (1 - y / 0.8) + 0.005, st = mesh(hat, starGeo(s, 0.006), trim, Math.sin(a) * r - Math.pow(y / 0.8, 2.4) * 0.32, y, Math.cos(a) * r);
      st.rotation.y = a;
    }

    // bell sleeves with hands; the left holds an orb, the right a staff
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      const sh = this.joint('sh' + n, body, s * 0.37, 1.52, 0);
      mesh(sh, SPH(0.11, 14, 10), robe, 0, 0, 0);
      const sleeve = mesh(sh, LATHE([[0.17, -0.6], [0.13, -0.45], [0.09, -0.2], [0.08, 0.0]], 24), sleeveM);
      mesh(sleeve, new THREE.TorusGeometry(0.17, 0.018, 6, 24), trim, 0, -0.6, 0, Math.PI / 2);
      const hand = this.joint('hand' + n, sh, 0, -0.62, 0);
      mesh(hand, SPH(0.055, 12, 10), skin, 0, 0, 0).scale.set(1, 1.1, 0.8);
      for (let f = 0; f < 4; f++) mesh(hand, CAP(0.012, 0.045), skin, -0.03 + f * 0.02, -0.06, 0.02, 0.3, 0, 0);
      mesh(hand, CAP(0.013, 0.04), skin, s * 0.045, -0.03, 0.03, 0, 0, s * 0.8);
    }
    this.orbL = mesh(this.j.handL, new THREE.IcosahedronGeometry(0.085, 2), glow, 0, -0.12, 0.06);
    // a gnarled staff with a crystal held in three claws
    const staff = this.joint('staff', this.j.handR, 0, 0, 0.02);
    const sp = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; sp.push(new THREE.Vector3(Math.sin(t * 7) * 0.03, -0.6 + t * 1.75, Math.cos(t * 5) * 0.025)); }
    const curve = new THREE.CatmullRomCurve3(sp);
    mesh(staff, new THREE.TubeGeometry(curve, 48, 0.026, 8), wood);
    for (const t of [0.25, 0.55, 0.8]) { const k = mesh(staff, SPH(0.036, 8, 6), wood, ...curve.getPoint(t).toArray()); k.scale.set(1, 0.7, 1); }
    const top = curve.getPoint(1);
    for (let c = 0; c < 3; c++) {
      const a = c / 3 * Math.PI * 2;
      const claw = new THREE.CatmullRomCurve3([top.clone(), top.clone().add(new THREE.Vector3(Math.cos(a) * 0.09, 0.08, Math.sin(a) * 0.09)), top.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, 0.22, Math.sin(a) * 0.05))]);
      mesh(staff, new THREE.TubeGeometry(claw, 12, 0.012, 5), wood);
    }
    const crystal = mesh(staff, new THREE.OctahedronGeometry(0.08, 0), glow, top.x, top.y + 0.13, top.z); crystal.scale.set(0.8, 1.6, 0.8);
    this.crystal = crystal;
    rimify(this.root, 0xc68bff, 0.4);
  }
  pose(dt, s) {
    const j = this.j;
    this.uTime.value = this.t;
    const cast = this.act('cast'); const c = cast >= 0 ? Math.sin(cast * Math.PI) : 0;
    j.body.position.y = Math.sin(this.t * 2) * 0.12;
    j.shL.rotation.set(-0.3 - c * 2.4, 0, 0.3 + c * 0.4);
    j.shR.rotation.set(-0.2 - c * 1.8, 0, -0.25 - c * 0.3);
    j.head.rotation.x = -c * 0.25 + Math.sin(this.t) * 0.05;
    j.hat.rotation.z = Math.sin(this.t * 1.3) * 0.08;
    this.beard.rotation.x = Math.sin(this.t * 1.9) * 0.06 - c * 0.15;
    this.crystal.rotation.y += dt * 1.5;
    const pulse = 2 + Math.sin(this.t * 6) * 0.8 + c * 5;
    this.orbL.material.emissiveIntensity = pulse;
  }
}

// ---------------------------------------------------------------- Nyan (pop-tart cat with legs and a face)
// pink frosting with a scalloped edge and scattered sprinkles, drawn once
let frostTex = null;
function frosting() {
  if (frostTex) return frostTex;
  const W = 128, H = 96, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#ff9ad9'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ffb8e6'; for (let k = 0; k < 40; k++) { x.beginPath(); x.arc(Math.random() * W, Math.random() * H, 3 + Math.random() * 6, 0, 7); x.fill(); }
  const cols = ['#ff2277', '#22aaff', '#ffee22', '#ffffff', '#9d4dff'];
  for (let k = 0; k < 34; k++) {
    x.save(); x.translate(8 + Math.random() * (W - 16), 8 + Math.random() * (H - 16)); x.rotate(Math.random() * 3.2);
    x.fillStyle = cols[k % cols.length]; x.fillRect(-5, -1.6, 10, 3.2); x.restore();
  }
  frostTex = new THREE.CanvasTexture(c); frostTex.colorSpace = THREE.SRGBColorSpace;
  return frostTex;
}
const TRAIL_COLS = [0xff0000, 0xff9900, 0xffff00, 0x33ff00, 0x0099ff, 0x6633ff];
const TRAIL_SEGS = 8, SPARKS = 6;
const _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _tp = new THREE.Vector3(), _ts = new THREE.Vector3();
export class NyanRig extends Rig {
  constructor() {
    super();
    const crust = mat(0xe8c9a0, { rough: 0.8 });
    const frost = new THREE.MeshStandardMaterial({ map: frosting(), roughness: 0.45, emissive: 0xff4fb0, emissiveIntensity: 0.25 });
    const gray = mat(0x9a9a9a, { rough: 0.8 }), black = mat(0x111111), white = mat(0xffffff, { emissive: 0xffffff, ei: 0.4 });
    const blush = mat(0xff8fb0, { emissive: 0xff6090, ei: 0.4 });
    const body = this.joint('body', null, 0, 0.5, 0);
    mesh(body, RB(0.25, 0.9, 1.2, 0.08), crust, 0, 0, 0);
    // frosting on both flat faces of the tart (the cat is seen side-on)
    for (const s of [-1, 1]) { const f = mesh(body, RB(0.03, 0.74, 1.02, 0.012), frost, s * 0.125, 0, 0); f.rotation.y = 0; }
    const head = this.joint('head', body, 0, -0.08, 0.72);
    mesh(head, RB(0.34, 0.46, 0.56, 0.12), gray, 0, 0, 0);
    for (const s of [-1, 1]) {
      mesh(head, CONE(0.08, 0.16, 4), gray, s * 0.11, 0.28, -0.05);
      mesh(head, RB(0.06, 0.07, 0.02, 0.02), black, s * 0.08, 0.06, 0.285);
      mesh(head, RB(0.022, 0.022, 0.01, 0.005), white, s * 0.08 - 0.012, 0.075, 0.296); // the pixel glint in each eye
      mesh(head, SPH(0.035, 8, 8), blush, s * 0.13, -0.06, 0.28).scale.set(1, 0.7, 0.3);
    }
    // the little "w" mouth: three pixels
    for (const [mx, my] of [[-0.045, -0.1], [0, -0.115], [0.045, -0.1]]) mesh(head, RB(0.04, 0.022, 0.02, 0.008), black, mx, my, 0.285);
    for (const n of ['FL', 'FR', 'BL', 'BR']) {
      const leg = this.joint('leg' + n, body, n[1] === 'L' ? -0.08 : 0.08, -0.45, n[0] === 'F' ? 0.4 : -0.4);
      mesh(leg, CAP(0.06, 0.1), gray, 0, -0.08, 0);
    }
    const tail = this.joint('tail', body, 0, 0.0, -0.65);
    mesh(tail, CAP(0.05, 0.2), gray, 0, 0, -0.1, Math.PI / 2);
    rimify(this.root, 0xffffff, 0.3);
    // rainbow trail: one instanced mesh (48 stepped blocks), plus twinkling 8-bit sparkles
    const n = TRAIL_COLS.length * TRAIL_SEGS;
    this.trail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.13, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
    TRAIL_COLS.forEach((c, i) => { for (let k = 0; k < TRAIL_SEGS; k++) this.trail.setColorAt(i * TRAIL_SEGS + k, new THREE.Color(c)); });
    this.trail.castShadow = false; this.trail.frustumCulled = false; body.add(this.trail);
    this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), SPARKS * 5);
    this.sparks.castShadow = false; this.sparks.frustumCulled = false; body.add(this.sparks);
    this.sparkSeed = Array.from({ length: SPARKS }, () => [rand(-0.25, 0.25), rand(-0.5, 0.6), rand(-3.6, -0.8), rand(0, 10)]);
  }
  pose(dt) {
    const j = this.j;
    j.body.position.y = 0.5 + Math.sin(this.t * 7) * 0.08;
    for (const n of ['FL', 'FR', 'BL', 'BR']) j['leg' + n].rotation.x = Math.sin(this.t * 14 + (n === 'FL' || n === 'BR' ? 0 : Math.PI)) * 0.7;
    j.head.rotation.x = Math.sin(this.t * 7 + 1) * 0.08;
    j.tail.rotation.x = Math.sin(this.t * 10) * 0.5;
    _tq.identity(); _ts.set(1, 1, 1);
    for (let i = 0; i < TRAIL_COLS.length; i++) for (let k = 0; k < TRAIL_SEGS; k++) {
      _tp.set(0, 0.33 - i * 0.13 + (Math.floor(this.t * 8 + k) % 2 ? 0.05 : -0.05), -0.85 - k * 0.38);
      this.trail.setMatrixAt(i * TRAIL_SEGS + k, _tm.compose(_tp, _tq, _ts));
    }
    this.trail.instanceMatrix.needsUpdate = true;
    // each sparkle is a "+" of 5 pixels that grows and shrinks on a 4-frame loop
    let m = 0;
    for (const [sx, sy, sz, ph] of this.sparkSeed) {
      const f = Math.floor(this.t * 6 + ph) % 4, r = [0, 1, 2, 1][f] * 0.035;
      const arms = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
      for (const [ay, az] of arms) { _ts.setScalar(f === 0 && (ay || az) ? 0 : 1); _tp.set(sx, sy + ay, sz + az); this.sparks.setMatrixAt(m++, _tm.compose(_tp, _tq, _ts)); }
    }
    this.sparks.instanceMatrix.needsUpdate = true;
  }
}
