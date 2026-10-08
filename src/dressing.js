// Set dressing: dust, ground fog, light shafts, lamps, braziers, banners, rubble, consoles.
// Anything animated registers in G.worldAnims (cleared with the world).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G, rand, pick, local } from './game.js';
import { play } from './audio.js';
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
// One instanced mesh of camera-facing quads for the whole fog layer: one draw call instead of one per puff.
// Each instance's matrix carries its position and size; aRot spins the texture so puffs don't repeat.
export function groundFog({ count = 40, min = [-40, -40], max = [40, 40], y = 0.6, color = 0xb8c0d8, opacity = 0.35, size = [10, 18] } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const rot = new Float32Array(count); for (let i = 0; i < count; i++) rot[i] = rand(0, 6.28);
  geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
  const m = new THREE.MeshBasicMaterial({ map: fogTex, color, transparent: true, opacity, depthWrite: false, fog: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRot;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 sc = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        float c = cos(aRot), s = sin(aRot);
        vec2 q = position.xy * sc;
        mvPosition.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'fogBillboard';
  const mesh = new THREE.InstancedMesh(geo, m, count);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  const puffs = [];
  const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const sz = rand(size[0], size[1]);
    puffs.push({ x: rand(min[0], max[0]), y: y + rand(-0.2, 0.6), z: rand(min[1], max[1]), w: sz, h: sz * 0.35, v: rand(0.2, 0.6) * (Math.random() < 0.5 ? 1 : -1) });
  }
  const write = () => {
    puffs.forEach((p, i) => mesh.setMatrixAt(i, mtx.compose(pos.set(p.x, p.y, p.z), quat, scl.set(p.w, p.h, 1))));
    mesh.instanceMatrix.needsUpdate = true;
  };
  write(); add(mesh);
  animate((dt) => {
    for (const p of puffs) {
      p.x += p.v * dt;
      if (p.x > max[0]) p.x = min[0]; if (p.x < min[0]) p.x = max[0];
    }
    write();
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
function mesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; m.userData.static = true; add(m); return m; }

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

// ================================================================ architecture kit
// Dressing for plain collider geometry: columns, wall pilasters + panels + cornices, trimmed barriers, archways.
// None of these add collision unless stated; they wrap the boxes/cylinders the encounter already placed.

// A fluted column: plinth, moulded base, fluted shaft, capital, and a glowing ring at the top.
// Adds its own cylinder collider (same footprint as addCyl).
export function column(x, z, { h = 9, r = 1.3, color = 0x5d606a, accent = 0xff2244, collide = true } = {}) {
  const stone = std(color, { roughness: 0.75, metalness: 0.15 });
  const dark = std(new THREE.Color(color).multiplyScalar(0.6).getHex(), { roughness: 0.6, metalness: 0.4 });
  if (collide) addCyl(x, 0, z, r, h, stone).visible = false;
  mesh(rb(r * 2.7, 0.5, r * 2.7, 0.08), dark, x, 0.25, z);
  const base = mesh(new THREE.TorusGeometry(r * 1.08, r * 0.14, 8, 32), stone, x, 0.62, z); base.rotation.x = Math.PI / 2;
  // shaft with 16 flutes (scalloped radius)
  const shaft = new THREE.CylinderGeometry(r, r * 1.04, h - 1.6, 64, 1, true);
  const pa = shaft.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const px = pa.getX(i), pz = pa.getZ(i), a = Math.atan2(pz, px);
    const k = 1 - 0.07 * Math.pow(Math.max(0, Math.cos(a * 16)), 2);
    pa.setX(i, px * k); pa.setZ(i, pz * k);
  }
  shaft.computeVertexNormals();
  mesh(shaft, stone, x, 0.75 + (h - 1.6) / 2, z);
  const neck = mesh(new THREE.TorusGeometry(r * 1.02, r * 0.1, 8, 32), stone, x, h - 0.85, z); neck.rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(r * 1.45, r * 1.05, 0.45, 32), stone, x, h - 0.55, z);
  mesh(rb(r * 2.6, 0.35, r * 2.6, 0.06), dark, x, h - 0.17, z);
  if (accent != null) {
    const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 2.2 });
    const ring = mesh(new THREE.TorusGeometry(r * 1.47, 0.05, 6, 40), glow, x, h - 0.33, z); ring.rotation.x = Math.PI / 2; ring.castShadow = false;
  }
}

