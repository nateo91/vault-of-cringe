// The Approach: the raid's walk-in. Land, cross the causeway, jump the chasm, clear the plaza, open the Vault.
// Traversal rules: no wipes here, falling just puts you back at the last checkpoint.
import * as THREE from 'three';
import { G, rand, pick, after, players, distXZ, local } from '../game.js';
import { Encounter } from './base.js';
import { setEnv, addBox, addCyl, add, std, pointLight, addStars, removeCollider } from '../world.js';
import { tileTex, textSprite, emojiSprite, IMPACT } from '../textures.js';
import { Doge, Stonks, MoaiKnight, Nyan, spawnEnemy } from '../enemies.js';
import { HUD } from '../hud.js';
import { play, playAt, say } from '../audio.js';
import * as fx from '../fx.js';
import * as D from '../dressing.js';
import { playCinematic } from '../cinematic.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const LORE = [
  { title: 'The First Normie', text: 'Before the Vault there was only the Feed, endless and grey. Then someone posted a dog with a confused face, and the Feed blinked. Every meme since is a descendant of that blink. Most of them should not have been.' },
  { title: 'On the Nature of Cringe', text: 'Cringe is not a feeling. Cringe is a substance. It pools in the low places of the internet and, given enough upvotes, it learns to stand. The Vault was built to hold it. The Vault is full.' },
  { title: 'A Warning, Scratched Into Stone', text: 'Whoever reads this: do not look at the toilet. Do not let it sing. If you hear "skibidi" from below, you are already in Ohio. There is no leaving Ohio. There is only touching grass, and the grass is far away.' },
];

