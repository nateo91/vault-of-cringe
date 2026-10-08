// Lore Ghosts: hidden collectibles with a scrap of the Vault's history each. Found ones are remembered.
import * as THREE from 'three';
import { G, local } from './game.js';
import { play, say } from './audio.js';
import * as fx from './fx.js';
import { add } from './world.js';
import { emojiSprite } from './textures.js';
import { unlock } from './triumphs.js';

export const LORE = [
  { title: 'The First Normie', text: 'Before the Vault there was only the Feed, endless and grey. Then someone posted a dog with a confused face, and the Feed blinked. Every meme since is a descendant of that blink. Most of them should not have been.' },
  { title: 'On the Nature of Cringe', text: 'Cringe is not a feeling. Cringe is a substance. It pools in the low places of the internet and, given enough upvotes, it learns to stand. The Vault was built to hold it. The Vault is full.' },
  { title: 'A Warning, Scratched Into Stone', text: 'Whoever reads this: do not look at the toilet. Do not let it sing. If you hear "skibidi" from below, you are already in Ohio. There is no leaving Ohio. There is only touching grass, and the grass is far away.' },
  { title: 'Plate Telemetry', text: 'Every plate remembers who pressed it. The Like plate has been pressed eleven billion times. The Subscribe plate, nine billion. The Bell plate has been pressed four times, all by the same guardian, all by accident.' },
  { title: 'Crewmate Log, Day 41', text: 'Red keeps saying they were in Electrical. Nobody has ever been in Electrical. We checked: Electrical does not have a door. Red is still saying it. Red is standing very close to me while saying it.' },
  { title: 'What the Moai Mean', text: 'The Moai do not speak. They boom. One boom is a greeting. Two is a warning. Four is an apology. Seven means Chungus has eaten the snacks again, and there is nothing any of us can do about it.' },
  { title: 'Coffee, Cold', text: 'The Dog was not always fine. Once he was merely okay. The fire started small, a single hot take in the corner, and he chose to sip. He has been sipping ever since. The mug has been empty for years. He has not noticed.' },
  { title: 'Ohio Is a State of Mind', text: 'Cartographers have tried to map Ohio for centuries. Every map comes back with one more toilet on it than the last. The current estimate is a thousand. The current estimate is always a thousand.' },
];

const ghosts = [];
export function clearLore() { ghosts.length = 0; }
export function loreFound() { try { return JSON.parse(localStorage.getItem('voc-lore') || '[]'); } catch (e) { return []; } }

// a floating Ghost shell with a glow; walk into it to read the entry
export function addLoreGhost(i, pos) {
  const g = new THREE.Group(); g.position.copy(pos); add(g);
  g.add(emojiSprite('💠', 0.7));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0x9fe2ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(1.6); g.add(glow);
  ghosts.push({ g, i, taken: false, base: pos.clone() });
}

export function updateLore(dt) {
  const p = G.player;
  for (const l of ghosts) {
    if (l.taken) continue;
    l.g.position.y = l.base.y + Math.sin(G.time * 2 + l.i) * 0.15;
    l.g.rotation.y += dt;
    if (p?.alive && p.pos.distanceTo(l.g.position) < 1.8) {
      l.taken = true; l.g.visible = false;
      play('engram'); fx.burst(l.g.position, 0x9fe2ff, 20, 4, 0.1, 0.7, -2);
      showLore(l.i);
    }
  }
}

export function showLore(i) {
  const L = LORE[i];
  const found = loreFound();
  if (!found.includes(i)) found.push(i);
  try { localStorage.setItem('voc-lore', JSON.stringify(found)); } catch (e) { /* fine */ }
  const el = document.getElementById('lore');
  el.querySelector('.lore-h').textContent = `LORE · ENTRY ${i + 1} OF ${LORE.length} · ${found.length}/${LORE.length} FOUND`;
  el.querySelector('.lore-t').textContent = L.title;
  el.querySelector('.lore-b').textContent = L.text;
  el.classList.remove('hidden');
  clearTimeout(showLore.t);
  showLore.t = setTimeout(() => el.classList.add('hidden'), 14000);
  local(() => say(L.text.split('. ')[0] + '.', 'ghost'));
  if (LORE.every((_, k) => found.includes(k))) unlock('lore');
}