// Pilasters + recessed panels + cornice + baseboard + little wall lamps along one wall face.
// (x1,z1)->(x2,z2) runs along the wall's inner face; `inward` is +1/-1: which side of the line the room is on
// (+1 = the left-hand normal (-dz, dx) of the A->B direction points into the room).
export function wallDress(x1, z1, x2, z2, { h = 12, every = 8, inward = 1, color = 0x45484f, accent = 0xffb070, lamps = true } = {}) {
  const A = new THREE.Vector3(x1, 0, z1), B = new THREE.Vector3(x2, 0, z2);
  const len = A.distanceTo(B), dir = B.clone().sub(A).normalize();
  const nrm = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(inward);
  const rotY = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  const n = Math.max(1, Math.round(len / every)), step = len / n;
  const pil = std(color, { roughness: 0.7, metalness: 0.2 });
  const panel = std(new THREE.Color(color).multiplyScalar(0.72).getHex(), { roughness: 0.85 });
  const trim = std(new THREE.Color(color).multiplyScalar(1.25).getHex(), { roughness: 0.5, metalness: 0.5 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), one = new THREE.Vector3(1, 1, 1);
  const inst = (geo, mat, count, fill) => { const im = new THREE.InstancedMesh(geo, mat, count); im.castShadow = im.receiveShadow = true; for (let i = 0; i < count; i++) im.setMatrixAt(i, fill(i)); add(im); return im; };
  const at = (t, out, off = 0, y = 0) => out.copy(A).addScaledVector(dir, t).addScaledVector(nrm, off).setY(y);
  const P = new THREE.Vector3();
  // pilasters at every bay boundary
  inst(rb(1.3, h, 0.7, 0.06), pil, n + 1, (i) => m4.compose(at(i * step, P, 0.35, h / 2), q, one));
  inst(rb(1.7, 0.6, 1.0, 0.06), trim, n + 1, (i) => m4.compose(at(i * step, P, 0.5, h - 0.7), q, one));
  inst(rb(1.6, 0.8, 0.95, 0.06), trim, n + 1, (i) => m4.compose(at(i * step, P, 0.47, 0.4), q, one));
  // a recessed panel (two, stacked) in each bay
  const pw = step - 2.2;
  if (pw > 0.8) {
    inst(rb(pw, h * 0.42, 0.12, 0.04), panel, n * 2, (i) => m4.compose(at((Math.floor(i / 2) + 0.5) * step, P, 0.06, i % 2 ? h * 0.71 : h * 0.29), q, one));
    inst(rb(pw + 0.3, 0.18, 0.2, 0.04), trim, n, (i) => m4.compose(at((i + 0.5) * step, P, 0.1, h * 0.5), q, one));
  }
  // cornice + baseboard the whole length
  const cor = mesh(rb(len, 0.5, 0.9, 0.08), trim, 0, 0, 0); at(len / 2, cor.position, 0.45, h - 0.25); cor.quaternion.copy(q);
  const bb = mesh(rb(len, 0.35, 0.35, 0.05), trim, 0, 0, 0); at(len / 2, bb.position, 0.17, 0.17); bb.quaternion.copy(q);
  // small warm lamps on alternate pilasters
  if (lamps) {
    const lm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 3 });
    inst(rb(0.35, 0.7, 0.2, 0.05), lm, Math.ceil((n + 1) / 2), (i) => m4.compose(at(i * 2 * step, P, 0.78, h * 0.62), q, one)).castShadow = false;
  }
}

