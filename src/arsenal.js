// The arsenal: weapon archetypes, named guns, perks, loot rolls, the saved inventory, and new gun models.
import * as THREE from 'three';
import { addWear, bevelBox } from './surface.js';
import { G, rand, pick, local } from './game.js';
import * as fxm from './fx.js';
import { play as rawPlay, playAt } from './audio.js';
import { explode, Shockwave } from './combat.js';
import { HUD } from './hud.js';

const play = (...a) => local(() => rawPlay(...a));
const lhud = (m, ...a) => local(() => HUD[m](...a));

// ---------------------------------------------------------------- weapons
// kind: single | auto | burst | pellets | sniper | fusion | rocket | gl
// kick: [camera pitch, random yaw, viewmodel], aa: [aim-assist cone deg, range], brick: rounds per ammo pickup
export const DEFS = {
  hc: { id: 'hc', model: 'hc', name: 'Ace of Spuds', type: 'Hand Cannon', slot: 0, ammo: 'primary', rarity: 'exotic', kind: 'single', dmg: 34, crit: 2.1, rof: 0.33, mag: 12, reload: 1.55, spread: 0.006, range: 140, falloff: [45, 90, 0.6], color: 0xffe9a0, sound: 'hc', kick: [0.032, 0.012, 1], aa: [2.0, 70], zoom: 58, adsZ: -0.46, hip: [0.12, -0.12, -0.34], fixedPerks: ['memento', 'firefly'], flavor: 'Somebody glued a potato to it. It is load-bearing.' },
  ar: { id: 'ar', model: 'ar', name: 'Grindset', type: 'Auto Rifle', slot: 0, ammo: 'primary', rarity: 'legendary', kind: 'auto', dmg: 13, crit: 1.6, rof: 0.1, mag: 40, reload: 1.9, spread: 0.012, range: 90, falloff: [28, 60, 0.6], color: 0xfff0c0, sound: 'ar', kick: [0.009, 0.007, 0.35], aa: [1.6, 50], zoom: 62, adsZ: -0.42, hip: [0.13, -0.13, -0.32], flavor: 'Rise at 4am. Shoot. Cold shower. Shoot.' },
  pr: { id: 'pr', model: 'pr', name: 'Stonks Pulse', type: 'Pulse Rifle', slot: 0, ammo: 'primary', rarity: 'legendary', kind: 'burst', burst: 3, burstGap: 0.07, dmg: 19, crit: 1.7, rof: 0.42, mag: 36, reload: 2.0, spread: 0.006, range: 100, falloff: [35, 70, 0.6], color: 0x7dff9a, sound: 'pr', kick: [0.012, 0.006, 0.5], aa: [1.8, 60], zoom: 58, adsZ: -0.42, hip: [0.13, -0.13, -0.32], flavor: 'Number go up. Three times. Per trigger pull.' },
  tg: { id: 'tg', model: 'tg', name: 'Touch of Grass', type: 'Scout Rifle', slot: 0, ammo: 'primary', rarity: 'exotic', questOnly: true, kind: 'single', dmg: 44, crit: 1.9, rof: 0.36, mag: 12, reload: 1.9, spread: 0.004, range: 170, falloff: [70, 130, 0.7], color: 0x8dff9a, sound: 'sr', kick: [0.024, 0.008, 0.8], aa: [1.5, 110], zoom: 40, adsZ: -0.38, hip: [0.13, -0.13, -0.32], fixedPerks: ['grassy', 'outlaw'], shader: 'grass', flavor: 'The raid exotic. It was outside the whole time.' },
  smg: { id: 'smg', model: 'smg', name: 'Skibidi Spray', type: 'Submachine Gun', slot: 0, ammo: 'primary', rarity: 'legendary', kind: 'auto', dmg: 9, crit: 1.5, rof: 0.065, mag: 36, reload: 1.6, spread: 0.022, range: 60, falloff: [16, 36, 0.5], color: 0xc8ff7a, sound: 'smg', kick: [0.006, 0.006, 0.25], aa: [2.0, 40], zoom: 64, adsZ: -0.36, hip: [0.12, -0.12, -0.3], flavor: 'Brrrrrrrr. Dop dop. Yes yes.' },
  bw: { id: 'bw', model: 'bow', name: "Cupid's Ratio", type: 'Combat Bow', slot: 0, ammo: 'primary', rarity: 'legendary', kind: 'bow', dmg: 92, crit: 2.0, charge: 0.62, rof: 0.22, mag: 20, reload: 1.0, spread: 0.003, range: 150, falloff: [60, 120, 0.7], color: 0xff7aa8, sound: 'bow', kick: [0.028, 0.004, 0.6], aa: [1.6, 90], zoom: 46, adsZ: -0.34, hip: [0.1, -0.06, -0.38], flavor: 'Every arrow is a reply. Every crit is a ratio.' },
  sa: { id: 'sa', model: 'sa', name: 'Pocket Pickle', type: 'Sidearm', slot: 1, ammo: 'primary', rarity: 'legendary', kind: 'single', dmg: 21, crit: 1.6, rof: 0.17, mag: 15, reload: 1.3, spread: 0.012, range: 50, falloff: [14, 30, 0.55], color: 0x9cff6a, sound: 'sa', kick: [0.014, 0.01, 0.6], aa: [2.4, 40], zoom: 66, adsZ: -0.32, hip: [0.11, -0.12, -0.27], flavor: "I turned myself into a pistol. Funniest thing I've ever seen." },
  tr: { id: 'tr', model: 'tr', name: 'Laser Pointer', type: 'Trace Rifle', slot: 1, ammo: 'special', rarity: 'exotic', kind: 'trace', dmg: 5, crit: 1.5, rof: 0.05, mag: 100, reload: 2.0, spread: 0, range: 60, falloff: [30, 60, 0.6], color: 0xff2a3a, sound: 'tr', kick: [0.0015, 0.001, 0.05], aa: [2.2, 60], zoom: 62, adsZ: -0.36, hip: [0.12, -0.12, -0.32], brick: 30, maxRes: 200, fixedPerks: ['shiny', 'subsistence'], flavor: 'Built for cats. Works on memes. Do not point it at the Moai.' },
  lf: { id: 'lf', model: 'lf', name: 'Main Character Beam', type: 'Linear Fusion Rifle', slot: 2, ammo: 'heavy', rarity: 'legendary', kind: 'linear', dmg: 300, crit: 2.2, charge: 0.55, rof: 0.9, mag: 3, reload: 2.4, spread: 0, range: 220, falloff: [200, 220, 0.9], color: 0xb98bff, sound: 'lf', kick: [0.05, 0.01, 2.0], aa: [1.0, 150], zoom: 36, adsZ: -0.38, hip: [0.14, -0.15, -0.38], brick: 3, maxRes: 9, flavor: 'Everyone else is an NPC. This proves it.' },
  rz: { id: 'rz', model: 'rz', name: 'Rizzrunner', type: 'Submachine Gun', slot: 0, ammo: 'primary', rarity: 'exotic', kind: 'auto', dmg: 10, crit: 1.5, rof: 0.07, mag: 32, reload: 1.6, spread: 0.02, range: 60, falloff: [16, 36, 0.5], color: 0x7fd7ff, sound: 'smg', kick: [0.006, 0.006, 0.25], aa: [2.0, 40], zoom: 64, adsZ: -0.36, hip: [0.12, -0.12, -0.3], fixedPerks: ['rizzrunner', 'subsistence'], flavor: 'Getting hit just makes it more confident.' },
  lm: { id: 'lm', model: 'lm', name: 'Le Mogarch', type: 'Combat Bow', slot: 0, ammo: 'primary', rarity: 'exotic', kind: 'bow', dmg: 96, crit: 2.0, charge: 0.6, rof: 0.22, mag: 20, reload: 1.0, spread: 0.003, range: 150, falloff: [60, 120, 0.7], color: 0xc58bff, sound: 'bow', kick: [0.028, 0.004, 0.6], aa: [1.6, 90], zoom: 46, adsZ: -0.34, hip: [0.1, -0.06, -0.38], fixedPerks: ['mogged', 'outlaw'], flavor: 'It looks at them once. That is enough.' },
  sr: { id: 'sr', model: 'sr', name: 'The Sus-pect', type: 'Scout Rifle', slot: 0, ammo: 'primary', rarity: 'legendary', kind: 'single', dmg: 46, crit: 1.85, rof: 0.38, mag: 14, reload: 2.0, spread: 0.004, range: 170, falloff: [70, 130, 0.7], color: 0xff8080, sound: 'sr', kick: [0.024, 0.008, 0.8], aa: [1.4, 110], zoom: 40, adsZ: -0.38, hip: [0.13, -0.13, -0.32], flavor: 'Seen venting. Shoots anyway.' },
  sg: { id: 'sg', model: 'sg', name: 'The Chaperwoof', type: 'Shotgun', slot: 1, ammo: 'special', rarity: 'legendary', kind: 'pellets', dmg: 15, pellets: 10, crit: 1.4, rof: 0.85, mag: 5, shellTime: 0.48, spread: 0.065, range: 32, falloff: [10, 26, 0.35], color: 0xa0fff0, sound: 'sg', kick: [0.06, 0.02, 1.6], aa: [3.5, 16], zoom: 64, adsZ: -0.4, hip: [0.12, -0.125, -0.3], brick: 4, maxRes: 25, flavor: 'Who let the dogs out? This did.' },
  sn: { id: 'sn', model: 'sn', name: 'Big Brain', type: 'Sniper Rifle', slot: 1, ammo: 'special', rarity: 'legendary', kind: 'sniper', dmg: 105, crit: 2.6, rof: 0.95, mag: 4, reload: 2.4, spread: 0.06, range: 260, falloff: [220, 260, 1], color: 0xc8e8ff, sound: 'sn', kick: [0.07, 0.012, 1.8], aa: [1.0, 220], zoom: 54, scope: 'sn', adsZ: -0.36, hip: [0.13, -0.14, -0.3], brick: 4, maxRes: 16, flavor: 'Galaxy brain. Galaxy damage.' },
  ns: { id: 'ns', model: 'ns', name: 'No Scope 360', type: 'Sniper Rifle', slot: 1, ammo: 'special', rarity: 'exotic', kind: 'sniper', dmg: 115, crit: 2.8, rof: 0.85, mag: 3, reload: 2.2, spread: 0.03, range: 260, falloff: [220, 260, 1], color: 0xffe066, sound: 'sn', kick: [0.07, 0.012, 1.8], aa: [1.4, 220], zoom: 54, scope: 'ns', adsZ: -0.36, hip: [0.13, -0.14, -0.3], brick: 4, maxRes: 15, fixedPerks: ['mlg'], flavor: 'git gud. press F to pay respects. mtn dew sold separately.' },
  fr: { id: 'fr', model: 'fr', name: 'Bruh Fusion', type: 'Fusion Rifle', slot: 1, ammo: 'special', rarity: 'legendary', kind: 'fusion', charge: 0.55, bolts: 7, boltGap: 0.035, dmg: 27, crit: 1.3, rof: 0.9, mag: 5, reload: 2.1, spread: 0.032, range: 42, falloff: [18, 36, 0.5], color: 0xc58bff, sound: 'fr', kick: [0.05, 0.02, 1.4], aa: [2.5, 30], zoom: 62, adsZ: -0.4, hip: [0.13, -0.135, -0.31], brick: 4, maxRes: 20, flavor: 'Charges up. Says bruh. Deletes things.' },
  rl: { id: 'rl', model: 'rl', name: "Gjallarhorn't", type: 'Rocket Launcher', slot: 2, ammo: 'heavy', rarity: 'exotic', kind: 'rocket', dmg: 140, splash: 5, splashDmg: 270, rof: 1.0, mag: 1, reload: 2.0, color: 0xffaa55, sound: 'rl', kick: [0.05, 0.015, 2.4], aa: [0, 0], zoom: 48, scope: 'rl', adsZ: -0.36, hip: [0.15, -0.16, -0.42], brick: 2, maxRes: 6, fixedPerks: ['wolfpack'], flavor: 'It is a horn. A party horn. It is also a rocket launcher.' },
  mg: { id: 'mg', model: 'mg', name: 'Vine Boom Deluxe', type: 'Machine Gun', slot: 2, ammo: 'heavy', rarity: 'legendary', kind: 'auto', dmg: 32, crit: 1.5, rof: 0.115, mag: 50, reload: 3.0, spread: 0.014, range: 110, falloff: [40, 80, 0.7], color: 0xffd070, sound: 'mg', kick: [0.016, 0.01, 0.6], aa: [1.6, 80], zoom: 60, adsZ: -0.42, hip: [0.15, -0.16, -0.36], brick: 60, maxRes: 200, flavor: '🗿 (sound effect not included) (it is included)' },
  gl: { id: 'gl', model: 'gl', name: 'Bonk Launcher', type: 'Grenade Launcher', slot: 2, ammo: 'heavy', rarity: 'legendary', kind: 'gl', dmg: 45, splash: 4.5, splashDmg: 220, rof: 0.85, mag: 4, reload: 2.6, speed: 32, gravity: 14, color: 0xffb060, sound: 'gl', kick: [0.045, 0.015, 1.8], aa: [0, 0], zoom: 56, adsZ: -0.42, hip: [0.15, -0.16, -0.38], brick: 4, maxRes: 12, flavor: 'Go to horny jail. Each round is a little jail.' },
};
export const SLOT_NAMES = ['KINETIC', 'ENERGY', 'POWER'];
const PRECISION = (d) => ['single', 'auto', 'burst', 'sniper'].includes(d.kind);

