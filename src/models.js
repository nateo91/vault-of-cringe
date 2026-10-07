// Low-poly meme models. Every model faces +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { addFur } from './surface.js';
import { emojiSprite, textSprite, makeSprite, cursedFaceTex, IMPACT } from './textures.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function makeDoge() {
  const g = new THREE.Group();
  const tan = std(0xd9a55b), cream = std(0xf3e2c0);
  const body = mesh(B(0.7, 0.6, 1.2), tan, 0, 0.75, 0); g.add(body);
  g.add(mesh(B(0.5, 0.2, 0.9), cream, 0, 0.5, 0.05));
  const legs = [];
  for (const [x, z] of [[-0.22, 0.42], [0.22, 0.42], [-0.22, -0.42], [0.22, -0.42]]) {
    const l = mesh(B(0.18, 0.5, 0.18), tan, x, 0.25, z); g.add(l); legs.push(l);
  }
  const tail = mesh(new THREE.TorusGeometry(0.18, 0.07, 6, 10, Math.PI * 1.4), cream, 0, 1.15, -0.6);
  tail.rotation.y = Math.PI / 2; g.add(tail);
  const head = emojiSprite('🐶', 1.0); head.position.set(0, 1.35, 0.55); g.add(head);
  g.userData = { legs, head };
  return g;
}

export function makeSuitGuy(suitColor = 0x1d2a4a, headEmoji = null) {
  const g = new THREE.Group();
  const suit = std(suitColor), skin = std(0xe0b090), white = std(0xffffff);
  const legL = mesh(B(0.24, 0.85, 0.26), suit, -0.15, 0.42, 0), legR = mesh(B(0.24, 0.85, 0.26), suit, 0.15, 0.42, 0);
  g.add(legL, legR);
  g.add(mesh(B(0.72, 0.8, 0.42), suit, 0, 1.25, 0));
  g.add(mesh(B(0.22, 0.6, 0.02), white, 0, 1.32, 0.215));
  g.add(mesh(B(0.08, 0.5, 0.03), std(0xc0182a), 0, 1.3, 0.23));
  const armL = mesh(B(0.18, 0.75, 0.2), suit, -0.46, 1.2, 0), armR = mesh(B(0.18, 0.75, 0.2), suit, 0.46, 1.2, 0.1);
  armR.rotation.x = -1.2; armR.position.set(0.42, 1.35, 0.3);
  g.add(armL, armR);
  let head;
  if (headEmoji) { head = emojiSprite(headEmoji, 0.75); head.position.set(0, 1.92, 0); }
  else { head = mesh(new THREE.SphereGeometry(0.28, 14, 10), skin, 0, 1.9, 0); }
  g.add(head);
  g.userData = { legs: [legL, legR], head };
  return g;
}

export function makeStonks() {
  const g = makeSuitGuy(0x1d2a4a);
  const label = textSprite('STONKS', 0.42, { font: IMPACT, color: '#ffffff', weight: 'normal' });
  label.position.set(0, 2.55, 0); g.add(label);
  const green = std(0x22dd55, { emissive: 0x11aa33, emissiveIntensity: 0.6 });
  const arrow = new THREE.Group();
  arrow.add(mesh(B(0.14, 1.3, 0.14), green, 0, 0, 0));
  const tip = mesh(new THREE.ConeGeometry(0.28, 0.45, 4), green, 0, 0.85, 0); arrow.add(tip);
  arrow.rotation.z = -0.8; arrow.position.set(-0.2, 1.7, -0.45);
  g.add(arrow);
  g.userData.label = label;
  return g;
}

export function makeSigma() {
  const g = makeSuitGuy(0x111111, '🗿');
  const shades = mesh(B(0.5, 0.1, 0.05), std(0x000000, { metalness: 0.9, roughness: 0.1 }), 0, 1.98, 0.3);
  g.add(shades);
  return g;
}

