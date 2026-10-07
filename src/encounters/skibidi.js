// Encounter 5: SKIBIDI OF A THOUSAND TOILETS — touch grass, farm aura, pass the vibe check, survive Ohio.
import * as THREE from 'three';
import { G, rand, pick, after, dampAngle, distXZ, local } from '../game.js';
import * as D from '../dressing.js';
import { Encounter, weightedPick } from './base.js';
import { setEnv, addBox, addCyl, add, std, pointLight, addStars } from '../world.js';
import { tileTex, textSprite, IMPACT } from '../textures.js';
import { Enemy, Doge, Sigma, Stonks, Nyan, registerNetType } from '../enemies.js';
import { Projectile, Shockwave, Pickup, los } from '../combat.js';
import * as M from '../models.js';
import { rimify } from '../rigs.js';
import { playCinematic } from '../cinematic.js';
import { HUD } from '../hud.js';
import { play, playAt, say } from '../audio.js';
import * as fx from '../fx.js';

const _t = new THREE.Vector3(), _f = new THREE.Vector3();
const BOSS_LINES = ['skibidi', 'you are not him', 'only in ohio', 'your aura is negative', 'ratio', 'mewing is mandatory', 'it is giving... defeat'];

class SkibidiBoss extends Enemy {
  constructor(enc) {
    super({ name: 'SKIBIDI, OF A THOUSAND TOILETS', hp: 11000, radius: 3.4, height: 9, rank: 'boss', gib: 0xffffff });
    this.enc = enc; this.knockable = false; this.immune = true;
    this.model = M.makeToiletBoss(); this.model.scale.setScalar(1.15); this.mesh.add(this.model);
    rimify(this.model, 0xff9ce8, 0.3);
    this.hb(0, 3.2, 0, 3.6).hb(0, 7.2, 0.3, 2.1, true);
    const sm = new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 20), sm); this.shield.position.y = 5; this.mesh.add(this.shield);
    this.shieldLbl = textSprite('RIZZ SHIELD', 0.8, { font: IMPACT, weight: 'normal', color: '#ff4fd8' }); this.shieldLbl.position.y = 13.2; this.mesh.add(this.shieldLbl);
    this.spitCd = 4; this.talkT = 6;
  }
  animate(dt) {
    this.shield.visible = this.shieldLbl.visible = this.immune;
    const bob = Math.abs(Math.sin(this.t * 3.2)) * 1.4;
    const u = this.model.userData;
    u.head.group.position.y = 6.3 + bob;
    u.neck.position.y = 4.5 + bob * 0.6;
    // sings on the bob and stares at whoever is looking: every player sees it staring at *them*
    u.head.update(dt, { open: Math.abs(Math.sin(this.t * 3.2)) * (this.cineSing ?? 1), stare: this.enc.vibe?.type === 'look' || this.cineStare, target: G.camera.position });
    this.hitboxes[1].off.y = 7.2 + bob * 1.15;
  }
  think(dt) {
    const p = this.tgt();
    this.yaw = dampAngle(this.yaw, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 2.2, dt);
    this.talkT -= dt;
    if (this.talkT <= 0) { this.talkT = rand(8, 14); const l = pick(BOSS_LINES); fx.floatText(this.top().clone().setY(this.pos.y + 13), l, { height: 1.0 }); say(l, 'boss', false); }
    this.spitCd -= dt;
    if (this.spitCd <= 0 && p.alive && this.enc.phase !== 'final') {
      this.spitCd = rand(3, 4.5) - (this.enc.p2 ? 0.8 : 0);
      const from = this.hbWorld(this.hitboxes[1], new THREE.Vector3());
      for (let i = 0; i < 5; i++) {
        this.fire(from, { speed: 16, dmg: 14, color: 0x3fa9ff, size: 0.35, splash: 2.4, gravity: 9, spread: 0.18, trail: 0x8fd0ff, source: 'Skibidi toilet water (do not ask)' });
      }
      playAt(from, 'flush');
    }
  }
}

