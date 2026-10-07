// Encounter 3: THE VINE BOOM CHAMBER — Moai Says. Repeat the boom sequence to make Big Chungus vulnerable.
import * as THREE from 'three';
import { G, rand, pick, after, dampAngle, distToSegment, alivePlayers, hurtPlayer, local } from '../game.js';
import * as D from '../dressing.js';
import { Encounter, weightedPick } from './base.js';
import { setEnv, addBox, addCyl, add, std, pointLight, addStars } from '../world.js';
import { tileTex, textSprite, emojiSprite, IMPACT } from '../textures.js';
import { Enemy, Doge, MoaiKnight, Wizard, Stonks, spawnEnemy, registerNetType } from '../enemies.js';
import { Projectile, Shockwave, Pickup, los } from '../combat.js';
import * as M from '../models.js';
import { rimify } from '../rigs.js';
import { playCinematic } from '../cinematic.js';
import { HUD } from '../hud.js';
import { play, playAt, say } from '../audio.js';
import * as fx from '../fx.js';

const STATUES = [
  { name: 'RED', color: 0xff3355, css: '#ff3355', pitch: 0.8 },
  { name: 'BLUE', color: 0x3399ff, css: '#3399ff', pitch: 1.0 },
  { name: 'GREEN', color: 0x33ff77, css: '#33ff77', pitch: 1.2 },
  { name: 'YELLOW', color: 0xffdd33, css: '#ffdd33', pitch: 1.45 },
];
const ENRAGE = 330;
const _t = new THREE.Vector3(), _t2 = new THREE.Vector3();
const r2 = (n) => Math.round(n * 100) / 100;
const v3 = (v) => [r2(v.x), r2(v.y), r2(v.z)];

class MoaiStatue extends Enemy {
  constructor(def, idx, enc) {
    super({ name: def.name + ' Moai', hp: 1, radius: 1, height: 5, rank: 'neutral' });
    this.def = def; this.idx = idx; this.enc = enc;
    this.hostile = false; this.drops = false; this.knockable = false;
    this.model = M.makeMoai(1.15, def.color); this.mesh.add(this.model);
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: def.color }));
    this.crystal.position.y = 5.4; this.mesh.add(this.crystal);
    this.light = new THREE.PointLight(def.color, 0, 18, 2); this.light.position.y = 4; this.mesh.add(this.light);
    this.hb(0, 3.1, 0.3, 1.6, false);
    this.glow = 0;
  }
  takeDamage(dmg, crit, info = {}) {
    if (G.net.isClient) return super.takeDamage(dmg, crit, info);
    this.enc.onStatueShot(this); return 0;
  }
  netVis() { return [r2(this.glow)]; }
  applyVis(v) { this.glow = v[0]; }
  think(dt) { this.glow = Math.max(this.enc.awaiting ? 0.15 : 0, this.glow - dt * 1.4); }
  animate(dt) {
    // a boom: a ring of its colour sweeps out from the pillar and a beam fires into the sky (every machine)
    if (this.glow > (this.prevGlow || 0) + 0.5) {
      const base = this.pos.clone().setY(5.05);
      local(() => { fx.ringFx(base, 7, this.def.color, 0.7); fx.burst(base.clone().setY(base.y + 5.5), this.def.color, 16, 6, 0.12, 0.7, 2); });
      this.beamK = 1;
    }
    this.prevGlow = this.glow;
    if (!this.beam) {
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.def.color).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }));
      this.beam.position.y = 35; this.mesh.add(this.beam);
    }
    this.beamK = Math.max(0, (this.beamK || 0) - dt * 1.6);
    this.beam.material.opacity = this.beamK * 0.55; this.beam.visible = this.beamK > 0.01;
    this.beam.scale.set(0.6 + this.beamK * 0.6, 1, 0.6 + this.beamK * 0.6);
    this.model.userData.headMat.emissiveIntensity = this.glow * 2;
    this.light.intensity = this.glow * 60;
    this.crystal.rotation.y += dt * 1.5;
    this.crystal.position.y = 5.4 + Math.sin(this.t * 2) * 0.2;
  }
  flash(k = 1) { this.glow = k; }
}

