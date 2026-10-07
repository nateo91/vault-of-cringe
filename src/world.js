// Arena building blocks + AABB collision.
import * as THREE from 'three';
import { G } from './game.js';
import { makeSky } from './render.js';
import { normalMapFor } from './textures.js';
import { addSurfaceDetail } from './surface.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function std(color, o = {}) {
  const { detail = true, ...mo } = o;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, ...mo });
  // tiled surfaces get a matching normal map so grout lines and grime catch the light
  if (o.map && o.normalMap === undefined && o.map.image?.getContext) {
    m.normalMap = normalMapFor(o.map); m.normalScale.set(0.8, 0.8);
  }
  // static scenery gets world-space grime/roughness/bump (moving things pass detail: false so it doesn't swim)
  if (detail) addSurfaceDetail(m, detail === true ? {} : detail);
  return m;
}

export function clearWorld() {
  G.worldGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !o.material.userData?.shared) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
  G.worldGroup.clear();
  G.colliders.length = 0;
  G.scene.fog = null;
  G.sun = null;
  G.worldAnims = [];
}

// small bevels so edges catch a highlight instead of looking like perfect CG boxes
const boxGeo = (w, h, d) => {
  const r = Math.min(0.07, Math.min(w, h, d) * 0.22);
  return r < 0.012 || (G.settings.quality || 'high') === 'low' ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
};
export function addBox(x, y, z, w, h, d, mat, { collide = true, shadow = true } = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow; m.receiveShadow = true;
  G.worldGroup.add(m);
  if (collide) {
    const b = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2));
    G.colliders.push(b);
    m.userData.box = b;
  }
  return m;
}

export function addCyl(x, y, z, r, h, mat, { collide = true, seg = 20, rTop = r } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  G.worldGroup.add(m);
  if (collide) {
    const k = Math.max(r, rTop) * 0.82;
    const b = new THREE.Box3(new THREE.Vector3(x - k, y, z - k), new THREE.Vector3(x + k, y + h, z + k));
    G.colliders.push(b);
    m.userData.box = b;
  }
  return m;
}

export function removeCollider(b) { const i = G.colliders.indexOf(b); if (i >= 0) G.colliders.splice(i, 1); }
export function add(o) { G.worldGroup.add(o); return o; }

export function setEnv({ sky = 0x101018, fog = sky, near = 40, far = 180, hemi = [0x9aa8ff, 0x2a2018, 0.7], sun = { color: 0xffffff, int: 1.6, pos: [30, 60, 20] }, shadowSize = 60, dome = {} } = {}) {
  const skyC = new THREE.Color(sky), fogC = new THREE.Color(fog);
  // gradient sky dome with a visible sun, derived from the arena colors unless overridden
  const sunDir = new THREE.Vector3(...sun.pos).normalize();
  G.scene.background = skyC.clone().multiplyScalar(0.5);
  add(makeSky({
    top: dome.top ?? skyC.clone().multiplyScalar(0.55).getHex(),
    horizon: dome.horizon ?? fogC.clone().lerp(new THREE.Color(sun.color), 0.12).getHex(),
    bottom: dome.bottom ?? skyC.clone().multiplyScalar(0.25).getHex(),
    sun: dome.sun ?? sun.color, sunDir: sunDir.toArray(), sunSize: dome.sunSize ?? 1, haze: dome.haze ?? 1, clouds: dome.clouds ?? 0.6,
  }));
  G.scene.fog = new THREE.Fog(fog, near, far);
  add(new THREE.HemisphereLight(hemi[0], hemi[1], hemi[2] * 0.75));
  const d = new THREE.DirectionalLight(sun.color, sun.int * 1.15);
  d.userData.offset = sunDir.clone().multiplyScalar(70);
  d.position.copy(d.userData.offset);
  d.castShadow = true;
  d.shadow.mapSize.set(2048, 2048);
  const c = d.shadow.camera, S = Math.min(shadowSize, 42);
  c.left = c.bottom = -S; c.right = c.top = S; c.near = 1; c.far = 200;
  d.shadow.bias = -0.0004; d.shadow.normalBias = 0.03;
  add(d); add(d.target);
  G.sun = d;
  return d;
}

