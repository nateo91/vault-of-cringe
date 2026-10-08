// Loaded only with ?debug — helpers for driving the game from the console.
import { G } from './game.js';
import { Input } from './input.js';

window.Input = Input;
window.aimAt = (e) => {
  const p = G.player, c = e.center ? e.center() : e;
  const dx = c.x - p.pos.x, dy = c.y - (p.pos.y + p.eye), dz = c.z - p.pos.z;
  p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
};
window.nearest = (f = (e) => e.hostile) => G.enemies.filter((e) => e.alive && f(e) && !e.untargetable)
  .sort((a, b) => a.pos.distanceTo(G.player.pos) - b.pos.distanceTo(G.player.pos))[0];
window.drive = (sec, fn) => {
  const errs = [];
  for (let t = 0; t < sec; t += 1 / 60) { try { fn?.(t); window.simulate(1 / 60); } catch (e) { errs.push(e.stack); break; } }
  return errs;
};
window.autoShoot = () => { const e = nearest(); if (e) { aimAt(e); Input.left = true; } else Input.left = false; };
window.startAt = async (i) => {
  document.querySelector('#startEnc').value = String(i);
  document.querySelector('#launch').click();
  await new Promise((r) => setTimeout(r, 1200));
  G.godMode = true;
};

// ---- co-op testing in two tabs ----
// Hidden/background tabs get no animation frames and throttled timers, so pump() runs the game loop off a
// MessageChannel at ~60 fps and collects every error into window.errs.
window.pump = () => {
  if (window.pumping) return;
  window.errs = [];
  addEventListener('error', (e) => window.errs.push(String(e.message)));
  addEventListener('unhandledrejection', (e) => window.errs.push('rejection: ' + String(e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a) => { window.errs.push(a.map(String).join(' ').slice(0, 300)); ce(...a); };
  const ch = new MessageChannel(); let last = performance.now();
  window.pumping = true; window.frames = 0;
  ch.port1.onmessage = () => {
    const now = performance.now();
    if (window.pumping && now - last >= 16) { last = now; try { window.simulate(1 / 60); window.frames++; } catch (e) { window.errs.push('simulate: ' + e.stack?.slice(0, 300)); } }
    ch.port2.postMessage(0);
  };
  ch.port2.postMessage(0);
};
const until = async (f, ms = 15000) => { for (const t0 = Date.now(); !f() && Date.now() - t0 < ms;) await new Promise((r) => setTimeout(r, 100)); return f(); };
window.coopHost = async (name = 'HostBot') => {
  window.pump();
  document.querySelector('#pname').value = name;
  document.querySelector('#hostBtn').click();
  await until(() => G.net.code);
  return G.net.code;
};
window.coopJoin = async (code, name = 'ClientBot') => {
  window.pump();
  document.querySelector('#pname').value = name;
  document.querySelector('#joinCode').value = code;
  document.querySelector('#joinBtn').click();
  return until(() => G.net.hostConn?.open);
};
// host: launch at encounter i; both sides then call godOn() so idle bots don't wipe the test
window.coopLaunch = async (i) => {
  document.querySelector('#startEnc').value = String(i);
  document.querySelector('#launch').click();
  await until(() => G.state === 'playing');
};
window.godOn = () => { G.godMode = true; };
window.skipCine = () => { if (G.cine) { G.cine.t = 99; G.cine.skip(); } };