// Hazard stripes (yellow/black), shared
const hazardTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#e8b400'; x.fillRect(0, 0, 128, 32);
  x.fillStyle = '#151515';
  for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 8, 32); x.lineTo(i * 16 + 24, 0); x.lineTo(i * 16 + 16, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
})();
// Dress a cover box that already exists as a collider: metal cap, kick plate, a hazard band, corner posts.
export function barrier(x, z, w, h, d, { color = 0x55504a, y = 0 } = {}) {
  const metal = std(0x3a3d44, { metalness: 0.75, roughness: 0.4 });
  mesh(rb(w + 0.16, 0.16, d + 0.16, 0.05), metal, x, y + h + 0.02, z);
  mesh(rb(w + 0.1, 0.22, d + 0.1, 0.04), std(0x222428, { roughness: 0.6, metalness: 0.4 }), x, y + 0.11, z);
  const t = hazardTex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round((w + d) / 1.2)), 1);
  const band = mesh(new THREE.BoxGeometry(w + 0.04, 0.22, d + 0.04), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), x, y + h * 0.72, z);
  band.castShadow = false;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(rb(0.18, h + 0.05, 0.18, 0.04), metal, x + sx * (w / 2 + 0.02), y + h / 2, z + sz * (d / 2 + 0.02));
}

// A monumental arch around a doorway: two tall piers, a stepped lintel, glowing inset lines.
export function archway(x, z, w, h, { depth = 3, color = 0x4a4d57, accent = 0xff2244, rotY = 0 } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; add(g);
  const stone = std(color, { roughness: 0.7, metalness: 0.2 });
  const dark = std(new THREE.Color(color).multiplyScalar(0.55).getHex(), { roughness: 0.6, metalness: 0.5 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 2.5 });
  const put = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  for (const s of [-1, 1]) {
    put(rb(2.4, h + 3, depth, 0.1), stone, s * (w / 2 + 1.2), (h + 3) / 2, 0);
    put(rb(2.8, 1, depth + 0.4, 0.1), dark, s * (w / 2 + 1.2), 0.5, 0);
    put(new THREE.BoxGeometry(0.12, h + 1, 0.06), glow, s * (w / 2 + 0.2), (h + 1) / 2 + 0.5, depth / 2 + 0.02).castShadow = false;
  }
  put(rb(w + 5.6, 1.2, depth + 0.6, 0.1), dark, 0, h + 3.4, 0);
  put(rb(w + 3.6, 0.8, depth + 0.3, 0.08), stone, 0, h + 4.4, 0);
  put(new THREE.BoxGeometry(w + 0.4, 0.12, 0.06), glow, 0, h + 0.4, depth / 2 + 0.02).castShadow = false;
  return g;
}

