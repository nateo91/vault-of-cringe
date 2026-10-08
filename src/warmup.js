// Shader warm-up, run behind the loading screen. three.js compiles a shader the first time something with a new
// material setup is drawn, and on Windows a compile can take long enough to see. Without this, the first wave of a
// new enemy type, the first explosion, the first elemental shield and so on each cost a stutter mid-fight.
// So: put one of every enemy and every common effect in front of the camera, render one frame (the loading
// screen covers it), and take it all away again. Programs are never released (see render.js), so each one
// compiles once per session.
import * as THREE from 'three';
import { G, local } from './game.js';
import * as fx from './fx.js';
import { Doge, Stonks, Nyan, Algorithm, SusSniper, MoaiKnight, Wizard, Sigma, Boyfriend, Troll, RickRoller } from './enemies.js';
import { makeChampion } from './champions.js';
import { compileAll } from './render.js';

const TYPES = [Doge, Stonks, Nyan, Algorithm, SusSniper, MoaiKnight, Wizard, Sigma, Boyfriend, Troll, RickRoller];

export function warmShaders(renderFrame) {
  const t0 = performance.now();
  const nid = G.nextNid, cam = G.camera, p = G.player;
  const camPos = cam.position.clone(), camRot = cam.rotation.clone();
  cam.position.set(p.pos.x, p.pos.y + 1.6, p.pos.z); cam.rotation.set(0, p.yaw, 0, 'YXZ'); cam.updateMatrixWorld();
  const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const at = (i, n, dist = 9) => cam.position.clone().addScaledVector(fwd, dist).addScaledVector(right, (i - (n - 1) / 2) * 2.2).setY(p.pos.y);
  const warm = [];
  try {
    TYPES.forEach((T, i) => {
      try {
        const e = new T();
        e.pos.copy(at(i, TYPES.length));
        if (i === 0) e.addShield?.('void');
        if (i === 1) e.addShield?.('arc');
        if (i === 2) e.addShield?.('solar');
        if (i === 3) { makeChampion(e, 'barrier'); if (e.barrierMesh) e.barrierMesh.visible = true; }
        e.mesh.updateMatrixWorld(true);
        warm.push(e);
      } catch (err) { /* a type that needs its encounter: it compiles when it spawns */ }
    });
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
    compileAll(cam);   // everything in the arena, in view or not
    renderFrame(1 / 60);              // and a real frame for what compile() misses (shadow depth, post)
    // and again mid-death: the dissolve turns their materials see-through
    local(() => { for (const e of warm) fx.dissolve(e.mesh, e.ash, 0.75, {}); });
    compileAll(cam);
    renderFrame(1 / 60);
  } catch (err) {
    console.warn('shader warm-up skipped:', err);
  } finally {
    for (const e of warm) { try { e.remove(); } catch (err) { /* fine */ } }
    fx.clearFx();
    G.nextNid = nid; G.shake = 0;
    cam.position.copy(camPos); cam.rotation.copy(camRot);
  }
  return Math.round(performance.now() - t0);
}
