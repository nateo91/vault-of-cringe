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
export function dissolve(obj, color = 0xff8a2a, life = 0.75) {
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
  addTimed(obj, life, (k, o, dt) => {
    const t = 1 - k;
    for (const m of mats) {
      m.opacity = Math.min(1, k * 1.6);
      if (m.emissive) { m.emissive.copy(ec); m.emissiveIntensity = 0.5 + t * 4; }
      else if (m.color && !m.map) m.color.lerp(ec, dt * 4);
    }
    o.scale.y = sy * (1 - t * 0.25);
    o.position.y += dt * 0.4;
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

function _spawnFx(pos) {
  const p = pos.clone(); p.y += 1;
  _burst(p, 0xb06cff, 14, 5, 0.18, 0.6, 2);
  _ringFx(pos, 2.5, 0xb06cff, 0.6);
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
    if (p.life <= 0) { G.fxGroup.remove(p.m); parts.splice(i, 1); continue; }
    p.v.y -= p.grav * dt;
    if (p.drag) p.v.multiplyScalar(1 - Math.min(1, p.drag * dt));
    p.m.position.addScaledVector(p.v, dt);
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
// Applied on clients for mirrored fx events.
export function applyFx(name, args) {
  const raw = { debris, burst: _burst, explosion: _explosion, tracer: _tracer, floatText: _floatText, floatEmoji: _floatEmoji, ringFx: _ringFx, spawnFx: _spawnFx }[name];
  if (!raw) return;
  raw(...args.map((v) => (Array.isArray(v) && v.length === 3 && typeof v[0] === 'number' ? new THREE.Vector3(v[0], v[1], v[2]) : v)));
}
