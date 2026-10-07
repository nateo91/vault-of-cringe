// Shared game state + tiny utilities. Everything imports from here.
import * as THREE from 'three';

export const G = {
  scene: null, camera: null, renderer: null,
  worldGroup: null, entities: null, fxGroup: null,
  player: null,
  enemies: [], projectiles: [], pickups: [], hazards: [], colliders: [],
  encounter: null, encounterIndex: 0,
  state: 'menu',       // menu | loading | playing | wipe | victory
  paused: false,
  time: 0,
  shake: 0,
  cursed: 1,
  cls: 'hunter',
  debug: new URLSearchParams(location.search).has('debug'),
  godMode: false,
  settings: { sens: 1, volume: 0.6, voice: true, music: true },
  stats: { kills: 0, crits: 0, deaths: 0, wipes: 0, shots: 0, hits: 0, start: 0, bruh: 0 },
  timers: [],
  cine: null,
  waypoint: null,        // world point the HUD's objective marker tracks            // a boss intro is playing
  introsSeen: new Set(), // intros only play on the first attempt
  // ---- co-op ----
  avatars: new Map(),   // other guardians (id -> Avatar)
  nextNid: 1,           // network ids for enemies/pickups (same sequence on host + clients during build)
  netLocal: 0,          // >0 while running code whose effects must NOT be mirrored to other players
  net: { active: false, isHost: false, isClient: false, myId: 'solo', emit() {}, sendTo() {}, playerEv() {}, hud: {} },
};

// Run fn without mirroring its fx/sounds/HUD to the fireteam (local-player-only stuff).
export function local(fn) { G.netLocal++; try { return fn(); } finally { G.netLocal--; } }
// True when we're the host and this effect should be mirrored to clients.
export function shareable() { return G.net.isHost && G.netLocal === 0; }
export function share(ev) { if (shareable()) G.net.emit(ev); }

export function players() { const a = [G.player]; for (const v of G.avatars.values()) a.push(v); return a; }
export function alivePlayers() { return players().filter((p) => p && p.alive); }
export function nearestPlayer(pos) {
  let best = null, bd = Infinity;
  for (const p of players()) {
    if (!p || !p.alive) continue;
    const d = (p.pos.x - pos.x) ** 2 + (p.pos.z - pos.z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
export function playerById(id) { if (id == null || id === G.net.myId) return G.player; return G.avatars.get(id) || null; }
// Damage a guardian wherever they live: locally, or by telling their machine.
export function hurtPlayer(pl, amt, cause) {
  if (!pl) return;
  if (pl === G.player) pl.hurt(amt, cause);
  else if (pl.alive) G.net.sendTo(pl.id, ['hurt', amt, cause]);
}

// Pausable timers that run on game time.
export function after(sec, fn) { const t = { at: G.time + sec, fn }; G.timers.push(t); return t; }
export function cancel(t) { const i = G.timers.indexOf(t); if (i >= 0) G.timers.splice(i, 1); }
export function updateTimers() {
  for (let i = G.timers.length - 1; i >= 0; i--) {
    const t = G.timers[i];
    if (G.time >= t.at) { G.timers.splice(i, 1); t.fn(); }
  }
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export function dampAngle(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Distance from point p to segment ab.
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
export function distToSegment(p, a, b) {
  _ab.subVectors(b, a); _ap.subVectors(p, a);
  const t = clamp(_ap.dot(_ab) / Math.max(1e-6, _ab.lengthSq()), 0, 1);
  return _ap.sub(_ab.multiplyScalar(t)).length();
}
