// Encounter 2: EMERGENCY MEETING — one of the crewmates is the impostor. Watch for venting.
import * as THREE from 'three';
import { G, rand, pick, shuffle, distXZ, after, hurtPlayer, playerById } from '../game.js';
import * as D from '../dressing.js';
import { Encounter } from './base.js';
import { setEnv, addBox, addCyl, add, std, pointLight, addStars } from '../world.js';
import { tileTex, textSprite, IMPACT } from '../textures.js';
import { Enemy, Doge, Nyan, SusSniper, spawnEnemy, registerNetType } from '../enemies.js';
import * as M from '../models.js';
import { CrewRig } from '../rigs.js';
import { playCinematic } from '../cinematic.js';
import { los } from '../combat.js';
import { HUD } from '../hud.js';
import { play, playAt, say } from '../audio.js';
import * as fx from '../fx.js';

const ROUNDS = [
  { crew: 6, imps: 1, killEvery: 30 },
  { crew: 8, imps: 1, killEvery: 26 },
  { crew: 10, imps: 2, killEvery: 24 },
];
const SUS_LINES = ['WAS ACTING KINDA SUS', 'VENTED IN FRONT OF EVERYONE', 'DID NOT DO A SINGLE TASK', 'SAID "WHERE?" TOO FAST', 'SELF-REPORTED', 'FAKED THE MEDBAY SCAN'];
const TASKS = ['📋 Swipe Card', '⚡ Fix Wiring', '🗑️ Empty Garbage', '🛡️ Prime Shields', '⛽ Fuel Engines', '📡 Download Data', '🌡️ Inspect Sample', '🚀 Align Engine'];

