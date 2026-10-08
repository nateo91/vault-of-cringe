// Particles, explosions, tracers, beams, floating meme text and damage numbers.
import * as THREE from 'three';
import { G, rand, pick, shareable } from './game.js';
import { textSprite, emojiSprite, MEME_COLORS } from './textures.js';
import { groundY } from './world.js';

export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
export const sphGeo = new THREE.SphereGeometry(1, 16, 12);
const matCache = new Map();
export function basicMat(color) {
  if (!matCache.has(color)) { const m = new THREE.MeshBasicMaterial({ color }); m.userData.shared = true; matCache.set(color, m); }
  return matCache.get(color);
}

const parts = [];
const timed = [];
const MAX_PARTS = 600;

// ---------- textures ----------
function radialTex(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const glowTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
const smokeTex = radialTex([[0, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
const holeTex = (() => {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.18, 'rgba(10,8,6,0.95)'); g.addColorStop(0.32, 'rgba(40,30,20,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, r = 8 + Math.random() * 18; x.beginPath(); x.moveTo(S / 2, S / 2); x.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); x.stroke(); }
  const t = new THREE.CanvasTexture(c); return t;
})();

const glowMats = new Map();
function glowMat(color) {
  if (!glowMats.has(color)) {
    const m = new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    m.userData.shared = true; glowMats.set(color, m);
  }
  return glowMats.get(color);
}

// ---------- pooled lights (adding/removing lights recompiles shaders = stutter) ----------
const lightPool = [];
function ensureLights() {
  if (lightPool.length) return;
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    l.userData = { life: 0, max: 1, base: 0 };
    G.scene.add(l); lightPool.push(l);
  }
}
export function flashLight(pos, color, intensity = 30, range = 12, life = 0.15) {
  ensureLights();
  let l = lightPool.find((q) => q.userData.life <= 0) || lightPool.reduce((a, b) => (a.userData.life < b.userData.life ? a : b));
  l.position.copy(pos); l.color.set(color); l.distance = range;
  l.userData.life = l.userData.max = life; l.userData.base = intensity; l.intensity = intensity;
}

// A light an enemy carries around (a disco ball, a burning sign). It borrows a pooled light, refreshed every frame,
// instead of owning a PointLight: a light per enemy would change the scene's light count every time one spawned
// or died, and every material in view would recompile its shader (a visible hitch each time).
export function carryLight(owner, pos, color, intensity, range) {
  ensureLights();
  let l = owner._poolLight;
  if (!l || l.userData.owner !== owner) {
    l = lightPool.find((q) => q.userData.life <= 0);
    if (!l) return;
    l.userData.owner = owner; owner._poolLight = l;
  }
  l.position.copy(pos); l.color.set(color); l.distance = range;
  l.userData.life = l.userData.max = 0.12; l.userData.base = intensity; l.intensity = intensity;
}

// Sparks / energy: additive glow sprites. (Signature is shared over the network — keep it stable.)
function _burst(pos, color = 0xffffff, count = 12, speed = 6, size = 0.15, life = 0.6, grav = 12) {
  for (let i = 0; i < count; i++) {
    if (parts.length >= MAX_PARTS) { const o = parts.shift(); G.fxGroup.remove(o.m); }
    const m = new THREE.Sprite(glowMat(color));
    m.position.copy(pos);
    const s = size * rand(1.4, 3.0);
    m.scale.setScalar(s);
    G.fxGroup.add(m);
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.3), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.35, 1));
    parts.push({ m, v, life, max: life, s, grav, drag: 1.5 });
  }
}
// Chunky debris that tumbles (gibs, rubble).
export function debris(pos, color, count = 6, speed = 5, size = 0.12, life = 0.9) {
  for (let i = 0; i < count; i++) {
    if (parts.length >= MAX_PARTS) { const o = parts.shift(); G.fxGroup.remove(o.m); }
    const m = new THREE.Mesh(boxGeo, basicMat(color));
    m.position.copy(pos); const s = size * rand(0.6, 1.4); m.scale.setScalar(s); m.rotation.set(rand(0, 6), rand(0, 6), 0);
    G.fxGroup.add(m);
    const v = new THREE.Vector3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
    parts.push({ m, v, life, max: life, s, grav: 14, spin: true });
  }
}

