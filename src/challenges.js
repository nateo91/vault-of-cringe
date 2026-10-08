// Weekly raid challenges, Destiny style: each week one encounter has an extra condition. Clear that encounter
// without breaking it and everyone in the fireteam gets a reward (once per week). The week comes from the
// date (UTC), so every guardian's game agrees on it without syncing; the host only sends "failed" / "done".
import { G } from './game.js';
import { HUD } from './hud.js';
import { play } from './audio.js';
import { unlock, toast } from './triumphs.js';

export const CHALLENGES = [
  { id: 'adfree', enc: 'NormieGate', name: 'Ad-Free', desc: 'Skip the ad within 10 seconds of the Skip Ad button appearing.' },
  { id: 'loyal', enc: 'EmergencyMeeting', name: 'Crewmate Loyalty', desc: 'Never shoot an innocent crewmate.' },
  { id: 'pitch', enc: 'VineBoomChamber', name: 'Perfect Pitch', desc: 'Never fail a Moai sequence (Cheems included).' },
  { id: 'safety', enc: 'ThisIsFine', name: 'Fire Safety', desc: 'Never let the room reach 90% fire.' },
  { id: 'speed', enc: 'SkibidiFinale', name: 'Speed Flush', desc: 'Flush Skibidi within 4 minutes of the encounter starting.' },
];
const WEEK0 = Date.UTC(2026, 0, 6); // a Tuesday: the reset, like the real thing
export const weekNumber = () => Math.floor((Date.now() - WEEK0) / (7 * 864e5));
export const weekly = () => (G.forceChallenge && CHALLENGES.find((c) => c.id === G.forceChallenge)) // (?debug: force one)
  || CHALLENGES[((weekNumber() % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
export function doneThisWeek() { try { return +localStorage.getItem('voc-challenge') === weekNumber(); } catch (e) { return false; } }

// every machine, when an encounter loads: is this week's challenge here?
export function announceChallenge(enc) {
  const c = weekly();
  if (c.enc !== enc.constructor.name) { HUD.clearDebuff('chal'); return; }
  enc.chal = { id: c.id, ok: true };
  HUD.setDebuff('chal', `🎯 CHALLENGE: ${c.name}${doneThisWeek() ? ' (done this week)' : ''} — ${c.desc}`);
}

// host: the condition broke
export function failChallenge(enc, why = '') {
  if (!enc?.chal?.ok || G.net.isClient) return;
  enc.ev('chal', { ok: 0, why });
}
// every machine
export function challengeEvent(enc, { ok, why }) {
  if (!enc.chal) return;
  const c = CHALLENGES.find((q) => q.id === enc.chal.id);
  if (!ok) {
    enc.chal.ok = false;
    play('wrong');
    HUD.setDebuff('chal', `🎯 CHALLENGE FAILED: ${c.name}${why ? ` (${why})` : ''}`, true);
    HUD.killfeed(`🎯 Challenge failed: ${c.name}`);
  } else {
    HUD.clearDebuff('chal');
    const fresh = !doneThisWeek();
    try { localStorage.setItem('voc-challenge', String(weekNumber())); } catch (e) { /* fine */ }
    play('fanfare');
    toast(`<div class="tt-h">WEEKLY CHALLENGE COMPLETE</div><div class="tt-n">🎯 ${c.name}</div><div class="tt-d">${fresh ? 'A reward drops. Come back next week for a new one.' : 'Already rewarded this week. Still impressive.'}</div>`);
    unlock('challenge');
    if (fresh) G.onChallenge?.();
  }
}
// host, when the encounter is cleared
export function finishChallenge(enc) {
  if (!enc?.chal?.ok || G.net.isClient) return;
  enc.ev('chal', { ok: 1 });
}