export const CREW_COLORS = {
  Red: 0xc51111, Blue: 0x132ed2, Green: 0x117f2d, Pink: 0xed54ba, Orange: 0xef7d0e, Yellow: 0xf6f658,
  Black: 0x3f474e, White: 0xd6e0f0, Purple: 0x6b31bc, Brown: 0x71491e, Cyan: 0x38fedb, Lime: 0x50ef39,
};
export function makeCrewmate(color, visorColor = 0x9fd8ef) {
  const g = new THREE.Group();
  const body = std(color, { roughness: 0.5 });
  g.add(mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 14), body, 0, 0.95, 0));
  const legL = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10), body, -0.2, 0.22, 0);
  const legR = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10), body, 0.2, 0.22, 0);
  g.add(legL, legR);
  const visorMat = std(visorColor, { metalness: 0.6, roughness: 0.15, emissive: visorColor, emissiveIntensity: 0.15 });
  const visor = mesh(new THREE.SphereGeometry(0.26, 16, 10), visorMat, 0, 1.15, 0.32);
  visor.scale.set(1.25, 0.75, 0.6); g.add(visor);
  g.add(mesh(B(0.55, 0.6, 0.3), body, 0, 0.95, -0.45));
  g.userData = { legs: [legL, legR], visor, visorMat, bodyMat: body };
  return g;
}
export function makeImpostorMouth() {
  const g = new THREE.Group();
  const red = std(0x8a0010, { emissive: 0x440000 });
  g.add(mesh(B(0.7, 0.7, 0.2), red, 0, 0, 0));
  const tooth = new THREE.ConeGeometry(0.06, 0.2, 4), white = std(0xffffff);
  for (let i = 0; i < 6; i++) {
    const t1 = mesh(tooth, white, -0.28 + i * 0.11, 0.25, 0.12); t1.rotation.x = Math.PI; g.add(t1);
    g.add(mesh(tooth, white, -0.28 + i * 0.11, -0.25, 0.12));
  }
  const tongue = mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6), std(0xff5577), 0, 0, 0.8);
  tongue.rotation.x = Math.PI / 2; g.add(tongue);
  return g;
}
export function makeDeadBody(color) {
  const g = new THREE.Group();
  const body = std(color);
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.45, 14), body, 0, 0.45, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10), body, -0.2, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10), body, 0.2, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14), std(0xd8d8d8), 0, 0.68, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8), std(0xffffff), 0, 0.85, 0));
  g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), std(0xffffff), 0, 1.03, 0));
  return g;
}

export function makeMoai(scale = 1, glowColor = null) {
  const g = new THREE.Group();
  const stone = std(0x7d7a73, { flatShading: true, roughness: 0.95 });
  const dark = std(0x2a2826);
  const s = scale;
  const add = (w, h, d, x, y, z, m = stone) => { const o = mesh(B(w * s, h * s, d * s), m, x * s, y * s, z * s); g.add(o); return o; };
  add(1.5, 1.5, 1.0, 0, 0.75, 0);
  const headMat = glowColor != null ? std(0x8a867e, { flatShading: true, emissive: glowColor, emissiveIntensity: 0 }) : stone;
  const head = add(1.3, 2.2, 1.1, 0, 2.6, 0, headMat);
  add(1.38, 0.32, 0.45, 0, 3.25, 0.42, headMat);
  add(0.36, 1.0, 0.45, 0, 2.6, 0.62, headMat);
  add(0.8, 0.14, 0.2, 0, 1.95, 0.56, headMat);
  add(1.0, 0.45, 0.9, 0, 1.72, 0.12, headMat);
  add(0.36, 0.18, 0.06, -0.32, 3.0, 0.56, dark);
  add(0.36, 0.18, 0.06, 0.32, 3.0, 0.56, dark);
  add(0.15, 1.2, 0.3, -0.72, 2.8, 0);
  add(0.15, 1.2, 0.3, 0.72, 2.8, 0);
  g.userData = { head, headMat };
  return g;
}

export function makeNyan() {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  inner.add(mesh(B(0.25, 0.9, 1.2), std(0xe8c9a0), 0, 0, 0));
  inner.add(mesh(B(0.27, 0.72, 1.02), std(0xff8fd6, { emissive: 0xff4fb0, emissiveIntensity: 0.3 }), 0, 0, 0));
  for (let i = 0; i < 6; i++) inner.add(mesh(B(0.29, 0.06, 0.06), std(0xff2277), 0, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8));
  const gray = std(0x9a9a9a);
  inner.add(mesh(B(0.35, 0.5, 0.6), gray, 0, -0.1, 0.75));
  const earL = mesh(new THREE.ConeGeometry(0.1, 0.18, 4), gray, 0, 0.22, 0.6), earR = mesh(new THREE.ConeGeometry(0.1, 0.18, 4), gray, 0, 0.22, 0.92);
  inner.add(earL, earR);
  inner.add(mesh(B(0.37, 0.07, 0.07), std(0x000000), 0, -0.03, 0.88));
  for (const z of [-0.4, -0.1, 0.2, 0.45]) inner.add(mesh(B(0.12, 0.2, 0.12), gray, 0, -0.5, z));
  const trail = new THREE.Group();
  const colors = [0xff0000, 0xff9900, 0xffff00, 0x33ff00, 0x0099ff, 0x6633ff];
  colors.forEach((c, i) => {
    const seg = mesh(B(0.12, 0.13, 2.6), new THREE.MeshBasicMaterial({ color: c }), 0, 0.33 - i * 0.13, -1.9);
    seg.castShadow = false; trail.add(seg);
  });
  inner.add(trail);
  g.userData = { inner, trail };
  return g;
}

