// SECRET ENCOUNTER: THE BACKROOMS. You noclipped out of the Approach (slide into the yellow glitch in the plaza)
// and landed in Level 0: an endless office maze, damp carpet, buzzing lights. Find four bottles of Almond Water,
// then the EXIT, while the Entity hunts you. It can't be killed; shoot it enough and it backs off for a while.
import * as THREE from 'three';
import { G, rand, pick, players, hurtPlayer, local, distXZ } from '../game.js';
import { Encounter } from './base.js';
import { setEnv, addBox, add, std, pointLight } from '../world.js';
import { textSprite, IMPACT } from '../textures.js';
import { Enemy, registerNetType } from '../enemies.js';
import { HUD } from '../hud.js';
import { play, playAt } from '../audio.js';
import * as fx from '../fx.js';
import { unlock } from '../triumphs.js';

const N = 8, C = 7, H = 3.4, HALF = (N * C) / 2; // an 8x8 maze of 7 m cells
const cellCenter = (cx, cz) => new THREE.Vector3(-HALF + C * (cx + 0.5), 0, -HALF + C * (cz + 0.5));
const cellOf = (p) => [Math.min(N - 1, Math.max(0, Math.floor((p.x + HALF) / C))), Math.min(N - 1, Math.max(0, Math.floor((p.z + HALF) / C)))];

// the same maze on every machine: a seeded generator
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeMaze(seed) {
  const r = mulberry(seed);
  // walls[cz][cx] = { e: wall to the east, s: wall to the south }
  const walls = Array.from({ length: N }, () => Array.from({ length: N }, () => ({ e: true, s: true })));
  const seen = Array.from({ length: N }, () => Array(N).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true;
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [x + dx, z + dz, dx, dz]).filter(([nx, nz]) => nx >= 0 && nz >= 0 && nx < N && nz < N && !seen[nz][nx]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, nz, dx, dz] = nb[Math.floor(r() * nb.length)];
    if (dx === 1) walls[z][x].e = false; else if (dx === -1) walls[z][nx].e = false; else if (dz === 1) walls[z][x].s = false; else walls[nz][x].s = false;
    seen[nz][nx] = true; stack.push([nx, nz]);
  }
  // knock out some extra walls so it loops (less backtracking, more ways to lose the Entity)
  for (let i = 0; i < 14; i++) { const x = Math.floor(r() * (N - 1)), z = Math.floor(r() * (N - 1)); if (r() < 0.5) walls[z][x].e = false; else walls[z][x].s = false; }
  return walls;
}
// can you walk from cell a straight into its neighbour b?
function open(walls, ax, az, bx, bz) {
  if (bx === ax + 1) return !walls[az][ax].e;
  if (bx === ax - 1) return !walls[az][bx].e;
  if (bz === az + 1) return !walls[az][ax].s;
  if (bz === az - 1) return !walls[bz][ax].s;
  return false;
}
// breadth-first distances from a cell (used for placing things far away, and for the Entity's pathing)
function bfs(walls, sx, sz) {
  const d = Array.from({ length: N }, () => Array(N).fill(Infinity)); d[sz][sx] = 0; const q = [[sx, sz]];
  while (q.length) {
    const [x, z] = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N || d[nz][nx] !== Infinity || !open(walls, x, z, nx, nz)) continue; d[nz][nx] = d[z][x] + 1; q.push([nx, nz]); }
  }
  return d;
}

// ---- textures: yellowed wallpaper, mustard carpet, ceiling tiles ----
function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]); return t; }
const wallpaper = () => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#c9b46a'; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(120,100,40,.35)'; x.lineWidth = 2;
  for (let i = 0; i < w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
  x.fillStyle = 'rgba(150,125,55,.35)'; for (let i = 8; i < w; i += 16) for (let j = 8; j < h; j += 24) { x.beginPath(); x.arc(i, j, 2.5, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(90,70,20,.12)'; for (let k = 0; k < 6; k++) { x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 18, 30 + Math.random() * 30, 0, 0, 7); x.fill(); } // water stains
}, [2, 1]);
const carpet = () => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#8f7b3e'; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 2500; k++) { x.fillStyle = `rgba(${60 + Math.random() * 60},${50 + Math.random() * 40},20,.25)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  x.fillStyle = 'rgba(50,40,15,.18)'; for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 16, 0, 7); x.fill(); } // damp patches
}, [14, 14]);
const ceiling = () => canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#b8b39a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#8f8a72'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2); }, [28, 28]);