class Crewmate extends Enemy {
  constructor(colorName, enc) {
    super({ name: colorName, hp: 1, radius: 0.45, height: 1.5, speed: 3.4, rank: 'neutral', gib: M.CREW_COLORS[colorName], deathLines: ['was The Impostor.'] });
    this.colorName = colorName; this.enc = enc; this.netArgs = [colorName];
    this.hostile = false; this.drops = false; this.knockable = false;
    this.useRig(new CrewRig(M.CREW_COLORS[colorName]));
    this.tag = textSprite(colorName, 0.32, { color: '#ffffff', font: 'Arial' }); this.tag.position.y = 2.0; this.mesh.add(this.tag);
    this.hb(0, 0.9, 0, 0.55).hb(0, 1.15, 0.32, 0.26, true);
    this.state = 'walk'; this.target = pick(enc.waypoints); this.wait = 0;
    this.impostor = false; this.revealed = false; this.ventT = rand(5, 9);
  }
  takeDamage(dmg, crit, info = {}) {
    if (!this.alive) return 0;
    if (G.net.isClient || this.revealed) return super.takeDamage(dmg, crit, info);
    if (this.state === 'vent2' || this.state === 'hidden') return 0;
    this.enc.onCrewShot(this, info);
    return 0;
  }
  pose() { return { task: this.state === 'task', aim: this.revealed }; }
  animate(dt) {
    if (this.mouth) this.mouth.position.z = 0.5 + Math.sin(this.t * 20) * 0.08;
    if (this.ejected) { this.model.rotation.x += dt * 8; this.model.rotation.z += dt * 5; }
  }
  netVis() { return [Math.round(this.model.position.y * 100) / 100, this.tag.visible ? 1 : 0, this.revealed ? 1 : 0, this.state === 'ejected' ? 1 : 0]; }
  applyVis(v) {
    this.model.position.y = v[0]; this.tag.visible = !!v[1];
    if (v[2] && !this.revealed) this.reveal();
    if (v[3]) { this.ejected = true; this.tag.visible = false; }
  }
  think(dt) {
    const walkAnim = () => {}; // legs are animated in animate() so clients see it too
    const p = this.tgt();
    if (this.revealed) {
      const d = this.steer(p.pos.x, p.pos.z, 8.5, dt, { stopDist: 1.0 });
      this.cd -= dt;
      if (d < 1.9 && this.cd <= 0 && p.alive) { this.cd = 0.8; hurtPlayer(p, 22, `${this.colorName} (they were the impostor)`); playAt(this.pos, 'stab'); }
      return;
    }
    switch (this.state) {
      case 'walk': {
        const d = this.steer(this.target.x, this.target.z, this.speed, dt, { stopDist: 0.4 });
        walkAnim(1);
        this.stuck = Math.hypot(this.vel.x, this.vel.z) < 1 ? (this.stuck || 0) + dt : 0;
        if (this.stuck > 1.5) { this.stuck = 0; this.target = pick(this.enc.waypoints); }
        if (d < 0.8) { this.state = 'task'; this.wait = rand(2, 5); }
        break;
      }
      case 'task':
        this.steer(this.pos.x, this.pos.z, 0, dt); walkAnim(0);
        this.wait -= dt;
        if (this.wait <= 0) { this.state = 'walk'; this.target = pick(this.enc.waypoints); }
        break;
      case 'meeting':
        this.steer(this.pos.x, this.pos.z, 0, dt); walkAnim(0);
        this.yaw = Math.atan2(-this.pos.x, -this.pos.z);
        break;
      case 'toVent': {
        const d = this.steer(this.vent.x, this.vent.z, this.speed * 1.2, dt, { stopDist: 0.1 });
        walkAnim(1);
        if (d < 0.5) { this.state = 'vent1'; this.vt = 0.6; this.pos.x = this.vent.x; this.pos.z = this.vent.z; playAt(this.pos, 'vent'); fx.burst(this.pos.clone().setY(0.3), 0x444444, 10, 3, 0.1, 0.5); }
        break;
      }
      case 'vent1':
        this.vt -= dt; this.model.position.y = -1.7 * (1 - this.vt / 0.6); this.tag.visible = false;
        if (this.vt <= 0) { this.state = 'hidden'; this.vt = rand(1.2, 2.5); this.untargetable = true; }
        break;
      case 'hidden':
        this.vt -= dt;
        if (this.vt <= 0) {
          const nv = pick(this.enc.vents.filter((v) => distXZ(v, this.pos) > 8));
          this.pos.set(nv.x, 0.05, nv.z); this.state = 'vent2'; this.vt = 0.6; this.untargetable = false;
          playAt(this.pos, 'vent'); fx.burst(this.pos.clone().setY(0.3), 0x444444, 10, 3, 0.1, 0.5);
          fx.floatText(this.pos.clone().setY(2.4), '👀', { height: 0.8 });
        }
        break;
      case 'vent2':
        this.vt -= dt; this.model.position.y = -1.7 * (this.vt / 0.6);
        if (this.vt <= 0) { this.model.position.y = 0; this.tag.visible = true; this.state = 'walk'; this.target = pick(this.enc.waypoints); this.ventT = rand(7, 12); }
        break;
      case 'hunt': {
        const v = this.victim;
        if (!v || !v.alive || v.state === 'ejected') { this.state = 'walk'; this.target = pick(this.enc.waypoints); break; }
        const d = this.steer(v.pos.x, v.pos.z, this.speed * 1.6, dt, { stopDist: 0.6 });
        walkAnim(1);
        if (d < 1.3) { this.enc.doKill(this, v); this.state = 'walk'; this.target = pick(this.enc.waypoints); }
        break;
      }
      case 'ejected':
        this.pos.y += dt * 9; this.ejected = true;
        if (this.pos.y > 30) this.remove();
        break;
    }
    if (this.impostor && (this.state === 'walk' || this.state === 'task') && this.enc.phase === 'play') {
      this.ventT -= dt;
      if (this.ventT <= 0) {
        this.vent = this.enc.vents.reduce((a, b) => (distXZ(a, this.pos) < distXZ(b, this.pos) ? a : b));
        this.state = 'toVent';
      }
    }
  }
  reveal() {
    this.revealed = true; this.hostile = true; this.rank = 'major'; this.name = 'IMPOSTOR (' + this.colorName + ')';
    this.maxHp = this.hp = 380; this.drops = true; this.state = 'revealed'; this.untargetable = false; this.model.position.y = 0;
    this.tag.visible = false; // no longer a crewmate, no longer gets a name tag
    this.mouth = M.makeImpostorMouth(); this.mouth.position.set(0, 0.62, 0.42); this.rig.j.torso.add(this.mouth);
    const vm = this.rig.visorMat; vm.color.set(0xff0000); vm.emissive.set(0xff0000); vm.emissiveIntensity = 0.9;
    // swap in a health bar now that it's a real fight
    const bar = new Enemy({ rank: 'major' }); this.bar = bar.bar; this.barFill = bar.barFill; bar.bar = null; bar.remove();
  }
}

