import * as THREE from 'three';
import { G, rand, pick, distXZ, players, local } from '../game.js';
import { spawnEnemy } from '../enemies.js';
import { HUD } from '../hud.js';
import * as fx from '../fx.js';
import { challengeEvent, finishChallenge } from '../challenges.js';

export class Encounter {
  constructor() { this.t = 0; this.done = false; this.spawn = new THREE.Vector3(0, 0.1, 30); this.spawnYaw = 0; }
  build() {}
  start() {}
  update() {}       // host only: the simulation
  localUpdate() {}  // every machine: mechanics that only affect *your* guardian (brainrot, lava...)
  clientStart() {}  // clients: instead of start()
  // throwaway copies of what spawns mid-fight (and of anything a co-op client only gets from the host after its
  // loading screen, like the boss), for the shader warm-up
  warmActors() { return []; }
  netState() { return 0; }
  applyNet() {}
  cleanup() {}
  // A one-off visual moment that every machine should see (dead body, giant bat...).
  ev(name, data = 0) {
    this['ev_' + name]?.(data);
    if (G.net.isHost) G.net.emit(['enc', name, data]);
  }
  ev_chal(d) { challengeEvent(this, d); }
  runLocal(dt) { local(() => this.localUpdate(dt)); }
  onPlayerRespawn() {}
  hostiles(filter) { return G.enemies.filter((e) => e.alive && e.hostile && (!filter || filter(e))).length; }
  count(Type) { return G.enemies.filter((e) => e.alive && e instanceof Type).length; }
  spawnAway(Type, points, minDist = 18, y = null, ...args) {
    const near = (q) => Math.min(...players().map((p) => distXZ(q, p.pos)));
    const ok = points.filter((q) => near(q) > minDist);
    const q = pick(ok.length ? ok : points);
    return spawnEnemy(Type, q.x + rand(-1.5, 1.5), q.z + rand(-1.5, 1.5), y ?? (q.y || null), ...args);
  }
  ghost(t, delay = 0) { if (delay) setTimeout(() => G.encounter === this && HUD.ghost(t), delay * 1000); else HUD.ghost(t); }
  complete() {
    if (this.done) return;
    this.done = true;
    finishChallenge(this);
    for (const e of G.enemies) if (e.alive && e.rank !== 'boss') { fx.burst(e.center(), 0xb06cff, 10, 5, 0.15, 0.6); e.remove(); }
    G.onEncounterComplete?.();
  }
}

export function weightedPick(table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of table) { if ((r -= w) <= 0) return v; }
  return table[0][0];
}