// ---------------------------------------------------------------- perks
// col a = utility/reload, col b = damage/on-kill. ok(d) limits which guns can roll it.
export const PERKS = {
  outlaw: { name: 'Outlaw', icon: '🤠', col: 'a', desc: 'Precision kills greatly increase reload speed.', ok: PRECISION },
  frenzy: { name: 'Feeding Frenzy', icon: '🍽️', col: 'a', desc: 'Each kill stacks faster reloads.' },
  subsistence: { name: 'Subsistence', icon: '♻️', col: 'a', desc: 'Kills refill part of the magazine from reserves.' },
  triple_tap: { name: 'Triple Tap', icon: '🎯', col: 'a', desc: 'Every 3 precision hits puts a free round in the mag.', ok: PRECISION },
  holster: { name: 'Auto-Loading Holster', icon: '🧳', col: 'a', desc: 'Reloads itself after 3s stowed.' },
  overflow: { name: 'Overflow', icon: '🌊', col: 'a', desc: 'Picking up ammo overfills the magazine to double.', ok: (d) => d.ammo !== 'primary' },
  snapshot: { name: 'Snapshot Sights', icon: '📸', col: 'a', desc: 'Aims down sights much faster.' },
  opening: { name: 'Opening Shot', icon: '🚪', col: 'a', desc: 'First shot after 2s of not firing deals +25% damage.' },
  stonks: { name: 'Stonks', icon: '📈', col: 'a', desc: 'Each consecutive hit: +3% damage (max +45%). Two misses in a row and the market crashes.' },
  ratio: { name: 'Ratio', icon: '💬', col: 'a', desc: 'Precision hits ratio the target: it takes +15% damage from you for 4s.', ok: PRECISION },
  tracking: { name: 'Tracking Module', icon: '🛰️', col: 'a', desc: 'Rockets home in on the nearest meme.', ok: (d) => d.kind === 'rocket' },
  rampage: { name: 'Rampage', icon: '😤', col: 'b', desc: 'Kills grant stacking damage (x3), refreshed on each kill.' },
  kill_clip: { name: 'Kill Clip', icon: '📎', col: 'b', desc: 'Reloading soon after a kill: +25% damage for 5s.' },
  firefly: { name: 'Firefly', icon: '🔥', col: 'b', desc: 'Precision kills explode.', ok: PRECISION },
  vorpal: { name: 'Vorpal Weapon', icon: '⚔️', col: 'b', desc: '+15% damage to majors and bosses.' },
  vine_boom: { name: 'Vine Boom', icon: '🗿', col: 'b', desc: 'Kills release a vine boom that damages and staggers nearby memes.' },
  touch_grass: { name: 'Touch Grass', icon: '🌱', col: 'b', desc: 'Kills restore health and shields.' },
  rizz: { name: 'Rizz', icon: '😏', col: 'b', desc: 'Kills charge your super. Precision kills also charge your grenade.' },
  demolitionist: { name: 'Demolitionist', icon: '💣', col: 'b', desc: 'Kills charge your grenade. Throwing a grenade reloads this gun.' },
  cluster: { name: 'Cluster Bombs', icon: '🎆', col: 'b', desc: 'Rockets release a spray of bomblets on impact.', ok: (d) => d.kind === 'rocket' },
  spike: { name: 'Spike Grenades', icon: '📌', col: 'b', desc: 'Direct grenade impacts deal +50% damage.', ok: (d) => d.kind === 'gl' },
  // exotic traits
  wolfpack: { name: 'Wolfpack Rounds', icon: '🐺', col: 'x', desc: 'Rockets split into seeking mini-rockets on impact.' },
  memento: { name: 'Memento Potato', icon: '🥔', col: 'x', desc: 'Reloading after a kill empowers the next 6 shots (+25% damage).' },
  grassy: { name: 'Touch of Grass', icon: '🌱', col: 'x', desc: 'The last 3 rounds in the mag deal +60% damage and grow back by themselves, at 4 health a shot (never lethal). Precision kills touch grass: health and shields back, and a stack of brainrot gone.' },
  rizzrunner: { name: 'Rizzrunner', icon: '⚡', col: 'x', desc: 'Taking damage charges Rizz. At full Rizz, for 6 s every hit chains lightning to up to two nearby memes and puts a round back in the mag.' },
  mogged: { name: 'Mogged', icon: '🗿', col: 'x', desc: 'Precision hits mog the target: it takes damage every half second for 3 s.' },
  shiny: { name: 'Ooh, Shiny', icon: '🔴', col: 'x', desc: "The beam's damage ramps up the longer you hold it (up to double), and minor memes it touches get distracted and stop for a moment." },
  mlg: { name: '360 No Scope', icon: '🎮', col: 'x', desc: 'Shots fired while airborne are perfectly accurate and deal double damage. Airborne kills: AIRHORN.' },
};

