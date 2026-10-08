// Exotic armor: one piece per class, equipped in the Armory. Each one bends how your abilities play.
// They drop alongside exotic weapons (any engram that could roll an exotic can roll one of these instead),
// and everyone starts with the Main Character Mask so the slot isn't empty.
// Kept in its own localStorage key so the weapon inventory format never changes.
const STORE = 'voc-armor';

export const ARMOR = {
  drip: { cls: 'hunter', piece: 'Legs', icon: '👟', name: 'Drip Walkers', flavor: 'They are not for running. They are for being seen running.',
    desc: 'Sliding reloads your weapon and gives +20% weapon damage for 3 s. You can slide again sooner.' },
  lens: { cls: 'hunter', piece: 'Helmet', icon: '🕶️', name: 'Rizz Lens', flavor: 'Sees through walls. Mostly sees through people.',
    desc: 'Precision hits mark the target for 4 s: it takes 20% more damage from you.' },
  gigachad: { cls: 'titan', piece: 'Gauntlets', icon: '💪', name: 'Gigachad Gauntlets', flavor: 'Average Titan enjoyer.',
    desc: 'Melee hits three times as hard, and a melee kill gives your grenade back.' },
  unbothered: { cls: 'titan', piece: 'Chest', icon: '🧱', name: 'Unbothered Plate', flavor: 'Moisturized. Happy. In its lane. Flourishing.',
    desc: 'Take 25% less damage while sprinting or sliding. Shields recharge twice as fast.' },
  galaxy: { cls: 'warlock', piece: 'Bond', icon: '🧠', name: 'Galaxy Brain Bond', flavor: 'It has read every comment section. All of them.',
    desc: 'Your grenade recharges 40% faster, and throwing one gives 6% super.' },
  treads: { cls: 'warlock', piece: 'Boots', icon: '🌱', name: 'Touch Grass Treads', flavor: 'Standing still is a skill. Few possess it.',
    desc: 'Stand still on the ground for a second and you heal fast, even under fire, and deal +15% weapon damage.' },
  mask: { cls: 'any', piece: 'Mask', icon: '🎭', name: 'Main Character Mask', flavor: 'Everyone else is an NPC. Statistically.',
    desc: 'Super charges 40% faster. Casting your super refreshes your grenade and melee.' },
};
export const ARMOR_KEYS = Object.keys(ARMOR);
export const fits = (id, cls) => ARMOR[id] && (ARMOR[id].cls === 'any' || ARMOR[id].cls === cls);

export const ARMOR_INV = { owned: ['mask'], on: { hunter: 'mask', titan: 'mask', warlock: 'mask' }, fresh: [] };

export function loadArmor() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s) {
      ARMOR_INV.owned = [...new Set(['mask', ...(s.owned || []).filter((k) => ARMOR[k])])];
      for (const c of ['hunter', 'titan', 'warlock']) if (fits(s.on?.[c], c) && ARMOR_INV.owned.includes(s.on[c])) ARMOR_INV.on[c] = s.on[c];
      ARMOR_INV.fresh = (s.fresh || []).filter((k) => ARMOR[k]);
    }
  } catch (e) { /* fresh start */ }
}
export function saveArmor() { try { localStorage.setItem(STORE, JSON.stringify(ARMOR_INV)); } catch (e) { /* fine */ } }
export const armorOn = (cls) => ARMOR_INV.on[cls] || null;
export function equipArmor(id, cls) {
  if (!fits(id, cls) || !ARMOR_INV.owned.includes(id)) return false;
  ARMOR_INV.on[cls] = id; ARMOR_INV.fresh = ARMOR_INV.fresh.filter((k) => k !== id);
  saveArmor();
  return true;
}
// a piece you don't own yet, preferring your current class; null once you have them all
export function rollArmor(cls) {
  const left = ARMOR_KEYS.filter((k) => !ARMOR_INV.owned.includes(k));
  if (!left.length) return null;
  const mine = left.filter((k) => fits(k, cls));
  const from = mine.length && Math.random() < 0.7 ? mine : left;
  return from[Math.floor(Math.random() * from.length)];
}
export function grantArmor(id) {
  if (!ARMOR[id] || ARMOR_INV.owned.includes(id)) return false;
  ARMOR_INV.owned.push(id); ARMOR_INV.fresh.push(id);
  saveArmor();
  return true;
}