export function addTimed(obj, life, update, onEnd) {
  G.fxGroup.add(obj);
  const t = { obj, life, max: life, update, onEnd };
  timed.push(t);
  return t;
}

function smoke(pos, color, count, size, life, rise = 1.5) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color, transparent: true, depthWrite: false, opacity: 0.5 }));
    m.position.copy(pos).add(new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.6), rand(-1, 1)).multiplyScalar(size * 0.5));
    m.material.rotation = rand(0, 6);
    const s0 = size * rand(0.6, 1.1);
    const vy = rise * rand(0.5, 1.2);
    addTimed(m, life * rand(0.7, 1.2), (k, o, dt) => { const g = 1 + (1 - k) * 1.6; o.scale.set(s0 * g, s0 * g, 1); o.position.y += vy * dt; o.material.opacity = 0.5 * k; }, (o) => o.material.dispose());
  }
}

function _explosion(pos, radius, color = 0xff8a2a) {
  const m = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.copy(pos);
  addTimed(m, 0.4, (k, o) => { o.scale.setScalar(radius * (0.2 + 0.9 * (1 - k * k))); o.material.opacity = 0.85 * k * k; }, (o) => o.material.dispose());
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  core.position.copy(pos);
  addTimed(core, 0.22, (k, o) => { o.scale.setScalar(radius * 3.2 * (1.2 - k * 0.5)); o.material.opacity = k; }, (o) => o.material.dispose());
  _burst(pos, color, 22, radius * 3.2, 0.12, 0.6, 6);
  _burst(pos, 0xffffff, 8, radius * 4, 0.06, 0.35, 0);
  debris(pos, 0x2a2a2a, 6, radius * 1.6, 0.18, 1.0);
  smoke(pos, 0x3a3a40, 6, radius * 1.1, 1.6, 1.2);
  flashLight(pos, color, 80, radius * 5, 0.3);
}

function _tracer(a, b, color = 0xfff1a8, width = 0.03, life = 0.07) {
  const len = a.distanceTo(b);
  if (len < 0.05) return;
  const m = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  m.scale.set(width, width, len);
  addTimed(m, life, (k, o) => { o.material.opacity = k; o.scale.x = o.scale.y = width * (0.3 + 0.7 * k); }, (o) => o.material.dispose());
}

// ---------- bullet impacts ----------
// Sparks that ricochet off the surface + a dust puff + a brief hot glow. Local only (each machine draws its own).
const sparkGeo = new THREE.BoxGeometry(1, 1, 1);
const sparkMats = new Map();
function sparkMat(color) {
  // over-bright so the sparks bloom
  if (!sparkMats.has(color)) sparkMats.set(color, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  return sparkMats.get(color);
}
const _rf = new THREE.Vector3(), _rd = new THREE.Vector3();
export function impact(point, normal, dir, { sparks = 6, color = 0xffc070, dust = 0x9a9080, size = 1 } = {}) {
  const n = normal || _rf.copy(dir).negate();
  // reflect the bullet direction about the surface; sparks spray in a cone around it
  const refl = _rd.copy(dir).sub(_rf.copy(n).multiplyScalar(2 * dir.dot(n))).normalize();
  for (let i = 0; i < sparks; i++) {
    if (parts.length >= MAX_PARTS) { const o = parts.shift(); G.fxGroup.remove(o.m); if (o.streak) o.m.material.dispose(); }
    const m = new THREE.Mesh(sparkGeo, sparkMat(Math.random() < 0.3 ? 0xffffff : color).clone());
    m.position.copy(point).addScaledVector(n, 0.02);
    const v = refl.clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.3, 0.7), rand(-0.6, 0.6))).normalize().multiplyScalar(rand(5, 13) * size);
    G.fxGroup.add(m);
    const life = rand(0.12, 0.32);
    parts.push({ m, v, life, max: life, s: 0.022 * size, grav: 16, drag: 2.5, streak: true });
  }
  // dust kicked off the surface
  smoke(point.clone().addScaledVector(n, 0.12), dust, 2, 0.32 * size, 0.7, 0.35);
  // the hot spot: a small glow that fades fast
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  g.position.copy(point).addScaledVector(n, 0.03);
  addTimed(g, 0.18, (k, o) => { o.scale.setScalar(0.22 * size * (0.6 + k * 0.6)); o.material.opacity = k; }, (o) => o.material.dispose());
}

