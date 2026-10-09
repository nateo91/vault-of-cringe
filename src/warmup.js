// Shader warm-up, run behind the loading screen. three.js compiles a shader the first time something with a new
// material setup is drawn, and on Windows a compile can take long enough to see. Without this, the first wave of a
// new enemy type, the first explosion, the first elemental shield and so on each cost a stutter mid-fight.
// So: put one of every enemy and every common effect in the arena, show everything that's hidden, render a few
// frames (the loading screen covers them), and take it all away again. Programs are never released (see
// render.js), so each one compiles once per session. The raid-smoke-test skill lists anything that still compiles
// during play, and what forced it.
import * as THREE from 'three';
import { G, local } from './game.js';
import * as fx from './fx.js';
import { Doge, Stonks, Nyan, Algorithm, SusSniper, MoaiKnight, Wizard, Sigma, Boyfriend, Troll, RickRoller } from './enemies.js';
import { makeChampion } from './champions.js';
import { compileAll, revealAll } from './render.js';

const TYPES = [Doge, Stonks, Nyan, Algorithm, SusSniper, MoaiKnight, Wizard, Sigma, Boyfriend, Troll, RickRoller];

// The death dissolve turns materials see-through, which takes other shader variants (and a double-sided material is
// then drawn twice, back faces and front, each with its own): rehearse it on everything in the arena that can die,
// bosses included. Returns the undo.
function seeThrough(enemies) {
  const mats = new Map();
  for (const e of enemies) {
    e.mesh.traverse((o) => {
      for (const m of [o.material].flat()) if (m && !m.userData?.shared && !m.transparent && !mats.has(m)) mats.set(m, m.depthWrite);
    });
  }
  for (const m of mats.keys()) { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; }
  return () => { for (const [m, depthWrite] of mats) { m.transparent = false; m.depthWrite = depthWrite; m.needsUpdate = true; } };
}

export function warmShaders(renderFrame) {
  const t0 = performance.now();
  const nid = G.nextNid, cam = G.camera, p = G.player;
  const camPos = cam.position.clone(), camRot = cam.rotation.clone();
  cam.position.set(p.pos.x, p.pos.y + 1.6, p.pos.z); cam.rotation.set(0, p.yaw, 0, 'YXZ'); cam.updateMatrixWorld();
  const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const at = (i, n, dist = 9) => cam.position.clone().addScaledVector(fwd, dist).addScaledVector(right, (i - (n - 1) / 2) * 2.2).setY(p.pos.y);
  const warm = [];
  let unreveal = null, opaque = null;
  try {
    TYPES.forEach((T, i) => {
      try {
        const e = new T();
        if (i === 0) e.addShield?.('void');
        if (i === 1) e.addShield?.('arc');
        if (i === 2) e.addShield?.('solar');
        if (i === 3) { makeChampion(e, 'barrier'); if (e.barrierMesh) e.barrierMesh.visible = true; }
        warm.push(e);
      } catch (err) { /* a type that needs its encounter: it compiles when it spawns */ }
    });
    // and whatever this encounter brings in mid-fight (Hot Takes, toilet disciples, the Skip Ad...)
    try { warm.push(...G.encounter.warmActors()); } catch (err) { /* those compile when they spawn */ }
    warm.forEach((e, i) => { e.pos.copy(at(i, warm.length)); e.mesh.updateMatrixWorld(true); });
    p.ensureSelfBody(); // your own guardian, for emotes
    // the effects that turn up mid-fight
    local(() => {
      const c = at(0, 1, 6), c2 = at(0, 1, 12), up = new THREE.Vector3(0, 1, 0);
      fx.explosion(c, 3, 0xff8a2a); fx.burst(c, 0xffffff, 6, 3, 0.1, 0.4); fx.ringFx(c, 4, 0x9a4dff, 0.5);
      fx.superRing(c.clone(), 0xffb030, 5); fx.crater(c.clone(), 3, 0x7fd7ff); fx.implode(c.clone(), 3);
      for (const k of ['solar', 'arc', 'void']) fx.grenadeField(k, c.clone(), 0.5);
      fx.spawnFx(c.clone()); fx.floatText(c.clone(), 'warm', { height: 0.4 }); fx.floatEmoji(c.clone(), '🗿', 0.6, 0.5, 1);
      fx.dmgNumber(c.clone(), 10); fx.dmgNumber(c.clone(), 20, 'crit'); fx.tracer(c.clone(), c2, 0xffd060, 0.03, 0.08);
      fx.impact(c.clone(), up, fwd, {}); fx.decal(c.clone(), up); fx.casing(c.clone(), up.clone(), 0xc9a24b); fx.glint(c.clone());
      fx.flashLight(c.clone(), 0xffaa55, 20, 10, 0.1); fx.muzzleSmoke(c.clone()); fx.rally(c.clone());
    });
    if (G.debug) { let n = 0; G.scene.traverseVisible((o) => { if (o.isPointLight) n++; }); G.warmLights = n; }
    unreveal = revealAll();
    compileAll(cam);       // everything in the arena, hidden or not, in view or not
    renderFrame(1 / 60);   // and real frames for what compile() misses (shadow depth, post). The shadow pass runs
    renderFrame(1 / 60);   // with the previous frame's lights, so its shaders only come out right on the second
    // and again mid-death
    opaque = seeThrough([...warm, ...G.enemies.filter((e) => e.alive)]);
    compileAll(cam);
    renderFrame(1 / 60);
  } catch (err) {
    console.warn('shader warm-up skipped:', err);
  } finally {
    opaque?.();
    unreveal?.();
    for (const e of warm) { try { e.remove(); } catch (err) { /* fine */ } }
    fx.clearFx();
    G.nextNid = nid; G.shake = 0;
    cam.position.copy(camPos); cam.rotation.copy(camRot);
  }
  return Math.round(performance.now() - t0);
}