// ---------------- the Entity ----------------
export class Entity extends Enemy {
  constructor(enc) {
    super({ name: 'The Entity', hp: 1e6, radius: 0.5, height: 2.7, speed: 3.6, rank: 'neutral', drops: false, gib: 0x111111, ash: 0x111111, deathLines: ['should not be possible'] });
    this.enc = enc; this.knockable = false; this.hostile = true;
    const g = new THREE.Group(); this.mesh.add(g); this.model = g;
    const black = new THREE.MeshBasicMaterial({ color: 0x050505 }), glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.3, 6, 10), black); body.position.y = 1.35; g.add(body);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 1.35, 4, 8), black); arm.position.set(s * 0.3, 1.1, 0); arm.rotation.z = s * 0.12; g.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.8, 4, 8), black); leg.position.set(s * 0.12, 0.45, 0); g.add(leg);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), black); head.position.y = 2.35; head.scale.set(1, 1.15, 1); g.add(head);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow); e.position.set(s * 0.08, 2.42, 0.22); g.add(e); }
    const grin = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 16, Math.PI), glow); grin.position.set(0, 2.3, 0.21); grin.rotation.z = Math.PI; g.add(grin);
    this.hb(0, 1.35, 0, 0.4).hb(0, 2.35, 0, 0.26, true);
    this.cd = 0; this.taken = 0; this.path = null; this.repathT = 0;
  }
  // it can't die; enough damage and it backs off to a far corner for a while
  takeDamage(dmg, crit, info = {}) {
    if (G.net.isClient) return G.net.clientHit(this, dmg, crit, info);
    if (info.from == null) fx.dmgNumber(this.top(new THREE.Vector3()), crit ? '!!' : '...', 'immune');
    this.flinch = Math.min(1.2, this.flinch + 0.3);
    this.taken += dmg;
    if (this.taken > 450) { this.taken = 0; this.enc.banishEntity(this); }
    return 0;
  }
  think(dt) {
    const enc = this.enc, p = this.tgt();
    if (!p?.alive) return;
    this.speed = 3.4 + enc.got * 0.45; // it gets faster the more you take
    // path through the maze toward the target's cell
    this.repathT -= dt;
    if (this.repathT <= 0) {
      this.repathT = 0.5;
      const [tx, tz] = cellOf(p.pos), d = bfs(enc.walls, tx, tz), [x, z] = cellOf(this.pos);
      let best = [x, z], bd = d[z][x];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N || !open(enc.walls, x, z, nx, nz)) continue; if (d[nz][nx] < bd) { bd = d[nz][nx]; best = [nx, nz]; } }
      this.next = (best[0] === x && best[1] === z) ? p.pos.clone() : cellCenter(best[0], best[1]);
    }
    if (this.next) this.steer(this.next.x, this.next.z, this.speed, dt, { stopDist: 0.2 });
    this.cd -= dt;
    if (distXZ(this.pos, p.pos) < 1.4 && this.cd <= 0) {
      this.cd = 1.4;
      hurtPlayer(p, 34, 'the Entity (you should not be here)', this.pos);
      playAt(this.pos, 'roar', 0.5);
    }
  }
  animate(dt) { this.model.position.y = Math.sin(this.t * 2) * 0.03; this.model.rotation.z = Math.sin(this.t * 7) * 0.02; }
}
registerNetType(Entity, () => new Entity(G.encounter));