class MiniToilet extends Enemy {
  constructor(enc, i) {
    super({ name: 'Toilet Disciple', hp: 420, radius: 1.2, height: 3, rank: 'major', flying: true, gib: 0xffffff, deathLines: ['was flushed', 'went down the drain'] });
    this.enc = enc; this.knockable = false; this.ang = i * Math.PI / 2; this.netArgs = [i];
    this.model = M.makeMiniToilet(); this.mesh.add(this.model);
    this.animate = (dt) => this.model.userData.head.update(dt, { open: Math.abs(Math.sin(this.t * 4 + i)), target: G.camera.position });
    rimify(this.model, 0xff9ce8, 0.3);
    this.hb(0, 1.2, 0, 1.3).hb(0, 2.0, 0, 0.7, true);
    this.cd = rand(2, 3);
  }
  think(dt) {
    this.ang += dt * 0.35;
    this.pos.set(Math.cos(this.ang) * 15, 6 + Math.sin(this.t * 2 + this.ang) * 1.2, Math.sin(this.ang) * 15);
    this.facePlayer(dt);
    this.cd -= dt;
    if (this.cd <= 0 && this.canSee) {
      this.cd = rand(2.2, 3.5);
      this.fire(this.center(new THREE.Vector3()), { speed: 22, dmg: 9, color: 0x3fa9ff, size: 0.2, source: 'a Toilet Disciple' });
      playAt(this.pos, 'enemyShot');
    }
  }
}
registerNetType(SkibidiBoss, () => new SkibidiBoss(G.encounter));
registerNetType(MiniToilet, (a) => new MiniToilet(G.encounter, a[0]));