// ---------- muzzle flash ----------
// A ragged four-to-six petal star, drawn once; the viewmodel picks a random rotation + scale per shot.
export const flashTex = (() => {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.translate(S / 2, S / 2);
  x.globalCompositeOperation = 'lighter';
  const petal = (a, len, w, alpha) => {
    x.save(); x.rotate(a);
    const g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, `rgba(255,255,240,${alpha})`); g.addColorStop(0.35, `rgba(255,200,110,${alpha * 0.8})`); g.addColorStop(1, 'rgba(255,120,30,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, -w); x.quadraticCurveTo(len * 0.45, -w * 0.7, len, 0); x.quadraticCurveTo(len * 0.45, w * 0.7, 0, w); x.closePath(); x.fill();
    x.restore();
  };
  for (let i = 0; i < 5; i++) petal(i / 5 * Math.PI * 2 + Math.random() * 0.4, S * (0.36 + Math.random() * 0.12), S * 0.07, 0.9);
  for (let i = 0; i < 7; i++) petal(Math.random() * Math.PI * 2, S * (0.18 + Math.random() * 0.12), S * 0.05, 0.6);
  const core = x.createRadialGradient(0, 0, 0, 0, 0, S * 0.2);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.5, 'rgba(255,230,170,0.6)'); core.addColorStop(1, 'rgba(255,160,60,0)');
  x.fillStyle = core; x.beginPath(); x.arc(0, 0, S * 0.2, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
// a little wisp of barrel smoke in the world, left behind as you move
export function muzzleSmoke(pos) { smoke(pos, 0xb8b4ac, 1, 0.07, 0.8, 0.45); }

// ---------- supers ----------
// A ring of energy sweeping out along the floor (cast + Fist of Yeet), with rising motes
export function superRing(pos, color, radius = 8) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.copy(pos).setY(pos.y + 0.06);
  addTimed(m, 0.7, (k, o) => { o.scale.setScalar(radius * (1 - k) + 0.5); o.material.opacity = k; }, (o) => { o.geometry.dispose(); o.material.dispose(); });
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    _burst(pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2)), color, 1, 3, 0.09, 0.9, -4);
  }
}
// The Fist of Yeet crater: a cracked, scorched decal on the floor + rubble + a rolling dust ring
const craterTex = (() => {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(10,8,8,0.95)'); g.addColorStop(0.35, 'rgba(25,20,20,0.75)'); g.addColorStop(0.7, 'rgba(30,25,25,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(0,0,0,0.85)'; x.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let a = Math.random() * Math.PI * 2, r = 18, px = S / 2, py = S / 2;
    x.lineWidth = 3 + Math.random() * 3; x.beginPath(); x.moveTo(px, py);
    while (r < S * 0.48) { a += (Math.random() - 0.5) * 0.7; r += 8 + Math.random() * 10; px = S / 2 + Math.cos(a) * r; py = S / 2 + Math.sin(a) * r; x.lineTo(px, py); x.lineWidth *= 0.92; }
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
})();
export function crater(pos, size = 7, color = 0x7fd7ff) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: craterTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = rand(0, 6); m.position.copy(pos).setY(pos.y + 0.03);
  addTimed(m, 14, (k, o) => { o.material.opacity = Math.min(1, k * 4); }, (o) => { o.geometry.dispose(); o.material.dispose(); });
  // glowing embers in the cracks that cool off
  const glow = new THREE.Mesh(new THREE.CircleGeometry(size * 0.3, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.copy(pos).setY(pos.y + 0.04);
  addTimed(glow, 2.5, (k, o) => { o.material.opacity = k * k * 0.8; }, (o) => { o.geometry.dispose(); o.material.dispose(); });
  debris(pos.clone().setY(pos.y + 0.3), 0x6a6570, 14, 9, 0.22, 1.4);
  // a ring of dust rolling outward (not on top of the camera)
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; smoke(pos.clone().add(new THREE.Vector3(Math.cos(a) * 3, 0.3, Math.sin(a) * 3)), 0x9a948c, 1, 2.6, 1.6, 0.5); }
}
// Nova Bomb: the void ball collapses inward for a beat, then detonates
export function implode(pos, radius = 4, color = 0x9a4dff) {
  const m = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0x1a0030, transparent: true, opacity: 0.9, depthWrite: false }));
  m.position.copy(pos);
  addTimed(m, 0.28, (k, o) => { o.scale.setScalar(radius * k); }, (o) => o.material.dispose());
  const rim = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, toneMapped: false }));
  rim.position.copy(pos);
  addTimed(rim, 0.28, (k, o) => { o.scale.setScalar(radius * 1.15 * k); }, (o) => o.material.dispose());
  for (let i = 0; i < 30; i++) {
    const d = new THREE.Vector3().randomDirection();
    if (parts.length >= MAX_PARTS) break;
    const s = new THREE.Sprite(glowMat(color)); s.position.copy(pos).addScaledVector(d, radius * 1.6); s.scale.setScalar(0.25);
    G.fxGroup.add(s);
    parts.push({ m: s, v: d.multiplyScalar(-radius * 5.5), life: 0.3, max: 0.3, s: 0.25, grav: 0, drag: 0 });
  }
}

