// Champions, Destiny style. On Master, some majors become Champions, and each kind is only properly dealt with
// by certain weapons (every gun's HUD row and Armory card shows which kind it counters):
//   🛡️ Barrier      raises an immune, healing barrier at 66% and 33% health. Pulse rifles, scouts and bows break it (and stun it).
//   ⚡ Overload     regenerates health fast. Autos, SMGs, machine guns and trace rifles disrupt it: no regen for 6 s.
//   🦬 Unstoppable  takes half damage. Hand cannons, sidearms, snipers and fusions stagger it: 4 s stunned, full damage.
import * as THREE from 'three';
import { G, pick } from './game.js';
import { DEFS } from './arsenal.js';
import { textSprite } from './textures.js';
import * as fx from './fx.js';

export const CHAMPS = {
  barrier: { icon: '🛡️', name: 'Barrier', color: 0x7fd7ff, kinds: ['burst', 'bow'], ids: ['sr', 'tg'] },
  overload: { icon: '⚡', name: 'Overload', color: 0xc58bff, kinds: ['auto', 'trace'], ids: [] },
  unstoppable: { icon: '🦬', name: 'Unstoppable', color: 0xffa040, kinds: ['single', 'sniper', 'fusion', 'linear'], ids: [] },
};
export const CHAMP_KEYS = Object.keys(CHAMPS);

// which champion a weapon counters (by id or def), or null
export function counters(w) {
  const d = typeof w === 'string' ? DEFS[w] : w;
  if (!d) return null;
  for (const [k, c] of Object.entries(CHAMPS)) if (c.ids.includes(d.id)) return k;
  for (const [k, c] of Object.entries(CHAMPS)) if (c.kinds.includes(d.kind) && !CHAMPS.barrier.ids.includes(d.id)) return k;
  return null;
}
export const counterIcon = (d) => { const k = counters(d); return k ? CHAMPS[k].icon : ''; };

export function makeChampion(e, type = pick(CHAMP_KEYS)) {
  e.champ = type;
  e.maxHp = e.hp = Math.round(e.maxHp * 1.5);
  e.barrierLevels = [0.66, 0.33]; e.barrierHp = 0;
  e.name = `${CHAMPS[type].name} ${e.name}`;
  ensureBadge(e);
  return e;
}

// the icon over its head, and the barrier bubble
export function ensureBadge(e) {
  if (e.champBadge || !e.champ) return;
  const c = CHAMPS[e.champ];
  e.champBadge = textSprite(c.icon, 0.5, { fog: false }); e.champBadge.position.y = e.height + 1.05; e.mesh.add(e.champBadge);
  if (e.champ === 'barrier') {
    e.barrierMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    e.barrierMesh.scale.setScalar(Math.max(1.2, e.height * 0.7)); e.barrierMesh.position.y = e.height * 0.5; e.barrierMesh.visible = false; e.mesh.add(e.barrierMesh);
  }
}

// Called from Enemy.takeDamage (host). Returns the damage that reaches health (0 if it was all stopped).
export function champHit(e, dmg, info, mine, top) {
  const counter = !!info.weapon && counters(info.weapon) === e.champ;
  if (e.champ === 'barrier' && e.barrierHp > 0) {
    if (!counter) { if (mine) fx.dmgNumber(top, 'BARRIER', 'immune'); return 0; }
    e.barrierHp -= dmg;
    if (e.barrierHp <= 0) {
      e.barrierHp = 0; e.stunT = Math.max(e.stunT || 0, 3);
      fx.burst(e.center(), CHAMPS.barrier.color, 30, 7, 0.12, 0.8); fx.floatText(top.clone(), 'BARRIER BROKEN', { height: 0.6, color: '#7fd7ff' });
    }
    return 0;
  }
  if (e.champ === 'overload' && counter) {
    if (!(e.disruptT > 0)) { e.stunT = Math.max(e.stunT || 0, 1.2); fx.floatText(top.clone(), 'DISRUPTED', { height: 0.55, color: '#c58bff' }); }
    e.disruptT = 6;
  }
  if (e.champ === 'unstoppable') {
    if (counter && !(e.staggerT > 0)) { e.staggerT = 4; e.stunT = Math.max(e.stunT || 0, 4); fx.floatText(top.clone(), 'STAGGERED', { height: 0.6, color: '#ffa040' }); }
    if (!(e.staggerT > 0)) dmg *= 0.5;
  }
  return dmg;
}
// after health damage: barrier thresholds
export function champAfterHit(e) {
  if (e.champ !== 'barrier' || !e.alive) return;
  const next = e.barrierLevels?.[0];
  if (next != null && e.hp / e.maxHp < next) {
    e.barrierLevels.shift();
    e.barrierHp = e.maxHp * 0.18;
    fx.floatText(e.top(new THREE.Vector3()), 'BARRIER UP', { height: 0.55, color: '#7fd7ff' });
  }
}
// every frame (host simulates, clients mirror the visuals)
export function champUpdate(e, dt) {
  if (!e.champ) return;
  ensureBadge(e);
  if (e.disruptT > 0) e.disruptT -= dt;
  if (e.staggerT > 0) e.staggerT -= dt;
  if (!G.net.isClient) {
    if (e.champ === 'overload' && !(e.disruptT > 0) && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.035 * dt);
    if (e.champ === 'barrier' && e.barrierHp > 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt); // the barrier heals it
  }
  if (e.barrierMesh) { e.barrierMesh.visible = e.barrierHp > 0; e.barrierMesh.material.opacity = 0.18 + Math.sin(e.t * 3) * 0.05; }
  e.champBadge.material.opacity = e.champ === 'overload' && e.disruptT > 0 ? 0.45 : e.champ === 'unstoppable' && e.staggerT > 0 ? 0.45 : 1;
}
// network: [type, barrier hp, disrupted, staggered]
export const champRow = (e) => (e.champ ? [CHAMP_KEYS.indexOf(e.champ), Math.ceil(e.barrierHp || 0), e.disruptT > 0 ? 1 : 0, e.staggerT > 0 ? 1 : 0] : 0);
export function applyChampRow(e, r) {
  if (!r) return;
  e.champ = CHAMP_KEYS[r[0]]; e.barrierHp = r[1]; e.disruptT = r[2] ? 1 : 0; e.staggerT = r[3] ? 1 : 0;
}
