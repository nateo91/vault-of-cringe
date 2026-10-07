// The Armory: browse your loot, read perks, equip weapons. Tab / I toggles it in-game.
import { G } from './game.js';
import { DEFS, PERKS, INV, SLOT_NAMES, saveInventory } from './arsenal.js';

let root = null, onClose = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initArmory(closeCb) {
  onClose = closeCb;
  root = document.getElementById('armory');
  root.querySelector('#armClose').onclick = () => closeArmory();
  root.addEventListener('click', (e) => {
    const card = e.target.closest('.arm-card');
    if (!card) return;
    equip(card.dataset.uid);
  });
  addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'Escape') { e.preventDefault(); closeArmory(); }
  });
}
export const isOpen = () => root && !root.classList.contains('hidden');

export function openArmory() {
  render();
  root.classList.remove('hidden');
  G.uiOpen = true;
}
export function closeArmory() {
  if (!isOpen()) return;
  root.classList.add('hidden');
  G.uiOpen = false;
  for (const i of INV.items) i.isNew = false;
  saveInventory();
  onClose?.();
}

function equip(uid) {
  const item = INV.items.find((i) => i.uid === uid);
  if (!item) return;
  const slot = DEFS[item.id].slot;
  if (INV.equipped[slot] === uid) return;
  INV.equipped[slot] = uid;
  item.isNew = false;
  saveInventory();
  G.player?.equip(slot, item);
  render();
}

function card(item) {
  const d = DEFS[item.id];
  const on = INV.equipped[d.slot] === item.uid;
  const perks = item.perks.map((k) => `<div class="arm-perk"><span class="pi">${PERKS[k].icon}</span><div><b>${esc(PERKS[k].name)}</b><small>${esc(PERKS[k].desc)}</small></div></div>`).join('');
  const stats = statBars(d);
  return `<div class="arm-card ${d.rarity} ${on ? 'on' : ''}" data-uid="${item.uid}">
    ${on ? '<div class="arm-badge">EQUIPPED</div>' : item.isNew ? '<div class="arm-badge new">NEW</div>' : ''}
    <div class="arm-name">${esc(d.name)}</div>
    <div class="arm-type">${d.rarity === 'exotic' ? 'EXOTIC' : 'LEGENDARY'} ${esc(d.type.toUpperCase())}</div>
    ${stats}
    <div class="arm-perks">${perks}</div>
    <div class="arm-flavor">${esc(d.flavor || '')}</div>
  </div>`;
}
// rough D2-style stat bars derived from the numbers
function statBars(d) {
  const dps = d.kind === 'pellets' ? d.dmg * d.pellets / d.rof : d.kind === 'burst' ? d.dmg * d.burst / d.rof : d.kind === 'fusion' ? d.dmg * d.bolts / (d.rof + d.charge) : d.kind === 'rocket' || d.kind === 'gl' ? (d.dmg + d.splashDmg) / d.rof : d.dmg / d.rof;
  const s = [
    ['IMPACT', Math.min(1, (d.kind === 'rocket' || d.kind === 'gl' ? d.splashDmg : d.dmg * (d.pellets || 1) * (d.bolts || 1)) / 300)],
    ['DPS', Math.min(1, dps / 420)],
    ['RANGE', Math.min(1, (d.falloff?.[0] ?? 30) / 120)],
    ['MAGAZINE', Math.min(1, d.mag / 50)],
    ['RELOAD', Math.max(0.1, 1 - (d.reload ?? d.shellTime * d.mag) / 3.2)],
  ];
  return `<div class="arm-stats">${s.map(([n, v]) => `<div><span>${n}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`).join('')}</div>`;
}

function render() {
  const cols = root.querySelector('.arm-cols');
  cols.innerHTML = [0, 1, 2].map((slot) => {
    const items = INV.items.filter((i) => DEFS[i.id].slot === slot)
      .sort((a, b) => (INV.equipped[slot] === b.uid) - (INV.equipped[slot] === a.uid) || (DEFS[b.id].rarity === 'exotic') - (DEFS[a.id].rarity === 'exotic') || (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    return `<div class="arm-col"><div class="arm-slot">${SLOT_NAMES[slot]} <small>${items.length}</small></div>${items.map(card).join('')}</div>`;
  }).join('');
}