// A window out to space: a framed panel showing stars, a nebula and (optionally) a ringed planet.
// Sits just in front of a wall face; purely visual.
function spaceTex(planet) {
  const W = 1024, H = 384, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#02030a'); bg.addColorStop(1, '#070a1a');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // nebula: soft overlapping blobs
  for (let i = 0; i < 26; i++) {
    const cx = rand(0, W), cy = rand(0, H), r = rand(40, 160);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const col = pick(['80,40,140', '30,80,160', '160,40,110', '40,120,140']);
    g.addColorStop(0, `rgba(${col},0.16)`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  for (let i = 0; i < 900; i++) { const b = Math.random(); x.fillStyle = `rgba(255,255,255,${0.2 + b * 0.8})`; const s = b > 0.97 ? 2.2 : b > 0.85 ? 1.4 : 0.8; x.fillRect(rand(0, W), rand(0, H), s, s); }
  if (planet) {
    const px = W * 0.68, py = H * 0.62, pr = H * 0.42;
    const g = x.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    g.addColorStop(0, '#f2b98a'); g.addColorStop(0.5, '#b0583a'); g.addColorStop(1, '#2a0e10');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 0.18; for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#fff0d0' : '#6a2010'; x.fillRect(px - pr, py - pr * 0.6 + i * pr * 0.14, pr * 2, pr * 0.05); } x.globalAlpha = 1;
    x.strokeStyle = 'rgba(255,220,180,0.55)'; x.lineWidth = 6; x.beginPath(); x.ellipse(px, py, pr * 1.7, pr * 0.32, -0.2, 0, Math.PI * 2); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function spaceWindow(x, y, z, rotY, { w = 12, h = 5, planet = true } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; add(g);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: spaceTex(planet), fog: false, toneMapped: false }));
  view.position.z = 0.02; g.add(view);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.12, envMapIntensity: 1.5 }));
  glass.position.z = 0.12; g.add(glass);
  const frame = std(0x2a2f3a, { metalness: 0.8, roughness: 0.35 });
  const put = (geo, px, py) => { const o = new THREE.Mesh(geo, frame); o.position.set(px, py, 0.15); o.castShadow = true; g.add(o); };
  put(rb(w + 0.6, 0.4, 0.4, 0.06), 0, h / 2 + 0.2); put(rb(w + 0.6, 0.5, 0.5, 0.06), 0, -h / 2 - 0.25);
  put(rb(0.4, h, 0.4, 0.06), -w / 2 - 0.1, 0); put(rb(0.4, h, 0.4, 0.06), w / 2 + 0.1, 0);
  for (let i = 1; i < Math.round(w / 4); i++) put(rb(0.18, h, 0.25, 0.04), -w / 2 + i * w / Math.round(w / 4), 0);
  // a cold rim of light spilling in
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(w, 3), new THREE.MeshBasicMaterial({ color: 0x3a6aa0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  spill.rotation.x = -Math.PI / 2; spill.position.set(0, -y + 0.03, 1.6); g.add(spill);
}

// Open roof framework: beams across the room with glowing light panels slung underneath.
export function ceilingTruss(x1, x2, z1, z2, y, { every = 10, accent = 0xcfeeff } = {}) {
  const steel = std(0x2e333e, { metalness: 0.8, roughness: 0.4 });
  const light = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: accent, emissiveIntensity: 2.6 });
  const W = x2 - x1, D = z2 - z1;
  for (let z = z1 + every / 2; z < z2; z += every) {
    mesh(rb(W, 0.5, 0.35, 0.05), steel, (x1 + x2) / 2, y, z);
    mesh(rb(W, 0.12, 0.12, 0.03), steel, (x1 + x2) / 2, y - 0.9, z);
    for (let x = x1 + 2; x < x2; x += 4) { const d = mesh(rb(0.1, 1.1, 0.1, 0.02), steel, x, y - 0.45, z); d.rotation.z = (Math.floor(x) % 8 < 4 ? 1 : -1) * 0.6; }
    for (let x = x1 + every / 2; x < x2; x += every) { const l = mesh(rb(3.2, 0.12, 0.7, 0.04), light, x, y - 1.05, z); l.castShadow = false; }
  }
  for (const x of [x1 + 0.5, x2 - 0.5]) mesh(rb(0.4, 0.4, D, 0.05), steel, x, y, (z1 + z2) / 2);
}

// A round cafeteria table on a pedestal, optionally ringed by a bench.
export function cafeTable(x, z, { r = 1.6, h = 1.0, bench = true } = {}) {
  const top = std(0xc8d2e2, { metalness: 0.35, roughness: 0.35 }), dark = std(0x39404e, { metalness: 0.7, roughness: 0.4 });
  mesh(new THREE.CylinderGeometry(r, r * 0.97, 0.14, 40), top, x, h - 0.07, z);
  mesh(new THREE.TorusGeometry(r, 0.05, 6, 40), dark, x, h - 0.07, z).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.24, h - 0.14, 16), dark, x, (h - 0.14) / 2, z);
  mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.55, 0.08, 24), dark, x, 0.04, z);
  if (bench) {
    const br = r + 0.95, seat = std(0x2c6fd6, { roughness: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(br, 0.28, 6, 48, Math.PI * 1.6), seat);
    ring.rotation.set(Math.PI / 2, 0, 0.3); ring.position.set(x, 0.5, z); ring.scale.set(1, 1, 0.45); ring.castShadow = true; ring.userData.static = true; add(ring);
  }
}

// The glass dome over the emergency button.
export function glassDome(x, y, z, r = 0.8) {
  const g = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 0.0, transparent: true, opacity: 0.22, envMapIntensity: 2.2 }));
  g.position.set(x, y, z); add(g);
  mesh(new THREE.TorusGeometry(r, 0.04, 6, 32), std(0xb0b8c8, { metalness: 0.9, roughness: 0.25 }), x, y + 0.02, z).rotation.x = Math.PI / 2;
}