export function addStars(count = 1500, radius = 350, color = 0xffffff, size = 1.2) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.8 + Math.random() * 0.2));
    if (v.y < -50) v.y = -v.y;
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, fog: false }));
  return add(p);
}

export function pointLight(x, y, z, color, intensity = 30, dist = 25) {
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.position.set(x, y, z);
  return add(l);
}

// Batch the static set dressing (meshes flagged userData.static) into one mesh per material, so a dressed
// arena costs a few dozen draw calls instead of hundreds (each also gets drawn again for shadows and AO).
export function mergeStatic() {
  const groups = new Map();
  for (const m of [...G.worldGroup.children]) {
    if (!m.isMesh || m.isInstancedMesh || !m.userData.static || Array.isArray(m.material)) continue;
    const k = m.material.uuid + (m.castShadow ? 's' : '') + (m.receiveShadow ? 'r' : '');
    (groups.get(k) || groups.set(k, []).get(k)).push(m);
  }
  let saved = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrixWorld(true);
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {};
      return g.applyMatrix4(m.matrixWorld);
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const out = new THREE.Mesh(merged, list[0].material);
    out.castShadow = list[0].castShadow; out.receiveShadow = list[0].receiveShadow;
    for (const m of list) { G.worldGroup.remove(m); m.geometry.dispose(); }
    G.worldGroup.add(out);
    saved += list.length - 1;
  }
  return saved;
}

// ---------- collision ----------
const EPS = 1e-3;
function overlaps(p, r, h, b) {
  return p.x + r > b.min.x && p.x - r < b.max.x && p.z + r > b.min.z && p.z - r < b.max.z && p.y + h > b.min.y && p.y < b.max.y;
}

// Moves feet-position p by v*dt against all colliders. Returns { ground, wall }.
export function moveCollide(p, v, dt, r, h, step = 0.5) {
  let ground = false, wall = false;
  const cs = G.colliders;
  p.x += v.x * dt;
  for (const b of cs) {
    if (!overlaps(p, r, h, b)) continue;
    if (b.max.y - p.y <= step && v.y <= 0.1) { p.y = b.max.y; continue; }
    if (v.x > 0) p.x = b.min.x - r - EPS; else if (v.x < 0) p.x = b.max.x + r + EPS;
    wall = true;
  }
  p.z += v.z * dt;
  for (const b of cs) {
    if (!overlaps(p, r, h, b)) continue;
    if (b.max.y - p.y <= step && v.y <= 0.1) { p.y = b.max.y; continue; }
    if (v.z > 0) p.z = b.min.z - r - EPS; else if (v.z < 0) p.z = b.max.z + r + EPS;
    wall = true;
  }
  const y0 = p.y;
  p.y += v.y * dt;
  for (const b of cs) {
    if (!overlaps(p, r, h, b)) continue;
    if (v.y <= 0) { p.y = b.max.y; v.y = 0; ground = true; }
    // moving up but we were already at its top surface (e.g. a bobbing platform rose into our feet): stand on it
    else if (y0 >= b.max.y - 0.6) { p.y = b.max.y; }
    // genuinely bonked a ceiling from below
    else { p.y = b.min.y - h - EPS; v.y = 0; }
  }
  return { ground, wall };
}

export function pointInWorld(p) {
  for (const b of G.colliders) if (b.containsPoint(p)) return true;
  return false;
}

// Highest floor top below a point (for spawning things on the ground).
export function groundY(x, z, fromY = 50) {
  let best = -Infinity;
  for (const b of G.colliders) {
    if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= fromY && b.max.y > best) best = b.max.y;
  }
  return best === -Infinity ? 0 : best;
}