// ---------------------------------------------------------------- loot + inventory
let uidN = Date.now() % 100000;
const STORE = 'voc-inv-v1';
export function rollPerks(def) {
  if (def.fixedPerks) return def.fixedPerks.slice();
  const pool = (col) => Object.entries(PERKS).filter(([, p]) => p.col === col && (!p.ok || p.ok(def))).map(([k]) => k);
  return [pick(pool('a')), pick(pool('b'))];
}
// every gun's element
const ELEMENT_OF = { rz: 'arc', lm: 'void', smg: 'arc', bw: 'void', sa: 'solar', tr: 'solar', lf: 'void', tg: 'arc', hc: 'solar', ar: 'arc', pr: 'void', sr: 'void', sg: 'arc', sn: 'solar', ns: 'arc', fr: 'void', rl: 'solar', mg: 'arc', gl: 'void' };
for (const id in DEFS) DEFS[id].element = ELEMENT_OF[id] || 'solar';

export function makeItem(id, perks = null) { return { uid: 'w' + (uidN++).toString(36), id, perks: perks || rollPerks(DEFS[id]), isNew: true }; }

export const INV = { items: [], equipped: [null, null, null], shader: 'default' };

// Weapon shaders: recolour every gun. Dark parts take the base colour, lighter parts the accent (keeping their
// shading); glowing bits (sights, cores) keep theirs. Originals are remembered so you can switch back.
export const SHADERS = {
  default: { name: 'Factory' },
  gold: { name: 'Gold Digger', a: 0xe8b84a, b: 0x2a2015, metal: 0.95, rough: 0.22 },
  ohio: { name: 'Welcome to Ohio', a: 0xff4fd8, b: 0x34105a, metal: 0.45, rough: 0.35 },
  chungus: { name: 'Simply Too Purple', a: 0xb8acff, b: 0x3a2d6a, metal: 0.5, rough: 0.4 },
  sigma: { name: 'Sigma Grindset', a: 0x3a3a42, b: 0x0b0b0d, metal: 0.85, rough: 0.18 },
  doge: { name: 'Such Shiba', a: 0xe8a858, b: 0xf6e8cc, metal: 0.1, rough: 0.65 },
  grass: { name: 'Touch Grass', a: 0x8dff9a, b: 0x1e3a24, metal: 0.3, rough: 0.5 },
};
export function applyShader(group, key = INV.shader) {
  if (group.userData?.fixedShader) key = group.userData.fixedShader; // (the raid exotic always looks like grass)
  const s = SHADERS[key] || SHADERS.default;
  group.traverse((o) => {
    if (!o.isMesh || !o.material?.isMeshStandardMaterial) return;
    const m = o.material, ud = m.userData;
    ud.orig ??= { c: m.color.getHex(), metal: m.metalness, rough: m.roughness };
    if (!s.a) { m.color.setHex(ud.orig.c); m.metalness = ud.orig.metal; m.roughness = ud.orig.rough; return; }
    if (m.emissiveIntensity > 0.5 && m.emissive.getHex() !== 0) return;
    const c = new THREE.Color(ud.orig.c), l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    m.color.setHex(l < 0.12 ? s.b : s.a).multiplyScalar(0.55 + Math.min(1, l) * 0.9);
    m.metalness = s.metal ?? ud.orig.metal; m.roughness = s.rough ?? ud.orig.rough;
  });
}
export function loadInventory() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && s.items?.length) { INV.items = s.items.filter((i) => DEFS[i.id]); INV.equipped = s.equipped; INV.shader = s.shader || 'default'; }
  } catch (e) { /* fresh start */ }
  if (!INV.items.length) {
    // starter kit
    const a = makeItem('hc'), b = makeItem('sg', ['holster', 'vine_boom']), c = makeItem('rl');
    const d = makeItem('ar', ['stonks', 'rampage']);
    [a, b, c, d].forEach((i) => (i.isNew = false));
    INV.items = [a, b, c, d];
    INV.equipped = [a.uid, b.uid, c.uid];
  }
  for (let s = 0; s < 3; s++) if (!INV.items.find((i) => i.uid === INV.equipped[s] && DEFS[i.id].slot === s)) INV.equipped[s] = INV.items.find((i) => DEFS[i.id].slot === s)?.uid ?? null;
  saveInventory();
}
export function saveInventory() { try { localStorage.setItem(STORE, JSON.stringify(INV)); } catch (e) { /* fine */ } }
export function equippedItem(slot) { return INV.items.find((i) => i.uid === INV.equipped[slot]) || null; }
export function addItem(item) {
  INV.items.push(item);
  // keep the vault from exploding: drop the oldest unequipped duplicates past 36
  while (INV.items.length > 36) {
    const idx = INV.items.findIndex((i) => !INV.equipped.includes(i.uid) && DEFS[i.id].rarity !== 'exotic');
    if (idx < 0) break; INV.items.splice(idx, 1);
  }
  saveInventory();
  return item;
}
// Loot roll. `exoticChance` rolls for an exotic you don't own yet.
export function rollLoot({ exoticChance = 0, slot = null } = {}) {
  const owned = new Set(INV.items.map((i) => i.id));
  const exotics = Object.values(DEFS).filter((d) => d.rarity === 'exotic' && !d.questOnly && !owned.has(d.id));
  if (exotics.length && Math.random() < exoticChance) return addItem(makeItem(pick(exotics).id));
  const legs = Object.values(DEFS).filter((d) => d.rarity === 'legendary' && (slot == null || d.slot === slot));
  return addItem(makeItem(pick(legs).id));
}
export function describe(item) {
  const d = DEFS[item.id];
  return `${d.name} (${d.type}) · ${item.perks.map((p) => PERKS[p].icon + ' ' + PERKS[p].name).join(' · ')}`;
}