export function makeWizard() {
  const g = new THREE.Group();
  const robe = std(0x4b2a8a, { emissive: 0x220a44 });
  g.add(mesh(new THREE.ConeGeometry(0.7, 1.9, 10), robe, 0, 0.95, 0));
  const head = emojiSprite('🧙', 1.1); head.position.set(0, 2.15, 0); g.add(head);
  const orb = mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xc68bff }), 0.55, 1.5, 0.3);
  g.add(orb);
  const label = textSprite('i came from the moon', 0.26, { color: '#d9b8ff' }); label.position.set(0, 2.95, 0); g.add(label);
  g.userData = { orb };
  return g;
}

export function makeChungus() {
  const g = new THREE.Group();
  const gray = std(0x8d8d96, { roughness: 0.9 }), white = std(0xf0eee8, { roughness: 0.95 }), pink = std(0xf2a0b0), black = std(0x111111, { roughness: 0.2 });
  const sph = (r) => new THREE.SphereGeometry(r, 24, 18);
  const bodyJ = new THREE.Group(); bodyJ.position.y = 2.4; g.add(bodyJ);
  const body = addFur(mesh(sph(1), gray, 0, 0, 0), { shells: 7, len: 0.035, density: 70 }); body.scale.set(2.6, 2.4, 2.3); bodyJ.add(body);
  const belly = addFur(mesh(sph(1), white, 0, -0.2, 1.45), { shells: 7, len: 0.035, density: 70 }); belly.scale.set(1.9, 1.8, 0.95); bodyJ.add(belly);
  const head = new THREE.Group(); head.position.set(0, 2.8, 0.3); bodyJ.add(head);
  head.add(addFur(mesh(sph(1.35), gray, 0, 0, 0), { shells: 7, len: 0.07, density: 40 }));
  const cheeks = addFur(mesh(sph(0.8), white, 0, -0.45, 0.85), { shells: 6, len: 0.06, density: 45 }); cheeks.scale.set(1.3, 0.8, 0.8); head.add(cheeks);
  const ears = [], arms = [], feet = [];
  for (const sx of [-1, 1]) {
    // two-segment ears so they can flop
    const ear = new THREE.Group(); ear.position.set(sx * 0.6, 1.0, 0); ear.rotation.z = -sx * 0.25; head.add(ear);
    ear.add(addFur(mesh(new THREE.CapsuleGeometry(0.36, 1.0, 6, 10), gray, 0, 0.7, 0), { shells: 5, len: 0.05, density: 45 }));
    ear.add(mesh(new THREE.CapsuleGeometry(0.2, 0.8, 6, 10), pink, 0, 0.7, 0.2));
    const tip = new THREE.Group(); tip.position.y = 1.4; ear.add(tip);
    tip.add(addFur(mesh(new THREE.CapsuleGeometry(0.34, 1.0, 6, 10), gray, 0, 0.6, 0), { shells: 5, len: 0.05, density: 45 }));
    tip.add(mesh(new THREE.CapsuleGeometry(0.19, 0.8, 6, 10), pink, 0, 0.6, 0.2));
    ears.push({ ear, tip, sx });
    const eye = mesh(sph(0.3), white, sx * 0.45, 0.3, 1.05); head.add(eye);
    head.add(mesh(sph(0.13), black, sx * 0.45, 0.28, 1.33));
    const foot = addFur(mesh(sph(1), gray, sx * 1.3, 0.35, 0.8), { shells: 5, len: 0.05, density: 60 }); foot.scale.set(0.9, 0.4, 1.3); g.add(foot); feet.push(foot);
    const arm = new THREE.Group(); arm.position.set(sx * 2.3, 0.6, 0.4); bodyJ.add(arm);
    const a = addFur(mesh(new THREE.CapsuleGeometry(0.45, 1.4, 6, 10), gray, sx * 0.25, -0.7, 0), { shells: 6, len: 0.06, density: 45 }); a.rotation.z = sx * 0.4; arm.add(a);
    arm.add(mesh(sph(0.5), white, sx * 0.55, -1.45, 0.1));
    arms.push({ arm, sx });
  }
  head.add(mesh(new THREE.BoxGeometry(0.5, 0.45, 0.12), white, 0, -0.75, 1.3));
  head.add(mesh(sph(0.15), pink, 0, -0.15, 1.38));
  const eyeGlow = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0 });
  head.add(mesh(sph(0.34), eyeGlow, -0.45, 0.3, 1.1), mesh(sph(0.34), eyeGlow, 0.45, 0.3, 1.1));
  g.userData = { head, eyeGlow, ears, arms, feet, bodyJ, belly };
  return g;
}