// A jumpship, roughly. Pointy, glowy, definitely not to scale.
function makeJumpship() {
  const g = new THREE.Group();
  const hull = std(0x9aa0aa, { metalness: 0.55, roughness: 0.5 }), dark = std(0x23262e, { metalness: 0.6, roughness: 0.4 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x44aaff, emissiveIntensity: 4 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 7, 6), hull); body.rotation.x = -Math.PI / 2; g.add(body);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 2.2, 6), dark); back.rotation.x = Math.PI / 2; back.position.z = 4.4; g.add(back);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), std(0x112233, { metalness: 1, roughness: 0.05 })); cockpit.scale.set(1, 0.6, 1.6); cockpit.position.set(0, 0.7, 0.6); g.add(cockpit);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 2.4), hull); wing.position.set(s * 2.8, -0.1, 2.6); wing.rotation.set(0, s * 0.35, s * -0.12); g.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.4), dark); tip.position.set(s * 5.2, 0.4, 3.4); g.add(tip);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.6, 10), dark); eng.rotation.x = Math.PI / 2; eng.position.set(s * 1.6, -0.2, 4.6); g.add(eng);
    const flame = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), glow); flame.position.set(s * 1.6, -0.2, 5.42); g.add(flame);
    const tr = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0x66ccff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    tr.scale.setScalar(2.4); tr.position.set(s * 1.6, -0.2, 5.8); g.add(tr);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class TheApproach extends Encounter {
  static title = 'THE APPROACH';
  static traversal = true;
  cursed = 1;
  traversal = true; // no wipes, no loot; reaching the door starts the raid proper
  build() {
    this.spawn.set(0, 0.1, 4); this.spawnYaw = 0;
    setEnv({ sky: 0x0a1820, fog: 0x2a4652, near: 25, far: 230, hemi: [0x9fd8e8, 0x1a1410, 0.75], sun: { color: 0xc8f0ff, int: 1.5, pos: [-35, 30, -90] }, shadowSize: 45,
      dome: { top: 0x020814, horizon: 0x3a7080, bottom: 0x01060a, sun: 0xd8f4ff, sunSize: 3.2, haze: 1.4 } });
    addStars(1800, 330, 0xd8f0ff, 1.4);
    const st = tileTex({ base: '#4a5258', line: '#30363b', accent: '#5fd8ff', n: 4, seed: 31 }); st.repeat.set(3, 10);
    const stone = std(0xffffff, { map: st });
    const rough = std(0x5a6066, { roughness: 1, flatShading: true });
    const trim = std(0x111111, { emissive: 0x5fd8ff, emissiveIntensity: 1.6 });
    // 1) landing pad
    addCyl(0, -3, 2, 9, 3, std(0x6a7278, { metalness: 0.5, roughness: 0.5 }), { seg: 32 });
    addBox(0, -3, 2, 12, 3, 12, rough).visible = false; // the pad's walkable footprint (cylinders collide as squares)
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; addBox(Math.cos(a) * 8.6, 0, 2 + Math.sin(a) * 8.6, 0.6, 0.1, 0.6, trim, { collide: false }); }
    const raid = textSprite('VAULT OF CRINGE', 1.4, { font: IMPACT, weight: 'normal', color: '#ffffff' }); raid.position.set(0, 6, 12); add(raid);
    const pwr = textSprite('RAID · RECOMMENDED POWER 69,420', 0.45, { color: '#9fe2ff', font: 'Rajdhani, sans-serif' }); pwr.position.set(0, 5, 12); add(pwr);
    D.banner(-6, 3.2, 9, Math.PI, { color: 0x1a4a5a, emblem: '🗿', text: 'RAID' });
    D.banner(6, 3.2, 9, Math.PI, { color: 0x1a4a5a, emblem: '💀', text: 'CRINGE' });
    // 2) the causeway
    addBox(0, -2, -36, 8, 2, 52, stone);
    for (let z = -12; z > -62; z -= 6) {
      for (const s of [-1, 1]) if (Math.random() < 0.8) addBox(s * 3.8, 0, z, 0.4, rand(0.3, 1.1), rand(2, 4.5), rough);
    }
    for (const z of [-16, -34, -52]) for (const s of [-1, 1]) { addCyl(s * 5.2, -6, z, 0.8, rand(10, 15), rough, { seg: 8 }); }
    for (const z of [-20, -44]) for (const s of [-1, 1]) D.brazier(s * 2.9, z, { color: 0x5fd8ff });
    addBox(7, -1, -40, 3, 1, 3, stone); // a little ledge with a secret on it
    // 3) the chasm: platforms over the void (some bob, some slide)
    this.platforms = [];
    const plat = (x, y, z, w, d, motion) => {
      const m = addBox(x, y - 0.6, z, w, 0.6, d, stone);
      const edge = addBox(x, y - 0.65, z, w + 0.1, 0.08, d + 0.1, trim, { collide: false });
      this.platforms.push({ m, edge, box: m.userData.box, base: V(x, y - 0.6, z), w, h: 0.6, d, motion, last: V(x, y - 0.6, z) });
    };
    // big platforms, ~1.5 m gaps, small steps: a stroll with some style, not a skill check
    // big platforms, ~1 m gaps, small steps. Spaced so an over-eager sprint jump lands on the *next-but-one*.
    plat(0, 0, -65.75, 5.5, 5.5, null);
    plat(1.2, 0.5, -72.45, 5.5, 5.5, { bob: 0.25, speed: 0.9 });
    plat(-0.8, 1.0, -79.15, 5.5, 5.5, { slide: 1.2, speed: 0.4 });
    plat(-8, 2.0, -82.5, 3.5, 3.5, { bob: 0.2, speed: 0.7 }); // optional side platform with lore on it
    plat(0.8, 1.4, -85.85, 5.5, 5.5, { bob: 0.3, speed: 1.0, phase: 1 });
    plat(-0.8, 1.0, -92.55, 5.5, 5.5, { slide: 1.2, speed: 0.45, phase: 2 });
    plat(0.4, 0.6, -99.25, 5.5, 5.5, { bob: 0.2, speed: 0.8, phase: 3 });
    plat(0, 0.3, -104, 5.5, 4, null);
    for (let i = 0; i < 18; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1, 3.5), 0), rough); r.position.set(rand(-30, 30), rand(-30, -8), rand(-110, -55)); r.rotation.set(rand(0, 6), rand(0, 6), 0); add(r); }
    // 4) the plaza
    addBox(0, -2, -128, 36, 2, 44, stone);
    for (const [x, z, w, h, d] of [[-9, -118, 4, 2, 2.5], [9, -118, 4, 2, 2.5], [-13, -134, 2.5, 2.4, 5], [13, -134, 2.5, 2.4, 5], [0, -126, 6, 1.4, 1.6]]) addBox(x, 0, z, w, h, d, rough);
    for (const [x, z] of [[-15, -110], [15, -110], [-15, -146], [15, -146]]) D.brazier(x, z, { color: 0xff7a20 });
    D.rubble(-6, -140, { n: 7 }); D.rubble(8, -112, { n: 5 });
    // 5) the gate of the Vault
    const gateM = std(0x3a3f46, { roughness: 0.9, flatShading: true });
    addBox(-11.5, 0, -150, 13, 18, 3, gateM); addBox(11.5, 0, -150, 13, 18, 3, gateM); addBox(0, 12, -150, 10, 6, 3, gateM);
    this.door = addBox(0, 0, -150, 10, 12, 1.6, std(0x55303a, { metalness: 0.6, roughness: 0.35, emissive: 0x330010 }));
    const doorRunes = new THREE.Mesh(new THREE.PlaneGeometry(8, 9), new THREE.MeshBasicMaterial({ map: emojiRunes(), transparent: true }));
    doorRunes.position.set(0, 6, -149.15); this.door.add(doorRunes); doorRunes.position.set(0, 0, 0.82);
    const title = textSprite('VAULT OF CRINGE', 2.2, { font: IMPACT, weight: 'normal', color: '#ff4fd8' }); title.position.set(0, 16.5, -148.3); add(title);
    pointLight(0, 9, -146, 0xff4fd8, 40, 26);
    D.banner(-8.5, 8, -148.3, 0, { color: 0x5a1030, emblem: '▶', text: 'SUBSCRIBE', h: 6 });
    D.banner(8.5, 8, -148.3, 0, { color: 0x5a1030, emblem: '🔔', text: 'THE BELL', h: 6 });
    addBox(0, -2, -162, 10, 2, 22, stone); addBox(-5.5, 0, -162, 1, 12, 22, gateM); addBox(5.5, 0, -162, 1, 12, 22, gateM);
    pointLight(0, 5, -160, 0xb06cff, 30, 20);
    // atmosphere
    D.dust({ min: [-18, 0.3, -150], max: [18, 10, 10], color: 0xcff4ff, count: 900 });
    D.groundFog({ min: [-20, -160], max: [20, 10], y: 0.4, color: 0x8fb8c8, opacity: 0.3, count: 40 });
    D.groundFog({ min: [-30, -110], max: [30, -56], y: -6, color: 0x9fc8d8, opacity: 0.45, count: 30, size: [18, 30] }); // mist down in the chasm
    D.lightShaft(0, 30, -128, { height: 30, top: 3, bottom: 9, color: 0xcff4ff, opacity: 0.12 });
    // the ship that dropped you off
    this.ship = makeJumpship(); this.ship.position.set(0, 3.5, 6); add(this.ship);
    // lore Ghosts
    this.lore = [V(7, 1.3, -40), V(-8, 2.9, -82.5), V(14, 1.3, -147)].map((p, i) => {
      const g = new THREE.Group(); g.position.copy(p); add(g);
      g.add(emojiSprite('💠', 0.7));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0x9fe2ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); glow.scale.setScalar(1.6); g.add(glow);
      return { g, i, taken: false, base: p.clone() };
    });
    this.tt = 0; this.gateT = -1; this.section = 0;
  }
  start() {
    this.host = true;
    HUD.objective(TheApproach.title, 'Find the entrance to the Vault.');
    // the mini-fights along the way
    this.plazaGroup = [];
    // leashed: they wait at their post until a guardian gets close
    const put = (T, x, z, group) => { const e = spawnEnemy(T, x, z); e.leash = 32; if (group) group.push(e); return e; };
    put(Doge, -2, -28); put(Doge, 2, -30); put(Stonks, 0, -38);
    put(Doge, -2, -50); put(Doge, 1, -52); put(Doge, 3, -49);
    put(MoaiKnight, 0, -138, this.plazaGroup); put(Stonks, -8, -130, this.plazaGroup); put(Stonks, 8, -130, this.plazaGroup);
    put(Doge, -4, -120, this.plazaGroup); put(Doge, 4, -121, this.plazaGroup);
    const nyan = spawnEnemy(Nyan, 0, -132, 6); nyan.leash = 32; this.plazaGroup.push(nyan);
    if (!G.introsSeen.has('approach')) { G.introsSeen.add('approach'); this.ev('arrive'); }
    else this.shipLeaveT = 0;
    after(0.5, () => this.ghost('We are here, Guardian. The Vault of Cringe. Every cursed thing the internet ever made ends up behind that door.'));
    after(8, () => this.ghost('Follow the path. And try not to fall. I am not picking you up off the bottom of a canyon.'));
  }
  clientStart() { this.shipLeaveT = 0; }

  // the arrival: jumpship sweeps in, hovers over the pad, title card
  ev_arrive() {
    const ship = this.ship;
    const path = new THREE.CatmullRomCurve3([V(60, 30, -80), V(30, 14, -30), V(8, 7, 0), V(0, 3.5, 6)]);
    playCinematic({
      duration: 7, sting: 'bossSting', grade: 1,
      shots: [
        { t: [0, 3.6], path: [V(-16, 10, 18), V(-12, 8, 12)], look: [V(30, 14, -30), V(4, 5, 2)], fov: [55, 50] },
        { t: [3.6, 7], path: [V(0, 2.2, 16), V(0, 2.6, 13)], look: [V(0, 3, 0), V(0, 4, -60)], fov: [52, 58] },
      ],
      card: { at: 3.9, name: 'VAULT OF CRINGE', sub: 'RAID · RECOMMENDED POWER 69,420 · NO MATCHMAKING (YOU HAVE NO FRIENDS) (JK)' },
      choreo: (t, dt, snap) => {
        if (snap) t = 99;
        const u = Math.min(1, t / 3.6), e = 1 - Math.pow(1 - u, 3);
        ship.position.copy(path.getPoint(e));
        const ahead = path.getPoint(Math.min(1, e + 0.02));
        // the nose points down -Z, and lookAt aims +Z, so look *away* from where we're going
        if (u < 1) ship.lookAt(ship.position.clone().multiplyScalar(2).sub(ahead));
        ship.rotation.z = Math.sin(t * 1.5) * 0.08;
        if (t > 3.6 && !this.landed && !snap) { this.landed = true; playAt(ship.position, 'land', 1); }
      },
      onEnd: () => { this.shipLeaveT = 0; ship.position.set(0, 3.5, 6); ship.rotation.set(0, 0, 0); fx.spawnFx(G.player.pos); },
    });
  }

  netState() { return { tt: Math.round(this.tt * 100) / 100, gate: this.gateT >= 0 ? 1 : 0 }; }
  applyNet(s) {
    if (!s) return;
    if (Math.abs(this.tt - s.tt) > 0.25) this.tt = s.tt;
    if (s.gate && this.gateT < 0) this.openGate(true);
  }

  // every machine: moving platforms (and carrying you), lore, checkpoints, waypoint, the ship leaving
  localUpdate(dt) {
    this.tt += dt;
    const p = G.player;
    for (const pl of this.platforms) {
      const m = pl.motion, ph = (m?.phase || 0);
      const x = pl.base.x + (m?.slide ? Math.sin(this.tt * m.speed + ph) * m.slide : 0);
      const y = pl.base.y + (m?.bob ? Math.sin(this.tt * m.speed + ph) * m.bob : 0);
      const dx = x - pl.last.x, dy = y - pl.last.y;
      // standing on it? ride along
      const b = pl.box;
      if (p.alive && p.onGround && Math.abs(p.pos.y - b.max.y) < 0.12 && p.pos.x > b.min.x - 0.3 && p.pos.x < b.max.x + 0.3 && p.pos.z > b.min.z - 0.3 && p.pos.z < b.max.z + 0.3) { p.pos.x += dx; p.pos.y += Math.max(0, dy); this.lastPlat = pl; }
      b.min.set(x - pl.w / 2, y, pl.base.z - pl.d / 2); b.max.set(x + pl.w / 2, y + pl.h, pl.base.z + pl.d / 2);
      pl.m.position.set(x, y + pl.h / 2, pl.base.z); pl.edge.position.set(x, y - 0.05 + 0.04, pl.base.z);
      pl.last.set(x, y, pl.base.z);
    }
    // missed a jump? your Ghost catches you and puts you back on the last platform you stood on
    if (p.alive && p.pos.y < -5 && p.pos.z < -60 && p.pos.z > -108) {
      const b = this.lastPlat?.box, back = b ? V((b.min.x + b.max.x) / 2, b.max.y + 0.05, (b.min.z + b.max.z) / 2) : V(0, 0.1, -58);
      p.pos.copy(back); p.vel.set(0, 0, 0);
      fx.spawnFx(p.pos); play('orb');
      this.catches = (this.catches || 0) + 1;
      if (this.catches === 1 || Math.random() < 0.3) HUD.ghost(pick(['Got you. Try that again.', 'Caught you. You are welcome.', 'I am a Ghost, not a safety net. ...Fine. Safety net.', 'That was a skill issue. Go again.']));
    }
    // lore Ghosts
    for (const l of this.lore) {
      if (l.taken) continue;
      l.g.position.y = l.base.y + Math.sin(this.tt * 2 + l.i) * 0.15;
      l.g.rotation.y += dt;
      if (p.alive && p.pos.distanceTo(l.g.position) < 1.8) {
        l.taken = true; l.g.visible = false;
        play('engram'); fx.burst(l.g.position, 0x9fe2ff, 20, 4, 0.1, 0.7, -2);
        showLore(l.i);
      }
    }
    // checkpoints: falling just sends you back to the last one you reached
    if (p.alive && p.onGround) {
      if (p.pos.z < -58 && this.spawn.z > -55) { this.spawn.set(0, 0.1, -55); HUD.killfeed('Checkpoint reached: The Chasm'); }
      if (p.pos.z < -106 && this.spawn.z > -110) { this.spawn.set(0, 0.1, -110); HUD.killfeed('Checkpoint reached: The Plaza'); }
    }
    // waypoint + objective by section
    const z = p.pos.z;
    G.waypoint = this.gateT >= 0 ? V(0, 3, -152) : z > -60 ? V(0, 1.5, -64) : z > -104 ? V(0, 1.5, -108) : V(0, 4, -150);
    // the ship heads home once you're on your way
    if (this.shipLeaveT != null) {
      this.shipLeaveT += dt;
      const k = Math.max(0, this.shipLeaveT - 2);
      this.ship.position.set(0, 3.5 + k * k * 1.6, 6 + k * k * 4);
      this.ship.rotation.x = -Math.min(0.5, k * 0.25);
      if (this.shipLeaveT > 2 && !this.shipGone) { this.shipGone = true; playAt(this.ship.position, 'rlLoad'); }
    }
    if (this.gateT >= 0) {
      this.gateT += dt;
      this.door.position.y = 6 + Math.min(1, this.gateT / 3.5) * 11.5;
      if (this.gateT < 3.5) G.shake = Math.max(G.shake, 0.15);
    }
  }

  // host: the fights and the door
  update(dt) {
    this.t += dt;
    if (this.done) return;
    const p = G.player;
    const sec = this.gateT >= 0 ? 3 : this.plazaGroup.every((e) => !e.alive) ? 2 : players().some((q) => q.pos.z < -104) ? 2 : players().some((q) => q.pos.z < -58) ? 1 : 0;
    const texts = ['Find the entrance to the Vault.', 'Cross the chasm.', 'Clear the plaza.', 'The Vault is open. Enter.'];
    const plazaLeft = this.plazaGroup.filter((e) => e.alive).length;
    HUD.objective(null, sec === 2 && plazaLeft ? `${texts[2]}\nGuardians remaining: ${plazaLeft}` : texts[sec]);
    if (this.gateT < 0 && plazaLeft === 0) {
      this.openGate();
      this.ghost('That is the door. Guardian... it is opening. Of course it is opening. Nothing good ever stays closed.');
    }
    if (this.gateT >= 2.5 && players().some((q) => q.alive && q.pos.z < -153)) this.complete();
    if (p.alive && p.pos.z < -100 && !this.plazaWarned) { this.plazaWarned = true; this.ghost('Hostiles in the plaza. They are guarding the door.'); }
  }
  openGate(fromNet = false) {
    if (this.gateT >= 0) return;
    this.gateT = 0;
    removeCollider(this.door.userData.box);
    if (!fromNet) { playAt(V(0, 6, -150), 'rumble', 3.5); playAt(V(0, 6, -150), 'vineBoom', 0.5); }
    else local(() => playAt(V(0, 6, -150), 'rumble', 3.5));
  }
  cleanup() { G.waypoint = null; document.getElementById('lore')?.classList.add('hidden'); }
}

