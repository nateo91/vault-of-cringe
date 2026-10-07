// DOM HUD in the style of a certain space-looter.
import { G, share, shareable, local, ELEMENTS } from './game.js';
import { say } from './audio.js';
import { setGrade } from './render.js';
import { PERKS, DEFS } from './arsenal.js';

import * as THREE from 'three';
const _wp = new THREE.Vector3();
const $ = (s) => document.querySelector(s);
const fmtClock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
let els = {};
let ghostTimer = 0, bigTimer = 0, hitTimer = 0;
const last = {};
function set(key, el, prop, val) { if (last[key] !== val) { last[key] = val; el.style[prop] = val; } }
function text(key, el, val) { if (last[key] !== val) { last[key] = val; el.textContent = val; } }

export const HUD = {
  init() {
    els = {
      hud: $('#hud'), objName: $('#objective .enc-name'), objText: $('#objective .obj-text'),
      ghost: $('#ghost'), ghostText: $('#ghost .ghost-text'),
      big: $('#bigtext'), bigT: $('#bigtext .big'), bigS: $('#bigtext .sub'),
      boss: $('#bossbar'), bossName: $('#bossbar .boss-name'), bossFill: $('#bossbar .fill'), bossSub: $('#bossbar .boss-sub'),
      health: $('#health'), shield: $('#health .shield-bar .fill'), hp: $('#health .hp-bar .fill'),
      superBox: $('#abilities .super'), superFill: $('#abilities .super-fill'), superLabel: $('#abilities .super-label'),
      gren: $('#abilities .grenade'), grenCd: $('#abilities .grenade .cd'), melee: $('#abilities .melee'), meleeCd: $('#abilities .melee .cd'),
      weapons: $('#weapons'), killfeed: $('#killfeed'), hit: $('#hitmarker'), cross: $('#crosshair'), scope: $('#scope'), scopeRng: $('#scope .rng'),
      vignette: $('#vignette'), pips: $('#cursed .pips'), revives: $('#revives'), debuffs: $('#debuffs'),
      prompt: $('#prompt'), promptText: $('#prompt .ptext'), promptFill: $('#prompt .pfill'), fireteam: $('#fireteam'),
      wp: $('#waypoint'), wpDist: $('#waypoint .wp-d'), timer: $('#raidtimer'),
      death: $('#deathscreen'), deathSub: $('#deathscreen .sub'), deepfry: $('#deepfry'),
    };
  },
  show(v) { els.hud.classList.toggle('hidden', !v); },

  ghost(t, { voice = true, dur } = {}) {
    share(['hud', 'ghost', [t, { voice, dur }]]);
    els.ghostText.textContent = t;
    els.ghost.classList.add('show');
    clearTimeout(ghostTimer);
    ghostTimer = setTimeout(() => els.ghost.classList.remove('show'), (dur ?? Math.max(3, t.length * 0.065)) * 1000);
    if (voice) local(() => say(t, 'ghost'));
  },
  objective(name, t) {
    if (name != null) text('objn', els.objName, name);
    text('objt', els.objText, t);
    if (shareable()) G.net.hud.obj = ['objective', [last.objn, t]];
  },
  bigText(t, sub = '', dur = 2.5, cls = '') {
    share(['hud', 'bigText', [t, sub, dur, cls]]);
    els.bigT.textContent = t; els.bigS.textContent = sub;
    els.big.className = 'show ' + cls;
    clearTimeout(bigTimer);
    bigTimer = setTimeout(() => { els.big.className = cls; }, dur * 1000);
  },
  boss(name, ratio, { immune = false, sub = '' } = {}) {
    if (shareable()) G.net.hud.boss = ['boss', [name, +ratio.toFixed(4), { immune, sub }]];
    els.boss.classList.remove('hidden');
    text('bn', els.bossName, name);
    set('bf', els.bossFill, 'width', (Math.max(0, ratio) * 100).toFixed(1) + '%');
    els.boss.classList.toggle('immune', immune);
    text('bs', els.bossSub, sub);
  },
  hideBoss() { if (shareable()) G.net.hud.boss = ['hideBoss', []]; els.boss.classList.add('hidden'); },
  killfeed(t) {
    share(['hud', 'killfeed', [t]]);
    const d = document.createElement('div'); d.textContent = t;
    els.killfeed.appendChild(d);
    while (els.killfeed.children.length > 6) els.killfeed.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 3500);
    setTimeout(() => d.remove(), 4200);
  },
  // shield hits glow in the shield's element; crits are gold; kills burst red (gold-red for a precision kill)
  hitmarker(crit, kill, shieldEl = null) {
    const cls = kill ? (crit ? 'kill crit' : 'kill') : shieldEl ? 'shield el-' + shieldEl : crit ? 'crit' : '';
    els.hit.className = cls;
    void els.hit.offsetWidth; // restart the pop animation
    els.hit.className = cls + ' go';
    els.hit.style.opacity = 1;
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => (els.hit.style.opacity = 0), kill ? 280 : 120);
  },
  damageFlash(amount) {
    els.vignette.style.transition = 'none';
    els.vignette.style.opacity = Math.min(1, 0.25 + amount / 50);
    requestAnimationFrame(() => { els.vignette.style.transition = 'opacity .6s'; els.vignette.style.opacity = 0; });
  },
  setCursed(lvl) {
    els.pips.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < lvl ? 'on' : ''}">◆</span>`).join('');
    els.deepfry.className = lvl >= 5 ? 'lvl5' : lvl >= 4 ? 'lvl4' : '';
    setGrade(lvl);
  },
  setRevives(n) { if (G.net.active) { els.revives.textContent = ''; return; } els.revives.textContent = 'REVIVES ' + '◆'.repeat(Math.max(0, n)) + '◇'.repeat(Math.max(0, 3 - n)); },
  setDebuff(id, t, warn = false) {
    let d = els.debuffs.querySelector(`[data-id="${id}"]`);
    if (!d) { d = document.createElement('div'); d.dataset.id = id; els.debuffs.appendChild(d); }
    if (d.textContent !== t) d.textContent = t;
    d.classList.toggle('warn', warn);
  },
  clearDebuff(id) { els.debuffs.querySelector(`[data-id="${id}"]`)?.remove(); },
  clearDebuffs() { els.debuffs.innerHTML = ''; },
  prompt(t, k = 0) {
    els.prompt.classList.toggle('hidden', !t);
    if (t) { text('pt', els.promptText, t); set('pf', els.promptFill, 'width', Math.round(k * 100) + '%'); }
  },
  fireteam(list) {
    const html = list ? list.map((m) => `<div class="${m.alive ? '' : 'down'}">${m.alive ? '◆' : '💀'} ${m.name.replace(/[<>&]/g, '')}</div>`).join('') : '';
    if (last.ft !== html) { last.ft = html; els.fireteam.innerHTML = html; }
  },
  // "LEGENDARY ACQUIRED" card that slides in on the right
  loot(item) {
    const d = DEFS[item.id];
    const el = document.createElement('div');
    el.className = 'loot-toast ' + d.rarity;
    el.innerHTML = `<div class="lt-r">${d.rarity === 'exotic' ? 'EXOTIC' : 'LEGENDARY'} ACQUIRED</div><div class="lt-n">${d.name}</div><div class="lt-t">${d.type}</div><div class="lt-p">${item.perks.map((k) => PERKS[k].icon + ' ' + PERKS[k].name).join('<br>')}</div><div class="lt-h">[TAB] to equip</div>`;
    let host = document.getElementById('loottoasts');
    if (!host) { host = document.createElement('div'); host.id = 'loottoasts'; els.hud.appendChild(host); }
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), 5200);
    setTimeout(() => el.remove(), 6000);
  },
  death(show, sub = '') { els.death.classList.toggle('hidden', !show); els.deathSub.textContent = sub; },

  buildWeapons(p) {
    els.weapons.innerHTML = '';
    p.wpn.forEach((w, i) => {
      const d = document.createElement('div');
      d.className = 'w ' + w.def.ammo + ' ' + w.def.rarity;
      const perks = (w.inst?.perks || []).map((k) => `<span title="${PERKS[k].name}: ${PERKS[k].desc}">${PERKS[k].icon}</span>`).join('');
      d.innerHTML = `<div class="wtype">${i + 1} · ${w.def.type.toUpperCase()}</div><div class="wname"><span class="wel" title="${ELEMENTS[w.def.element]?.name || ''}">${ELEMENTS[w.def.element]?.icon || ''}</span>${w.def.name}</div><div class="wperks">${perks}</div><div class="ammo"></div>`;
      els.weapons.appendChild(d);
      w.el = d; w.ammoEl = d.querySelector('.ammo');
    });
    document.documentElement.style.setProperty('--accent', p.clsDef.color);
  },
  update(p) {
    set('sh', els.shield, 'width', (p.shield / p.maxShield * 100).toFixed(1) + '%');
    set('hp', els.hp, 'width', (p.hp / p.maxHp * 100).toFixed(1) + '%');
    els.health.classList.toggle('hurt', p.shield < p.maxShield || p.hp < p.maxHp);
    set('sf', els.superFill, 'height', (p.superCharge * 1.4) + '%');
    const ready = p.superCharge >= 100 && !p.superActive;
    els.superBox.classList.toggle('ready', ready);
    text('sl', els.superLabel, p.superActive ? 'ACTIVE' : ready ? 'F' : Math.floor(p.superCharge) + '%');
    set('gc', els.grenCd, 'height', (p.grenadeCd / p.grenadeMax * 100) + '%');
    els.gren.classList.toggle('ready', p.grenadeCd <= 0);
    set('mc', els.meleeCd, 'height', (p.meleeCd / p.meleeMax * 100) + '%');
    els.melee.classList.toggle('ready', p.meleeCd <= 0);
    // raid timer (the host's clock in co-op)
    const rc = G.net.isClient ? G.runView : G.run && [G.run.clock, G.run.eligible ? 1 : 0];
    if (rc) { text('rt', els.timer, (rc[1] ? '⏱ ' : '⏱ PRACTICE · ') + fmtClock(rc[0])); els.timer.classList.toggle('practice', !rc[1]); }
    // objective waypoint: a diamond that sticks to the screen edge when off-screen
    if (G.waypoint && p.alive) {
      _wp.copy(G.waypoint).project(G.camera);
      const behind = _wp.z > 1;
      let x = behind ? -_wp.x : _wp.x, y = behind ? -_wp.y : _wp.y;
      const m = Math.max(Math.abs(x), Math.abs(y));
      const off = behind || m > 0.92;
      if (off) { x = x / m * 0.92; y = y / m * 0.92; }
      els.wp.classList.remove('hidden');
      els.wp.classList.toggle('edge', off);
      els.wp.style.transform = `translate(${((x * 0.5 + 0.5) * innerWidth).toFixed(0)}px, ${((-y * 0.5 + 0.5) * innerHeight).toFixed(0)}px) translate(-50%,-50%)`;
      text('wpd', els.wpDist, Math.round(G.waypoint.distanceTo(p.pos)) + 'm');
    } else if (!els.wp.classList.contains('hidden')) els.wp.classList.add('hidden');
    // crosshair: per-weapon style, spread from movement + recent shots
    const cd = p.wpn[p.cur].def;
    const wid = p.superActive === 'gg' ? 'gg' : { single: 'hc', sniper: 'hc', auto: 'ar', burst: 'ar', pellets: 'sg', fusion: 'sg', rocket: 'rl', gl: 'rl' }[cd.kind];
    const base = p.superActive === 'gg' ? 9 : { single: 7, auto: 9, burst: 8, sniper: 20, pellets: 24, fusion: 18 + (1 - Math.min(1, p.chargeT / (cd.charge || 1))) * 10, rocket: 9, gl: 10 }[cd.kind];
    const move = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 8) + (p.onGround ? 0 : 0.6);
    const sp = (base + move * 7 + p.bloomK * 14) * (p.ads ? 0.45 : 1);
    const spv = sp.toFixed(1) + 'px';
    if (last.sp !== spv) { last.sp = spv; els.cross.style.setProperty('--sp', spv); }
    const cls = 'w-' + wid + (p.scoped || p.inspectT > 0 || p.emote || p.carry ? ' hidden-x' : '');
    if (els.cross.className !== cls) els.cross.className = cls;
    els.scope.classList.toggle('hidden', !p.scoped);
    if (p.scoped) {
      const sc = 'sc-' + p.scopeType;
      if (els.scope.dataset.t !== sc) {
        els.scope.dataset.t = sc; els.scope.className = sc;
        const txt = { rl: ["GJALLARHORN'T OPTIC v6.9", '🎉 WOLFPACK ARMED<br>HORN STATUS: TOOTED'], sn: ['BIG BRAIN OPTICS', '🧠 IQ: 200<br>WIND: IRRELEVANT'], ns: ['MLG OPTICS PRO™', '🎮 GET 360 OR GET OUT<br>▲ ILLUMINATI CONFIRMED'] }[p.scopeType];
        els.scope.querySelector('.scope-txt.left').firstChild.textContent = txt[0];
        els.scope.querySelector('.scope-txt.right').innerHTML = txt[1];
      }
      text('rng', els.scopeRng, `RANGE ${p.range >= 299 ? '---' : p.range.toFixed(0) + 'm'}`);
    }
    p.wpn.forEach((w, i) => {
      if (!w.el) return;
      const active = i === p.cur && p.superActive !== 'gg';
      if (w.el._a !== active) { w.el._a = active; w.el.classList.toggle('active', active); }
      const res = w.def.ammo === 'primary' ? '∞' : w.reserve;
      const s = (active && p.reloadT > 0) ? `<span class="reloading">RELOADING</span>` : `${w.mag}<small>${res}</small>`;
      if (w._s !== s) { w._s = s; w.ammoEl.innerHTML = s; }
    });
  },
};