class Chungus extends Enemy {
  constructor(enc) {
    super({ name: 'BIG CHUNGUS, THE SIMPLY TOO BIG', ash: 0xbfb6ff, hp: 6000, radius: 2.6, height: 8, rank: 'boss', gib: 0x8d8d96 });
    this.enc = enc; this.knockable = false; this.immune = true;
    this.model = M.makeChungus(); this.mesh.add(this.model);
    rimify(this.model, 0xc8b8ff, 0.3);
    this.hb(0, 2.4, 0, 2.6).hb(0, 5.2, 0.6, 1.45, true);
    const sm = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(5.6, 32, 20), sm); this.shield.position.y = 4; this.mesh.add(this.shield);
    this.beam = new fx.Beam(0xff2020, 0.4, 0.9);
    this.aimBeam = new fx.Beam(0xff6060, 0.04, 0.5);
    this.state = 'idle'; this.beamCd = 6; this.stompCd = 11; this.aim = new THREE.Vector3();
  }
  cleanupMesh() { super.cleanupMesh(); this.aimBeam.dispose(); }
  animate(dt) {
    const u = this.model.userData;
    this.shield.visible = this.immune;
    this.shield.material.opacity = 0.15 + Math.sin(this.t * 3) * 0.05;
    u.head.rotation.z = Math.sin(this.t * 1.3) * 0.08;
    // the thicc idle: belly breathes, ears flop a beat behind the head, arms sway
    const air = this.model.position.y; // >0 mid-stomp
    u.bodyJ.scale.set(1 + Math.sin(this.t * 2) * 0.015, 1 - Math.sin(this.t * 2) * 0.02 + air * 0.03, 1);
    u.belly.scale.set(1.9 + Math.sin(this.t * 4) * 0.04, 1.8, 0.95 + Math.sin(this.t * 4 + 1) * 0.05);
    for (const e of u.ears) {
      e.ear.rotation.x = Math.sin(this.t * 1.3 - 0.4) * 0.12 - air * 0.15;
      e.tip.rotation.x = 0.6 + Math.sin(this.t * 1.3 - 0.9) * 0.3 + air * 0.4;
      e.tip.rotation.z = e.sx * (0.2 + Math.sin(this.t * 0.9) * 0.1);
    }
    for (const a of u.arms) a.arm.rotation.set(Math.sin(this.t * 1.1 + a.sx) * 0.15 - air * 0.3, 0, a.sx * (0.1 + air * 0.4));
    this.flinch = Math.max(0, this.flinch);
    u.head.rotation.x = -Math.min(1, this.flinch) * 0.25;
  }
  netVis() {
    const b = this.beam.m, a = this.aimBeam.m;
    return [r2(this.model.position.y), r2(this.model.userData.eyeGlow.opacity),
      b.visible ? [...v3(this.eyeV), ...v3(this.beamEnd), r2(b.scale.x)] : 0,
      a.visible ? [...v3(this.eyeV), ...v3(this.aim)] : 0];
  }
  applyVis(v) {
    this.model.position.y = v[0]; this.model.userData.eyeGlow.opacity = v[1];
    if (v[2]) this.beam.set(_t.set(v[2][0], v[2][1], v[2][2]), _t2.set(v[2][3], v[2][4], v[2][5]), v[2][6]); else this.beam.hide();
    if (v[3]) this.aimBeam.set(_t.set(v[3][0], v[3][1], v[3][2]), _t2.set(v[3][3], v[3][4], v[3][5])); else this.aimBeam.hide();
  }
  think(dt) {
    const p = this.tgt();
    this.yaw = dampAngle(this.yaw, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 1.6, dt);
    const eye = this.eyeV = this.hbWorld({ off: _t.set(0, 5.5, 1.6) }, new THREE.Vector3());
    const eg = this.model.userData.eyeGlow;
    if (this.state === 'idle') {
      eg.opacity = 0;
      this.beamCd -= dt; this.stompCd -= dt;
      if (this.stompCd <= 0) { this.state = 'stomp'; this.st = 0; this.stompCd = rand(11, 15); }
      else if (this.beamCd <= 0 && p.alive) { this.state = 'charge'; this.st = 1.1; this.aim.set(p.pos.x, p.pos.y + 1, p.pos.z); playAt(eye, 'sus'); }
    } else if (this.state === 'charge') {
      this.st -= dt; eg.opacity = 1 - this.st;
      this.aim.lerp(_t.set(p.pos.x, p.pos.y + 1, p.pos.z), 1 - Math.exp(-3 * dt));
      this.aimBeam.set(eye, this.aim);
      if (this.st <= 0) { this.state = 'beam'; this.st = 2.6; this.aimBeam.hide(); playAt(eye, 'laser'); }
    } else if (this.state === 'beam') {
      this.st -= dt; eg.opacity = 1;
      // the beam slowly chases you — sprint!
      _t.set(p.pos.x, p.pos.y + 1, p.pos.z).sub(this.aim);
      const step = Math.min(_t.length(), 7.5 * dt);
      if (_t.length() > 0.001) this.aim.addScaledVector(_t.normalize(), step);
      const dir = this.aim.clone().sub(eye).normalize();
      const end = this.beamEnd = eye.clone().addScaledVector(dir, 70);
      this.beam.set(eye, end, 0.35 + Math.sin(this.t * 40) * 0.05);
      if (Math.random() < 0.3) playAt(eye, 'laser');
      // the laser cooks anyone it sweeps across, not just its target
      for (const q of alivePlayers()) {
        _t.set(q.pos.x, q.pos.y + 1, q.pos.z);
        if (distToSegment(_t, eye, end) < 1.0 && los(eye, _t)) hurtPlayer(q, 50 * dt, 'Big Chungus\'s eye laser');
      }
      if (this.st <= 0) { this.state = 'idle'; this.beamCd = rand(6, 9); this.beam.hide(); }
    } else if (this.state === 'stomp') {
      this.st += dt;
      this.model.position.y = Math.sin(Math.min(1, this.st / 0.9) * Math.PI) * 2.5;
      if (this.st >= 0.9) {
        this.model.position.y = 0; this.state = 'idle';
        new Shockwave({ center: this.pos.clone(), speed: 14, maxR: 36, dmg: 40, height: 0.9, color: 0xff5555, source: 'a Chungus stomp (you had to jump)' });
        playAt(this.pos, 'vineBoom', 0.6); G.shake += 0.6;
        fx.floatText(this.top().clone(), 'THICC STOMP', { height: 1.2, color: '#ff5555' });
      }
    }
  }
  takeDamage(dmg, crit, info) {
    const r = super.takeDamage(dmg, crit, info);
    if (r && this.alive && Math.random() < 0.04) fx.floatText(this.top().clone(), pick(['oof', 'ouch my thicc', 'big chungus is no longer amused']), { height: 0.7 });
    return r;
  }
}