// ---------- class grenades (visual only; the thrower's machine deals the damage) ----------
export function grenadeField(kind, pos, life = 3) {
  const P = pos.clone();
  if (kind === 'solar') {
    // a burning patch: a glowing disc, licking flames, embers
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(0xff6a10).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.copy(P).setY(P.y + 0.05);
    addTimed(disc, life, (k, o) => { o.material.opacity = Math.min(1, k * 3) * (0.75 + Math.random() * 0.25); }, (o) => { o.geometry.dispose(); o.material.dispose(); });
    let acc = 0;
    addTimed(new THREE.Object3D(), life, (k, o, dt) => {
      if ((acc += dt) < 0.05) return; acc = 0;
      const a = rand(0, 6.28), r = rand(0, 3.2);
      _burst(new THREE.Vector3(P.x + Math.cos(a) * r, P.y + 0.2, P.z + Math.sin(a) * r), Math.random() < 0.3 ? 0xffd060 : 0xff6a10, 1, 1.5, 0.18, 0.7, -5);
    });
    flashLight(P.clone().setY(P.y + 1), 0xff6a10, 30, 10, life);
  } else if (kind === 'arc') {
    // a pulse field: a crackling sphere that flares on each pulse, with lightning arcs
    const sph = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fd7ff).multiplyScalar(2), transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, wireframe: true }));
    sph.position.copy(P).setY(P.y + 0.6);
    let pulse = 0, pt = 0;
    addTimed(sph, life, (k, o, dt) => {
      pt -= dt;
      if (pt <= 0) { pt = life / 4; pulse = 1; flashLight(P.clone().setY(P.y + 1), 0x7fd7ff, 40, 10, 0.15); _ringFx(P, 4.5, 0x7fd7ff, 0.3); }
      pulse = Math.max(0, pulse - dt * 5);
      o.scale.setScalar(4.5 * (0.8 + pulse * 0.25)); o.rotation.y += dt * 2; o.material.opacity = 0.08 + pulse * 0.35;
      if (Math.random() < dt * 14) { const a = new THREE.Vector3().randomDirection().multiplyScalar(4).add(P).setY(P.y + rand(0.2, 3)); _tracer(P.clone().setY(P.y + 0.6), a, 0xbfefff, 0.03, 0.06); }
    }, (o) => o.material.dispose());
  } else {
    // a vortex: a dark void core with a glowing rim, particles spiralling in
    const core = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0x14002a, transparent: true, opacity: 0.85, depthWrite: false }));
    const rim = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb06cff).multiplyScalar(2.2), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, toneMapped: false }));
    core.position.copy(P).setY(P.y + 1); rim.position.copy(core.position);
    addTimed(core, life, (k, o) => { const s = 0.9 + Math.sin(k * 40) * 0.08; o.scale.setScalar(Math.min(1, (1 - k) * 8, k * 6) * s); }, (o) => o.material.dispose());
    addTimed(rim, life, (k, o) => { o.scale.setScalar(Math.min(1, (1 - k) * 8, k * 6) * 1.25); }, (o) => o.material.dispose());
    let acc = 0;
    addTimed(new THREE.Object3D(), life, (k, o, dt) => {
      if ((acc += dt) < 0.03) return; acc = 0;
      if (parts.length >= MAX_PARTS) return;
      const d = new THREE.Vector3().randomDirection(); d.y *= 0.4;
      const s = new THREE.Sprite(glowMat(0xb06cff)); s.position.copy(core.position).addScaledVector(d, 5); s.scale.setScalar(0.2);
      G.fxGroup.add(s);
      parts.push({ m: s, v: d.multiplyScalar(-11), life: 0.42, max: 0.42, s: 0.2, grav: 0, drag: 0 });
    });
    flashLight(core.position.clone(), 0xb06cff, 25, 9, life);
  }
}