// rows of emoji runes carved on the door
function emojiRunes() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 288;
  const x = c.getContext('2d');
  x.font = '30px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.globalAlpha = 0.55;
  const r = ['🗿', '💀', '😂', '🔥', '👁️', '🚽', '🐸', '📉', '🐶', '🌚'];
  for (let j = 0; j < 7; j++) for (let i = 0; i < 6; i++) x.fillText(r[(i * 3 + j * 7) % r.length], 24 + i * 42, 34 + j * 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function showLore(i) {
  const L = LORE[i];
  let found = [];
  try { found = JSON.parse(localStorage.getItem('voc-lore') || '[]'); } catch (e) { /* fine */ }
  if (!found.includes(i)) found.push(i);
  try { localStorage.setItem('voc-lore', JSON.stringify(found)); } catch (e) { /* fine */ }
  const el = document.getElementById('lore');
  el.querySelector('.lore-h').textContent = `LORE · ENTRY ${i + 1} OF ${LORE.length} · ${found.length}/${LORE.length} FOUND`;
  el.querySelector('.lore-t').textContent = L.title;
  el.querySelector('.lore-b').textContent = L.text;
  el.classList.remove('hidden');
  clearTimeout(showLore.t);
  showLore.t = setTimeout(() => el.classList.add('hidden'), 14000);
  local(() => say(L.text.split('. ')[0] + '.', 'ghost'));
}
