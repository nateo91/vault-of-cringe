// The Firing Range: practice. Target dummies that never die, show your DPS, and come in every shield flavour.
import * as THREE from 'three';
import { G, rand } from '../game.js';
import * as D from '../dressing.js';
import { Encounter } from './base.js';
import { setEnv, addBox, add, std, addStars } from '../world.js';
import { tileTex, textSprite, IMPACT } from '../textures.js';
import { Enemy, Doge, Stonks, MoaiKnight, Wizard, Sigma, RickRoller, spawnEnemy, registerNetType } from '../enemies.js';
import { hit } from '../input.js';
import { play } from '../audio.js';
import { HUD } from '../hud.js';
import * as fx from '../fx.js';

// A stand-in for a meme: takes damage, never dies, regrows its shield, and keeps a damage log for the DPS meter.
class TargetDummy extends Enemy {
  constructor(enc, { label = 'DUMMY', shield = null, major = false, mover = false } = {}) {
    super({ name: label, hp: major ? 2000 : 600, radius: 0.5, height: 2.0, rank: major ? 'major' : 'minor', drops: false, gib: 0xffd23f });
    this.enc = enc; this.knockable = false; this.mover = mover; this.hostile = true;
    const body = std(major ? 0x8a6a3a : 0x9a8a6a, { roughness: 0.8, detail: false }), bull = std(0xd02020, { detail: false }), white = std(0xeeeeee, { detail: false });
    const g = new THREE.Group(); this.mesh.add(g); this.model = g;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 8), std(0x3a3a3a, { detail: false })); post.position.y = 0.5; g.add(post);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.6, 6, 12), body); torso.position.y = 1.3; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), body); head.position.y = 1.95; g.add(head);
    for (const [r, m] of [[0.28, bull], [0.19, white], [0.1, bull]]) { const c = new THREE.Mesh(new THREE.CircleGeometry(r, 24), m); c.position.set(0, 1.35, 0.33 - r * 0.01); g.add(c); }
    const tag = textSprite(label, 0.28, { font: IMPACT, weight: 'normal', color: '#ffd23f' }); tag.position.y = 2.55; g.add(tag);
    this.hb(0, 1.3, 0.05, 0.42).hb(0, 1.95, 0, 0.22, true);
    if (shield) this.addShield(shield, 0.5);
    this.log = []; this.home = null; this.regenT = 0;
    this.netArgs = { label, shield, major, mover }; // clients rebuild the same dummy
  }
  takeDamage(dmg, crit, info = {}) {
    const d = super.takeDamage(dmg, crit, info);
    if (d > 0) { this.log.push([G.time, d]); this.regenT = 2.5; }
    return d;
  }
  die() { this.hp = this.maxHp; fx.burst(this.center(), 0xffd23f, 12, 4, 0.1, 0.5); } // it was never alive
  think(dt) {
    if (!this.home) this.home = this.pos.clone();
    if (this.mover) { this.pos.x = this.home.x + Math.sin(this.t * 0.8) * 5; }
    this.yaw = 0;
    // after a breather: full health, shield back
    if ((this.regenT -= dt) <= 0) { this.hp = this.maxHp; if (this.shieldMax) this.shieldHp = this.shieldMax; }
  }
  animate() { this.model.rotation.z = Math.sin(this.t * 7) * Math.min(1, this.flinch) * 0.25; }
}

const WAVES = [
  { name: 'DOGE PACK', spawn: [[Doge, 6]] },
  { name: 'STONKS IN COVER', spawn: [[Stonks, 4]] },
  { name: 'MOAI ESCORT', spawn: [[MoaiKnight, 1], [Doge, 3]] },
  { name: 'MOON + MOG', spawn: [[Wizard, 1], [Sigma, 2]] },
  { name: 'NEVER GONNA', spawn: [[RickRoller, 5]] },
  { name: 'EVERYTHING', spawn: [[Doge, 4], [Stonks, 2], [MoaiKnight, 1], [Sigma, 1]] },
];