function makeToiletParts(s = 1) {
  const g = new THREE.Group();
  const porcelain = std(0xf4f4f4, { roughness: 0.18, metalness: 0.05, side: THREE.DoubleSide });
  const chrome = std(0xd8dde6, { metalness: 1, roughness: 0.15 });
  const V2 = (r, y) => new THREE.Vector2(r * s, y * s);
  // the bowl: a pedestal flaring into an oval bowl with a rolled rim, then the inner surface going back down
  const bowl = new THREE.LatheGeometry([
    V2(1.25, 0), V2(1.32, 0.12), V2(1.05, 0.45), V2(0.98, 1.1), V2(1.35, 1.6), V2(2.2, 2.35), V2(2.85, 3.2),
    V2(3.15, 3.85), V2(3.22, 4.08), V2(3.08, 4.2), V2(2.82, 4.12), V2(2.45, 3.7), V2(1.6, 3.15), V2(0.7, 2.9), V2(0.01, 2.85),
  ], 40);
  const b = mesh(bowl, porcelain); b.scale.z = 1.18; g.add(b);
  const water = mesh(new THREE.CircleGeometry(2.05 * s, 32), std(0x3fa9ff, { emissive: 0x0a3a88, roughness: 0.05, metalness: 0.2 }), 0, 3.45 * s, 0);
  water.rotation.x = -Math.PI / 2; water.scale.y = 1.18; g.add(water);
  // the seat, and the lid standing open behind it
  const seat = mesh(new THREE.TorusGeometry(2.88 * s, 0.26 * s, 10, 40), porcelain, 0, 4.32 * s, 0);
  seat.rotation.x = Math.PI / 2; seat.scale.y = 1.18; seat.scale.z = 0.7; g.add(seat);
  const lidG = new THREE.Group(); lidG.position.set(0, 4.45 * s, -3.15 * s); lidG.rotation.x = -0.18; g.add(lidG);
  const lid = mesh(new THREE.CylinderGeometry(3.0 * s, 3.0 * s, 0.22 * s, 40), porcelain, 0, 3.2 * s, 0); lid.rotation.x = Math.PI / 2; lid.scale.x = 1; lid.scale.z = 1.12; lidG.add(lid);
  // the tank: rounded, with a capped lid, a chrome flush handle and the pipe down to the bowl
  const RB = (w, h, d, r) => new RoundedBoxGeometry(w * s, h * s, d * s, 3, r * s);
  g.add(mesh(RB(5.0, 3.6, 1.7, 0.35), porcelain, 0, 5.75 * s, -3.75 * s));
  g.add(mesh(RB(5.4, 0.42, 2.0, 0.18), porcelain, 0, 7.72 * s, -3.75 * s));
  const handleBase = mesh(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 0.12 * s, 16), chrome, 1.7 * s, 7.1 * s, -2.87 * s); handleBase.rotation.x = Math.PI / 2; g.add(handleBase);
  const lever = mesh(RB(0.9, 0.16, 0.16, 0.06), chrome, 2.05 * s, 7.1 * s, -2.78 * s); lever.rotation.z = -0.25; g.add(lever);
  g.add(mesh(new THREE.CylinderGeometry(0.35 * s, 0.35 * s, 1.2 * s, 16), porcelain, 0, 3.9 * s, -3.15 * s));
  // bolt caps on the base
  for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.16 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), porcelain, sx * 1.15 * s, 0.05 * s, 0.25 * s));
  return g;
}
// Skibidi's head: bulging eyes that track you, a jaw that sings, brows that never come down.
const _hv = new THREE.Vector3();
export class SkibidiHead {
  constructor(scale = 1) {
    const g = this.group = new THREE.Group();
    this.inner = new THREE.Group(); this.inner.scale.setScalar(scale); g.add(this.inner);
    const h = this.inner;
    const skin = std(0xe9b894, { roughness: 0.5 }), skinDark = std(0xd29a78, { roughness: 0.6 });
    const hair = std(0x2b1a10, { roughness: 0.9 }), white = std(0xfbfbf6, { roughness: 0.15 });
    const dark = std(0x120806, { roughness: 0.3 }), mouthM = std(0x3a0507, { roughness: 0.7 }), tongue = std(0xd95a6a, { roughness: 0.5 });
    const S = (r, w = 24, hh = 18) => new THREE.SphereGeometry(r, w, hh);
    const skull = mesh(S(1), skin, 0, 0, 0); skull.scale.set(0.92, 1.08, 0.95); h.add(skull);
    const cap = mesh(new THREE.SphereGeometry(1.04, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), hair, 0, 0.05, -0.08); cap.scale.set(0.93, 1.1, 0.98); h.add(cap);
    for (let i = -2; i <= 2; i++) { const f = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), hair, i * 0.16, 0.86, 0.5 - Math.abs(i) * 0.06); f.rotation.set(2.6, 0, i * 0.15); h.add(f); }
    for (const sx of [-1, 1]) { const ear = mesh(S(0.22, 12, 10), skinDark, sx * 0.88, 0.02, -0.02); ear.scale.set(0.4, 1, 0.7); h.add(ear); }
    const nose = mesh(new THREE.CapsuleGeometry(0.11, 0.18, 4, 10), skinDark, 0, 0.02, 0.96); nose.rotation.x = 0.35; h.add(nose);
    this.eyes = []; this.lids = []; this.brows = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(sx * 0.34, 0.26, 0.74); h.add(eye);
      eye.add(mesh(S(0.22, 20, 16), white, 0, 0, 0));
      const look = new THREE.Group(); eye.add(look);
      const iris = mesh(S(0.095, 14, 12), std(0x4a2e1a, { roughness: 0.3 }), 0, 0, 0.17); iris.scale.z = 0.5; look.add(iris);
      const pupil = mesh(S(0.05, 12, 10), dark, 0, 0, 0.215); pupil.scale.z = 0.4; look.add(pupil);
      look.add(mesh(S(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.03, 0.035, 0.235));
      const lid = mesh(new THREE.SphereGeometry(0.235, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), skin, 0, 0, 0); eye.add(lid);
      const brow = mesh(new THREE.BoxGeometry(0.36, 0.08, 0.1), hair, sx * 0.34, 0.6, 0.8); h.add(brow);
      this.eyes.push({ eye, look, pupil, sx }); this.lids.push(lid); this.brows.push({ brow, sx });
    }
    this.eyeGlow = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const e of this.eyes) e.eye.add(mesh(S(0.3, 12, 10), this.eyeGlow, 0, 0, 0.05));
    // mouth: a cavity that stretches open, teeth that part, a chin that drops
    const mouth = this.mouth = new THREE.Group(); mouth.position.set(0, -0.42, 0.74); h.add(mouth);
    this.cavity = mesh(S(0.42, 20, 14), mouthM, 0, 0, 0); this.cavity.scale.set(1.25, 0.4, 0.5); mouth.add(this.cavity);
    this.upperTeeth = mesh(new THREE.BoxGeometry(0.66, 0.11, 0.1), white, 0, 0.1, 0.16); mouth.add(this.upperTeeth);
    this.lowerTeeth = mesh(new THREE.BoxGeometry(0.58, 0.09, 0.1), white, 0, -0.1, 0.16); mouth.add(this.lowerTeeth);
    this.tongue = mesh(S(0.2, 14, 10), tongue, 0, -0.12, 0.08); this.tongue.scale.set(1.2, 0.45, 1); mouth.add(this.tongue);
    this.chin = mesh(S(0.42, 16, 12), skin, 0, -0.66, 0.42); this.chin.scale.set(1.15, 0.7, 0.85); h.add(this.chin);
    this.t = Math.random() * 10; this.blinkT = 2; this.blink = 0; this.stareK = 0;
  }
  // open: 0..1 jaw; stare: the vibe-check glare; target: world point to stare at (your camera)
  update(dt, { open = 0, stare = false, target = null } = {}) {
    this.t += dt;
    this.stareK += ((stare ? 1 : 0) - this.stareK) * Math.min(1, dt * 6);
    const st = this.stareK;
    // blink every few seconds (never while staring)
    this.blinkT -= dt;
    if (this.blinkT <= 0 && st < 0.1) { this.blink = 1; this.blinkT = 1.5 + Math.random() * 3.5; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const lidClose = Math.sin(this.blink * Math.PI);
    for (const lid of this.lids) { lid.scale.set(1.02, 1, 1.02); lid.rotation.x = -1.55 + lidClose * 1.8 - st * 0.2; }
    // eyes track the target in head space
    if (target) {
      _hv.copy(target); this.inner.worldToLocal(_hv);
      for (const e of this.eyes) {
        const dx = _hv.x - e.eye.position.x, dy = _hv.y - e.eye.position.y, dz = _hv.z - e.eye.position.z;
        e.look.rotation.y = Math.max(-0.6, Math.min(0.6, Math.atan2(dx, dz)));
        e.look.rotation.x = Math.max(-0.5, Math.min(0.5, -Math.atan2(dy, Math.hypot(dx, dz))));
      }
    }
    for (const e of this.eyes) {
      e.eye.scale.setScalar(1 + st * 0.45 + Math.sin(this.t * 13) * 0.02 * st);
      e.pupil.scale.set(1 - st * 0.55, 1 - st * 0.55, 0.4);
    }
    this.eyeGlow.opacity = st * (0.55 + Math.sin(this.t * 20) * 0.2);
    // brows: permanently raised and wiggling; furrowed into a glare when staring
    for (const b of this.brows) {
      b.brow.position.y = 0.6 + 0.08 * (1 - st) + Math.sin(this.t * 6.4 + b.sx) * 0.03 - st * 0.12;
      b.brow.rotation.z = b.sx * (-0.18 * (1 - st) + 0.35 * st) + Math.sin(this.t * 3.2) * 0.05;
    }
    // the song
    const o = Math.max(0, Math.min(1, open)) * (1 - st * 0.4) + st * 0.6;
    this.cavity.scale.set(1.25 + o * 0.15, 0.25 + o * 0.85, 0.5);
    this.upperTeeth.position.y = 0.08 + o * 0.16;
    this.lowerTeeth.position.y = -0.08 - o * 0.2;
    this.tongue.position.y = -0.12 - o * 0.18;
    this.chin.position.y = -0.66 - o * 0.22;
    this.inner.rotation.z = Math.sin(this.t * 3.2) * 0.08;
  }
}

