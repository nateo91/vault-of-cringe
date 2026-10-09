// Encounter 1: THE NORMIE GATE — capture Like / Subscribe / Bell plates and hold all three.
// Then the twist: the gate plays a mid-roll ad. Shoot the Skip Ad button (it dodges), or sit through both ads.
import * as THREE from 'three';
import { G, rand, pick, distXZ, after, players, local, nearestPlayer } from '../game.js';
import * as D from '../dressing.js';
import { Encounter, weightedPick } from './base.js';
import { setEnv, addBox, addCyl, add, std, pointLight, addStars, removeCollider } from '../world.js';
import { tileTex, textSprite, IMPACT, emojiSprite, emojiTex } from '../textures.js';
import { Enemy, Doge, Stonks, Nyan, Wizard, RickRoller, Boyfriend, Algorithm, spawnEnemy, registerNetType } from '../enemies.js';
import { HUD } from '../hud.js';
import { play, playAt } from '../audio.js';
import { unlock } from '../triumphs.js';
import { addLoreGhost } from '../lore.js';
import { failChallenge } from '../challenges.js';
import * as fx from '../fx.js';

const AD_LEN = [30, 15]; // ad 1 of 2, ad 2 of 2
const AD_SLIDES = [
  ['THIS RAID IS', 'SPONSORED BY'],
  ['RAID: SHADOW CRINGE', 'the #1 mobile game your uncle plays'],
  ['DOWNLOAD NOW', 'and get 69 FREE GEMS'],
  ['USE CODE "CRINGE"', 'for 0% off your first purchase'],
  ['NO REALLY', 'it is very fun. we promise.'],
];
// The Skip Ad button, out of the screen and loose in the arena. It dodges: every hit teleports it and shrinks it.
const SKIP_SCALE = [1, 0.75, 0.55];
let skipTex = null;
function skipTexture() {
  if (skipTex) return skipTex;
  const c = document.createElement('canvas'); c.width = 320; c.height = 112;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,10,12,0.82)'; x.fillRect(0, 0, 320, 112);
  x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 4; x.strokeRect(2, 2, 316, 108);
  x.fillStyle = '#fff'; x.font = '600 52px Rajdhani, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('Skip Ad', 34, 58);
  x.beginPath(); x.moveTo(232, 34); x.lineTo(268, 56); x.lineTo(232, 78); x.closePath(); x.fill(); x.fillRect(272, 34, 8, 44);
  skipTex = new THREE.CanvasTexture(c); skipTex.colorSpace = THREE.SRGBColorSpace;
  return skipTex;
}
class SkipAd extends Enemy {
  constructor(enc) {
    super({ name: 'Skip Ad', hp: 999, radius: 0.6, height: 0.9, rank: 'neutral', flying: true, drops: false, gib: 0xffffff, ash: 0xffffff, deathLines: ['was skipped', 'got skipped. finally.'] });
    this.enc = enc; this.knockable = false; this.stage = 0; this.home = null;
    this.model = new THREE.Group(); this.mesh.add(this.model);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.91), new THREE.MeshBasicMaterial({ map: skipTexture(), transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    panel.position.y = 0.45; this.model.add(panel);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
    glow.scale.set(4, 2, 1); glow.position.y = 0.45; this.model.add(glow);
    this.hb(0, 0.45, 0, 0.55).hb(-0.8, 0.45, 0, 0.45).hb(0.8, 0.45, 0, 0.45);
    this.baseR = this.hitboxes.map((h) => h.r); this.baseOff = this.hitboxes.map((h) => h.off.clone());
  }
  netVis() { return [this.stage]; }
  applyVis(v) { this.setStage(v[0] || 0); }
  // every hit is exactly one dodge, however big the gun (and a whole shotgun blast is still one)
  takeDamage(dmg, crit = false, info = {}) {
    if (!G.net.isClient && (this.dodgeCd || 0) > G.time) return 0;
    this.dodgeCd = G.time + 0.3;
    return super.takeDamage(1, crit, info);
  }
  setStage(s) {
    this.stage = s; const k = SKIP_SCALE[Math.min(s, 2)];
    this.model.scale.setScalar(k);
    this.hitboxes.forEach((h, i) => { h.r = this.baseR[i] * k; h.off.copy(this.baseOff[i]).multiplyScalar(k); });
  }
  onHurt() {
    if (this.stage >= 2) { this.hp = 0; return; } // third hit: skipped (Enemy.takeDamage kills it right after this)
    // nope: off it goes, smaller
    local(() => { fx.burst(this.center(), 0xffffff, 14, 5, 0.08, 0.5); fx.floatText(this.top(new THREE.Vector3()), pick(['nope', 'nice try', 'too slow', 'Skip Ad in 5']), { height: 0.4 }); });
    playAt(this.pos, 'wrong', 0.8);
    this.setStage(this.stage + 1);
    const far = () => { const q = new THREE.Vector3(rand(-40, 40), rand(1.5, 5.5), rand(-42, 32)); return players().every((p) => distXZ(q, p.pos) > 12) ? q : null; };
    let q = null; for (let i = 0; i < 20 && !q; i++) q = far();
    q ||= new THREE.Vector3(rand(-40, 40), 3, rand(-42, 32));
    this.pos.copy(q); this.home = q.clone(); fx.spawnFx(this.pos);
    this.enc?.onSkipDodge?.(this.stage);
  }
  die(info) { super.die(info); this.enc?.onSkipped?.(); }
  think(dt) {
    if (!this.home) this.home = this.pos.clone();
    // bob, and drift side to side so it isn't a free shot
    this.pos.y = this.home.y + Math.sin(this.t * 2.2) * 0.35;
    this.pos.x = this.home.x + Math.sin(this.t * (0.9 + this.stage * 0.4)) * (1 + this.stage);
    const p = nearestPlayer(this.pos);
    if (p) this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
  }
  animate() { this.model.rotation.z = Math.sin(this.t * 9) * Math.min(1, this.flinch) * 0.3; }
}
registerNetType(SkipAd, () => new SkipAd(G.encounter));

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
    // the screen the ad plays on (hidden until it does)
    this.adCanvas = document.createElement('canvas'); this.adCanvas.width = 640; this.adCanvas.height = 360;
    this.adTex = new THREE.CanvasTexture(this.adCanvas); this.adTex.colorSpace = THREE.SRGBColorSpace;
    this.adScreen = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 8), new THREE.MeshBasicMaterial({ map: this.adTex, toneMapped: false }));
    this.adScreen.position.set(0, 4.2, -49.1); this.adScreen.visible = false; add(this.adScreen);
    this.adN = 0; this.adT = 0; this.adDrawT = 0;
    addLoreGhost(3, new THREE.Vector3(-47.5, 1.3, 47.5)); // behind the crate in the far corner
    this.spawners = [[-46, 40], [46, 40], [-46, 10], [46, 10], [-46, -30], [46, -30], [-25, -46], [25, -46], [0, 46]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  }
  warmActors() { return [new SkipAd(this)]; }
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
      if (captured === 3) return this.adN ? this.openGate() : this.startAd();
      // spawns
      this.spawnT -= dt;
      const cap = this.plates.filter((q) => q.captured).length;
      const target = 6 + cap * 2;
      if (this.spawnT <= 0 && this.hostiles() < target) {
        this.spawnT = rand(1.8, 3.2);
        const n = Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const T = weightedPick([[Doge, 5], [Stonks, 4], [Nyan, cap >= 1 ? 2 : 0], [RickRoller, this.count(RickRoller) < 1 ? 1 : 0], [Boyfriend, cap >= 1 && this.count(Boyfriend) < 1 ? 0.8 : 0]]);
          const e = this.spawnAway(T, this.spawners, 22);
          // Stonks love to unsubscribe your plates
          if (e instanceof Stonks && Math.random() < 0.55) {
            const owned = this.plates.filter((q) => q.prog > 0.3);
            if (owned.length) { const q = pick(owned); e.goal = new THREE.Vector3(q.x + rand(-2, 2), 0, q.z + rand(-2, 2)); }
          }
        }
      }
    } else if (this.phase === 'ad') {
      this.adT -= dt;
      const elapsed = AD_LEN[this.adN - 1] - this.adT;
      if (this.adN === 1 && elapsed > 5 && !this.skipBtn) {
        // the Skip button pops out of the screen
        this.skipBtn = spawnEnemy(SkipAd, 4.8, -47.5, 1.2, this); this.skipBtn.home = this.skipBtn.pos.clone(); this.skipAt = this.t;
        this.ghost('There! Skip it! SKIP IT!');
      }
      if (this.adT <= 0) {
        if (this.adN === 1) { failChallenge(this, 'you sat through the ad'); this.adN = 2; this.adT = AD_LEN[1]; this.ghost('...Ad 2 of 2. Of course there are two.'); play('wrong'); }
        else return this.openGate();
      }
      const m = Math.ceil(Math.max(0, this.adT));
      HUD.objective(null, `📺 Ad ${this.adN} of 2 · 0:${String(m).padStart(2, '0')}\n` + (this.skipBtn?.alive ? 'Shoot the Skip Ad button.' : 'Survive the ad.'));
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.hostiles() < 9) {
        this.spawnT = rand(1.4, 2.6);
        this.spawnAway(weightedPick([[Doge, 5], [Stonks, 3], [RickRoller, this.count(RickRoller) < 1 ? 1.5 : 0]]), this.spawners, 22);
      }
    } else if (this.phase === 'gate') {
      if (players().some((q) => q.alive && q.pos.z < -56)) this.complete();
    }
  }
  startAd() {
    this.phase = 'ad'; this.adN = 1; this.adT = AD_LEN[0];
    this.ev('ad');
    this.ghost('Three plates! The gate is... wait. Guardian. The gate is playing an ad.');
  }
  ev_ad() { this.adScreen.visible = true; play('airhorn'); HUD.bigText('📺 A WORD FROM OUR SPONSOR', 'Your raid will resume after this message', 3, 'meme'); }
  onSkipDodge(stage) { if (stage === 1) this.ghost('It moved. Of course it moved.'); if (stage === 2) this.ghost('Smaller. It is getting smaller. Keep shooting!'); }
  ev_skipped() { unlock('adblock'); }
  onSkipped() { if (this.phase === 'ad') { this.ev('skipped'); if (this.t - (this.skipAt ?? this.t) > 10) failChallenge(this, 'took more than 10s'); this.ghost('Skipped. You are a hero. Nobody has ever skipped an ad that fast.', 1.6); this.openGate(); } }
  // draws the ad (every machine; the timer comes from the host)
  drawAd() {
    const c = this.adCanvas, x = c.getContext('2d'), W = c.width, H = c.height;
    const len = AD_LEN[Math.max(0, this.adN - 1)], el = len - this.adT;
    const slide = AD_SLIDES[Math.floor(el / 3 + (this.adN - 1) * 2) % AD_SLIDES.length];
    const hue = (this.t * 40) % 360;
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, `hsl(${hue},80%,35%)`); g.addColorStop(1, `hsl(${(hue + 60) % 360},80%,20%)`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    x.font = '900 54px Impact, sans-serif'; x.fillText(slide[0], W / 2, H * 0.42);
    x.font = '600 26px Rajdhani, Arial, sans-serif'; x.fillText(slide[1], W / 2, H * 0.58);
    // the player chrome: "Ad 1 of 2 · 0:24", a yellow progress bar, the skip box
    x.textAlign = 'left'; x.font = '600 22px Rajdhani, Arial, sans-serif'; x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(14, H - 58, 170, 32);
    x.fillStyle = '#ffd23f'; x.fillText(`Ad ${this.adN} of 2 · 0:${String(Math.ceil(Math.max(0, this.adT))).padStart(2, '0')}`, 22, H - 42);
    x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(0, H - 8, W, 8); x.fillStyle = '#ffd23f'; x.fillRect(0, H - 8, W * Math.min(1, el / len), 8);
    x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(W - 200, H - 82, 186, 52); x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 2; x.strokeRect(W - 200, H - 82, 186, 52);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '600 24px Rajdhani, Arial, sans-serif';
    const left = Math.ceil(5 - el);
    x.fillText(this.adN === 1 && left > 0 ? `Skip Ad in ${left}` : this.adN === 1 ? '(it escaped)' : 'Skip Ad ▸|  (no)', W - 107, H - 56);
    this.adTex.needsUpdate = true;
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
    if (this.phase === 'ad' && this.host !== true) this.adT -= dt; // clients tick between host updates
    if (this.phase === 'ad' && (this.adDrawT -= dt) <= 0) { this.adDrawT = 0.2; this.drawAd(); }
    if (this.phase === 'gate') {
      this.gateT += dt;
      const k = Math.min(1, this.gateT / 3);
      this.doors[0].position.x = -4 - k * 7.5; this.doors[1].position.x = 4 + k * 7.5;
    }
  }
  netState() { return { ph: this.phase, pl: this.plates.map((q) => [Math.round(q.prog * 100) / 100, q.captured ? 1 : 0]), ad: [this.adN, Math.round(this.adT * 10) / 10] }; }
  applyNet(s) {
    if (!s) return;
    s.pl.forEach(([prog, cap], i) => { this.plates[i].prog = prog; this.plates[i].captured = !!cap; });
    if (s.ad) { if (s.ad[0] && !this.adScreen.visible) this.adScreen.visible = true; this.adN = s.ad[0]; if (Math.abs(this.adT - s.ad[1]) > 0.5) this.adT = s.ad[1]; }
    if (s.ph === 'gate' && this.phase !== 'gate') this.openDoors();
    this.phase = s.ph;
  }
  clientStart() { this.phase = 'plates'; }
  openDoors() {
    if (this.doorsOpen) return;
    this.doorsOpen = true; this.gateT = 0;
    for (const d of this.doors) removeCollider(d.userData.box);
    this.lock.visible = false; this.adScreen.visible = false;
  }
  onCapture() {
    const n = this.plates.filter((q) => q.captured).length;
    if (n === 1) this.ghost('One plate down. The algorithm is... intrigued.');
    if (n === 2 && !this.wizardSpawned) {
      this.wizardSpawned = true;
      this.ghost('Two plates. Hold on. That wizard came from the moon.');
      this.spawnAway(Wizard, this.spawners, 20, 6);
      // and the feed starts recommending things
      spawnEnemy(Algorithm, 0, -40, 7);
      this.ghost('Something is watching us from above the gate. It only opens when it shoots. Hit the eye.', 4);
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
