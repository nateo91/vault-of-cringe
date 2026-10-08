// Raid secrets: hidden chests, Destiny style. Off the main path, no waypoint, no objective text.
// Each guardian opens their own (it's all local: everyone in the fireteam can loot it), once per encounter
// load, and which ones you've ever found is remembered so the end screen can say "secrets 2/3".
import * as THREE from 'three';
import { G, distXZ } from './game.js';
import { HUD } from './hud.js';
import { play } from './audio.js';
import * as fx from './fx.js';
import { add, std } from './world.js';
import { down } from './input.js';
import { unlock } from './triumphs.js';
import { weekNumber } from './challenges.js';

export const SECRETS = {
  approach: 'The Rock Nobody Checks',
  meeting: 'Emergency Funds',
  fine: 'Behind the Sunflowers',
};

const spots = []; // things you can hold [E] at: chests, buttons, paintings
let holdT = 0, shown = false;

export function clearSecrets() { spots.length = 0; holdT = 0; if (shown) { HUD.prompt(null); shown = false; } }

export function secretsFound() {
  try { return JSON.parse(localStorage.getItem('voc-secrets') || '[]'); } catch (e) { return []; }
}

// A raid chest: dark stone box, gold bands, a glowing moai crest, and a lid on a hinge.
function makeChest() {
  const g = new THREE.Group();
  const stone = std(0x2b2d33, { roughness: 0.6, metalness: 0.3, detail: false });
  const gold = std(0xd4a63a, { roughness: 0.3, metalness: 0.9, detail: false });
  const glowM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x5fd8ff, emissiveIntensity: 2.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.85), stone); body.position.y = 0.35; g.add(body);
  for (const x of [-0.5, 0.5]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.87), gold); band.position.set(x, 0.35, 0); g.add(band); }
  const hinge = new THREE.Group(); hinge.position.set(0, 0.7, -0.42); g.add(hinge);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.26, 0.89), stone); lid.position.set(0, 0.13, 0.42); hinge.add(lid);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 0.91), gold); rim.position.set(0, 0.0, 0.42); hinge.add(rim);
  const crest = new THREE.Mesh(new THREE.CircleGeometry(0.17, 6), glowM); crest.position.set(0, 0.36, 0.431); g.add(crest);
  const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0x9fe2ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  inner.scale.setScalar(2.2); inner.position.y = 0.8; g.add(inner);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { hinge, inner, crest };
  return g;
}

// A chest at pos. hidden: not there until something reveals it (reveal() rises it out of the floor).
export function addChest(id, pos, { yaw = 0, hidden = false } = {}) {
  const mesh = makeChest(); mesh.position.copy(pos); mesh.rotation.y = yaw; add(mesh);
  const c = { kind: 'chest', id, pos: pos.clone(), mesh, r: 2.2, prompt: 'Hold [E] to open', open: false, openK: 0, riseK: hidden ? 0 : 1, hidden };
  mesh.visible = !hidden;
  c.reveal = () => { if (!c.hidden) return; c.hidden = false; mesh.visible = true; c.riseK = 0; play('rumble', 1); fx.burst(pos.clone().setY(pos.y + 0.3), 0x9fe2ff, 20, 4, 0.1, 0.8); };
  spots.push(c);
  return c;
}

// Anything else you hold [E] at (a button, a painting). Fires once.
export function addTrigger(pos, r, prompt, onDone) {
  const t = { kind: 'trigger', pos: pos.clone(), r, prompt, onDone, done: false };
  spots.push(t);
  return t;
}

function openChest(c) {
  c.open = true;
  const found = secretsFound();
  const fresh = !found.includes(c.id);
  if (fresh) { found.push(c.id); try { localStorage.setItem('voc-secrets', JSON.stringify(found)); } catch (e) { /* fine */ } }
  const n = found.filter((k) => SECRETS[k]).length, total = Object.keys(SECRETS).length;
  // loot once per chest per week (like the real thing), or it's an exotic farm
  let looted = {}; try { looted = JSON.parse(localStorage.getItem('voc-secrets-week') || '{}'); } catch (e) { /* fine */ }
  const pays = looted[c.id] !== weekNumber();
  if (pays) { looted[c.id] = weekNumber(); try { localStorage.setItem('voc-secrets-week', JSON.stringify(looted)); } catch (e) { /* fine */ } }
  play(pays ? 'engram' : 'click'); play('chime', 3);
  fx.burst(c.pos.clone().setY(c.pos.y + 1), 0xffe9a0, pays ? 40 : 12, 7, 0.12, 1.1, 2);
  HUD.bigText('SECRET CHEST', `${SECRETS[c.id] || 'a secret'} · ${n}/${total} found${fresh ? ' (new!)' : ''}${pays ? '' : ' · already looted this week (resets Tuesday)'}`, 3, 'good');
  if (pays) G.onSecret?.(c.id);
  if (n === total) { unlock('secrets'); G.onRaidExotic?.('tg'); }
}

export function updateSecrets(dt) {
  const p = G.player;
  // animate chests (rising out of the floor, the lid swinging open, the glow inside)
  for (const c of spots) {
    if (c.kind !== 'chest') continue;
    if (c.riseK < 1) { c.riseK = Math.min(1, c.riseK + dt * 1.2); c.mesh.position.y = c.pos.y - (1 - c.riseK) * 1.2; }
    if (c.open && c.openK < 1) c.openK = Math.min(1, c.openK + dt * 2.5);
    const u = c.mesh.userData;
    u.hinge.rotation.x = -c.openK * 1.9;
    u.inner.material.opacity = c.openK * (0.7 + Math.sin(G.time * 3) * 0.15);
    u.crest.material.emissiveIntensity = c.open ? 0.4 : 1.6 + Math.sin(G.time * 2.5) * 0.6;
  }
  // the nearest thing you can interact with
  let best = null, bd = Infinity;
  if (p.alive && G.state === 'playing' && !G.cine) {
    for (const s of spots) {
      if ((s.kind === 'chest' && (s.open || s.hidden || s.riseK < 1)) || (s.kind === 'trigger' && s.done)) continue;
      const d = distXZ(s.pos, p.pos);
      if (d < s.r && Math.abs(p.pos.y - s.pos.y) < 2.5 && d < bd) { bd = d; best = s; }
    }
  }
  if (!best) { holdT = 0; if (shown) { HUD.prompt(null); shown = false; } return; }
  holdT = down('KeyE') ? holdT + dt : 0;
  HUD.prompt(best.prompt, Math.min(1, holdT / 0.8)); shown = true;
  if (holdT >= 0.8) {
    holdT = 0;
    if (best.kind === 'chest') openChest(best);
    else { best.done = true; best.onDone?.(); }
  }
}

export const debugSpots = () => spots; // for the ?debug console
