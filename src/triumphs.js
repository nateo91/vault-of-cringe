// Triumphs: the raid's achievements (and a seal for getting them all), Destiny style.
// Each guardian earns their own, on their own machine; they're kept in localStorage.
import { play } from './audio.js';

export const TRIUMPHS = {
  clear: { icon: '🗿', name: 'Raid Clear', desc: 'Flush Skibidi. Ohio thanks you.' },
  flawless: { icon: '💎', name: 'Flawless', desc: 'A full run from The Approach without dying, and without a wipe.' },
  shy: { icon: '🙈', name: 'Shy Guy', desc: "Cross the Shy Bridge without falling once." },
  adblock: { icon: '⏭️', name: 'Ad Blocker', desc: 'Skip the mid-roll ad at the Normie Gate.' },
  sparky: { icon: '⚡', name: 'Electrician', desc: 'Be the one who fixes the lights in Electrical.' },
  cheems: { icon: '🐕', name: 'Not Today, Cheems', desc: 'Hold your fire through a whole "Cheems Says" turn.' },
  spicy: { icon: '🌶️', name: 'Spicy', desc: 'Carry the hot sauce while the Dog is putting the fire out.' },
  vibes: { icon: '🕺', name: 'Immeasurable Aura', desc: 'Out-vibe Skibidi after he refuses to die.' },
  finisher: { icon: '🪑', name: 'Sit.', desc: 'Land 5 finishers in a single run.' },
  secrets: { icon: '🔑', name: 'Secret Keeper', desc: 'Find all three secret chests.' },
  master: { icon: '⚔️', name: 'Master Raider', desc: 'Clear the raid with the Master modifier on.' },
  speed: { icon: '⏱️', name: 'Speedrunner', desc: 'A full run in under 15 minutes.' },
};
export const SEAL = 'TERMINALLY ONLINE';

export function earned() {
  try { return JSON.parse(localStorage.getItem('voc-triumphs') || '[]'); } catch (e) { return []; }
}
export function hasSeal() { const e = earned(); return Object.keys(TRIUMPHS).every((k) => e.includes(k)); }

let toastHost = null;
function toast(html, seal = false) {
  if (!toastHost) { toastHost = document.createElement('div'); toastHost.id = 'triumphToasts'; document.body.appendChild(toastHost); }
  const el = document.createElement('div');
  el.className = 'tri-toast' + (seal ? ' seal' : '');
  el.innerHTML = html;
  toastHost.appendChild(el);
  setTimeout(() => el.classList.add('out'), 4600);
  setTimeout(() => el.remove(), 5300);
}

export function unlock(id) {
  const t = TRIUMPHS[id];
  if (!t) return false;
  const e = earned();
  if (e.includes(id)) return false;
  e.push(id);
  try { localStorage.setItem('voc-triumphs', JSON.stringify(e)); } catch (err) { /* fine */ }
  play('chime', 4);
  const n = e.filter((k) => TRIUMPHS[k]).length, total = Object.keys(TRIUMPHS).length;
  toast(`<div class="tt-h">TRIUMPH · ${n}/${total}</div><div class="tt-n">${t.icon} ${t.name}</div><div class="tt-d">${t.desc}</div>`);
  if (n === total) setTimeout(() => { play('fanfare'); toast(`<div class="tt-h">SEAL COMPLETE</div><div class="tt-n">🏅 ${SEAL}</div><div class="tt-d">Every triumph in the Vault of Cringe. Please go outside.</div>`, true); }, 1800);
  return true;
}

export function renderTriumphs(root) {
  const e = earned();
  const n = e.filter((k) => TRIUMPHS[k]).length, total = Object.keys(TRIUMPHS).length;
  root.querySelector('.tri-seal').innerHTML = `<div class="ts-t">${n === total ? '🏅' : '🔒'} ${SEAL}</div><div class="ts-bar"><i style="width:${(n / total * 100).toFixed(0)}%"></i></div><div class="ts-c">${n}/${total} triumphs${n === total ? ' · seal earned' : ''}</div>`;
  root.querySelector('.tri-list').innerHTML = Object.entries(TRIUMPHS).map(([k, t]) => {
    const got = e.includes(k);
    return `<div class="tri ${got ? 'got' : ''}"><div class="ti">${got ? t.icon : '🔒'}</div><div><div class="tn">${t.name}</div><div class="td">${t.desc}</div></div></div>`;
  }).join('');
}
