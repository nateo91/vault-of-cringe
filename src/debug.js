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