export function makeToiletBoss() {
  const g = makeToiletParts(1);
  const neck = mesh(new THREE.CylinderGeometry(0.8, 1.0, 3, 16), std(0xe0b090, { roughness: 0.55 }), 0, 4.5, 0); g.add(neck);
  const head = new SkibidiHead(2.05);
  head.group.position.set(0, 6.3, 0.3); g.add(head.group);
  g.userData = { head, neck };
  return g;
}
export function makeMiniToilet({ sprite = false } = {}) {
  const g = makeToiletParts(0.32);
  if (sprite) {
    // distant decoration: a flat face is plenty
    const face = makeSprite(cursedFaceTex(), 1.5, 1.6); face.position.set(0, 2.0, 0); g.add(face);
    g.userData = { face };
    return g;
  }
  const head = new SkibidiHead(0.62);
  head.group.position.set(0, 2.0, 0.1); g.add(head.group);
  g.userData = { head };
  return g;
}

export function makeGrassPatch(radius = 3) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), std(0x2f8f2f, { emissive: 0x0c3a0c }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.03; base.receiveShadow = true; g.add(base);
  const N = 260;
  const blade = new THREE.ConeGeometry(0.05, 0.5, 3); blade.translate(0, 0.25, 0);
  const inst = new THREE.InstancedMesh(blade, std(0x5fd35f, { emissive: 0x1a5a1a }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius * 0.95;
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    e.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5); q.setFromEuler(e);
    const s = 0.6 + Math.random() * 0.9; sc.set(s, s, s);
    m.compose(p, q, sc); inst.setMatrixAt(i, m);
  }
  g.add(inst);
  const label = textSprite('🌱 TOUCH GRASS', 0.5, { color: '#9dff9d' }); label.position.y = 2.6; g.add(label);
  g.userData = { base, label };
  return g;
}
