// Boss intro cinematics: letterbox, scripted camera paths, a title card, and a choreography hook.
// While one plays, G.cine is set: the AI, timers and the player freeze, and nobody can be hurt.
import * as THREE from 'three';
import { G, local } from './game.js';
import { play, say, duckMusic } from './audio.js';
import { HUD } from './hud.js';
import { setGrade } from './render.js';

const ease = (x) => x * x * (3 - 2 * x);
let el = null;

// shots: [{ t: [start, end], path: [Vector3...], look: [Vector3...], fov: [a, b] }]
// card: { at, name, sub }   choreo(t, dt): animate the boss   lines: [[time, text, voice]]
export function playCinematic({ shots, card, choreo, duration, lines = [], onEnd, sting = 'bossSting', grade = 3 }) {
  el ||= document.getElementById('cine');
  const curves = shots.map((s) => ({
    ...s,
    pc: s.path.length > 1 ? new THREE.CatmullRomCurve3(s.path, false, 'catmullrom', 0.3) : null,
    lc: s.look.length > 1 ? new THREE.CatmullRomCurve3(s.look, false, 'catmullrom', 0.3) : null,
  }));
  const said = new Set();
  G.cine = {
    t: 0, duration, done: false,
    update(dt) {
      const c = G.cine;
      c.t += dt;
      const t = c.t;
      const shot = curves.find((s) => t >= s.t[0] && t < s.t[1]) || curves[curves.length - 1];
      const u = ease(Math.min(1, Math.max(0, (t - shot.t[0]) / (shot.t[1] - shot.t[0]))));
      const cam = G.camera;
      cam.position.copy(shot.pc ? shot.pc.getPoint(u) : shot.path[0]);
      cam.lookAt(shot.lc ? shot.lc.getPoint(u) : shot.look[0]);
      // a little handheld drift and whatever shake the choreography adds
      const sh = Math.min(0.6, G.shake) * 0.2;
      cam.position.x += Math.sin(t * 1.3) * 0.04 + (Math.random() - 0.5) * sh;
      cam.position.y += Math.sin(t * 1.7) * 0.03 + (Math.random() - 0.5) * sh;
      G.shake = Math.max(0, G.shake - dt * 1.5);
      const fov = shot.fov ? shot.fov[0] + (shot.fov[1] - shot.fov[0]) * u : 60;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
      for (const [at, text, voice] of lines) if (t >= at && !said.has(at)) { said.add(at); local(() => say(text, voice || 'boss')); }
      if (card && t >= card.at && !c.cardShown) { c.cardShown = true; showCard(card); }
      choreo?.(t, dt);
      if (t >= duration) end();
    },
    skip() { if (G.cine.t > 0.8) end(true); },
  };
  // letterbox in, HUD out
  el.classList.remove('hidden'); el.classList.remove('out');
  el.querySelector('.card').className = 'card';
  setTimeout(() => el.classList.add('on'), 30);
  HUD.show(false);
  G.vmScene.visible = false;
  duckMusic(0.25);
  setGrade(Math.min(G.cursed || 1, grade)); // intros are graded clean so the boss reads; the fight gets the full deep-fry
  document.getElementById('deepfry').style.visibility = 'hidden';
  if (sting) local(() => play(sting));

  function end(skipped = false) {
    const c = G.cine;
    if (!c || c.done) return;
    c.done = true;
    if (skipped) choreo?.(duration, 0, true); // snap the boss to its final pose
    el.classList.add('out');
    setTimeout(() => { el.classList.remove('on', 'out'); el.classList.add('hidden'); }, 500);
    G.cine = null;
    G.vmScene.visible = true;
    HUD.show(true);
    duckMusic(1);
    setGrade(G.cursed || 1);
    document.getElementById('deepfry').style.visibility = '';
    onEnd?.();
  }
}

function showCard({ name, sub }) {
  const card = el.querySelector('.card');
  card.querySelector('.name').textContent = name;
  card.querySelector('.sub').textContent = sub;
  card.className = 'card show';
}
