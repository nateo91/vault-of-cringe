// Set dressing: dust, ground fog, light shafts, lamps, braziers, banners, rubble, consoles.
// Anything animated registers in G.worldAnims (cleared with the world).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G, rand, pick } from './game.js';
import { add, addBox, addCyl, std, pointLight } from './world.js';
import { textTex, emojiTex, IMPACT } from './textures.js';
import { glowTex } from './fx.js';

export function animate(fn) { (G.worldAnims ||= []).push(fn); }
export function updateDressing(dt) { for (const f of G.worldAnims || []) f(dt); }
export function clearDressing() { G.worldAnims = []; }

// ---------- floating dust motes that catch the light ----------
export function dust({ count = 600, min = [-40, 0.3, -40], max = [40, 9, 40], color = 0xfff1d0, size = 0.06, opacity = 0.55 } = {}) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(min[0], max[0]); pos[i * 3 + 1] = rand(min[1], max[1]); pos[i * 3 + 2] = rand(min[2], max[2]);
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color, size, map: glowTex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const p = add(new THREE.Points(g, m));
  let t = 0;
  animate((dt) => {
    t += dt;
    const a = g.attributes.position.array;
    for (let i = 0; i < count; i++) {
      a[i * 3] += Math.sin(t * 0.3 + seed[i]) * 0.08 * dt;
      a[i * 3 + 1] += (Math.sin(t * 0.21 + seed[i] * 1.7) * 0.06 + 0.02) * dt;
      a[i * 3 + 2] += Math.cos(t * 0.27 + seed[i]) * 0.08 * dt;
      if (a[i * 3 + 1] > max[1]) a[i * 3 + 1] = min[1];
    }
    g.attributes.position.needsUpdate = true;
  });
  return p;
}

// ---------- low rolling ground fog (big soft sprites) ----------
const fogTex = (() => {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const gx = rand(30, 98), gy = rand(40, 88), r = rand(18, 40);
    const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export function groundFog({ count = 40, min = [-40, -40], max = [40, 40], y = 0.6, color = 0xb8c0d8, opacity = 0.35, size = [10, 18] } = {}) {
  const sprites = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: fogTex, color, transparent: true, opacity, depthWrite: false, fog: true });
    const s = new THREE.Sprite(m);
    const sz = rand(size[0], size[1]);
    s.scale.set(sz, sz * 0.35, 1);
    s.position.set(rand(min[0], max[0]), y + rand(-0.2, 0.6), rand(min[1], max[1]));
    s.userData.v = rand(0.2, 0.6) * (Math.random() < 0.5 ? 1 : -1);
    m.rotation = rand(0, 6);
    add(s); sprites.push(s);
  }
  animate((dt) => {
    for (const s of sprites) {
      s.position.x += s.userData.v * dt;
      if (s.position.x > max[0]) s.position.x = min[0]; if (s.position.x < min[0]) s.position.x = max[0];
    }
  });
}

// ---------- light shaft (fake volumetric cone) ----------
const shaftTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 128);
  const h = x.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 128);
  return new THREE.CanvasTexture(c);
})();
export function lightShaft(x, y, z, { height = 10, top = 0.6, bottom = 3, color = 0xffe2b0, opacity = 0.18, tilt = 0 } = {}) {
  const m = new THREE.MeshBasicMaterial({ map: shaftTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 24, 1, true), m);
  cone.position.set(x, y - height / 2, z); cone.rotation.z = tilt;
  add(cone);
  let t = rand(0, 6);
  animate((dt) => { t += dt; m.opacity = opacity * (0.85 + Math.sin(t * 0.7) * 0.15); });
  return cone;
}

// ---------- props ----------
const rb = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
function mesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; add(m); return m; }