// Railings around the top edge of a platform (w x d, top at height h).
export function railing(x, z, w, d, h, { color = 0x8a93a6 } = {}) {
  const m = std(color, { metalness: 0.85, roughness: 0.3 });
  const post = (px, pz) => mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), m, px, h + 0.5, pz);
  const _d = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
  const bar = (ax, az, bx, bz, y) => {
    const len = Math.hypot(bx - ax, bz - az);
    const o = mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), m, (ax + bx) / 2, y, (az + bz) / 2);
    o.quaternion.setFromUnitVectors(_u, _d.set(bx - ax, 0, bz - az).normalize());
  };
  const hw = w / 2 - 0.1, hd = d / 2 - 0.1;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2));
    for (let k = 0; k < n; k++) post(x + ax + (bx - ax) * k / n, z + az + (bz - az) * k / n);
    bar(x + ax, z + az, x + bx, z + bz, h + 1.0); bar(x + ax, z + az, x + bx, z + bz, h + 0.55);
  }
}

// Birds (or bats) circling overhead: little bodies with flapping wings, each on its own orbit, gliding now and then.
export function birds({ center = [0, 0, 0], count = 12, radius = [20, 45], height = [18, 30], color = 0x1a1a1f, bats = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute(bats ? [0, 0, 0.12, 0, 0, -0.12, 0.7, 0.05, -0.05, 0, 0, 0.12, 0.7, 0.05, -0.05, 0.45, -0.05, 0.15] : [0, 0, 0.15, 0, 0, -0.12, 0.8, 0.02, -0.18], 3));
  wingGeo.computeVertexNormals();
  const bodyGeo = new THREE.CapsuleGeometry(0.08, 0.3, 3, 6).rotateX(Math.PI / 2);
  const list = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyGeo, mat));
    const L = new THREE.Mesh(wingGeo, mat), Rw = new THREE.Mesh(wingGeo, mat); Rw.scale.x = -1;
    g.add(L, Rw);
    const s = rand(0.9, 1.4) * (bats ? 0.8 : 1); g.scale.setScalar(s);
    add(g);
    list.push({ g, L, R: Rw, r: rand(radius[0], radius[1]), h: rand(height[0], height[1]), a: rand(0, 6.28), w: rand(0.12, 0.3) * (Math.random() < 0.5 ? 1 : -1), ph: rand(0, 6), flap: bats ? rand(14, 18) : rand(7, 10), glideT: rand(0, 4) });
  }
  let t = 0;
  animate((dt) => {
    t += dt;
    for (const b of list) {
      b.a += b.w * dt;
      const x = center[0] + Math.cos(b.a) * b.r, z = center[2] + Math.sin(b.a) * b.r, y = center[1] + b.h + Math.sin(t * 0.7 + b.ph) * 1.5;
      b.g.position.set(x, y, z);
      b.g.rotation.y = Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w)) ;
      b.g.rotation.z = -Math.sign(b.w) * 0.25; // bank into the turn
      b.glideT -= dt;
      if (b.glideT < -2.5) b.glideT = rand(2, 5);
      const flapping = bats || b.glideT > 0;
      const f = flapping ? Math.sin(t * b.flap + b.ph) * 0.8 : 0.12;
      b.L.rotation.z = f; b.R.rotation.z = -f;
    }
  });
}