export class EmergencyMeeting extends Encounter {
  static title = 'EMERGENCY MEETING';
  cursed = 2;
  build() {
    this.spawn.set(0, 0.1, 30); this.spawnYaw = 0;
    setEnv({ sky: 0x0b0f1c, fog: 0x0b0f1c, near: 40, far: 160, hemi: [0xbfd4ff, 0x202430, 0.8], sun: { color: 0xdde8ff, int: 1.3, pos: [20, 60, 30] }, shadowSize: 45,
      dome: { top: 0x02030a, horizon: 0x0e2a3a, bottom: 0x02020a, sun: 0x9fd8ff, sunSize: 0.6, haze: 0.6, clouds: 0 } });
    addStars(1400, 300, 0xdfe8ff);
    const ft = tileTex({ base: '#8a93a6', line: '#5d6577', n: 4, grain: 14, seed: 7 }); ft.repeat.set(10, 10);
    const wt = tileTex({ base: '#5b6478', line: '#3d4455', n: 3, seed: 8 }); wt.repeat.set(8, 1);
    const floor = std(0xffffff, { map: ft, metalness: 0.3, roughness: 0.6 });
    const wall = std(0xffffff, { map: wt, metalness: 0.4 });
    const trim = std(0x111111, { emissive: 0x00ccff, emissiveIntensity: 0.9 });
    const S = 40;
    addBox(0, -2, 0, S * 2 + 4, 2, S * 2 + 4, floor);
    addBox(0, 0, -S - 1, S * 2 + 4, 10, 2, wall); addBox(0, 0, S + 1, S * 2 + 4, 10, 2, wall);
    addBox(-S - 1, 0, 0, 2, 10, S * 2 + 4, wall); addBox(S + 1, 0, 0, 2, 10, S * 2 + 4, wall);
    for (const z of [-S, S]) addBox(0, 9.6, z, S * 2, 0.3, 0.3, trim, { collide: false, shadow: false });
    // interior walls with doorways — rooms like a certain spaceship
    for (const [x, z, w, d] of [[-26, -15, 9, 1], [26, -15, 9, 1], [-26, 15, 9, 1], [26, 15, 9, 1], [-15, -28, 1, 7], [15, -28, 1, 7], [-15, 28, 1, 7], [15, 28, 1, 7]]) {
      addBox(x, 0, z, w, 4, d, wall);
      D.barrier(x, z, w, 4, d);
    }
    // the hull: pilastered walls with cyan lights, windows out to space, trusses + light panels overhead
    D.wallDress(-S, -S, S, -S, { inward: 1, h: 10, every: 10, color: 0x4a5266, accent: 0x7fe0ff });
    D.wallDress(-S, S, S, S, { inward: -1, h: 10, every: 10, color: 0x4a5266, accent: 0x7fe0ff });
    D.wallDress(S, -S, S, S, { inward: 1, h: 10, every: 10, color: 0x4a5266, accent: 0x7fe0ff });
    D.wallDress(-S, -S, -S, S, { inward: -1, h: 10, every: 10, color: 0x4a5266, accent: 0x7fe0ff });
    D.spaceWindow(-15, 5.2, -S + 0.12, 0, { w: 14, h: 5 }); D.spaceWindow(15, 5.2, -S + 0.12, 0, { w: 14, h: 5, planet: false });
    D.spaceWindow(0, 5.2, S - 0.12, Math.PI, { w: 18, h: 5 });
    D.ceilingTruss(-S, S, -S, S, 10.2, { every: 10, accent: 0xcfeeff });
    // cafeteria: the emergency button under a glass dome on a big round table
    D.cafeTable(0, 0, { r: 3.2, bench: true });
    addCyl(0, 0, 0, 3.2, 1.0, std(0x9aa5b8, { metalness: 0.5 }), { seg: 24 }).visible = false;
    addCyl(0, 1.0, 0, 0.6, 0.35, std(0xff0000, { emissive: 0xaa0000 }), { collide: false });
    D.glassDome(0, 1.0, 0, 0.85);
    const btnLbl = textSprite('EMERGENCY', 0.5, { font: IMPACT, weight: 'normal', color: '#ff3333' }); btnLbl.position.set(0, 2.4, 0); add(btnLbl);
    for (const [x, z] of [[-12, -6], [12, -6], [-12, 6], [12, 6]]) { addCyl(x, 0, z, 1.6, 0.9, std(0x9aa5b8, { metalness: 0.5 }), { seg: 18 }).visible = false; D.cafeTable(x, z, { r: 1.6, h: 0.9, bench: true }); }
    // sniper perches (corners) with steps
    const perchMat = std(0x3d4455, { metalness: 0.5 });
    this.perches = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * 33, z = sz * 33;
      addBox(x, 0, z, 8, 4, 8, perchMat); D.barrier(x, z, 8, 4, 8);
      addBox(x - sx * 5.5, 0, z, 3, 1.5, 3, perchMat); D.barrier(x - sx * 5.5, z, 3, 1.5, 3);
      addBox(x - sx * 5.5, 0, z - sz * 3.0, 3, 2.8, 3, perchMat); D.barrier(x - sx * 5.5, z - sz * 3.0, 3, 2.8, 3);
      D.railing(x, z, 8, 8, 4);
      addBox(x, 4, z, 8, 0.15, 0.15, trim, { collide: false });
      this.perches.push(new THREE.Vector3(x, 4.05, z));
    }
    // vents
    this.vents = [[-30, 0], [30, 0], [0, -25], [0, 25], [-20, -32], [20, 32], [-6, 10], [8, -12]].map(([x, z]) => {
      addBox(x, 0, z, 1.6, 0.06, 1.6, std(0x2a2e38, { metalness: 0.8 }), { collide: false });
      for (let i = -1; i <= 1; i++) addBox(x + i * 0.45, 0.06, z, 0.12, 0.02, 1.4, std(0x0e1015), { collide: false });
      return new THREE.Vector3(x, 0, z);
    });
    // task waypoints
    this.waypoints = [[-30, -30], [30, -30], [-30, 30], [30, 30], [-22, -6], [22, -6], [-22, 6], [22, 6], [-6, -30], [6, 30], [0, -8], [0, 8], [-8, 0], [8, 0], [-34, 8], [34, -8]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.waypoints.forEach((w, i) => { if (i % 2 === 0) { const t = textSprite(TASKS[(i / 2) % TASKS.length], 0.35, { color: '#ffe066', font: 'Arial' }); t.position.set(w.x, 2.8, w.z); add(t); } });
    for (const [x, z] of [[-25, -25], [25, -25], [-25, 25], [25, 25], [0, 0]]) pointLight(x, 6, z, 0xaad4ff, 30, 30);
    // ship dressing: consoles, pipes, hazard trim, cold dust
    D.console_(-38.5, 8, Math.PI / 2, { lines: ['SUS LEVEL: HIGH', 'O2: 69%', 'CREW: ???'] });
    D.console_(38.5, -8, -Math.PI / 2, { lines: ['VENTS: 7 ACTIVE', 'WHO VENTED?', 'not me', 'kinda sus'], color: '#ff7d7d' });
    D.console_(-8, -38.5, 0, { lines: ['TASK 3/9', 'SWIPE FAILED', 'TOO FAST'], color: '#7dd8ff' });
    D.console_(8, 38.5, Math.PI, { lines: ['EMERGENCY', 'MEETINGS: 0', 'remaining: 1'], color: '#ffd27d' });
    for (const z of [-40, 40]) { D.pipeRun(-38, 8.4, z * 0.985, 38, z * 0.985, { r: 0.22 }); D.pipeRun(-38, 7.7, z * 0.985, 38, z * 0.985, { r: 0.12, color: 0x8a5a30 }); }
    for (const x of [-40, 40]) D.pipeRun(x * 0.985, 8.4, -38, x * 0.985, 8.4, 38, { r: 0.22 });
    for (const z of [-40.8, 40.8]) D.trimStrip(0, z, 80, 0.2, 0x00ccff);
    for (const x of [-40.8, 40.8]) D.trimStrip(x, 0, 0.2, 80, 0x00ccff);
    for (const [x, z] of [[-33, -20], [33, 20], [-20, 33], [20, -33], [6, -20], [-6, 20]]) D.crate(x, z, { s: 1.4, color: 0x4a5468, stripe: 0xffd200 });
    D.dust({ min: [-40, 0.3, -40], max: [40, 8, 40], color: 0xbfe6ff, count: 500, opacity: 0.45 });
    this.addSpawns = [[-36, -36], [36, 36], [-36, 36], [36, -36], [0, -37], [0, 37]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  }
  start() {
    this.round = 0; this.phase = 'intro'; this.crew = [];
    HUD.objective(EmergencyMeeting.title, 'Find the impostor.');
    this.ghost("Guardian... one of these crewmates is not what they seem. Don't shoot the wrong one.", 0.5);
    this.ghost('Watch for anyone using the vents. Crewmates do not use vents.', 6.5);
    after(5, () => this.startRound());
  }
  startRound() {
    const r = ROUNDS[this.round];
    for (const c of this.crew) c.remove();
    const names = shuffle(Object.keys(M.CREW_COLORS)).slice(0, r.crew);
    this.crew = names.map((n) => {
      const c = new Crewmate(n, this);
      const wp = pick(this.waypoints);
      c.spawnAt(wp.x + rand(-2, 2), 0.05, wp.z + rand(-2, 2));
      G.enemies.push(c);
      return c;
    });
    shuffle(this.crew.slice()).slice(0, r.imps).forEach((c) => { c.impostor = true; c.ventT = rand(4, 7); });
    this.killT = r.killEvery; this.phase = 'play'; this.addT = 6; this.sniperT = 3;
    HUD.bigText(`ROUND ${this.round + 1}`, `${r.imps} impostor${r.imps > 1 ? 's' : ''} among us`, 2.5, 'meme');
    play('sus');
  }
  innocents() { return this.crew.filter((c) => c.alive && !c.impostor && c.state !== 'ejected'); }
  impostors() { return this.crew.filter((c) => c.alive && c.impostor); }
  update(dt) {
    this.t += dt;
    if (this.phase === 'play' || this.phase === 'meeting') {
      const imps = this.impostors(), inn = this.innocents();
      HUD.objective(null, `Round ${this.round + 1}/3 — find the impostor.\nCrewmates alive: ${inn.length + imps.filter((i) => !i.revealed).length}   Impostors left: ${imps.length}\nNext "accident" in: ${Math.max(0, Math.ceil(this.killT))}s`);
      if (this.phase === 'play') {
        this.killT -= dt;
        if (this.killT <= 0) {
          this.killT = ROUNDS[this.round].killEvery;
          const hunter = pick(imps.filter((i) => !i.revealed && (i.state === 'walk' || i.state === 'task')));
          if (hunter && inn.length) {
            hunter.victim = inn.reduce((a, b) => (distXZ(a.pos, hunter.pos) < distXZ(b.pos, hunter.pos) ? a : b));
            hunter.state = 'hunt';
          }
        }
      }
      // adds
      this.sniperT -= dt;
      if (this.sniperT <= 0) { this.sniperT = 18; if (this.count(SusSniper) < 1 + Math.min(1, this.round)) { const q = pick(this.perches); spawnEnemy(SusSniper, q.x, q.z, q.y, this.perches); } }
      this.addT -= dt;
      if (this.addT <= 0) {
        this.addT = rand(9, 14) - this.round * 2;
        if (this.hostiles() < 5 + this.round) {
          if (this.round >= 1 && Math.random() < 0.5) this.spawnAway(Nyan, this.addSpawns, 15, 6);
          else { this.spawnAway(Doge, this.addSpawns, 15); this.spawnAway(Doge, this.addSpawns, 15); }
        }
      }
      if (inn.length <= imps.filter((i) => !i.revealed).length && imps.length > 0) this.lose();
    }
  }
  ev_reveal({ nid, full, line }) {
    const c = G.enemies.find((e) => e.nid === nid);
    if (!c) return;
    if (!c.revealed) c.reveal();
    const P = c.pos.clone();
    // turn to face whoever is watching
    const cam = G.camera.position.clone();
    const d = new THREE.Vector3(cam.x - P.x, 0, cam.z - P.z); if (d.lengthSq() < 0.01) d.set(0, 0, 1); d.normalize();
    c.yaw = c.netYaw = Math.atan2(d.x, d.z);
    const at = (dist, h, rot = 0) => { const v = d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot); return P.clone().addScaledVector(v, dist).add(new THREE.Vector3(0, h, 0)); };
    const head = P.clone().add(new THREE.Vector3(0, 1.0, 0));
    const T = full ? 0 : 1.0; // the quick cut skips the whip-pan
    // reveals happen anywhere on the ship: orbit to whichever side has a clear view
    const clear = (p) => los(head, p) ? 1 : 0;
    const side = clear(at(3.4, 1.5, 0.9)) + clear(at(3.8, 1.9, 1.6)) >= clear(at(3.4, 1.5, -0.9)) + clear(at(3.8, 1.9, -1.6)) ? 1 : -1;
    const shots = [
      { t: [0 - T, 1.0 - T], path: [cam.clone(), at(5, 1.7), at(3.6, 1.4)], look: [head.clone().add(new THREE.Vector3(0, 0.6, 0)), head], fov: [74, 52] },
      { t: [1.0 - T, 2.6 - T], path: [at(2.6, 0.55, 0.15), at(2.0, 0.65, 0.05)], look: [head], fov: [44, 36] },
      { t: [2.6 - T, 4.4 - T], path: [at(3.4, 1.5, 0.9 * side), at(3.8, 1.9, 1.6 * side)], look: [head.clone().add(new THREE.Vector3(0, -0.15, 0))], fov: [50, 56] },
    ].filter((s) => s.t[1] > 0).map((s) => ({ ...s, t: [Math.max(0, s.t[0]), s.t[1]] }));
    const mouth = () => c.mouth;
    const vm = c.rig.visorMat;
    let popped = false;
    playCinematic({
      duration: full ? 4.4 : 2.6, sting: 'impostor', grade: 2, shots,
      card: { at: 2.7 - T, name: `${c.colorName.toUpperCase()}, THE IMPOSTOR`, sub: `${SUS_LINES[line % SUS_LINES.length]} · AMONG US` },
      choreo: (t, dt, snap) => {
        if (snap) t = 99;
        if (c.bar) c.bar.visible = false;
        const m = mouth();
        // shudder, then the mouth bursts out and the visor goes red
        const burst = 1.2 - T;
        const k = t < burst ? 0 : Math.min(1, (t - burst) / 0.25);
        if (m) m.scale.setScalar(Math.max(0.001, k * (1 + Math.sin(Math.min(1, k) * Math.PI) * 0.35)));
        c.model.position.x = t < burst ? (Math.random() - 0.5) * 0.06 : 0;
        c.model.rotation.z = t < burst ? (Math.random() - 0.5) * 0.08 : Math.sin(t * 9) * 0.05;
        const red = t < burst ? 0.1 : 1;
        vm.color.setRGB(0.62 + 0.38 * red, 0.85 * (1 - red), 0.94 * (1 - red));
        vm.emissive.setRGB(red, 0, 0); vm.emissiveIntensity = red * (1.2 + Math.sin(t * 25) * 0.4);
        if (!popped && t >= burst && !snap) {
          popped = true;
          play('stab'); G.shake += 0.6;
          fx.burst(P.clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(d, 0.6), 0xaa0010, 26, 5, 0.12, 0.8, 8);
        }
        if (m && m.children.length) { const tongue = m.children[m.children.length - 1]; tongue.scale.y = 1 + Math.max(0, Math.sin(t * 14)) * 0.6 * k; }
      },
      onEnd: () => { c.model.position.x = 0; c.model.rotation.z = 0; if (c.mouth) c.mouth.scale.setScalar(1); },
    });
  }
  onCrewShot(c, info = {}) {
    if (this.phase !== 'play' && this.phase !== 'meeting') return;
    if (c.impostor) {
      c.reveal();
      c.onDeath = () => this.onImpostorDead(c);
      // the reveal gets a cinematic: the full version once, a quick cut after that
      const full = !G.introsSeen.has('impostor');
      G.introsSeen.add('impostor');
      this.ev('reveal', { nid: c.nid, full: full ? 1 : 0, line: Math.floor(Math.random() * SUS_LINES.length) });
      // these land when the cinematic ends (game time is frozen while it plays)
      after(0.05, () => {
        play('airhorn');
        HUD.bigText(`${c.colorName.toUpperCase()} IS SUS`, 'IT WAS THE IMPOSTOR. KILL IT.', 2.2, 'warn');
        this.ghost(`It was ${c.colorName}! Kill it! KILL IT!`);
      });
    } else {
      c.state = 'ejected'; c.untargetable = true; c.tag.visible = false;
      play('wrong'); play('alarm');
      HUD.bigText(`${c.colorName} was not The Impostor.`, 'bruh.', 3, 'eject');
      say('bruh', 'bruh');
      G.stats.bruh++;
      const shooter = playerById(info.from) || G.player;
      hurtPlayer(shooter, 30, 'an emergency meeting called on YOU');
      if (shooter !== G.player) HUD.killfeed(`${shooter.name} shot ${c.colorName}. bruh.`);
      for (let i = 0; i < 2; i++) this.spawnAway(Doge, this.addSpawns, 12);
    }
  }
  doKill(imp, victim) {
    playAt(victim.pos, 'stab');
    this.ev('body', { c: victim.colorName, x: Math.round(victim.pos.x * 10) / 10, z: Math.round(victim.pos.z * 10) / 10, r: Math.round(rand(0, 6) * 10) / 10 });
    fx.burst(victim.pos.clone().setY(0.8), 0xaa0000, 16, 4, 0.12, 0.7);
    victim.remove();
    after(0.6, () => this.meeting(victim));
  }
  ev_body({ c, x, z, r }) {
    const body = M.makeDeadBody(M.CREW_COLORS[c]);
    body.position.set(x, 0, z); body.rotation.y = r;
    add(body);
  }
  meeting(victim) {
    if (this.phase !== 'play') return;
    this.phase = 'meeting';
    play('alarm');
    HUD.bigText('DEAD BODY REPORTED', `${victim.colorName} got got. Everyone to the cafeteria.`, 3, 'warn');
    const sus = pick(this.crew.filter((c) => c.alive && c !== victim));
    this.ghost(pick([`Where? Who? It was ${sus?.colorName}. Probably. I have no idea.`, `I was doing my tasks, I swear. Maybe ${sus?.colorName}? Kinda sus.`, `${sus?.colorName} was acting weird. Or was that you?`]));
    const living = shuffle(this.crew.filter((c) => c.alive && !c.revealed && c.state !== 'ejected'));
    living.forEach((c, i) => {
      const a = (i / living.length) * Math.PI * 2;
      c.pos.set(Math.cos(a) * 5, 0.05, Math.sin(a) * 5); c.vel.set(0, 0, 0);
      c.state = 'meeting'; c.model.position.y = 0; c.tag.visible = true; c.untargetable = false;
      fx.burst(c.pos.clone().setY(1), 0xffffff, 6, 3, 0.1, 0.4);
    });
    after(3.5, () => {
      if (this.phase !== 'meeting') return;
      this.phase = 'play';
      for (const c of this.crew) if (c.alive && c.state === 'meeting') { c.state = 'walk'; c.target = pick(this.waypoints); if (c.impostor) c.ventT = rand(3, 6); }
    });
  }
  onImpostorDead(c) {
    HUD.bigText(`${c.colorName} was The Impostor.`, `${this.impostors().length} Impostor${this.impostors().length === 1 ? '' : 's'} remain${this.impostors().length === 1 ? 's' : ''}.`, 3.5, 'eject');
    play('airhorn');
    if (this.impostors().length > 0) return;
    this.phase = 'between';
    this.round++;
    for (const cm of this.crew) if (cm.alive && !cm.impostor) { cm.state = 'task'; cm.wait = 99; cm.vel.y = 7; fx.floatText(cm.top().clone(), pick(['ty', 'gg', 'pog', 'ez']), { height: 0.5 }); }
    if (this.round >= ROUNDS.length) {
      this.ghost('Victory. The crewmates thank you. Well, the ones that are left.');
      after(3, () => { for (const cm of this.crew) cm.remove(); this.complete(); });
    } else {
      this.ghost(pick(['Nice. But there is more than one ship. Of course there is.', 'Another round? Another round.']));
      after(5, () => { if (G.encounter === this) this.startRound(); });
    }
  }
  lose() {
    this.phase = 'lost';
    play('stab');
    HUD.bigText('IMPOSTOR WINS', 'Defeat.', 3, 'warn');
    after(2.5, () => G.wipe?.('The impostors outnumbered the crew. Very sus of you.'));
  }
}

registerNetType(Crewmate, (a) => new Crewmate(a[0], G.encounter));
