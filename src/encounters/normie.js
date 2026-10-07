// Encounter 1: THE NORMIE GATE — capture Like / Subscribe / Bell plates and hold all three.
import * as THREE from 'three';
import { G, rand, pick, distXZ, after, players, local } from '../game.js';
import * as D from '../dressing.js';
import { Encounter, weightedPick } from './base.js';
import { setEnv, addBox, addCyl, add, std, pointLight, addStars, removeCollider } from '../world.js';
import { tileTex, textSprite, IMPACT, emojiSprite, emojiTex } from '../textures.js';
import { Doge, Stonks, Nyan, Wizard, spawnEnemy } from '../enemies.js';
import { HUD } from '../hud.js';
import { play } from '../audio.js';
import * as fx from '../fx.js';

const PLATES = [
  { label: '👍 LIKE', x: -28, z: -14 },
  { label: '▶ SUBSCRIBE', x: 0, z: -30 },
  { label: '🔔 HIT THE BELL', x: 28, z: -14 },
];

export class NormieGate extends Encounter {
  static title = 'THE NORMIE GATE';
  cursed = 1;
  build() {
    this.spawn.set(0, 0.1, 38); this.spawnYaw = 0;
    setEnv({ sky: 0x232a3f, fog: 0x5a4a5a, near: 50, far: 220, hemi: [0xb8c4ff, 0x30281c, 0.9], sun: { color: 0xffc890, int: 2.0, pos: [-50, 28, -60] },
      dome: { top: 0x101a40, horizon: 0xc0704a, bottom: 0x1a1018, sun: 0xffb070, sunSize: 1.4, haze: 1.6 } });
    addStars(800);
    const floorTex = tileTex({ base: '#4a4d57', line: '#2c2e35', accent: '#ff3355', n: 4, seed: 2 }); floorTex.repeat.set(14, 14);
    const wallTex = tileTex({ base: '#3b3e48', line: '#272930', n: 2, seed: 5 }); wallTex.repeat.set(10, 1);
    const floor = std(0xffffff, { map: floorTex });
    const wall = std(0xffffff, { map: wallTex });
    const trim = std(0x222222, { emissive: 0xff2244, emissiveIntensity: 0.9 });
    addBox(0, -2, 0, 104, 2, 104, floor);
    addBox(-30, 0, -51, 44, 12, 2, wall); addBox(30, 0, -51, 44, 12, 2, wall); addBox(0, 8, -51, 16, 4, 2, wall);
    addBox(0, 0, 51, 104, 12, 2, wall); addBox(51, 0, 0, 2, 12, 104, wall); addBox(-51, 0, 0, 2, 12, 104, wall);
    for (const x of [-50, 50]) addBox(x, 11.5, 0, 0.4, 0.4, 104, trim, { collide: false, shadow: false });
    addBox(0, 11.5, 50, 104, 0.4, 0.4, trim, { collide: false, shadow: false });
    // corridor beyond the gate
    addBox(0, -2, -64, 16, 2, 26, floor); addBox(-8.5, 0, -64, 1, 10, 26, wall); addBox(8.5, 0, -64, 1, 10, 26, wall); addBox(0, 0, -77.5, 16, 10, 1, wall);
    const sign = textSprite('VAULT OF CRINGE', 3, { font: IMPACT, weight: 'normal', color: '#ffffff' }); sign.position.set(0, 14.5, -50); add(sign);
    // gate doors
    const doorMat = std(0x55303a, { metalness: 0.6, roughness: 0.4, emissive: 0x330010 });
    this.doors = [addBox(-4, 0, -51, 8, 8, 1.5, doorMat), addBox(4, 0, -51, 8, 8, 1.5, doorMat)];
    const lock = emojiSprite('🔒', 2.5); lock.position.set(0, 4, -50); add(lock); this.lock = lock;
    // cover
    const crate = std(0x6a5a48, { roughness: 1 });
    const pill = std(0x555a66);
    for (const [x, z, w, h, d] of [[-14, 12, 4, 2.2, 4], [14, 12, 4, 2.2, 4], [0, 2, 8, 1.4, 2], [-34, 26, 5, 2.4, 3], [34, 26, 5, 2.4, 3], [-12, -20, 3, 2.2, 6], [12, -20, 3, 2.2, 6], [-40, -2, 3, 3, 3], [40, -2, 3, 3, 3], [-22, 30, 2, 1.2, 6], [22, 30, 2, 1.2, 6]]) {
      addBox(x, 0, z, w, h, d, crate);
      D.barrier(x, z, w, h, d);
    }
    for (const [x, z] of [[-20, 0], [20, 0], [-38, -36], [38, -36], [-6, 22], [6, 22]]) D.column(x, z, { h: 9, r: 1.3, color: 0x5d606a, accent: 0xff2244 });
    // walls get pilasters, panels and a cornice; the gate gets a proper arch
    D.wallDress(-50, -50, -9.5, -50, { inward: 1 }); D.wallDress(9.5, -50, 50, -50, { inward: 1 });
    D.wallDress(-50, 50, 50, 50, { inward: -1 });
    D.wallDress(50, -50, 50, 50, { inward: 1 }); D.wallDress(-50, -50, -50, 50, { inward: -1 });
    D.archway(0, -49.6, 16, 8, { depth: 2.6, accent: 0xff2244 });
    // plates
    this.plates = PLATES.map((p) => {
      const mat = std(0x2a0a10, { emissive: 0xff2244, emissiveIntensity: 0.2 });
      const disc = addCyl(p.x, 0, p.z, 4.2, 0.12, mat, { collide: false, seg: 32 });
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 16, 1, true), beamMat); beam.position.set(p.x, 0, p.z); add(beam);
      const lbl = textSprite(p.label, 1.2, { font: IMPACT, weight: 'normal', color: '#ffffff', bg: '#cc0000', stroke: null }); lbl.position.set(p.x, 9.5, p.z); add(lbl);
      pointLight(p.x, 3, p.z, 0xff2244, 25, 14);
      // a progress ring that fills around the edge, and a hologram of the icon that grows + spins as it fills
      const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.35, 4.85, 96, 1, Math.PI / 2, Math.PI * 2), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.04, p.z); ring.geometry.setDrawRange(0, 0); add(ring);
      const track = new THREE.Mesh(new THREE.RingGeometry(4.35, 4.85, 96), new THREE.MeshBasicMaterial({ color: 0x14050a, transparent: true, opacity: 0.8, depthWrite: false }));
      track.rotation.x = -Math.PI / 2; track.position.set(p.x, 0.03, p.z); add(track);
      const holo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: emojiTex(p.label.split(' ')[0]), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 }));
      holo.position.set(p.x, 4.5, p.z); add(holo);
      return { ...p, r: 4.2, prog: 0, captured: false, mat, beam, beamMat, ring, ringMat, holo, wasCap: false };
    });
    // set dressing
    for (const [x, z] of [[-42, 32], [42, 32], [-42, -40], [42, -40]]) D.lamp(x, z, { color: 0xffb070 });
    D.banner(-17, 6.2, -49.8, 0, { color: 0xc4161c, emblem: '▶', text: 'SUBSCRIBE' });
    D.banner(17, 6.2, -49.8, 0, { color: 0xc4161c, emblem: '🔔', text: 'THE BELL' });
    D.banner(-49.8, 6.2, 0, Math.PI / 2, { color: 0x1a1a1a, emblem: '👍', text: 'LIKE' });
    D.banner(49.8, 6.2, 0, -Math.PI / 2, { color: 0x1a1a1a, emblem: '💬', text: 'FIRST' });
    for (const [x, z] of [[-20, 3], [20, 3], [-38, -33], [38, -33], [-6, 25]]) D.rubble(x, z, { n: 6 });
    for (const [x, z] of [[-44, 44], [44, 44], [-44, -2], [44, -2]]) D.crate(x, z);
    D.dust({ min: [-48, 0.3, -48], max: [48, 10, 48], color: 0xffd9a8, count: 700 });
    D.groundFog({ min: [-48, -48], max: [48, 48], color: 0xd8a888, opacity: 0.22, count: 30 });
    D.birds({ center: [0, 0, 0], count: 10, radius: [25, 55], height: [16, 30], color: 0x5a5a66 }); // pigeons. obviously.
    this.spawners = [[-46, 40], [46, 40], [-46, 10], [46, 10], [-46, -30], [46, -30], [-25, -46], [25, -46], [0, 46]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  }
  start() {
    this.host = true;
    this.phase = 'plates'; this.spawnT = 2; this.wizardSpawned = false;
    HUD.objective(NormieGate.title, 'Like, subscribe and hit the bell.\nCapture all three plates at the same time.');
    this.ghost('Guardian, this is it. The Vault of Cringe. They say the memes in here have been deep fried.', 0.6);
    this.ghost('Stand on the plates. Like, subscribe, and hit the bell. Yes, really.', 7);
    for (let i = 0; i < 4; i++) this.spawnAway(i % 2 ? Stonks : Doge, this.spawners, 25);
  }
  update(dt) {
    this.t += dt;
    const p = G.player;
    if (this.phase === 'plates') {
      let captured = 0;
      for (const pl of this.plates) {
        const playerOn = players().some((q) => q.alive && distXZ(q.pos, pl) < pl.r && q.pos.y < 2.5);
        const enemyOn = G.enemies.some((e) => e.alive && e.hostile && !e.flying && distXZ(e.pos, pl) < pl.r);
        if (playerOn) pl.prog = Math.min(1, pl.prog + dt / (enemyOn ? 9 : 4.5));
        else if (enemyOn) pl.prog = Math.max(0, pl.prog - dt / 8);
        if (!pl.captured && pl.prog >= 1) {
          pl.captured = true; play('correct'); play('chime', captured);
          HUD.killfeed(`${pl.label} captured`);
          this.onCapture();
        }
        if (pl.captured && pl.prog < 0.6) {
          pl.captured = false; play('wrong');
          HUD.bigText('👎 DISLIKED', `The ${pl.label.replace(/^\S+ /, '')} plate was lost`, 2.2, 'warn');
        }
        if (pl.captured) captured++;
      }
      const status = this.plates.map((pl) => `${pl.captured ? '■' : pl.prog > 0 ? '▣' : '□'} ${pl.label.replace(/^\S+ /, '')} ${Math.round(pl.prog * 100)}%`).join('\n');
      HUD.objective(null, 'Capture all three plates at the same time.\n' + status);
      if (captured === 3) return this.openGate();
      // spawns
      this.spawnT -= dt;
      const cap = this.plates.filter((q) => q.captured).length;
      const target = 6 + cap * 2;
      if (this.spawnT <= 0 && this.hostiles() < target) {
        this.spawnT = rand(1.8, 3.2);
        const n = Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const T = weightedPick([[Doge, 5], [Stonks, 4], [Nyan, cap >= 1 ? 2 : 0]]);
          const e = this.spawnAway(T, this.spawners, 22);
          // Stonks love to unsubscribe your plates
          if (e instanceof Stonks && Math.random() < 0.55) {
            const owned = this.plates.filter((q) => q.prog > 0.3);
            if (owned.length) { const q = pick(owned); e.goal = new THREE.Vector3(q.x + rand(-2, 2), 0, q.z + rand(-2, 2)); }
          }
        }
      }
    } else if (this.phase === 'gate') {
      if (players().some((q) => q.alive && q.pos.z < -56)) this.complete();
    }
  }
  // visuals, on every machine
  localUpdate(dt) {
    if (this.host !== true) this.t += dt;
    const p = G.player;
    for (const pl of this.plates) {
      const on = p.alive && distXZ(p.pos, pl) < pl.r;
      pl.beam.scale.set(1, 0.1 + pl.prog * 14, 1); pl.beam.position.y = (0.1 + pl.prog * 14) / 2;
      pl.beamMat.opacity = pl.captured ? 0.55 + Math.sin(this.t * 6) * 0.15 : 0.3;
      pl.mat.emissiveIntensity = 0.12 + pl.prog * 0.35 + (on ? Math.sin(this.t * 10) * 0.08 : 0);
      pl.ring.geometry.setDrawRange(0, Math.floor(pl.prog * 96) * 6);
      pl.ringMat.color.set(pl.captured ? 0x5fe8ff : 0xfff0f0).multiplyScalar(pl.captured ? 2.2 : 1.6);
      pl.beamMat.color.set(pl.captured ? 0x5fe8ff : 0xff2244); pl.mat.emissive.set(pl.captured ? 0x2fb8ff : 0xff2244);
      const hs = 0.6 + pl.prog * 0.7 + (pl.captured ? Math.sin(this.t * 4) * 0.06 : 0);
      pl.holo.scale.setScalar(hs);
      pl.holo.rotation.y += dt * (0.6 + pl.prog * 2.5);
      pl.holo.position.y = 4.5 + Math.sin(this.t * 1.7 + pl.x) * 0.25;
      // rising sparks while someone is taking it, a pop when it flips
      if (pl.prog > 0 && pl.prog < 1 && !pl.captured && Math.random() < dt * 8) local(() => fx.burst(new THREE.Vector3(pl.x + rand(-3.5, 3.5), 0.3, pl.z + rand(-3.5, 3.5)), 0xff5577, 1, 2, 0.08, 1.0, -4));
      if (pl.captured !== pl.wasCap) {
        pl.wasCap = pl.captured;
        if (pl.captured) local(() => { fx.ringFx(new THREE.Vector3(pl.x, 0.3, pl.z), 6, 0x5fe8ff, 0.6); fx.burst(new THREE.Vector3(pl.x, 4.5, pl.z), 0x5fe8ff, 30, 7, 0.12, 0.8, 4); fx.floatEmoji(new THREE.Vector3(pl.x, 6.5, pl.z), pl.label.split(' ')[0], 2, 1.4, 2); });
      }
    }
    if (this.phase === 'gate') {
      this.gateT += dt;
      const k = Math.min(1, this.gateT / 3);
      this.doors[0].position.x = -4 - k * 7.5; this.doors[1].position.x = 4 + k * 7.5;
    }
  }
  netState() { return { ph: this.phase, pl: this.plates.map((q) => [Math.round(q.prog * 100) / 100, q.captured ? 1 : 0]) }; }
  applyNet(s) {
    if (!s) return;
    s.pl.forEach(([prog, cap], i) => { this.plates[i].prog = prog; this.plates[i].captured = !!cap; });
    if (s.ph === 'gate' && this.phase !== 'gate') this.openDoors();
    this.phase = s.ph;
  }
  clientStart() { this.phase = 'plates'; }
  openDoors() {
    if (this.doorsOpen) return;
    this.doorsOpen = true; this.gateT = 0;
    for (const d of this.doors) removeCollider(d.userData.box);
    this.lock.visible = false;
  }
  onCapture() {
    const n = this.plates.filter((q) => q.captured).length;
    if (n === 1) this.ghost('One plate down. The algorithm is... intrigued.');
    if (n === 2 && !this.wizardSpawned) {
      this.wizardSpawned = true;
      this.ghost('Two plates. Hold on. That wizard came from the moon.');
      this.spawnAway(Wizard, this.spawners, 20, 6);
    }
  }
  openGate() {
    this.phase = 'gate';
    this.openDoors();
    for (const e of G.enemies) if (e.alive) { fx.burst(e.center(), 0xb06cff, 10, 5, 0.15, 0.6); e.remove(); }
    play('airhorn');
    HUD.bigText('LIKED, SUBSCRIBED, BELLED', 'The normies have logged off.', 3, 'meme');
    HUD.objective(null, 'The gate is open. Go through it.');
    this.ghost('Like, subscribe AND the bell. You absolute legend. The gate is open!');
  }
}