// ---------------- the encounter ----------------
export class Backrooms extends Encounter {
  static title = 'THE BACKROOMS';
  static secret = true;
  cursed = 3;
  build() {
    this.walls = makeMaze(0x5ec2e7);
    setEnv({ sky: 0x2a2614, fog: 0x7a6c38, near: 5, far: 34, hemi: [0xfff3c0, 0x6a5a28, 0.9], sun: { color: 0xfff1c8, int: 0.25, pos: [10, 60, 10] }, shadowSize: 20,
      dome: { top: 0x2a2614, horizon: 0x2a2614, bottom: 0x2a2614, sun: 0x2a2614, sunSize: 0.01, haze: 0.2, clouds: 0 } });
    const wall = std(0xffffff, { map: wallpaper(), roughness: 0.95, detail: false });
    const floor = std(0xffffff, { map: carpet(), roughness: 1, detail: false });
    const ceil = std(0xffffff, { map: ceiling(), roughness: 0.9, detail: false });
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d0, emissiveIntensity: 1.6 });
    addBox(0, -1, 0, N * C + 2, 1, N * C + 2, floor);
    const c = addBox(0, H, 0, N * C + 2, 0.4, N * C + 2, ceil, { collide: false }); c.castShadow = false;
    const T = 0.4;
    const wallBox = (x, z, w, d) => { const m = addBox(x, 0, z, w, H, d, wall); m.userData.static = true; };
    // the outer boundary
    wallBox(0, -HALF, N * C + T, T); wallBox(0, HALF, N * C + T, T); wallBox(-HALF, 0, T, N * C); wallBox(HALF, 0, T, N * C);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const cc = cellCenter(x, z);
      if (this.walls[z][x].e && x < N - 1) wallBox(cc.x + C / 2, cc.z, T, C + T);
      if (this.walls[z][x].s && z < N - 1) wallBox(cc.x, cc.z + C / 2, C + T, T);
      // a fluorescent panel in every cell
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.5), this.lampMat); l.position.set(cc.x, H - 0.04, cc.z); l.userData.static = true; add(l);
    }
    // a handful of real lights (the panels themselves just glow)
    for (const [x, z] of [[1, 1], [6, 1], [1, 6], [6, 6], [3, 4]]) { const cc = cellCenter(x, z); pointLight(cc.x, H - 0.4, cc.z, 0xfff1c0, 22, 16); }
    // the spawn corner, the bottles far away, the exit farthest of all
    this.spawn.copy(cellCenter(0, 0)).setY(0.1); this.spawnYaw = Math.PI;
    const d = bfs(this.walls, 0, 0);
    const cells = []; for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) cells.push([x, z, d[z][x]]);
    cells.sort((a, b) => b[2] - a[2]);
    const exitCell = cells[0];
    const picked = []; for (const cl of cells.slice(1)) { if (picked.length >= 4) break; if (picked.every((q) => Math.abs(q[0] - cl[0]) + Math.abs(q[1] - cl[1]) >= 3) && Math.abs(cl[0] - exitCell[0]) + Math.abs(cl[1] - exitCell[1]) >= 2 && cl[2] >= 4) picked.push(cl); }
    this.bottles = picked.map(([x, z], i) => {
      const g = new THREE.Group(); g.position.copy(cellCenter(x, z)).setY(0.9); add(g);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 14), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, roughness: 0.05 })); g.add(glass);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0xd8f4ff, emissive: 0x6ab8ff, emissiveIntensity: 0.6 })); water.position.y = -0.04; g.add(water);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 10), std(0xffffff, { detail: false })); cap.position.y = 0.25; g.add(cap);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0x9fd8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 })); glow.scale.setScalar(1.4); g.add(glow);
      const lbl = textSprite('ALMOND WATER', 0.16, { color: '#dff4ff' }); lbl.position.y = 0.5; g.add(lbl);
      return { g, i, got: false, pos: g.position.clone() };
    });
    // the exit: a door with a red EXIT sign; dark until you've got all four bottles
    const ec = cellCenter(exitCell[0], exitCell[1]);
    this.exitPos = ec.clone();
    this.exitMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x33ff88, emissiveIntensity: 0 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.15), this.exitMat); door.position.set(ec.x, 1.2, ec.z); add(door);
    this.exitSign = textSprite('EXIT', 0.4, { font: IMPACT, weight: 'normal', color: '#ff3b3b', bg: '#220000', pad: 8 }); this.exitSign.position.set(ec.x, 2.85, ec.z); add(this.exitSign);
    this.got = 0; this.exitOpen = false; this.entity = null; this.flickT = 0;
  }
  warmActors() { return [new Entity(this)]; }
  start() {
    this.host = true;
    HUD.objective(Backrooms.title, 'You noclipped out of reality.\nFind the Almond Water: 0/4');
    this.ghost('Guardian... where are we? This is not the Vault. It smells like old carpet and someone else\'s birthday.', 1);
    this.ghost('There is water here. Almond water. I think we need it. And I think something else is here too.', 7);
    this.entityT = 9;
  }
  clientStart() {}
  complete() { if (!this.done) this.ev('escaped'); super.complete(); }
  ev_escaped() { unlock('noclip'); G.onBackroomsLoot?.(); }
  netState() { return { got: this.bottles.map((b) => (b.got ? 1 : 0)), ex: this.exitOpen ? 1 : 0 }; }
  applyNet(s) {
    if (!s) return;
    s.got.forEach((v, i) => { if (v && !this.bottles[i].got) this.takeBottle(i); });
    if (s.ex && !this.exitOpen) this.openExit();
  }
  takeBottle(i) {
    const b = this.bottles[i]; if (b.got) return;
    b.got = true; b.g.visible = false; this.got = this.bottles.filter((q) => q.got).length;
    local(() => { play('engram'); fx.burst(b.pos, 0x9fd8ff, 20, 4, 0.1, 0.7, -2); });
  }
  openExit() { this.exitOpen = true; this.exitMat.emissiveIntensity = 2.2; local(() => play('superReady')); }
  banishEntity(e) {
    // off to the far corner from everyone, for a breather
    let best = null, bd = -1;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const cc = cellCenter(x, z); const md = Math.min(...players().map((q) => distXZ(q.pos, cc))); if (md > bd) { bd = md; best = cc; } }
    fx.burst(e.center(), 0x000000, 24, 5, 0.15, 0.6);
    e.pos.set(best.x, 0, best.z); e.next = null; e.repathT = 0;
    this.ghost(pick(['It is gone. For now. Keep moving.', 'You scared it off. I did not know you could do that.', 'It left. It will be back. They always come back.']));
  }
  update(dt) {
    this.t += dt;
    if (this.done) return;
    // the Entity arrives after a few seconds, somewhere far away
    if (!this.entity && (this.entityT -= dt) <= 0) {
      this.entity = new Entity(this); G.enemies.push(this.entity);
      this.banishEntity(this.entity); this.entity.spawnAt(this.entity.pos.x, 0, this.entity.pos.z);
      this.ghost('Something just... arrived. Do not let it touch you. Shooting it seems to annoy it, at least.');
    }
    for (const b of this.bottles) if (!b.got && players().some((q) => q.alive && q.pos.distanceTo(b.pos) < 1.6)) { this.takeBottle(b.i); if (this.got < 4) this.ghost(pick(['Got one. It tastes like nothing. That is worse somehow.', 'Almond water. Do not ask where it comes from.', 'Another one. The lights are getting louder.'])); }
    if (this.got >= 4 && !this.exitOpen) { this.openExit(); this.ghost('That is all of it. There is an EXIT sign. Run.'); }
    HUD.objective(null, this.exitOpen ? 'Find the EXIT. Run.' : `You noclipped out of reality.\nFind the Almond Water: ${this.got}/4`);
    if (this.exitOpen && players().some((q) => q.alive && distXZ(q.pos, this.exitPos) < 2)) this.complete();
  }
  // every machine: the lights buzz and flicker when the Entity is near you
  localUpdate(dt) {
    const p = G.player, e = this.entity || G.enemies.find((x) => x instanceof Entity && x.alive);
    const near = e && p.alive ? distXZ(e.pos, p.pos) : 99;
    const k = near < 16 ? 1 - near / 16 : 0;
    this.lampMat.emissiveIntensity = k > 0 ? (Math.random() < k * 0.5 ? 0.15 : 1.6) : 1.6;
    if (k > 0 && (this.flickT -= dt) <= 0) { this.flickT = 0.4 + (1 - k) * 1.5; play('tick', 0.4 + k); }
    for (const b of this.bottles) if (!b.got) b.g.rotation.y += dt;
    this.exitSign.material.opacity = this.exitOpen ? 0.8 + Math.sin(this.t * 6) * 0.2 : 0.35;
  }
}
