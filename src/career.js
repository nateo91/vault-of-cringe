// The Raid Report: lifetime stats across every run on this browser.
// Runs keep their own G.stats; bank() adds whatever has happened since the last bank, so it's safe to call
// often (every encounter load, the victory screen, closing the page).
import { G } from './game.js';

const KEY = 'voc-career';
const NUM = ['kills', 'crits', 'deaths', 'wipes', 'shots', 'hits', 'bruh', 'finishers', 'pkills'];
export const CAREER = (() => {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* fresh */ }
  for (const k of NUM) c[k] ||= 0;
  c.time ||= 0; c.clears ||= 0; c.runs ||= 0; c.fastest ??= null; c.wk ||= {};
  return c;
})();
let banked = {};

export function save() { try { localStorage.setItem(KEY, JSON.stringify(CAREER)); } catch (e) { /* fine */ } }
export function newRun() { banked = { wk: {} }; CAREER.runs++; save(); }
export function bank() {
  const s = G.stats; if (!s) return;
  for (const k of NUM) { const d = (s[k] || 0) - (banked[k] || 0); if (d > 0) CAREER[k] += d; banked[k] = s[k] || 0; }
  banked.wk ||= {};
  for (const [id, n] of Object.entries(s.wk || {})) { const d = n - (banked.wk[id] || 0); if (d > 0) CAREER.wk[id] = (CAREER.wk[id] || 0) + d; banked.wk[id] = n; }
  save();
}
export function addTime(dt) { CAREER.time += dt; }
export function recordClear(time = null) {
  CAREER.clears++;
  if (time != null && (CAREER.fastest == null || time < CAREER.fastest)) CAREER.fastest = time;
  bank();
}
addEventListener('beforeunload', () => { bank(); save(); });