export function lamp(x, z, { color = 0xffc070, height = 4.5, base = 0x2a2a30 } = {}) {
  const metal = std(base, { metalness: 0.8, roughness: 0.35 });
  addCyl(x, 0, z, 0.12, height, metal, { seg: 10 });
  addBox(x, 0, z, 0.6, 0.25, 0.6, metal);
  const head = mesh(rb(0.5, 0.35, 0.5, 0.06), metal, x, height + 0.15, z);
  mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4 }), x, height - 0.05, z);
  pointLight(x, height - 0.3, z, color, 18, 14);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
  glow.scale.setScalar(1.6); glow.position.set(x, height - 0.05, z); add(glow);
  lightShaft(x, height - 0.1, z, { height: height - 0.2, top: 0.25, bottom: 2.2, color, opacity: 0.12 });
  return head;
}

export function brazier(x, z, { color = 0xff7a20, y = 0 } = {}) {
  const stone = std(0x55505a, { roughness: 0.95, flatShading: true });
  addCyl(x, y, z, 0.7, 1.1, stone, { seg: 8, rTop: 0.55 });
  mesh(new THREE.CylinderGeometry(0.8, 0.6, 0.3, 8), stone, x, y + 1.25, z);
  const lightObj = pointLight(x, y + 2.2, z, color, 30, 16);
  const flames = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i < 2 ? 0xfff0b0 : color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(x + rand(-0.25, 0.25), y + 1.5, z + rand(-0.25, 0.25)); add(s); flames.push({ s, ph: rand(0, 6), k: i < 2 ? 0.7 : 1.3 });
  }
  let t = 0;
  animate((dt) => {
    t += dt;
    lightObj.intensity = 26 + Math.sin(t * 17) * 4 + Math.sin(t * 7.3) * 5;
    for (const f of flames) {
      const u = (t * 1.6 + f.ph) % 1;
      f.s.position.y = y + 1.45 + u * 1.3 * f.k;
      f.s.scale.setScalar((1 - u) * 0.9 * f.k + 0.15);
      f.s.material.opacity = 1 - u;
    }
  });
}