// ---------------------------------------------------------------- perk engine (one per player)
export class PerkEngine {
  constructor(player) { this.p = player; this.buffs = {}; this.moggedList = []; }
  has(w, id) { return w.inst.perks.includes(id); }
  buff(id, dur, add = 1, max = 1) {
    const b = this.buffs[id] || (this.buffs[id] = { t: 0, n: 0 });
    b.t = dur; b.n = Math.min(max, b.n + add);
  }
  n(id) { const b = this.buffs[id]; return b && b.t > 0 ? b.n : 0; }
  // Rizzrunner charges from damage taken (the player's hurt() calls this)
  onHurt(amount) {
    const w = this.p.wpn[this.p.cur];
    if (!w || !this.has(w, 'rizzrunner') || this.n('rizzrunner')) return;
    w.rizz = Math.min(100, (w.rizz || 0) + amount * 1.6);
    lhud('setDebuff', 'rizz', `⚡ RIZZ ${Math.floor(w.rizz)}%`);
    if (w.rizz >= 100) { w.rizz = 0; this.buff('rizzrunner', 6); lhud('clearDebuff', 'rizz'); lhud('killfeed', '⚡ Rizzrunner: unspoken rizz unlocked'); play('superReady'); }
  }
  tick(dt) {
    // Mogged: the damage-over-time ticks on whoever is mogged
    for (let i = (this.moggedList ||= []).length - 1; i >= 0; i--) {
      const e = this.moggedList[i];
      if (!e.alive || !(e.mogUntil > G.time)) { this.moggedList.splice(i, 1); continue; }
      if (G.time >= e.mogNext) { e.mogNext = G.time + 0.5; e.takeDamage(16, false, { splash: true, element: 'void', weapon: e.mogBy }); if (Math.random() < 0.4) fxm.floatText(e.top(), '🗿', { height: 0.35, life: 0.5 }); }
    }
    for (const [id, b] of Object.entries(this.buffs)) {
      if (b.t > 0) {
        b.t -= dt;
        const P = PERKS[id];
        lhud('setDebuff', 'perk-' + id, `${P.icon} ${P.name.toUpperCase()}${b.n > 1 ? ' x' + b.n : ''}  ${Math.ceil(b.t)}s`);
        if (b.t <= 0) { b.n = 0; lhud('clearDebuff', 'perk-' + id); }
      }
    }
    // auto-loading holster: stowed guns top themselves off
    const p = this.p;
    p.wpn.forEach((w, i) => {
      if (i === p.cur || !this.has(w, 'holster') || w.mag >= w.def.mag) { w.holsterT = 0; return; }
      w.holsterT = (w.holsterT || 0) + dt;
      if (w.holsterT > 3) { w.holsterT = 0; p.refill(w); }
    });
  }
  // damage multiplier for this shot
  dmgMult(w, e, crit) {
    const p = this.p; let m = 1;
    const r = this.n('rampage'); if (r && this.has(w, 'rampage')) m *= [1, 1.1, 1.2, 1.33][r];
    if (this.n('kill_clip') && this.has(w, 'kill_clip')) m *= 1.25;
    if (this.has(w, 'vorpal') && e && e.rank !== 'minor') m *= 1.15;
    if (this.has(w, 'stonks')) m *= 1 + 0.03 * (w.stonks || 0);
    if (this.has(w, 'ratio') && e && e.ratioUntil > G.time) m *= 1.15;
    if (this.has(w, 'opening') && w.openingShot) m *= 1.25;
    if (this.has(w, 'memento') && w.memento > 0) m *= 1.25;
    if (this.has(w, 'mlg') && !p.onGround) m *= 2;
    if (this.has(w, 'grassy') && w.grassShot) m *= 1.6;
    return m;
  }
  reloadMult(w) {
    let m = 1;
    if (this.n('outlaw') && this.has(w, 'outlaw')) m = Math.min(m, 0.55);
    const f = this.n('frenzy'); if (f && this.has(w, 'frenzy')) m = Math.min(m, 1 - 0.1 * f);
    return m;
  }
  onFire(w) {
    w.openingShot = G.time - (w.lastFire ?? -10) > 2; w.lastFire = G.time;
    if (w.memento > 0) w.memento--;
    // Touch of Grass: the last three rounds come back, and they cost you
    w.grassShot = this.has(w, 'grassy') && w.mag < 3;
    if (w.grassShot) {
      w.mag++;
      const p = this.p; p.hp = Math.max(1, p.hp - 4); p.lastHurt = G.time;
      if (Math.random() < 0.35) fxm.floatText(p.pos.clone().setY(p.pos.y + 2.1), '🌱', { height: 0.3, life: 0.6 });
    }
  }
  onHit(w, e, crit) {
    if (this.has(w, 'rizzrunner') && this.n('rizzrunner') && e) {
      w.mag = Math.min(w.def.mag, w.mag + 1);
      const near = G.enemies.filter((o) => o !== e && o.alive && o.hostile !== false && !o.untargetable && o.pos.distanceTo(e.pos) < 8).slice(0, 2);
      for (const o of near) { o.takeDamage(12, false, { splash: true, element: 'arc', weapon: w.def.id }); fxm.tracer(e.center(), o.center(), 0x7fd7ff, 0.03, 0.08); }
    }
    if (crit && this.has(w, 'mogged') && e) { e.mogUntil = G.time + 3; e.mogBy = w.def.id; e.mogNext = e.mogNext > G.time ? e.mogNext : G.time + 0.5; if (!this.moggedList.includes(e)) this.moggedList.push(e); }
    if (this.has(w, 'shiny') && e && e.rank === 'minor' && !(e.shinyAt > G.time)) { e.shinyAt = G.time + 1.2; e.stunT = Math.max(e.stunT || 0, 0.3); if (Math.random() < 0.25) fxm.floatText(e.top(), pick(['ooh', 'shiny', '!?', 'red dot']), { height: 0.35, life: 0.6 }); }
    if (this.has(w, 'stonks')) { w.stonks = Math.min(15, (w.stonks || 0) + 1); w.misses = 0; }
    if (crit && this.has(w, 'ratio') && e) { e.ratioUntil = G.time + 4; if (Math.random() < 0.3) fxm.dmgNumber(e.top(), 'RATIO', 'immune'); }
    if (crit && this.has(w, 'triple_tap')) { w.crits = (w.crits || 0) + 1; if (w.crits % 3 === 0 && w.mag < w.def.mag) { w.mag++; play('shellIn'); } }
  }
  onMiss(w) {
    if (!this.has(w, 'stonks') || !w.stonks) return;
    w.misses = (w.misses || 0) + 1;
    if (w.misses >= 2) { w.stonks = 0; w.misses = 0; lhud('killfeed', '📉 NOT STONKS (market crashed)'); }
  }
  onKill(w, e, crit, pos) {
    const p = this.p;
    if (this.has(w, 'rampage')) this.buff('rampage', 4.5, 1, 3);
    if (this.has(w, 'kill_clip') || this.has(w, 'memento')) w.killReady = G.time + 3;
    if (crit && this.has(w, 'outlaw')) this.buff('outlaw', 6);
    if (this.has(w, 'frenzy')) this.buff('frenzy', 3.5, 1, 4);
    if (crit && this.has(w, 'firefly')) this.boom(pos, 3, 90, 0xff8a2a, w.def.id);
    if (this.has(w, 'vine_boom')) {
      this.boom(pos, 4.5, 70, 0x9a9488, w.def.id);
      playAt(pos, 'vineBoom', 1 + Math.random() * 0.3);
    }
    if (crit && this.has(w, 'grassy')) {
      p.hp = Math.min(p.maxHp, p.hp + 30); p.shield = Math.min(p.maxShield, p.shield + 30);
      if (G.encounter?.brainrot > 0) G.encounter.brainrot--;
      fxm.floatText(p.pos.clone().setY(p.pos.y + 2.2), '*touches grass*', { height: 0.35, life: 0.9, color: '#9dff9d' });
    }
    if (this.has(w, 'touch_grass')) { p.hp = Math.min(p.maxHp, p.hp + 20); p.shield = Math.min(p.maxShield, p.shield + 25); fxm.floatText(p.pos.clone().setY(p.pos.y + 2.2), '🌱', { height: 0.4, life: 0.8 }); }
    if (this.has(w, 'rizz')) { p.addSuper(4); if (crit) p.grenadeCd = Math.max(0, p.grenadeCd - 2); }
    if (this.has(w, 'demolitionist')) p.grenadeCd = Math.max(0, p.grenadeCd - 3);
    if (this.has(w, 'subsistence')) p.refill(w, Math.ceil(w.def.mag * 0.25));
    if (this.has(w, 'mlg') && !p.onGround) {
      play('airhorn');
      lhud('bigText', '360 NO SCOPE', pick(['GET REKT', 'MOM GET THE CAMERA', 'OHHHHHH', 'git gud']), 1.4, 'meme');
      p.addSuper(6);
    }
  }
  onReloadDone(w) {
    if (w.killReady > G.time) {
      if (this.has(w, 'kill_clip')) this.buff('kill_clip', 5);
      if (this.has(w, 'memento')) { w.memento = 6; lhud('killfeed', '🥔 Memento Potato: next 6 shots empowered'); }
    }
    w.killReady = 0;
  }
  onAmmo(w) { if (this.has(w, 'overflow')) w.mag = Math.min(w.def.mag * 2, w.mag + w.def.mag); }
  onGrenade() { const p = this.p; const w = p.wpn[p.cur]; if (this.has(w, 'demolitionist')) p.refill(w); }
  // explosion from a perk: damage applies on this machine, teammates see the boom
  boom(pos, r, dmg, color, weapon = null) {
    explode(pos, r, dmg, { color, knock: 0.4, localFx: true, big: 0.7, weapon });
    G.net.playerEv(['pfx', 'boom', [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)], r, color]);
  }
}