export class VineBoomChamber extends Encounter {
  static title = 'THE VINE BOOM CHAMBER';
  cursed = 3;
  build() {
    this.spawn.set(0, 0.1, 30); this.spawnYaw = 0;
    setEnv({ sky: 0x1a0f24, fog: 0x2a1838, near: 30, far: 150, hemi: [0xc8a8ff, 0x201418, 0.7], sun: { color: 0xffd0a0, int: 1.5, pos: [-30, 45, 20] }, shadowSize: 45,
      dome: { top: 0x0a0618, horizon: 0x5a2a6a, bottom: 0x0a0610, sun: 0xffe0c0, sunSize: 2.5, haze: 1.2 } });
    addStars(1000, 300, 0xffccff);
    const ft = tileTex({ base: '#4d4452', line: '#2e2733', accent: '#b06cff', n: 4, seed: 11 }); ft.repeat.set(10, 10);
    const wt = tileTex({ base: '#3d3542', line: '#2a2330', n: 2, seed: 12 }); wt.repeat.set(2, 1);
    const floor = std(0xffffff, { map: ft }), wall = std(0xffffff, { map: wt });
    addBox(0, -2, 0, 84, 2, 84, floor);
    const R = 36, N = 28;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      addBox(Math.cos(a) * R, 0, Math.sin(a) * R, 9, 14, 9, wall);
    }
    // dais for chungus: two steps and a ring of glowing runes
    addCyl(0, 0, 0, 7.6, 0.5, std(0x4a3d55, { metalness: 0.3 }), { seg: 48 });
    addCyl(0, 0, 0, 6.5, 1, std(0x5a4a66, { metalness: 0.4 }), { seg: 48 });
    const rune = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xb06cff, emissiveIntensity: 2.4 });
    for (const [r, y, w] of [[7.0, 0.52, 0.12], [5.6, 1.02, 0.08]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 96), rune); t.rotation.x = Math.PI / 2; t.position.y = y; add(t); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const g = textSprite(pick(['🗿', 'ᚱ', 'ᛟ', 'ᚦ', 'BOOM']), 0.35, { color: '#d9b8ff', font: IMPACT, weight: 'normal' }); g.position.set(Math.cos(a) * 6.1, 1.25, Math.sin(a) * 6.1); add(g); }
    // inlaid floor rings + an inner colonnade with a carved frieze above it
    for (const r of [12, 19.5]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 160), rune); t.rotation.x = Math.PI / 2; t.position.y = 0.03; add(t); }
    // (offset so they stay clear of the braziers, banners and the entrance)
    for (let i = 0; i < 12; i++) { const a = (i * 30 + 15) * Math.PI / 180; D.column(Math.cos(a) * 31, Math.sin(a) * 31, { h: 11, r: 1.1, color: 0x6a5f72, accent: 0xb06cff }); }
    const frieze = new THREE.Mesh(new THREE.CylinderGeometry(32.5, 32.5, 1.6, 96, 1, true), std(0x5a4f63, { roughness: 0.8 }));
    frieze.material.side = THREE.BackSide; frieze.position.y = 11.8; add(frieze);
    const fr2 = new THREE.Mesh(new THREE.TorusGeometry(32.3, 0.25, 6, 128), std(0x7a6f82, { metalness: 0.3 })); fr2.rotation.x = Math.PI / 2; fr2.position.y = 11; add(fr2);
    // statues on pillars
    this.statues = STATUES.map((def, i) => {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const x = Math.cos(a) * 24, z = Math.sin(a) * 24;
      addCyl(x, 0, z, 2.4, 5, std(0x6a5f72), { seg: 12 });
      const s = new MoaiStatue(def, i, this);
      s.pos.set(x, 5, z); s.yaw = Math.atan2(-x, -z);
      G.enemies.push(s);
      const lbl = textSprite(def.name, 0.8, { font: IMPACT, weight: 'normal', color: def.css }); lbl.position.set(x, 12.3, z); add(lbl);
      return s;
    });
    // low cover
    const cover = std(0x6d6070);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      addBox(Math.cos(a) * 15, 0, Math.sin(a) * 15, i % 2 ? 1.5 : 7, 1.6, i % 2 ? 7 : 1.5, cover);
      addBox(Math.cos(a + 0.42) * 27, 0, Math.sin(a + 0.42) * 27, 2.5, 2.4, 2.5, cover);
    }
    pointLight(0, 12, 0, 0xb06cff, 60, 40);
    // temple dressing: braziers, 🗿 banners, a shaft of light on the big man
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; D.brazier(Math.cos(a) * 30.5, Math.sin(a) * 30.5); }
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; D.banner(Math.cos(a) * 31.3, 7.5, Math.sin(a) * 31.3, -a - Math.PI / 2, { color: 0x3a1a5a, emblem: '🗿', text: 'BOOM', h: 6 }); }
    for (let i = 0; i < 6; i++) { const a = rand(0, 6.28); D.rubble(Math.cos(a) * 20, Math.sin(a) * 20, { n: 5, color: 0x6d6070 }); }
    D.lightShaft(0, 26, 0, { height: 26, top: 2, bottom: 7, color: 0xd8b8ff, opacity: 0.16 });
    D.dust({ min: [-32, 0.3, -32], max: [32, 12, 32], color: 0xe0c8ff, count: 700 });
    D.groundFog({ min: [-32, -32], max: [32, 32], color: 0x8a5aa8, opacity: 0.25, count: 26 });
    this.spawners = [];
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; this.spawners.push(new THREE.Vector3(Math.cos(a) * 30, 0, Math.sin(a) * 30)); }
  }
  start() {
    this.boss = new Chungus(this);
    this.boss.pos.set(0, 1, 0);
    G.enemies.push(this.boss);
    this.seqLen = 3; this.phase = 'intro'; this.enrageT = ENRAGE; this.spawnT = 3; this.awaiting = false;
    HUD.objective(VineBoomChamber.title, 'Listen to the Moai.');
    // first attempt gets the intro; game-time timers wait for it to finish
    if (!G.introsSeen.has('chungus')) { G.introsSeen.add('chungus'); this.ev('intro'); }
    after(0.8, () => this.ghost('Is that... Big Chungus? He is immune. He is simply too big.'));
    after(6, () => this.ghost('The Moai statues. They are booming in a pattern. Shoot them in the same order!'));
    after(9, () => this.playSequence());
  }
  ev_intro() {
    const b = this.boss || G.enemies.find((e) => e instanceof Chungus);
    if (!b) return;
    const u = b.model.userData;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    let stomped = false, rumbled = false;
    playCinematic({
      duration: 8.4,
      shots: [
        { t: [0, 3.2], path: [V(15, 2.2, 27), V(9, 2.6, 20), V(5, 2.4, 16)], look: [V(0, 2.5, 0), V(0, 4.5, 0)], fov: [52, 46] },
        { t: [3.2, 5.4], path: [V(1.2, 6.4, 9.5), V(0.4, 6.1, 7.4)], look: [V(0, 6.1, 0.6)], fov: [40, 33] },
        { t: [5.4, 8.4], path: [V(-5, 4, 13), V(-12, 8, 22), V(-15, 11, 27)], look: [V(0, 4, 0), V(0, 3.5, 0)], fov: [56, 62] },
      ],
      card: { at: 4.7, name: 'BIG CHUNGUS, THE SIMPLY TOO BIG', sub: 'LORD OF THE THICC · HE WHO CANNOT BE STOPPED, ONLY DAMAGED' },
      lines: [[3.7, 'I am simply too big', 'boss']],
      choreo: (t, dt, snap) => {
        if (snap) t = 99;
        if (!rumbled && !snap) { rumbled = true; play('rumble', 3.2); }
        // rise out of the floor
        const rise = Math.min(1, t / 3.0);
        b.model.position.y = -9 * (1 - rise * rise * (3 - 2 * rise));
        if (t < 3) { G.shake = Math.max(G.shake, 0.25); if (Math.random() < 0.3) fx.burst(new THREE.Vector3(Math.random() * 10 - 5, 1.1, Math.random() * 10 - 5), 0xbfb6a8, 3, 3, 0.1, 0.6, 4); }
        // eyes ignite on the close-up
        u.eyeGlow.opacity = t < 3.6 ? 0 : t < 4.4 ? (t - 3.6) / 0.8 : t < 7 ? 1 : Math.max(0, 1 - (t - 7));
        // the hop and the stomp
        if (t > 5.6 && t < 6.2) b.model.position.y = Math.sin(((t - 5.6) / 0.6) * Math.PI) * 2.6;
        if (t >= 6.2 && !stomped) {
          stomped = true;
          if (!snap) { playAt(b.pos, 'vineBoom', 0.55); play('explosion', 1.5); G.shake += 1.4; fx.ringFx(b.pos.clone().setY(1.05), 18, 0xff5555, 0.9); fx.burst(b.pos.clone().setY(1.2), 0xbfb6a8, 30, 9, 0.2, 0.9, 6); }
        }
        // the shield wraps around him
        const sk = t < 6.6 ? 0 : Math.min(1, (t - 6.6) / 0.9);
        b.shield.visible = sk > 0; b.shield.scale.setScalar(Math.max(0.001, sk * (1 + Math.sin(sk * Math.PI) * 0.15)));
        if (snap) { b.model.position.y = 0; u.eyeGlow.opacity = 0; b.shield.scale.setScalar(1); b.shield.visible = true; }
      },
      onEnd: () => { b.model.position.y = 0; u.eyeGlow.opacity = 0; b.shield.scale.setScalar(1); },
    });
  }
  playSequence() {
    if (this.done || this.phase === 'enrage') return;
    this.phase = 'listen'; this.awaiting = false; this.input = 0;
    this.seq = [];
    for (let i = 0; i < this.seqLen; i++) {
      let s; do { s = Math.floor(Math.random() * 4); } while (s === this.seq[i - 1]);
      this.seq.push(s);
    }
    HUD.bigText('🗿 MOAI SAYS 🗿', 'listen...', 1.8, 'meme');
    this.seq.forEach((s, i) => after(1.6 + i * 1.05, () => {
      if (this.phase !== 'listen') return;
      const st = this.statues[s];
      st.flash(1); playAt(st.pos.clone().setY(st.pos.y + 3), 'vineBoom', st.def.pitch);
      fx.floatEmoji(st.pos.clone().setY(st.pos.y + 7), '🗿', 2.5, 1.2, 1.5);
    }));
    after(1.6 + this.seq.length * 1.05 + 0.3, () => {
      if (this.phase !== 'listen') return;
      this.phase = 'input'; this.awaiting = true; this.inputCd = 0;
      HUD.bigText('YOUR TURN', 'shoot the Moai in order', 1.6);
    });
  }
  onStatueShot(st) {
    if (this.phase !== 'input' || G.time < this.inputCd) return;
    this.inputCd = G.time + 0.35;
    const want = this.seq[this.input];
    st.flash(1);
    playAt(st.pos.clone().setY(st.pos.y + 3), 'vineBoom', st.def.pitch);
    if (st.idx === want) {
      this.input++;
      play('chime', this.input);
      if (this.input >= this.seq.length) this.startDps();
    } else {
      this.phase = 'fail'; this.awaiting = false;
      play('wrong'); say('bruh', 'bruh'); G.stats.bruh++;
      HUD.bigText('BRUH', `that was the ${st.def.name} Moai. disrespectful.`, 2.5, 'warn');
      const targets = alivePlayers();
      for (const s of this.statues) {
        s.flash(1);
        for (const q of targets) {
          const from = s.pos.clone().setY(s.pos.y + 3.3);
          const dir = _t.set(q.pos.x, q.pos.y + 1, q.pos.z).sub(from).normalize();
          new Projectile({ pos: from, vel: dir.multiplyScalar(18), owner: 'enemy', dmg: 18, splash: 3.5, color: 0x8a867e, size: 0.6, trail: 0x555555, source: 'the Moai (you disrespected them)' });
        }
      }
      after(4, () => this.playSequence());
    }
  }
  startDps() {
    this.phase = 'dps'; this.awaiting = false; this.dpsT = 18;
    this.boss.immune = false;
    play('airhorn');
    HUD.bigText('CHUNGUS IS VULNERABLE', 'he is no longer simply too big', 2.5, 'good');
    this.ghost('He is vulnerable! Dump everything into him! Rockets! Supers! Hopes and dreams!');
    for (const s of this.statues) s.flash(1);
    for (let i = 0; i < 2; i++) new Pickup('heavy', new THREE.Vector3(rand(-6, 6), 2, 14 + rand(-3, 3)));
    new Pickup('special', new THREE.Vector3(rand(-6, 6), 2, -14));
  }
  endDps() {
    this.phase = 'cooldown';
    this.boss.immune = true;
    this.seqLen = Math.min(7, this.seqLen + 1);
    HUD.bigText('CHUNGUS HAS RE-THICCENED', `next sequence: ${this.seqLen} booms`, 2.5, 'warn');
    after(3, () => this.playSequence());
  }
  update(dt) {
    this.t += dt;
    if (this.done || this.won) return;
    const b = this.boss;
    if (!b.alive) { this.won = true; return this.win(); }
    this.enrageT -= dt;
    const mm = Math.floor(Math.max(0, this.enrageT) / 60), ss = String(Math.floor(Math.max(0, this.enrageT) % 60)).padStart(2, '0');
    let obj = '';
    if (this.phase === 'listen') obj = 'Listen to the Moai...';
    else if (this.phase === 'input') obj = `Shoot the Moai in order: ${this.seq.map((s, i) => (i < this.input ? '●' : '○')).join(' ')}`;
    else if (this.phase === 'dps') obj = `DAMAGE PHASE: ${Math.ceil(this.dpsT)}s`;
    else obj = 'The Moai are thinking...';
    HUD.objective(null, `${obj}\nCheems BONK in ${mm}:${ss}`);
    HUD.boss(b.name, b.hp / b.maxHp, { immune: b.immune, sub: b.immune ? 'IMMUNE — simply too big' : 'VULNERABLE' });
    if (this.phase === 'dps') { this.dpsT -= dt; if (this.dpsT <= 0) this.endDps(); }
    if (this.enrageT <= 0 && this.phase !== 'enrage') this.enrage();
    // adds
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.phase !== 'enrage') {
      this.spawnT = rand(3, 5);
      if (this.hostiles((e) => e !== b) < 7) {
        const T = weightedPick([[Doge, 5], [Stonks, 2], [MoaiKnight, this.count(MoaiKnight) < 2 ? 2 : 0], [Wizard, this.count(Wizard) < 1 ? 1 : 0]]);
        this.spawnAway(T, this.spawners, 16, T === Wizard ? 6 : null);
      }
    }
  }
  enrage() {
    this.phase = 'enrage';
    HUD.bigText('GO TO RAID JAIL', 'BONK', 3, 'warn');
    this.ghost('Oh no. Cheems is here. And he has the bat.');
    this.ev('bat');
  }
  ev_bat() {
    const bat = new THREE.Group();
    const wood = std(0x8b5a2b);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.6, 18, 12), wood); handle.position.y = 9; bat.add(handle);
    const cheems = emojiSprite('🐕', 10); cheems.position.y = 24; bat.add(cheems);
    const p = G.player.pos;
    bat.position.set(p.x, 0, p.z + 10); bat.rotation.x = -1.6;
    add(bat);
    let k = 0;
    const tick = setInterval(() => {
      k += 0.05; bat.rotation.x = -1.6 + Math.min(1, k) * 1.5;
      if (k >= 1) {
        clearInterval(tick); play('bigBonk'); G.shake += 2;
        fx.floatText(G.player.pos.clone().setY(3), 'BONK', { height: 3, color: '#ffffff', life: 2 });
        G.player.revives = 0;
        local(() => G.player.die('Cheems (enrage). Go to raid jail.'));
      }
    }, 30);
  }
  win() {
    play('vineBoom', 0.5); play('airhorn');
    HUD.hideBoss();
    HUD.bigText('BIG CHUNGUS DEFEATED', 'he was, in the end, simply too big to live', 4, 'meme');
    this.ghost('He is down! Big Chungus has been... un-chungused.');
    for (const s of this.statues) s.remove();
    after(2, () => this.complete());
  }
}

registerNetType(MoaiStatue, () => null); // built by build() on every machine
registerNetType(Chungus, () => new Chungus(G.encounter));