// ---------------- weather ----------------
// Precipitation that follows the camera (so it's "everywhere" for the price of a box around you).
// kind 'rain': fast streaks (line segments) with splashes; 'ash'/'snow': slow drifting flakes (points).
export function weather(kind = 'rain', { count = 2600, box = [36, 22, 36], color = 0xaec4e0, wind = [2, 0], speed = 22, opacity = 0.45 } = {}) {
  const [bx, by, bz] = box;
  const pos = new Float32Array(count * 3), rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = (Math.random() - 0.5) * bx; pos[i * 3 + 1] = Math.random() * by; pos[i * 3 + 2] = (Math.random() - 0.5) * bz; rnd[i] = Math.random(); }
  let obj, geo;
  if (kind === 'rain') {
    const seg = new Float32Array(count * 6);
    geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(seg, 3));
    obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: true }));
  } else {
    geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    obj = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: kind === 'ash' ? 0.09 : 0.07, transparent: true, opacity, depthWrite: false, map: glowTex, blending: kind === 'ash' ? THREE.NormalBlending : THREE.AdditiveBlending }));
  }
  obj.frustumCulled = false; add(obj);
  let splashT = 0, t = 0;
  animate((dt) => {
    t += dt;
    const cam = G.camera.position, a = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (kind === 'rain') { y -= speed * dt * (0.8 + rnd[i] * 0.4); x += wind[0] * dt; z += wind[1] * dt; }
      else { y -= speed * dt * (0.5 + rnd[i]); x += (wind[0] + Math.sin(t * 0.7 + rnd[i] * 20) * 0.8) * dt; z += (wind[1] + Math.cos(t * 0.6 + rnd[i] * 17) * 0.8) * dt; }
      if (y < 0) y += by;
      x = ((x + bx / 2) % bx + bx) % bx - bx / 2; z = ((z + bz / 2) % bz + bz) % bz - bz / 2;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const wx = cam.x + x, wy = cam.y - by * 0.35 + y, wz = cam.z + z;
      if (kind === 'rain') {
        const len = 0.55 + rnd[i] * 0.4;
        a[i * 6] = wx; a[i * 6 + 1] = wy; a[i * 6 + 2] = wz;
        a[i * 6 + 3] = wx - wind[0] * 0.03; a[i * 6 + 4] = wy + len; a[i * 6 + 5] = wz - wind[1] * 0.03;
      } else { a[i * 3] = wx; a[i * 3 + 1] = wy; a[i * 3 + 2] = wz; }
    }
    geo.attributes.position.needsUpdate = true;
    // splashes around your feet
    if (kind === 'rain' && (splashT -= dt) <= 0) {
      splashT = 0.03;
      const sx = cam.x + (Math.random() - 0.5) * 18, sz = cam.z + (Math.random() - 0.5) * 18;
      const gy = groundAt(sx, sz, cam.y + 2);
      if (gy > -50) splashFx(sx, gy, sz, color);
    }
  });
  return obj;
}
// a tiny ring + droplets where rain lands (pooled; no allocations per splash)
const splashPool = [];
function splashFx(x, y, z, color) {
  let s = splashPool.find((q) => q.t <= 0);
  if (!s) {
    if (splashPool.length > 40) return;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 12), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; add(m);
    s = { m, t: 0 }; splashPool.push(s);
    animate((dt) => { if (s.t <= 0) { s.m.visible = false; return; } s.t -= dt; const k = 1 - s.t / 0.35; s.m.visible = true; s.m.scale.setScalar(1 + k * 3); s.m.material.opacity = (1 - k) * 0.5; });
  }
  s.t = 0.35; s.m.position.set(x, y + 0.03, z);
}
function groundAt(x, z, from) {
  let best = -99;
  for (const b of G.colliders) if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= from && b.max.y > best) best = b.max.y;
  return best;
}
// Lightning: the sky and the world flash, then thunder rolls in a beat later
export function lightning({ every = [8, 18], color = 0xcfe0ff } = {}) {
  const l = new THREE.DirectionalLight(color, 0); l.position.set(20, 60, -30); add(l);
  let next = rand(every[0] * 0.5, every[1] * 0.5), flash = 0, pending = null;
  animate((dt) => {
    next -= dt;
    if (next <= 0) { next = rand(every[0], every[1]); flash = 1; pending = rand(0.4, 1.8); }
    if (pending !== null && (pending -= dt) <= 0) { pending = null; if (G.state === 'playing') thunder(); }
    flash = Math.max(0, flash - dt * 3.5);
    const f = flash > 0.6 ? 1 : flash > 0.4 ? 0.2 : flash; // a double flicker
    l.intensity = f * 3.5;
  });
}
const thunder = () => local(() => play('thunder'));