export class SkibidiFinale extends Encounter {
  static title = 'SKIBIDI OF A THOUSAND TOILETS';
  cursed = 5;
  build() {
    this.spawn.set(0, 0.1, 24); this.spawnYaw = 0;
    setEnv({ sky: 0x2a0838, fog: 0x6a2060, near: 60, far: 280, hemi: [0xff9cf0, 0x20102a, 0.85], sun: { color: 0xffe0f0, int: 1.7, pos: [30, 35, -60] }, shadowSize: 50,
      dome: { top: 0x1a0430, horizon: 0xff5a9a, bottom: 0x10021a, sun: 0xfff0a0, sunSize: 6, haze: 2.2 } });
    addStars(2000, 320, 0xffaaff, 1.6);
    const ft = tileTex({ base: '#5a4a68', line: '#3a2e46', accent: '#ff4fd8', n: 4, seed: 21 }); ft.repeat.set(8, 8);
    this.floorMat = std(0xffffff, { map: ft, emissive: 0xff2200, emissiveIntensity: 0 });
    const edge = std(0x111111, { emissive: 0xff4fd8, emissiveIntensity: 1.2 });
    addBox(0, -3, 0, 60, 3, 60, this.floorMat);
    for (const [x, z, w, d] of [[0, 30, 60, 0.4], [0, -30, 60, 0.4], [30, 0, 0.4, 60], [-30, 0, 0.4, 60]]) addBox(x, -0.2, z, w, 0.3, d, edge, { collide: false, shadow: false });
    // side floating islands (sigmas like to hang out here)
    const isle = std(0x6a5a78, { map: ft });
    this.islands = [[0, -40], [40, 0], [-40, 0], [0, 40]].map(([x, z]) => { addBox(x, -1, z, 10, 1.5, 10, isle); return new THREE.Vector3(x, 0.5, z); });
    // raised platforms — they matter later
    const plat = std(0x8a7a98, { emissive: 0x4fd8ff, emissiveIntensity: 0.15 });
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) addBox(x, 0, z, 6, 1.2, 6, plat);
    // boss pedestal
    addBox(0, 0, 0, 9, 1, 9, std(0xdedede, { roughness: 0.3 }));
    const blocker = addBox(0, 1, -1, 7, 4, 9, std(0xffffff), { collide: true, shadow: false });
    blocker.visible = false; blocker.userData.box.noRay = true; // movement only, bullets pass
    // OHIO
    const sign = textSprite('WELCOME TO OHIO', 14, { font: IMPACT, weight: 'normal', color: '#ffffff', fog: false }); sign.position.set(0, 40, -150); sign.material.fog = false; add(sign);
    // a thousand toilets (well, twenty-four) orbiting in the distance
    this.orbiters = [];
    for (let i = 0; i < 24; i++) {
      const t = M.makeMiniToilet({ sprite: true }); const s = rand(1.5, 4); t.scale.setScalar(s);
      t.userData.orbit = { r: rand(90, 160), a: rand(0, Math.PI * 2), y: rand(-30, 50), sp: rand(0.03, 0.08) * (Math.random() < 0.5 ? 1 : -1) };
      add(t); this.orbiters.push(t);
    }
    pointLight(0, 14, 0, 0xff4fd8, 80, 50);
    D.floatingRocks({ count: 36, rMin: 45, rMax: 110 });
    D.dust({ min: [-30, 0.3, -30], max: [30, 14, 30], color: 0xffb8f0, count: 600 });
    D.lightShaft(0, 30, 0, { height: 30, top: 2.5, bottom: 8, color: 0xffc8f0, opacity: 0.14 });
    for (const [x, z] of [[-29, -29], [29, -29], [-29, 29], [29, 29]]) D.lamp(x, z, { color: 0xff4fd8, height: 5 });
    this.spawners = [...this.islands, ...[[-26, -26], [26, -26], [-26, 26], [26, 26]].map(([x, z]) => new THREE.Vector3(x, 0, z))];
    // grass exists on every machine; the host decides where it is
    this.grass = [M.makeGrassPatch(3.2), M.makeGrassPatch(3.2)];
    this.grass.forEach((g, i) => { add(g); g.position.set(i ? 12 : -12, 0, 12); });
    this.phase = 'fight'; this.vibe = null; this.p2 = false; this.aura = 0; this.grassT = 25;
    this.brainrot = 0; this.brainT = 0;
  }
  start() {
    this.boss = new SkibidiBoss(this);
    this.boss.pos.set(0, 1, 0);
    G.enemies.push(this.boss);
    this.vibeT = 16; this.sigmaT = 4; this.addT = 8;
    for (const g of this.grass) this.placeGrass(g);
    HUD.objective(SkibidiFinale.title, '');
    if (!G.introsSeen.has('skibidi')) { G.introsSeen.add('skibidi'); this.ev('intro'); }
    after(0.6, () => this.ghost('Guardian. We are in Ohio. I did not think it was real.'));
    after(6, () => this.ghost('The air here causes brainrot. Touch grass to cleanse it. Kill the Sigmas and farm their aura to break that shield.'));
  }
  // while an intro plays, keep the scenery moving (and spin the thousand toilets up)
  cineTick(dt) { this.animateOrbiters(dt * (this.orbitBoost || 1)); }
  ev_intro() {
    const b = this.boss || G.enemies.find((e) => e instanceof SkibidiBoss);
    if (!b) return;
    const u = b.model.userData;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const fired = new Set();
    const once = (k, f) => { if (!fired.has(k)) { fired.add(k); f(); } };
    playCinematic({
      duration: 9.2,
      shots: [
        { t: [0, 2.7], path: [V(46, 20, 30), V(30, 16, 44), V(6, 12, 50)], look: [V(0, 5, 0)], fov: [62, 58] },
        { t: [2.7, 4.9], path: [V(6, 1.8, 11), V(3.5, 2.2, 8.5)], look: [V(0, 5.5, 0), V(0, 8.5, 0)], fov: [52, 46] },
        { t: [4.9, 7.3], path: [V(1.0, 9.0, 11.5), V(0.3, 8.8, 9.0)], look: [V(0, 8.2, 0.6)], fov: [40, 34] },
        { t: [7.3, 9.2], path: [V(0, 7, 14), V(9, 11, 26), V(13, 14, 32)], look: [V(0, 7, 0), V(0, 6, 0)], fov: [52, 64] },
      ],
      card: { at: 5.1, name: 'SKIBIDI, OF A THOUSAND TOILETS', sub: 'SOVEREIGN OF OHIO · DEVOURER OF ATTENTION SPANS' },
      lines: [[4.4, 'skibidi', 'boss'], [6.4, 'look at me', 'boss']],
      choreo: (t, dt, snap) => {
        if (snap) t = 99;
        // the thousand toilets spin up, then settle
        this.orbitBoost = t < 2.7 ? 1 + t * 3 : t < 7 ? 9 : Math.max(1, 9 - (t - 7) * 5);
        // the head rises out of the bowl
        const r = t < 2.9 ? 0 : Math.min(1, (t - 2.9) / 1.8), e = r * r * (3 - 2 * r);
        u.head.group.position.y = 3.2 + (6.3 - 3.2) * e;
        u.head.group.scale.setScalar(0.25 + 0.75 * e);
        u.neck.position.y = 2.4 + (4.5 - 2.4) * e;
        if (t > 2.9) once('flush', () => { if (!snap) { playAt(b.pos, 'flush'); fx.burst(b.pos.clone().setY(5.8), 0x3fa9ff, 30, 6, 0.15, 1, 6); } });
        // singing on the close-up, then the stare
        b.cineSing = t < 4.9 ? 0.4 : 1.6;
        b.cineStare = t > 6.2 && t < 7.4;
        // the rizz shield forms
        const sk = t < 7.6 ? 0 : Math.min(1, (t - 7.6) / 0.8);
        b.shield.visible = b.shieldLbl.visible = sk > 0;
        b.shield.scale.setScalar(Math.max(0.001, sk));
        if (t > 7.6) once('shield', () => { if (!snap) { play('superCast'); fx.ringFx(b.pos.clone().setY(1.2), 14, 0xff4fd8, 0.8); G.shake += 0.6; } });
        if (snap) reset();
      },
      onEnd: () => { reset(); this.orbitBoost = 1; },
    });
    function reset() { b.cineSing = null; b.cineStare = false; u.head.group.scale.setScalar(1); b.shield.scale.setScalar(1); }
  }
  placeGrass(g) {
    let x, z, tries = 0;
    do { x = rand(-25, 25); z = rand(-25, 25); tries++; }
    while ((Math.hypot(x, z) < 9 || Math.abs(Math.abs(x) - 16) < 4.5 && Math.abs(Math.abs(z) - 16) < 4.5 || this.grass.some((o) => o !== g && Math.hypot(o.position.x - x, o.position.z - z) < 14)) && tries < 50);
    g.position.set(x, 0, z);
    fx.burst(g.position.clone().setY(0.5), 0x5fd35f, 16, 4, 0.12, 0.6);
  }
  animateOrbiters(dt) {
    for (const o of this.orbiters) { const u = o.userData.orbit; u.a += u.sp * dt; o.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r); o.rotation.y += dt * 0.3; }
  }

  // ---------- co-op sync ----------
  netState() {
    const v = this.vibe;
    return { ph: this.phase, p2: this.p2 ? 1 : 0, gT: Math.round(this.grassT * 10) / 10, gr: this.grass.map((g) => [Math.round(g.position.x * 10) / 10, Math.round(g.position.z * 10) / 10]),
      vb: v ? [v.type, v.stage, Math.round(v.t * 100) / 100, v.seq] : 0 };
  }
  applyNet(s) {
    if (!s) return;
    this.phase = s.ph; this.grassT = s.gT;
    if (s.p2 && !this.p2) { this.p2 = true; document.getElementById('game').style.animation = 'shake .2s 6'; }
    s.gr.forEach(([x, z], i) => { const g = this.grass[i]; if (Math.abs(g.position.x - x) + Math.abs(g.position.z - z) > 0.5) { g.position.set(x, 0, z); local(() => fx.burst(g.position.clone().setY(0.5), 0x5fd35f, 16, 4, 0.12, 0.6)); } });
    this.vibe = s.vb ? { type: s.vb[0], stage: s.vb[1], t: s.vb[2], seq: s.vb[3] } : null;
  }

  // ---------- what only *your* guardian experiences (every machine runs this) ----------
  localUpdate(dt) {
    if (!this.host) this.t += dt;
    this.animateOrbiters(dt);
    const p = G.player;
    if (!p.alive) this.brainrot = 0;
    const won = this.phase === 'won';
    // brainrot
    const inGrass = p.alive && p.pos.y < 0.6 && this.grass.some((g) => distXZ(g.position, p.pos) < 3.2);
    this.brainT += dt;
    if (p.alive && !won) {
      if (inGrass) { if (this.brainT > 0.4) { this.brainT = 0; if (this.brainrot > 0) { this.brainrot--; fx.floatText(p.pos.clone().setY(p.pos.y + 2.2), '*touches grass*', { color: '#9dff9d', height: 0.35, life: 0.8 }); } } }
      else if (this.brainT > 3.3) {
        this.brainT = 0; this.brainrot++;
        play('tick');
        if (this.brainrot >= 10) { this.brainrot = 0; p.die('becoming terminally online (10x Brainrot)'); }
        else if (this.brainrot >= 7) HUD.bigText(`BRAINROT x${this.brainrot}`, 'TOUCH GRASS. NOW.', 1.2, 'warn');
      }
    }
    if (won) HUD.clearDebuff('brain');
    else HUD.setDebuff('brain', `🧠 BRAINROT x${this.brainrot}${inGrass ? '  🌱' : ''}`, this.brainrot >= 7);
    if (!this.host) this.grassT -= dt;
    for (const g of this.grass) g.userData.base.material.emissiveIntensity = this.grassT < 3 ? (Math.sin(this.t * 20) > 0 ? 1.5 : 0.2) : 0.5;
    // lava
    if (this.phase === 'final') {
      this.floorMat.emissiveIntensity = 0.6 + Math.sin(this.t * 4) * 0.2;
      if (p.alive && p.onGround && p.pos.y < 0.3 && Math.hypot(p.pos.x, p.pos.z) > 4.6) p.hurt(45 * dt, 'the floor (it was lava)');
    } else this.floorMat.emissiveIntensity = 0;
    // vibe checks: the host runs the clock, every guardian is judged on their own screen
    const v = this.vibe, lv = this.lastVibe;
    if (lv && lv.type === 'look' && lv.stage === 'warn' && (!v || v.seq !== lv.seq || v.stage !== 'warn')) this.judgeLook();
    if (v && v.type === 'move' && v.stage === 'active' && p.alive) {
      this.moveTick = (this.moveTick || 0) - dt;
      const moving = Math.hypot(p.vel.x, p.vel.z) > 1.6 || Math.abs(p.vel.y) > 3;
      if (moving && this.moveTick <= 0) { this.moveTick = 0.3; p.hurt(22, 'moving during red light (cringe)'); fx.floatText(p.pos.clone().setY(p.pos.y + 2.4), 'YOU MOVED', { color: '#ff3b3b', height: 0.4, life: 0.7 }); }
    }
    this.lastVibe = v ? { ...v } : null;
  }
  judgeLook() {
    const p = G.player, b = this.boss || G.enemies.find((e) => e instanceof SkibidiBoss);
    if (!p.alive || !b) return;
    _f.set(0, 0, -1).applyQuaternion(G.camera.quaternion);
    const toBoss = b.center(_t).sub(G.camera.position).normalize();
    if (_f.dot(toBoss) > 0.35 && los(G.camera.position, b.center(new THREE.Vector3()))) { p.hurt(90, 'making eye contact with Skibidi'); HUD.bigText('EYE CONTACT', 'ew.', 1.8, 'warn'); }
    else HUD.bigText('VIBE CHECK PASSED', 'you did not look. respect.', 1.5, 'good');
  }

  // ---------- host simulation ----------
  update(dt) {
    this.t += dt; this.host = true;
    if (this.done || this.won) return;
    const b = this.boss;
    if (!b.alive) { this.won = true; return this.win(); }
    const ratio = b.hp / b.maxHp;

    this.grassT -= dt;
    if (this.grassT <= 3 && this.grassT + dt > 3) HUD.killfeed('🌱 The grass is moving in 3s...');
    if (this.grassT <= 0) { this.grassT = 25; for (const g of this.grass) this.placeGrass(g); }

    if (this.phase === 'fight') {
      HUD.objective(null, `Kill Sigmas, collect their aura: ${this.aura}/3000\nTouch grass to cleanse brainrot.`);
      if (this.aura >= 3000) this.breakShield();
    } else if (this.phase === 'dps') {
      this.dpsT -= dt;
      HUD.objective(null, `RIZZ SHIELD DOWN: ${Math.ceil(this.dpsT)}s\nDamage Skibidi!`);
      if (this.dpsT <= 0) this.restoreShield();
    } else if (this.phase === 'final') {
      this.finalT -= dt;
      HUD.objective(null, `THE FLOOR IS LAVA. Stay on the platforms!\nKill Skibidi before the flush: ${Math.max(0, Math.ceil(this.finalT))}s`);
      if (this.finalT <= 0 && !this.flushed) {
        this.flushed = true; play('flush');
        HUD.bigText('*FLUSH*', 'everyone got flushed', 3, 'warn');
        this.ev('flush');
      }
    }
    HUD.boss(b.name, ratio, { immune: b.immune, sub: this.phase === 'final' ? 'OHIO FINAL FORM' : b.immune ? 'RIZZ SHIELD — farm aura to break it' : 'VULNERABLE' });

    if (!this.p2 && ratio <= 0.5) this.phase2();
    if (this.phase !== 'final' && ratio <= 0.15) this.finalStand();

    this.updateVibe(dt);

    // adds
    this.sigmaT -= dt;
    if (this.sigmaT <= 0 && this.phase === 'fight') {
      this.sigmaT = 11;
      const n = 3 - this.count(Sigma);
      for (let i = 0; i < n; i++) {
        const s = this.spawnAway(Sigma, this.spawners, 14);
        s.onDeath = (e) => new Pickup('aura', e.center(), { onCollect: () => this.addAura() });
      }
    }
    this.addT -= dt;
    if (this.addT <= 0 && this.phase !== 'final') {
      this.addT = rand(5, 8);
      if (this.hostiles((e) => !(e instanceof Sigma) && e !== b && !(e instanceof MiniToilet)) < 5) {
        const T = weightedPick([[Doge, 4], [Stonks, 2], [Nyan, 2]]);
        this.spawnAway(T, this.spawners, 14, T === Nyan ? 6 : null);
      }
    }
  }
  ev_flush() { G.player.revives = 0; local(() => G.player.die('the Final Flush (DPS check failed)')); }
  addAura() {
    this.aura = Math.min(3000, this.aura + 1000);
    HUD.killfeed(`✨ AURA ${this.aura}/3000`);
  }
  breakShield() {
    this.phase = 'dps'; this.dpsT = 20; this.boss.immune = false; this.aura = 0;
    play('shieldBreak'); play('airhorn');
    HUD.bigText('RIZZ SHIELD MOGGED', '+3000 aura. Skibidi is vulnerable!', 2.5, 'good');
    this.ghost('Your aura is immeasurable! The shield is down! Light it up!');
    for (let i = 0; i < 2 + G.avatars.size; i++) new Pickup('heavy', new THREE.Vector3(rand(-8, 8), 2, rand(10, 14)));
  }
  restoreShield() {
    this.phase = 'fight'; this.boss.immune = true; this.sigmaT = 2;
    HUD.bigText('SHIELD RESTORED', 'farm more aura', 2, 'warn');
  }
  phase2() {
    this.p2 = true;
    HUD.bigText('THE TOILETS MULTIPLY', 'there are always more toilets', 3, 'warn');
    this.ghost('Guardian... there are more toilets. There are always more toilets.');
    play('flush');
    for (let i = 0; i < 4; i++) { const m = new MiniToilet(this, i); m.spawnAt(0, 6, 0); G.enemies.push(m); }
    document.getElementById('game').style.animation = 'shake .2s 6';
  }
  finalStand() {
    this.phase = 'final'; this.finalT = 40; this.boss.immune = false; this.vibe = null; this.vibeT = 7;
    for (const e of G.enemies) if (e.alive && e !== this.boss && !(e instanceof MiniToilet)) { fx.burst(e.center(), 0xffffff, 8, 4, 0.12, 0.5); e.remove(); }
    HUD.bigText('OHIO FINAL FORM', 'THE FLOOR IS LAVA', 3, 'warn');
    this.ghost('The floor! The floor is lava! Get on a platform and finish this!');
    play('airhorn'); play('vineBoom', 0.5);
  }
  updateVibe(dt) {
    const b = this.boss;
    if (!this.vibe) {
      this.vibeT -= dt;
      if (this.vibeT <= 0) {
        if (this.phase === 'final') { this.vibeT = 7; this.startVibe('jump'); }
        else { this.vibeT = this.p2 ? rand(15, 19) : rand(19, 24); this.startVibe(pick(['move', 'look', 'jump'])); }
      }
      return;
    }
    const v = this.vibe;
    v.t -= dt;
    if (v.stage === 'warn') {
      const sec = Math.ceil(v.t);
      if (sec !== v.lastSec && sec > 0) { v.lastSec = sec; play('tick'); HUD.bigText(v.title, `${v.sub} — ${sec}`, 1.1, 'meme'); }
      if (v.t <= 0) {
        if (v.type === 'move') { v.stage = 'active'; v.t = 2.6; HUD.bigText('🔴 RED LIGHT', "DON'T. MOVE.", 2.6, 'warn'); }
        else if (v.type === 'look') { this.vibe = null; } // every guardian's localUpdate judges their own eyes
        else if (v.type === 'jump') {
          new Shockwave({ center: b.pos.clone().setY(0), speed: 17, maxR: 45, dmg: 45, height: 1.0, color: 0xff4fd8, source: 'the Skibidi Shockwave (you had to jump)' });
          if (this.p2) after(0.7, () => new Shockwave({ center: b.pos.clone().setY(0), speed: 17, maxR: 45, dmg: 45, height: 1.0, color: 0x4fd8ff, source: 'the second Skibidi Shockwave' }));
          playAt(b.pos, 'vineBoom', 0.7); G.shake += 0.5;
          HUD.bigText('JUMP', '', 1.2, 'warn');
          this.vibe = null;
        }
      }
    } else if (v.stage === 'active' && v.t <= 0) {
      this.vibe = null; HUD.bigText('🟢 GREEN LIGHT', 'you may move', 1.2, 'good');
    }
  }
  startVibe(type) {
    const defs = {
      move: { title: 'VIBE CHECK', sub: "DON'T MOVE" },
      look: { title: 'VIBE CHECK', sub: 'LOOK AWAY FROM SKIBIDI' },
      jump: { title: 'VIBE CHECK', sub: 'GET READY TO JUMP' },
    };
    this.vibeSeq = (this.vibeSeq || 0) + 1;
    this.vibe = { type, stage: 'warn', t: 3, lastSec: 0, seq: this.vibeSeq, ...defs[type] };
    play('sus');
    if (type === 'look') say('look at me', 'boss');
  }
  win() {
    this.phase = 'won';
    HUD.hideBoss();
    play('flush'); play('airhorn');
    HUD.bigText('SKIBIDI HAS BEEN FLUSHED', 'Ohio is saved. Somehow.', 5, 'meme');
    this.ghost('We did it. We actually did it. I am going to go touch grass. Forever.');
    for (const e of G.enemies) if (e.alive && e !== this.boss) e.die();
    for (const o of this.orbiters) fx.explosion(o.position, 10, 0xffffff);
    after(4, () => this.complete());
  }
  cleanup() { HUD.clearDebuff('brain'); document.getElementById('game').style.animation = ''; }
}