export class FiringRange extends Encounter {
  static title = 'THE FIRING RANGE';
  static practice = true;
  cursed = 1;
  build() {
    this.spawn.set(0, 0.1, 22); this.spawnYaw = 0;
    setEnv({ sky: 0x23304a, fog: 0x5a6a80, near: 70, far: 260, hemi: [0xcfe0ff, 0x30302a, 0.95], sun: { color: 0xfff0d8, int: 2.0, pos: [40, 60, 40] },
      dome: { top: 0x2a4a80, horizon: 0xb8c8e0, bottom: 0x20242c, sun: 0xffffff, sunSize: 1.2, haze: 1 } });
    addStars(300);
    const ft = tileTex({ base: '#5a5e66', line: '#3a3d44', n: 4, seed: 31 }); ft.repeat.set(10, 16);
    addBox(0, -2, -10, 60, 2, 90, std(0xffffff, { map: ft }));
    const wall = std(0x4a4e58);
    addBox(0, 0, -56, 60, 10, 2, wall); addBox(-31, 0, -10, 2, 6, 90, wall); addBox(31, 0, -10, 2, 6, 90, wall);
    D.wallDress(-30, -55, 30, -55, { inward: 1, h: 10, every: 8, color: 0x4a4e58, accent: 0xffd23f });
    // lanes + distance markers
    for (const z of [12, -3, -28]) {
      const dist = 22 - z;
      D.trimStrip(0, z, 56, 0.15, 0xffd23f);
      const t = textSprite(`${dist} m`, 0.9, { font: IMPACT, weight: 'normal', color: '#ffd23f' }); t.position.set(-26, 1.2, z); add(t);
    }
    // a firing line with cover to practise peeking
    addBox(-8, 0, 16, 4, 1.3, 1, std(0x5a5550)); D.barrier(-8, 16, 4, 1.3, 1);
    addBox(8, 0, 16, 4, 1.3, 1, std(0x5a5550)); D.barrier(8, 16, 4, 1.3, 1);
    const sign = textSprite('🎯 FIRING RANGE', 2.4, { font: IMPACT, weight: 'normal', color: '#ffffff' }); sign.position.set(0, 12.5, -54.5); add(sign);
    for (const [x, z] of [[-28, 24], [28, 24], [-28, -50], [28, -50]]) D.lamp(x, z, { color: 0xffe0b0 });
    D.dust({ min: [-28, 0.3, -54], max: [28, 8, 28], count: 300 });
  }
  start() {
    const put = (x, z, o) => { const d = new TargetDummy(this, o); d.pos.set(x, 0, z); G.enemies.push(d); return d; };
    this.dummies = [
      put(-12, 12, { label: 'BODY / CRIT' }), put(-4, 12, { label: 'SOLAR SHIELD', shield: 'solar', major: true }),
      put(4, 12, { label: 'ARC SHIELD', shield: 'arc', major: true }), put(12, 12, { label: 'VOID SHIELD', shield: 'void', major: true }),
      put(0, -3, { label: 'STRAFING', mover: true }), put(-14, -28, { label: '50 m' }), put(14, -28, { label: '50 m', major: true }),
    ];
    HUD.objective(FiringRange.title, 'Practice. The dummies never die.');
    this.wave = 0; this.waveEnemies = []; this.waveT = 0; this.bestClear = {};
    this.ghost('The Firing Range. Try your weapons, your grenades, your elements. They can take it.');
  }
  // practice waves: real enemies down the far end of the range (G to send the next one)
  sendWave() {
    const W = WAVES[this.wave % WAVES.length];
    this.waveName = W.name; this.waveIdx = this.wave % WAVES.length; this.wave++;
    let k = 0;
    this.waveEnemies = [];
    for (const [T, n] of W.spawn) for (let i = 0; i < n; i++, k++) this.waveEnemies.push(spawnEnemy(T, -18 + (k % 8) * 5, -44 - (k % 2) * 4, T === Wizard ? 4 : null));
    for (const e of this.waveEnemies) e.drops = false; // practice: no loot farming
    this.waveT = 0; this.waveDone = false;
    play('alarm'); HUD.bigText(`WAVE: ${W.name}`, 'incoming', 1.6, 'warn');
  }
  update(dt) {
    if (hit('KeyG') && !this.waveEnemies.some((e) => e.alive)) this.sendWave();
    let waveLine = 'Press [G] to send a practice wave.';
    if (this.waveEnemies.length) {
      const left = this.waveEnemies.filter((e) => e.alive).length;
      if (left) { this.waveT += dt; waveLine = `${this.waveName}: ${left} left · ${this.waveT.toFixed(1)}s`; }
      else {
        if (!this.waveDone) {
          this.waveDone = true;
          const best = this.bestClear[this.waveIdx];
          if (!best || this.waveT < best) this.bestClear[this.waveIdx] = this.waveT;
          play('fanfare'); HUD.bigText('WAVE CLEARED', `${this.waveT.toFixed(1)} s`, 1.8, 'good');
        }
        waveLine = `${this.waveName} cleared in ${this.waveT.toFixed(1)}s (best ${this.bestClear[this.waveIdx].toFixed(1)}s). [G] next wave.`;
      }
    }
    // a DPS meter over the last 5 s, and the best burst so far
    const now = G.time;
    let sum = 0, total = 0;
    for (const d of this.dummies) { d.log = d.log.filter(([t]) => now - t < 30); for (const [t, v] of d.log) { total += v; if (now - t < 5) sum += v; } }
    const dps = Math.round(sum / 5);
    this.best = Math.max(this.best || 0, dps);
    HUD.objective(null, `DPS (5 s): ${dps}\nBest: ${this.best}\nDamage (30 s): ${total}\nShields regrow after 2.5 s without damage.\n${waveLine}`);
  }
}
registerNetType(TargetDummy, (o) => new TargetDummy(G.encounter, o || {}));
