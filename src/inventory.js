// The Armory: browse your loot, read perks, equip weapons. Tab / I toggles it in-game.
import { G, ELEMENTS } from './game.js';
import { DEFS, PERKS, INV, SLOT_NAMES, SHADERS, saveInventory } from './arsenal.js';
import { showGun, startView, stopView } from './gunview.js';
import { ARMOR, ARMOR_KEYS, ARMOR_INV, fits, equipArmor } from './armor.js';
import { HUD } from './hud.js';

let root = null, onClose = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initArmory(closeCb) {
  onClose = closeCb;
  root = document.getElementById('armory');
  root.querySelector('#armClose').onclick = () => closeArmory();
  root.addEventListener('click', (e) => {
    const ex = e.target.closest('.arm-ex');
    if (ex && !ex.classList.contains('locked')) {
      const cls = G.player?.cls || G.cls;
      if (equipArmor(ex.dataset.ex, cls)) { G.player?.setArmor(ex.dataset.ex); HUD.exotic(G.player); renderArmor(); }
      return;
    }
    const card = e.target.closest('.arm-card');
    if (!card) return;
    equip(card.dataset.uid);
  });
  // the shader picker
  root.querySelector('.arm-shaders').addEventListener('click', (e) => {
    const b = e.target.closest('[data-shader]');
    if (!b) return;
    INV.shader = b.dataset.shader; saveInventory();
    G.player?.applyShaderAll();
    renderShaders();
    if (lastPreview) preview(lastPreview, true);
  });
  // hovering a card puts that gun on the turntable
  root.addEventListener('mouseover', (e) => { const c = e.target.closest('.arm-card'); if (c) preview(c.dataset.uid); });
  addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'Escape') { e.preventDefault(); closeArmory(); }
  });
}
export const isOpen = () => root && !root.classList.contains('hidden');

let lastPreview = null;
function renderShaders() {
  root.querySelector('.arm-shaders').innerHTML = Object.entries(SHADERS).map(([k, s]) => {
    const a = '#' + (s.a ?? 0x8a8f99).toString(16).padStart(6, '0'), b = '#' + (s.b ?? 0x2a2c33).toString(16).padStart(6, '0');
    return `<button class="arm-sh ${INV.shader === k ? 'on' : ''}" data-shader="${k}" title="${esc(s.name)}"><i style="background:linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)"></i><span>${esc(s.name)}</span></button>`;
  }).join('');
}
function preview(uid, force = false) {
  const item = INV.items.find((i) => i.uid === uid);
  if (!item) return;
  lastPreview = uid;
  const d = DEFS[item.id];
  try { showGun(item.id, root.querySelector('.arm-view canvas'), force); } catch (e) { return; }
  const n = root.querySelector('.arm-view-name');
  n.innerHTML = `${ELEMENTS[d.element]?.icon || ''} ${esc(d.name)} <small>${d.rarity === 'exotic' ? 'EXOTIC' : 'LEGENDARY'} ${esc(d.type.toUpperCase())}</small>`;
  n.className = 'arm-view-name ' + d.rarity;
}
export function openArmory() {
  render(); renderShaders(); renderArmor();
  root.classList.remove('hidden');
  G.uiOpen = true;
  const uid = INV.equipped[0];
  if (uid) preview(uid);
  startView();
}
export function closeArmory() {
  if (!isOpen()) return;
  root.classList.add('hidden');
  G.uiOpen = false;
  stopView();
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
    <div class="arm-name">${ELEMENTS[d.element]?.icon || ''} ${esc(d.name)}</div>
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

// exotic armor: the pieces your current class can wear (locked ones say where they come from)
function renderArmor() {
  const cls = G.player?.cls || G.cls || 'hunter';
  const list = ARMOR_KEYS.filter((k) => fits(k, cls));
  const owned = ARMOR_KEYS.filter((k) => ARMOR_INV.owned.includes(k)).length;
  root.querySelector('.arm-armor').innerHTML = `<div class="arm-slot">EXOTIC ARMOR · ${cls.toUpperCase()} <small>${owned}/${ARMOR_KEYS.length} collected · click to wear</small></div><div class="arm-ex-row">${list.map((k) => {
    const a = ARMOR[k], have = ARMOR_INV.owned.includes(k), on = ARMOR_INV.on[cls] === k, fresh = ARMOR_INV.fresh.includes(k);
    if (!have) return `<div class="arm-ex locked"><div class="ai">❔</div><div><b>???</b><div class="at">EXOTIC ${a.piece.toUpperCase()}</div><small>Not found yet. Drops from exotic engrams.</small></div></div>`;
    return `<div class="arm-ex ${on ? 'on' : ''}" data-ex="${k}">${on ? '<div class="arm-badge">WEARING</div>' : fresh ? '<div class="arm-badge new">NEW</div>' : ''}<div class="ai">${a.icon}</div><div><b>${esc(a.name)}</b><div class="at">EXOTIC ${a.piece.toUpperCase()}${a.cls === 'any' ? ' · ANY CLASS' : ''}</div><small>${esc(a.desc)}</small><i>${esc(a.flavor)}</i></div></div>`;
  }).join('')}</div>`;
}
function render() {
  const cols = root.querySelector('.arm-cols');
  cols.innerHTML = [0, 1, 2].map((slot) => {
    const items = INV.items.filter((i) => DEFS[i.id].slot === slot)
      .sort((a, b) => (INV.equipped[slot] === b.uid) - (INV.equipped[slot] === a.uid) || (DEFS[b.id].rarity === 'exotic') - (DEFS[a.id].rarity === 'exotic') || (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    return `<div class="arm-col"><div class="arm-slot">${SLOT_NAMES[slot]} <small>${items.length}</small></div>${items.map(card).join('')}</div>`;
  }).join('');
}