export function banner(x, y, z, rotY, { color = 0xaa1020, emblem = null, text = null, w = 2.4, h = 5 } = {}) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(color).getHexString(); g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 8, 256); g.fillRect(120, 0, 8, 256);
  g.fillStyle = '#e8c35a'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 230, 128, 6);
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 32, 256); g.lineTo(i * 32 + 16, 236); g.lineTo(i * 32 + 32, 256); g.fillStyle = '#000'; g.fill(); }
  if (emblem) { g.font = '72px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emblem, 64, 110); }
  if (text) { g.font = `bold 26px Impact, Anton, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(text, 64, 190); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(w, h, 6, 12);
  const m = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 });
  const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); b.rotation.y = rotY; b.castShadow = true; add(b);
  const rod = mesh(new THREE.CylinderGeometry(0.05, 0.05, w + 0.4, 8), std(0xc9a24b, { metalness: 0.9, roughness: 0.3 }), 0, 0, 0);
  rod.rotation.z = Math.PI / 2; rod.position.set(x, y + h / 2, z); rod.rotation.y = rotY; rod.rotateZ(0);
  rod.rotation.set(0, rotY, Math.PI / 2);
  // cloth ripple
  const pos = geo.attributes.position, base = pos.array.slice();
  let tt = rand(0, 6);
  animate((dt) => {
    tt += dt;
    for (let i = 0; i < pos.count; i++) {
      const by = base[i * 3 + 1], bx = base[i * 3];
      const k = (h / 2 - by) / h;
      pos.array[i * 3 + 2] = Math.sin(tt * 1.6 + by * 0.9 + bx * 0.6) * 0.12 * k;
    }
    pos.needsUpdate = true;
  });
  return b;
}

export function rubble(x, z, { n = 8, r = 1.6, color = 0x6a6570 } = {}) {
  const m = std(color, { roughness: 1, flatShading: true });
  for (let i = 0; i < n; i++) {
    const s = rand(0.15, 0.55);
    const rock = mesh(new THREE.DodecahedronGeometry(s, 0), m, x + rand(-r, r), s * 0.5, z + rand(-r, r));
    rock.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  }
}

export function crate(x, z, { s = 1.6, color = 0x6a5a48, y = 0, stripe = 0xffb020 } = {}) {
  const body = std(color, { roughness: 0.85 });
  const m = new THREE.Mesh(rb(s, s, s, 0.08), body); m.position.set(x, y + s / 2, z); m.castShadow = m.receiveShadow = true; add(m);
  addBox(x, y, z, s, s, s, body, { collide: true }).visible = false;
  const tr = std(stripe, { roughness: 0.5, metalness: 0.3 });
  for (const sy of [0.12, s - 0.12]) { const b = mesh(rb(s + 0.04, 0.1, s + 0.04, 0.03), tr, x, y + sy, z); }
}

// A wall console with a screen that flickers through meme text
export function console_(x, z, rotY, { lines = ['SUS LEVEL: HIGH', 'TASKS: 3/9', 'VENT: CLOGGED'], color = '#7dffb2' } = {}) {
  const body = std(0x2a2e38, { metalness: 0.6, roughness: 0.4 });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; add(g);
  const b = new THREE.Mesh(rb(1.6, 1.3, 0.6, 0.06), body); b.position.y = 0.65; b.castShadow = true; g.add(b);
  const top = new THREE.Mesh(rb(1.6, 0.9, 0.2, 0.05), body); top.position.set(0, 1.55, -0.15); top.rotation.x = -0.4; g.add(top);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: t }));
  scr.position.set(0, 1.58, -0.04); scr.rotation.x = -0.4; g.add(scr);
  let i = 0, acc = 0;
  const draw = () => {
    const x2 = c.getContext('2d');
    x2.fillStyle = '#04120c'; x2.fillRect(0, 0, 256, 128);
    x2.fillStyle = color; x2.font = 'bold 22px monospace';
    for (let k = 0; k < 3; k++) x2.fillText(lines[(i + k) % lines.length], 10, 34 + k * 34);
    for (let y = 0; y < 128; y += 4) { x2.fillStyle = 'rgba(0,0,0,0.25)'; x2.fillRect(0, y, 256, 2); }
    t.needsUpdate = true;
  };
  draw();
  animate((dt) => { acc += dt; if (acc > 1.5) { acc = 0; i++; draw(); } });
  addBox(x, 0, z, 1.4, 1.2, 1.4, std(0), { collide: true }).visible = false;
}

export function pipeRun(x1, y, z1, x2, z2, { r = 0.15, color = 0x5a6070 } = {}) {
  const m = std(color, { metalness: 0.7, roughness: 0.35 });
  const a = new THREE.Vector3(x1, y, z1), b = new THREE.Vector3(x2, y, z2);
  const len = a.distanceTo(b);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
  p.position.copy(a).add(b).multiplyScalar(0.5);
  p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  p.castShadow = true; add(p);
  for (let k = 0.1; k < 1; k += 0.2) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.12, 10), m); c.position.copy(a).lerp(b, k); c.quaternion.copy(p.quaternion); add(c); }
}

// Glowing trim strip along the base of walls
export function trimStrip(x, z, w, d, color, y = 0.05) {
  const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.2 });
  const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), m); s.position.set(x, y, z); add(s);
}

// Floating chunks of ground drifting in the void (Ohio)
export function floatingRocks({ count = 30, rMin = 40, rMax = 90, color = 0x6a5a78 } = {}) {
  const m = std(color, { roughness: 1, flatShading: true });
  const rocks = [];
  for (let i = 0; i < count; i++) {
    const s = rand(0.8, 4);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), m);
    const a = rand(0, Math.PI * 2), r = rand(rMin, rMax);
    rock.position.set(Math.cos(a) * r, rand(-25, 20), Math.sin(a) * r);
    rock.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    rock.userData = { bob: rand(0, 6), spin: rand(-0.2, 0.2) };
    add(rock); rocks.push(rock);
  }
  let t = 0;
  animate((dt) => { t += dt; for (const r of rocks) { r.position.y += Math.sin(t * 0.4 + r.userData.bob) * 0.15 * dt; r.rotation.y += r.userData.spin * dt; } });
}