// ---------------------------------------------------------------- models for the new guns
function M(c, o = {}) { return addWear(new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.7, ...o })); }
function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; }
const BX = (w, h, d) => bevelBox(w, h, d);
const CY = (r, l, s = 14, r2 = r) => new THREE.CylinderGeometry(r, r2, l, s);

// Left-hand placement per model (foregrip)
export const LEFT_HAND = { rz: [0, -0.07, -0.2], lm: [0, -0.02, -0.02], smg: [0, -0.07, -0.2], sa: [0, -0.07, -0.02], bow: [0, -0.02, -0.02], tr: [0, -0.07, -0.26], lf: [0, -0.08, -0.32], tg: [0, -0.06, -0.28], ar: [0, -0.06, -0.26], pr: [0, -0.06, -0.24], sr: [0, -0.06, -0.28], sn: [0, -0.07, -0.3], ns: [0, -0.07, -0.3], fr: [0, -0.07, -0.25], mg: [0, -0.09, -0.3], gl: [0, -0.08, -0.22] };

export function buildModel(kind) {
  if (kind === 'rz') {
    // the SMG, wired up: arc-blue glow strips and a coil
    const r = buildModel('smg'); r.kind = 'rz';
    const arc = M(0x0a2a3a, { emissive: 0x7fd7ff, emissiveIntensity: 2.0 });
    part(r.group, BX(0.054, 0.012, 0.22), arc, 0, -0.035, -0.06);
    for (let i = 0; i < 3; i++) part(r.group, new THREE.TorusGeometry(0.03, 0.006, 6, 12), arc, 0, 0.012, -0.25 - i * 0.03);
    r.group.traverse((o) => { if (o.isMesh && o.material?.color?.getHex?.() === 0x262a24) o.material = M(0x1e2230, { roughness: 0.35 }); });
    return r;
  }
  if (kind === 'lm') {
    // the bow, royal: purple limbs and gold tips
    const r = buildModel('bow'); r.kind = 'lm';
    r.group.traverse((o) => {
      const c = o.material?.color?.getHex?.();
      if (c === 0x3a1f2c) o.material = M(0x3a1a5a, { roughness: 0.35 });
      else if (c === 0xff7aa8) o.material = M(0xffd23f, { emissive: 0xaa7a00, emissiveIntensity: 0.8, metalness: 0.9 });
    });
    return r;
  }
  if (kind === 'tg') {
    const r = buildModel('sr'); r.kind = 'tg';
    // a fine fuzz of grass along the top and sides (thin blades, a few shades of green)
    const blades = [0x5fd35f, 0x7ee36a, 0x3fae4a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, emissive: 0x1a5a1a, emissiveIntensity: 0.35 }));
    const geo = new THREE.ConeGeometry(0.0025, 1, 3); geo.translate(0, 0.5, 0);
    for (let i = 0; i < 60; i++) {
      const h = 0.012 + Math.random() * 0.022, side = Math.random() < 0.7 ? 0 : Math.sign(Math.random() - 0.5);
      const t = part(r.group, geo, blades[i % 3], side ? side * 0.028 : (Math.random() - 0.5) * 0.045, side ? Math.random() * 0.03 : 0.042, -0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5, 0, side ? side * -1.2 : (Math.random() - 0.5) * 0.5);
      t.scale.set(1, h, 1); t.castShadow = false;
    }
    const core = M(0x103010, { emissive: 0x8dff9a, emissiveIntensity: 2.2, metalness: 0.2 });
    part(r.group, CY(0.018, 0.12, 10), core, 0, 0.0, -0.22, Math.PI / 2);
    r.group.userData.fixedShader = 'grass';
    return r;
  }
  const g = new THREE.Group(); const parts = {};
  const sight = new THREE.Object3D();
  let muzzleZ = -0.6;
  const poly = M(0x1e1f24, { metalness: 0.2, roughness: 0.7 });
  if (kind === 'ar' || kind === 'pr' || kind === 'sr') {
    const body = M(kind === 'pr' ? 0x1f3a2a : kind === 'sr' ? 0x3a1f22 : 0x2a2c33, { roughness: 0.4 });
    const accent = kind === 'pr' ? M(0x22dd55, { emissive: 0x119933, emissiveIntensity: 0.8 }) : kind === 'sr' ? M(0xc51111, { metalness: 0.3 }) : M(0xffb020, { metalness: 0.4 });
    part(g, BX(0.055, 0.08, 0.32), body, 0, 0, -0.08);
    part(g, BX(0.05, 0.06, 0.24), body, 0, -0.005, -0.34);
    part(g, CY(0.014, kind === 'sr' ? 0.34 : 0.24), M(0x111111), 0, 0.01, kind === 'sr' ? -0.6 : -0.54, Math.PI / 2);
    part(g, BX(0.058, 0.01, 0.3), accent, 0, 0.043, -0.1);
    parts.mag = part(g, BX(0.04, 0.13, 0.06), poly, 0, -0.1, -0.12, 0.2);
    part(g, BX(0.04, 0.1, 0.05), poly, 0, -0.07, 0.04, -0.3);
    part(g, BX(0.045, 0.075, 0.2), poly, 0, -0.025, 0.17, 0.12);
    if (kind === 'sr') {
      // little scope (it's a crewmate visor. of course it is.)
      part(g, CY(0.024, 0.16, 16), M(0x111111), 0, 0.075, -0.08, Math.PI / 2);
      part(g, new THREE.CircleGeometry(0.02, 16), M(0x9fd8ef, { emissive: 0x2a6080, metalness: 0.9, roughness: 0.05 }), 0, 0.075, 0.001);
      sight.position.set(0, 0.075, 0.0);
    } else if (kind === 'pr') {
      // holo red-dot
      part(g, BX(0.05, 0.05, 0.012), M(0x111111), 0, 0.07, -0.08);
      part(g, new THREE.CircleGeometry(0.006, 8), M(0xff2020, { emissive: 0xff2020, emissiveIntensity: 3 }), 0, 0.07, -0.073);
      sight.position.set(0, 0.07, 0.02);
    } else {
      part(g, BX(0.008, 0.02, 0.01), accent, 0, 0.06, -0.42);
      part(g, BX(0.03, 0.02, 0.012), body, 0, 0.055, 0.0);
      sight.position.set(0, 0.062, 0.02);
    }
    muzzleZ = kind === 'sr' ? -0.77 : -0.66;
  } else if (kind === 'sn' || kind === 'ns') {
    const exo = kind === 'ns';
    const body = M(exo ? 0x1a8a3a : 0x2e3a52, { roughness: 0.35, emissive: exo ? 0x0a3a14 : 0, emissiveIntensity: 0.5 });
    const trim = M(exo ? 0xffe066 : 0x9fd8ff, { emissive: exo ? 0xffaa00 : 0x2a6aa0, emissiveIntensity: 0.9 });
    part(g, BX(0.06, 0.08, 0.36), body, 0, 0, -0.06);
    part(g, CY(0.016, 0.62), M(0x111111), 0, 0.012, -0.55, Math.PI / 2);
    part(g, CY(0.024, 0.08), body, 0, 0.012, -0.86, Math.PI / 2);
    part(g, BX(0.062, 0.012, 0.3), trim, 0, 0.044, -0.06);
    parts.mag = part(g, BX(0.04, 0.09, 0.06), poly, 0, -0.08, -0.06);
    part(g, BX(0.04, 0.1, 0.05), poly, 0, -0.08, 0.05, -0.3);
    part(g, BX(0.05, 0.09, 0.26), body, 0, -0.03, 0.22, 0.08);
    part(g, CY(0.032, 0.3, 16), M(0x0d0d10), 0, 0.09, -0.08, Math.PI / 2);
    part(g, CY(0.038, 0.06, 16), M(0x0d0d10), 0, 0.09, -0.24, Math.PI / 2);
    part(g, new THREE.CircleGeometry(0.028, 16), M(exo ? 0xffe066 : 0x8fd0ff, { emissive: exo ? 0xaa7700 : 0x205080, metalness: 0.9, roughness: 0.05 }), 0, 0.09, 0.071);
    if (exo) { // doritos + mountain dew charm. it is canon.
      const chip = part(g, new THREE.ConeGeometry(0.025, 0.01, 3), M(0xff8a20, { metalness: 0 }), 0.04, -0.05, 0.08, Math.PI / 2, 0, 0); parts.chip = chip;
      part(g, CY(0.012, 0.04, 8), M(0x40ff40, { emissive: 0x1a8a1a }), -0.04, -0.06, 0.12);
    }
    sight.position.set(0, 0.09, 0.07);
    muzzleZ = -0.9;
  } else if (kind === 'smg') {
    // compact, boxy, a long stick mag and a neon trim
    const body = M(0x262a24, { roughness: 0.4 }), neon = M(0x9cff3a, { emissive: 0x4a9a10, emissiveIntensity: 0.9 });
    part(g, BX(0.05, 0.075, 0.24), body, 0, 0, -0.06);
    part(g, BX(0.045, 0.06, 0.12), body, 0, -0.005, -0.23);
    part(g, CY(0.012, 0.1), M(0x111111), 0, 0.01, -0.33, Math.PI / 2);
    part(g, BX(0.052, 0.01, 0.2), neon, 0, 0.042, -0.07);
    parts.mag = part(g, BX(0.032, 0.17, 0.04), poly, 0, -0.12, -0.12, 0.1);
    part(g, BX(0.035, 0.09, 0.045), poly, 0, -0.07, 0.03, -0.3);
    part(g, BX(0.012, 0.04, 0.16), poly, 0, -0.01, 0.13); // folding stock
    part(g, BX(0.008, 0.03, 0.012), neon, 0, 0.062, -0.02);
    sight.position.set(0, 0.062, 0.02);
    muzzleZ = -0.39;
  } else if (kind === 'sa') {
    // a stubby pistol with a pickle-green slide
    const slide = M(0x3f8a2a, { roughness: 0.35 }), frame = M(0x1c1d20, { roughness: 0.5 });
    part(g, BX(0.042, 0.048, 0.2), slide, 0, 0.02, -0.08);
    part(g, BX(0.04, 0.035, 0.18), frame, 0, -0.02, -0.07);
    part(g, BX(0.036, 0.11, 0.055), frame, 0, -0.08, 0.02, -0.25);
    parts.mag = part(g, BX(0.03, 0.04, 0.045), poly, 0, -0.14, 0.035, -0.25);
    for (let i = 0; i < 5; i++) part(g, BX(0.044, 0.006, 0.006), M(0x2a6a1a), 0, 0.03, -0.13 + i * 0.02);
    part(g, BX(0.008, 0.012, 0.012), M(0xffee66, { emissive: 0xaa8800, emissiveIntensity: 0.8 }), 0, 0.05, -0.16);
    sight.position.set(0, 0.052, 0.0);
    muzzleZ = -0.19;
  } else if (kind === 'bow') {
    // a recurve bow held upright: two curved limbs, a grip, the string and a nocked arrow
    const limb = M(0x3a1f2c, { roughness: 0.4 }), pink = M(0xff7aa8, { emissive: 0xaa2a5a, emissiveIntensity: 0.7 });
    const grip = part(g, BX(0.03, 0.12, 0.04), M(0x2a2a2a, { roughness: 0.8 }), 0, 0, -0.02);
    for (const s of [1, -1]) {
      const l = part(g, new THREE.TorusGeometry(0.155, 0.011, 6, 18, Math.PI * 0.42), limb, 0, s * 0.02, -0.13, 0, Math.PI / 2, s > 0 ? Math.PI * 0.5 : Math.PI * 1.08);
      part(g, BX(0.012, 0.02, 0.012), pink, 0, s * 0.17, -0.08);
    }
    // the string is two halves that meet at the nock; the nock moves back as you draw
    parts.nock = new THREE.Object3D(); parts.nock.position.set(0, 0, 0.06); g.add(parts.nock);
    const strMat = new THREE.MeshBasicMaterial({ color: 0xfff4ff });
    parts.strings = [1, -1].map((s) => { const m = part(g, CY(0.0045, 1, 5), strMat, 0, 0, 0); m.userData.s = s; return m; });
    parts.arrow = part(parts.nock, CY(0.004, 0.42, 6), M(0xd8c8b0, { metalness: 0, roughness: 0.7 }), 0, 0, -0.21, Math.PI / 2);
    part(parts.arrow, new THREE.ConeGeometry(0.01, 0.035, 6), pink, 0, -0.225, 0, Math.PI);
    parts.bowTips = [new THREE.Vector3(0, 0.17, -0.08), new THREE.Vector3(0, -0.17, -0.08)];
    // canted slightly toward the middle of the screen, the way FPS bows are held
    const cant = new THREE.Group(); cant.rotation.z = -0.2;
    for (const c of [...g.children]) cant.add(c);
    g.add(cant); parts.cant = cant;
    sight.position.set(0, 0.05, 0.03);
    muzzleZ = -0.45;
  } else if (kind === 'tr') {
    // a sleek white trace rifle with a red emitter at the front... and cat ears
    const shell = M(0xeeeef2, { roughness: 0.3, metalness: 0.2 }), red = M(0x220000, { emissive: 0xff2a3a, emissiveIntensity: 2.4 });
    part(g, BX(0.06, 0.085, 0.4), shell, 0, 0, -0.1);
    part(g, CY(0.03, 0.12, 14), shell, 0, 0.005, -0.36, Math.PI / 2);
    part(g, new THREE.SphereGeometry(0.022, 12, 10), red, 0, 0.005, -0.43);
    part(g, BX(0.062, 0.012, 0.3), red, 0, -0.03, -0.1);
    for (const s of [-1, 1]) part(g, new THREE.ConeGeometry(0.018, 0.04, 4), M(0xffb6c8), s * 0.022, 0.06, -0.02);
    parts.mag = part(g, BX(0.05, 0.05, 0.1), poly, 0, -0.07, -0.02);
    part(g, BX(0.04, 0.09, 0.05), poly, 0, -0.07, 0.07, -0.3);
    sight.position.set(0, 0.06, 0.04);
    muzzleZ = -0.45;
  } else if (kind === 'lf') {
    // a long rail with three glowing charge coils
    const body = M(0x1d1a2a, { roughness: 0.35 }), coil = M(0x2a1050, { emissive: 0xb98bff, emissiveIntensity: 1.6 });
    part(g, BX(0.065, 0.09, 0.5), body, 0, 0, -0.14);
    part(g, BX(0.03, 0.03, 0.4), M(0x111111), 0, 0.015, -0.55);
    parts.coils = [];
    for (let i = 0; i < 3; i++) parts.coils.push(part(g, new THREE.TorusGeometry(0.04, 0.009, 6, 16), coil, 0, 0.015, -0.42 - i * 0.11));
    parts.mag = part(g, BX(0.05, 0.08, 0.1), poly, 0, -0.08, -0.05);
    part(g, BX(0.045, 0.1, 0.05), poly, 0, -0.08, 0.08, -0.3);
    part(g, BX(0.05, 0.07, 0.18), body, 0, -0.02, 0.2, 0.1);
    part(g, CY(0.02, 0.18, 10), M(0x222222), 0, 0.08, -0.08, Math.PI / 2);
    sight.position.set(0, 0.1, 0.02);
    muzzleZ = -0.76;
  } else if (kind === 'fr') {
    const body = M(0x2a1f3a, { roughness: 0.35 }), glow = M(0xc58bff, { emissive: 0xb070ff, emissiveIntensity: 1 });
    part(g, BX(0.07, 0.09, 0.34), body, 0, 0, -0.08);
    for (const a of [0, 2.1, 4.2]) part(g, CY(0.014, 0.3), body, Math.cos(a) * 0.028, 0.01 + Math.sin(a) * 0.028, -0.38, Math.PI / 2);
    parts.charge = part(g, new THREE.SphereGeometry(0.03, 12, 10), glow, 0, 0.01, -0.27);
    for (let i = 0; i < 3; i++) part(g, BX(0.074, 0.012, 0.03), glow, 0, 0.03 - i * 0.03, -0.02 - i * 0.06);
    parts.mag = part(g, BX(0.045, 0.08, 0.07), poly, 0, -0.08, -0.08);
    part(g, BX(0.04, 0.1, 0.05), poly, 0, -0.08, 0.05, -0.3);
    part(g, BX(0.05, 0.07, 0.2), poly, 0, -0.02, 0.17, 0.1);
    part(g, BX(0.008, 0.02, 0.01), glow, 0, 0.06, -0.24);
    sight.position.set(0, 0.06, 0.02);
    muzzleZ = -0.55;
  } else if (kind === 'mg') {
    const body = M(0x3a3a2a, { roughness: 0.45 }), gold = M(0xc9a24b, { metalness: 0.9, roughness: 0.3 });
    part(g, BX(0.08, 0.1, 0.4), body, 0, 0, -0.1);
    part(g, CY(0.02, 0.5), M(0x111111), 0, 0.015, -0.55, Math.PI / 2);
    for (let i = 0; i < 6; i++) part(g, CY(0.026, 0.02), M(0x222222), 0, 0.015, -0.36 - i * 0.05, Math.PI / 2);
    parts.mag = part(g, BX(0.09, 0.12, 0.12), body, -0.06, -0.08, -0.1);
    part(g, BX(0.04, 0.11, 0.05), poly, 0, -0.09, 0.06, -0.3);
    part(g, BX(0.06, 0.09, 0.22), poly, 0, -0.02, 0.22, 0.08);
    // a moai bust on the top cover. vine boom deluxe.
    const moai = new THREE.Group(); moai.position.set(0, 0.07, -0.18); g.add(moai);
    part(moai, BX(0.035, 0.06, 0.03), M(0x86827a, { metalness: 0, roughness: 1, flatShading: true }), 0, 0.03, 0);
    part(moai, BX(0.012, 0.025, 0.012), M(0x86827a, { metalness: 0, roughness: 1 }), 0, 0.03, 0.02);
    part(g, BX(0.03, 0.025, 0.012), gold, 0, 0.065, 0.03);
    sight.position.set(0, 0.08, 0.03);
    muzzleZ = -0.82;
  } else if (kind === 'gl') {
    const body = M(0x5a3a1a, { roughness: 0.6, metalness: 0.2 }), steel = M(0x3a3e46);
    part(g, BX(0.07, 0.09, 0.26), steel, 0, 0, -0.04);
    part(g, CY(0.045, 0.34, 16), steel, 0, 0.015, -0.32, Math.PI / 2);
    parts.drum = part(g, CY(0.075, 0.12, 8), body, 0, -0.03, -0.1, Math.PI / 2);
    part(g, BX(0.04, 0.11, 0.05), M(0x222222), 0, -0.08, 0.06, -0.3);
    part(g, BX(0.05, 0.08, 0.22), body, 0, -0.02, 0.2, 0.1);
    // the bonk bat, strapped on
    part(g, CY(0.012, 0.22, 8, 0.02), M(0x8b5a2b, { metalness: 0, roughness: 0.9 }), 0.055, 0.02, -0.12, Math.PI / 2);
    part(g, BX(0.006, 0.03, 0.012), steel, 0, 0.065, -0.4);
    sight.position.set(0, 0.065, 0.02);
    muzzleZ = -0.5;
  }
  g.add(sight);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, muzzleZ); g.add(muzzle);
  const fl = () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxm.glowTex, color: 0xffd28a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.position.copy(muzzle.position); s.visible = false; g.add(s); return s; };
  const flash = fl(), flash2 = fl(); flash2.material.color.set(0xffffff);
  return { group: g, muzzle, flash, flash2, sight, parts, kind };
}