// A revive: a column of Light where the Guardian stands back up, rising motes, a ring
export function rally(pos, self = false) {
  // (the revived player is standing inside the column, so they just get the ring and the motes)
  if (!self) {
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 12, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe2ff).multiplyScalar(2), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  col.position.copy(pos).setY(pos.y + 6);
  addTimed(col, 1.2, (k, o) => { o.material.opacity = 0.5 * k; o.scale.set(0.4 + k * 0.6, 1, 0.4 + k * 0.6); }, (o) => { o.geometry.dispose(); o.material.dispose(); });
  }
  superRing(pos, 0x9fe2ff, 5);
  for (let i = 0; i < 20; i++) _burst(pos.clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(0, 1.5), rand(-0.6, 0.6))), 0xcff4ff, 1, 2, 0.08, 1.2, -6);
  flashLight(pos.clone().setY(pos.y + 1.5), 0x9fe2ff, self ? 12 : 40, 10, 0.6);
}

// ---------- bullet holes ----------
const decals = [];
const decalGeo = new THREE.PlaneGeometry(1, 1);
const decalMat = new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.9 });
decalMat.userData.shared = true;
const _n = new THREE.Vector3();
export function decal(point, normal, size = 0.16) {
  if (!normal) return;
  const m = new THREE.Mesh(decalGeo, decalMat);
  m.position.copy(point).addScaledVector(normal, 0.01);
  m.lookAt(_n.copy(m.position).add(normal));
  m.rotateZ(rand(0, 6));
  m.scale.setScalar(size * rand(0.8, 1.2));
  G.fxGroup.add(m);
  decals.push(m);
  if (decals.length > 80) G.fxGroup.remove(decals.shift());
}

// ---------- shell casings ----------
const casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.04, 6);
const casingMat = new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 0.9, roughness: 0.3 });
casingMat.userData.shared = true;
export function casing(pos, vel, color) {
  const m = new THREE.Mesh(casingGeo, color ? new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 }) : casingMat);
  if (color) m.scale.set(2.2, 1.6, 2.2);
  m.position.copy(pos);
  const v = vel.clone();
  let bounced = 0;
  addTimed(m, 1.6, (k, o, dt) => {
    v.y -= 18 * dt; o.position.addScaledVector(v, dt);
    o.rotation.x += dt * 14; o.rotation.z += dt * 9;
    const floor = groundY(o.position.x, o.position.z, o.position.y + 0.3);
    if (o.position.y < floor + 0.02 && v.y < 0) {
      o.position.y = floor + 0.02; v.y *= -0.35; v.x *= 0.5; v.z *= 0.5;
      if (bounced++ < 2 && Math.abs(v.y) > 0.6) clink();
    }
  }, (o) => { if (o.material !== casingMat) o.material.dispose(); });
}
let clinkFn = null;
export function setClink(f) { clinkFn = f; }
function clink() { clinkFn?.(); }

// ---------- death: enemies burn away into ash, Destiny style ----------
const _fallAxis = new THREE.Vector3(), _fallQ = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
export function dissolve(obj, color = 0xff8a2a, life = 0.75, { dir = null, flying = false } = {}) {
  const mats = [];
  obj.traverse((o) => {
    if (!o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (m.userData?.shared || mats.includes(m)) continue;
      m.transparent = true; m.depthWrite = false;
      mats.push(m);
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const ec = new THREE.Color(color);
  const sy = obj.scale.y;
  let ashT = 0;
  // the death throw: topple away from the shot (pivoting at the feet), slide back with a little hop
  const q0 = obj.quaternion.clone(), p0 = obj.position.clone();
  const d = dir ? dir.clone().setY(0) : null;
  if (d && d.lengthSq() > 1e-4) { d.normalize(); _fallAxis.crossVectors(_up, d).normalize(); }
  const axis = d ? _fallAxis.clone() : null, spin = rand(-1, 1);
  addTimed(obj, life, (k, o, dt) => {
    const t = 1 - k;
    if (axis) {
      const f = Math.min(1, t / 0.55), e = 1 - (1 - f) * (1 - f);
      _fallQ.setFromAxisAngle(axis, e * (flying ? 2.2 : 1.35));
      o.quaternion.copy(_fallQ).multiply(q0);
      if (flying) o.rotateY(spin * t * 6);
      o.position.set(p0.x + d.x * e * 0.8, p0.y + (flying ? -t * t * 3 : Math.sin(f * Math.PI) * 0.25), p0.z + d.z * e * 0.8);
    }
    for (const m of mats) {
      m.opacity = Math.min(1, k * 1.6);
      // the burn creeps in, so you can see the body fall before it goes white-hot
      if (m.emissive) { m.emissive.copy(ec); m.emissiveIntensity = axis ? 0.15 + Math.pow(t, 1.8) * 4.2 : 0.5 + t * 4; }
      else if (m.color && !m.map) m.color.lerp(ec, dt * 4);
    }
    if (!axis) { o.scale.y = sy * (1 - t * 0.25); o.position.y += dt * 0.4; }
    ashT -= dt;
    if (ashT <= 0) {
      ashT = 0.02;
      const p = new THREE.Vector3(center.x + rand(-0.5, 0.5) * size.x, box.min.y + rand(0, 1) * size.y, center.z + rand(-0.5, 0.5) * size.z);
      _burst(p, color, 2, 1.2, 0.07, 0.9, -3);
    }
  }, (o) => {
    o.traverse((c) => {
      if (c.geometry && c.geometry !== decalGeo) c.geometry.dispose();
      if (c.material && !c.material.userData?.shared && !c.isInstancedMesh) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
    });
  });
  flashLight(center, color, 25, Math.max(4, size.y * 3), 0.4);
}

export class Beam {
  constructor(color = 0xff2020, width = 0.05, opacity = 0.85) {
    this.w = width;
    this.m = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.m.visible = false;
    G.fxGroup.add(this.m);
  }
  set(a, b, w = this.w) {
    const len = a.distanceTo(b);
    this.m.position.copy(a).add(b).multiplyScalar(0.5);
    this.m.lookAt(b);
    this.m.scale.set(w, w, Math.max(0.01, len));
    this.m.visible = true;
  }
  hide() { this.m.visible = false; }
  dispose() { G.fxGroup.remove(this.m); this.m.material.dispose(); }
}

function _floatText(pos, text, o = {}) {
  const s = textSprite(text, o.height || 0.6, { color: o.color || pick(MEME_COLORS), font: o.font, px: 64 });
  s.position.copy(pos);
  const rise = o.rise ?? 1.0;
  const sx = s.scale.x, sy = s.scale.y;
  addTimed(s, o.life || 1.6, (k, obj, dt) => {
    obj.position.y += rise * dt;
    obj.material.opacity = Math.min(1, k * 3);
    const pop = 1 + Math.max(0, (k - 0.85)) * 3;
    obj.scale.set(sx * pop, sy * pop, 1);
  }, (obj) => obj.material.dispose());
  return s;
}

function _floatEmoji(pos, e, size = 1, life = 1.4, rise = 1.2) {
  const s = emojiSprite(e, size);
  s.position.copy(pos);
  addTimed(s, life, (k, obj, dt) => { obj.position.y += rise * dt; obj.material.opacity = Math.min(1, k * 3); }, (obj) => obj.material.dispose());
}

const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
function _ringFx(pos, radius, color = 0xb06cff, life = 0.5) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(pos); m.position.y += 0.05;
  addTimed(m, life, (k, o) => { const r = radius * (1 - k * 0.9); o.scale.set(r, r, r); o.material.opacity = k; }, (o) => o.material.dispose());
}

// Enemy arrival: a swirling portal opens facing you, spits the enemy out, and closes; a column of light + sparks.
const portalGeo = new THREE.PlaneGeometry(1, 1);
function portalMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOpen: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uT, uOpen; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0; float r = length(p), a = atan(p.y, p.x);
        float edge = smoothstep(1.0, 0.82, r) * smoothstep(0.0, 0.25, r);
        float swirl = 0.5 + 0.5 * sin(a * 5.0 + r * 9.0 - uT * 9.0);
        float core = smoothstep(0.55, 0.0, r);
        vec3 col = mix(vec3(0.55, 0.2, 1.0), vec3(1.0, 0.45, 0.95), swirl) * (0.8 + swirl * 0.6);
        col = mix(col, vec3(0.08, 0.0, 0.18), core * 0.85);
        float rim = smoothstep(0.75, 0.95, r) * smoothstep(1.0, 0.95, r);
        float alpha = (edge * (0.22 + swirl * 0.3) + rim * 1.0) * uOpen;
        gl_FragColor = vec4(col * alpha + vec3(1.0, 0.8, 1.0) * rim * uOpen * 0.6, alpha);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}
function _spawnFx(pos) {
  const p = pos.clone(); p.y += 1.1;
  const m = new THREE.Mesh(portalGeo, portalMat()); m.position.copy(p);
  addTimed(m, 1.0, (k, o, dt) => {
    const t = 1 - k;
    const open = t < 0.25 ? t / 0.25 : t > 0.7 ? (1 - t) / 0.3 : 1;
    o.material.uniforms.uT.value += dt; o.material.uniforms.uOpen.value = open;
    o.scale.setScalar(2.6 * (0.3 + 0.7 * open));
    o.lookAt(G.camera.position);
  }, (o) => o.material.dispose());
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xc08cff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  col.position.copy(pos).setY(pos.y + 3);
  addTimed(col, 0.7, (k, o) => { o.material.opacity = 0.3 * k; o.scale.set(k, 1, k); }, (o) => { o.geometry.dispose(); o.material.dispose(); });
  _burst(p, 0xb06cff, 14, 5, 0.12, 0.6, 2);
  _ringFx(pos, 2.5, 0xb06cff, 0.6);
  flashLight(p, 0xb06cff, 18, 8, 0.5);
}

// An attack tell: a star glint at a muzzle just before an enemy fires
function _glint(pos, color = 0xffffff) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(color).multiplyScalar(2.5), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, toneMapped: false }));
  s.position.copy(pos); s.renderOrder = 15;
  addTimed(s, 0.32, (k, o) => { const u = Math.sin((1 - k) * Math.PI); o.scale.setScalar(0.15 + u * 0.7); o.material.rotation += 0.1; o.material.opacity = u; }, (o) => o.material.dispose());
}

// ---------- DOM damage numbers ----------
const nums = [];
const _v = new THREE.Vector3();
export function dmgNumber(pos, val, cls = '') {
  const host = document.getElementById('dmgnums');
  const el = document.createElement('div');
  el.className = 'dn ' + cls; el.textContent = val;
  host.appendChild(el);
  nums.push({ el, pos: pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(0, 0.3), rand(-0.4, 0.4))), t: 0 });
  if (nums.length > 45) nums.shift().el.remove();
}

export function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.fxGroup.remove(p.m); if (p.streak) p.m.material.dispose(); parts.splice(i, 1); continue; }
    p.v.y -= p.grav * dt;
    if (p.drag) p.v.multiplyScalar(1 - Math.min(1, p.drag * dt));
    p.m.position.addScaledVector(p.v, dt);
    if (p.streak) {
      // stretched along its velocity: reads as a hot spark trail, not a dot
      const sp = p.v.length(), k = p.life / p.max;
      p.m.lookAt(_v.copy(p.m.position).add(p.v));
      p.m.scale.set(p.s * k, p.s * k, Math.max(p.s, sp * 0.035) * (0.4 + 0.6 * k));
      p.m.material.opacity = Math.min(1, k * 1.6);
      continue;
    }
    p.m.scale.setScalar(p.s * Math.min(1, (p.life / p.max) * 1.5));
    if (p.spin) p.m.rotation.x += dt * 5;
  }
  for (const l of lightPool) {
    if (l.userData.life <= 0) { l.intensity = 0; continue; }
    l.userData.life -= dt;
    l.intensity = l.userData.base * Math.max(0, l.userData.life / l.userData.max);
  }
  for (let i = timed.length - 1; i >= 0; i--) {
    const t = timed[i];
    t.life -= dt;
    if (t.life <= 0) { G.fxGroup.remove(t.obj); t.onEnd?.(t.obj); timed.splice(i, 1); continue; }
    t.update?.(t.life / t.max, t.obj, dt);
  }
  const W = innerWidth, H = innerHeight;
  for (let i = nums.length - 1; i >= 0; i--) {
    const d = nums[i];
    d.t += dt; d.pos.y += dt * 0.8;
    if (d.t > 1.0) { d.el.remove(); nums.splice(i, 1); continue; }
    _v.copy(d.pos).project(G.camera);
    if (_v.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = '';
    d.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * W}px, ${(-_v.y * 0.5 + 0.5) * H}px) translate(-50%,-50%)`;
    d.el.style.opacity = 1 - Math.max(0, (d.t - 0.6) / 0.4);
  }
}

export function clearFx() {
  for (const p of parts) G.fxGroup.remove(p.m);
  parts.length = 0;
  for (const t of timed) { G.fxGroup.remove(t.obj); t.onEnd?.(t.obj); }
  timed.length = 0;
  for (const d of nums) d.el.remove();
  nums.length = 0;
  decals.length = 0;
  for (const l of lightPool) { l.userData.life = 0; l.intensity = 0; }
  G.fxGroup.clear();
}

// ---------- co-op mirroring ----------
// On the host, world effects are mirrored to every client (unless we're inside local()).
function mirrored(name, f) {
  return (...a) => {
    if (shareable()) G.net.emit(['fx', name, a.map((v) => (v && v.isVector3 ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] : v))]);
    return f(...a);
  };
}
export const burst = mirrored('burst', _burst);
export const explosion = mirrored('explosion', _explosion);
export const tracer = mirrored('tracer', _tracer);
export const floatText = mirrored('floatText', _floatText);
export const floatEmoji = mirrored('floatEmoji', _floatEmoji);
export const ringFx = mirrored('ringFx', _ringFx);
export const spawnFx = mirrored('spawnFx', _spawnFx);
export const debrisM = mirrored('debris', debris);
export const glint = mirrored('glint', _glint);
// Applied on clients for mirrored fx events.
export function applyFx(name, args) {
  const raw = { glint: _glint, debris, burst: _burst, explosion: _explosion, tracer: _tracer, floatText: _floatText, floatEmoji: _floatEmoji, ringFx: _ringFx, spawnFx: _spawnFx }[name];
  if (!raw) return;
  raw(...args.map((v) => (Array.isArray(v) && v.length === 3 && typeof v[0] === 'number' ? new THREE.Vector3(v[0], v[1], v[2]) : v)));
}
