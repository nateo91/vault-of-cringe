// The Approach: the raid's walk-in. Land, cross the causeway, jump the (very, very long) chasm, cross the Shy Bridge, clear the plaza, open the Vault.
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
import { addChest } from '../secrets.js';
import { unlock } from '../triumphs.js';
import { addLoreGhost } from '../lore.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _e1 = new THREE.Vector3();


// A jumpship, roughly. Pointy, glowy, definitely not to scale.
function makeJumpship() {
  const g = new THREE.Group();
  const hull = std(0x9aa0aa, { metalness: 0.55, roughness: 0.5, detail: false }), dark = std(0x23262e, { metalness: 0.6, roughness: 0.4, detail: false });
  const glow = new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x44aaff, emissiveIntensity: 4 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 7, 6), hull); body.rotation.x = -Math.PI / 2; g.add(body);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 2.2, 6), dark); back.rotation.x = Math.PI / 2; back.position.z = 4.4; g.add(back);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), std(0x112233, { metalness: 1, roughness: 0.05, detail: false })); cockpit.scale.set(1, 0.6, 1.6); cockpit.position.set(0, 0.7, 0.6); g.add(cockpit);
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
    const stoneMoving = std(0xffffff, { map: st, detail: false }); // world-space detail would swim on moving platforms
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
      const m = addBox(x, y - 0.6, z, w, 0.6, d, motion ? stoneMoving : stone);
      const edge = addBox(x, y - 0.65, z, w + 0.1, 0.08, d + 0.1, trim, { collide: false });
      this.platforms.push({ m, edge, box: m.userData.box, base: V(x, y - 0.6, z), w, h: 0.6, d, motion, last: V(x, y - 0.6, z) });
    };
    // the first few: big platforms, ~1 m gaps, a warm-up (it does not stay like this)
    plat(0, 0, -65.75, 5.5, 5.5, null);
    plat(1.2, 0.5, -72.45, 5.5, 5.5, { bob: 0.25, speed: 0.9 });
    plat(-0.8, 1.0, -79.15, 5.5, 5.5, { slide: 1.2, speed: 0.4 });
    plat(-8, 2.0, -82.5, 3.5, 3.5, { bob: 0.2, speed: 0.7 }); // optional side platform with lore on it
    // secret: a rock further out past the lore platform, with a chest on it (fall, and the Ghost puts you back on it)
    plat(-13.6, 1.3, -88.6, 3.2, 3.2, null);
    addChest('approach', V(-13.6, 1.3, -88.9), { yaw: Math.PI * 0.75 });
    plat(0.8, 1.4, -85.85, 5.5, 5.5, { bob: 0.3, speed: 1.0, phase: 1 });
    // THE GAUNTLET. It keeps going. The gaps keep growing (2.5 m up to 9: late ones need a double jump or a glide),
    // the platforms keep shrinking, and more of them move. Seeded, so every machine in co-op builds the same one.
    const rnd = seeded(4242);
    const R = (a, b) => a + rnd() * (b - a);
    const N = 34;
    let edge = -85.85 - 2.75, x = 0.8, y = 1.4;
    this.gauntlet = [];
    const notes = { 4: ['CHASM PROGRESS: 9%', 'you are doing great (relatively)'], 9: ['CHASM PROGRESS: 23%', 'the Ghost has started a podcast'], 15: ['HALFWAY', 'this is not the halfway point'], 19: ['CHASM PROGRESS: 61%', 'your ancestors are watching. they are bored'], 24: ['CHASM PROGRESS: 74%', 'almost there (lie)'], 29: ['CHASM PROGRESS: 88%', 'ok this time it really is almost there'], 33: ['CHASM PROGRESS: 99%', 'the last one. probably.'] };
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const gap = 2.5 + t * 6.5 + R(-0.4, 0.4);
      const d = 4.6 - t * 1.6, w = 4.6 - t * 1.3;
      const dy = gap > 7 ? R(-1.2, 0.2) : R(-0.9, 0.9);
      y = Math.max(-0.4, Math.min(3.2, y + dy));
      x = Math.max(-6, Math.min(6, x + R(-3.2, 3.2)));
      const z = edge - gap - d / 2;
      const motion = i > 3 && i % 5 === 2 ? { slide: R(1.2, 1.8 + t * 1.6), speed: 0.45 + t * 0.4, phase: R(0, 6) } : i % 3 === 1 ? { bob: R(0.15, 0.4), speed: R(0.7, 1.2), phase: R(0, 6) } : null;
      plat(x, y, z, w, d, motion);
      this.gauntlet.push(this.platforms[this.platforms.length - 1]);
      if (notes[i]) {
        const sg = textSprite(notes[i][0], 0.5, { font: IMPACT, weight: 'normal', color: '#ffcc33' }); sg.position.set(x, y + 2.6, z); add(sg);
        const sb = textSprite(notes[i][1], 0.24, { color: '#9fe2ff', font: 'Rajdhani, sans-serif' }); sb.position.set(x, y + 2.15, z); add(sb);
        this.platforms[this.platforms.length - 1].note = i;
      }
      edge = z - d / 2;
    }
    // the last ledge. After it: an 11 m gap and a sign. Everything past here sits S metres further out than it used to.
    const lastZ = edge - 3.5 - 2.5;
    plat(0, 0, lastZ, 6, 5, null);
    const S = this.off = lastZ + 92.2;
    this.buildShyBridge(trim);
    for (let i = 0; i < 60; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1, 3.5), 0), rough); r.position.set(rand(-34, 34), rand(-34, -8), rand(-110 + S, -55)); r.rotation.set(rand(0, 6), rand(0, 6), 0); add(r); }
    // 4) the plaza
    addBox(0, -2, -128 + S, 36, 2, 44, stone);
    for (const [x, z, w, h, d] of [[-9, -118, 4, 2, 2.5], [9, -118, 4, 2, 2.5], [-13, -134, 2.5, 2.4, 5], [13, -134, 2.5, 2.4, 5], [0, -126, 6, 1.4, 1.6]]) { addBox(x, 0, z + S, w, h, d, rough); D.barrier(x, z + S, w, h, d); }
    for (const [x, z] of [[-16.5, -120], [16.5, -120], [-16.5, -138], [16.5, -138]]) D.column(x, z + S, { h: 9, r: 1.0, color: 0x5d646c, accent: 0x5fd8ff });
    for (const [x, z] of [[-15, -110], [15, -110], [-15, -146], [15, -146]]) D.brazier(x, z + S, { color: 0xff7a20 });
    D.rubble(-6, -140 + S, { n: 7 }); D.rubble(8, -112 + S, { n: 5 });
    // secret: a patch of reality that didn't load. Slide into it.
    this.glitchPos = V(-17.4, 0, -122 + S);
    const gl = document.createElement('canvas'); gl.width = gl.height = 64;
    const gx = gl.getContext('2d'); gx.fillStyle = '#c9b46a'; gx.fillRect(0, 0, 64, 64); gx.strokeStyle = 'rgba(120,100,40,.4)'; gx.lineWidth = 2; for (let i = 0; i < 64; i += 8) { gx.beginPath(); gx.moveTo(i, 0); gx.lineTo(i, 64); gx.stroke(); }
    const glTex = new THREE.CanvasTexture(gl); glTex.colorSpace = THREE.SRGBColorSpace;
    this.glitchMat = new THREE.MeshStandardMaterial({ map: glTex, emissive: 0x6a5a20, emissiveIntensity: 0.6, roughness: 0.9 });
    this.glitch = addBox(this.glitchPos.x, 0, this.glitchPos.z, 0.25, 3, 2.4, this.glitchMat);
    // 5) the gate of the Vault
    const gateM = std(0x3a3f46, { roughness: 0.9, flatShading: true });
    addBox(-11.5, 0, -150 + S, 13, 18, 3, gateM); addBox(11.5, 0, -150 + S, 13, 18, 3, gateM); addBox(0, 12, -150 + S, 10, 6, 3, gateM);
    this.door = addBox(0, 0, -150 + S, 10, 12, 1.6, std(0x55303a, { metalness: 0.6, roughness: 0.35, emissive: 0x330010 }));
    const doorRunes = new THREE.Mesh(new THREE.PlaneGeometry(8, 9), new THREE.MeshBasicMaterial({ map: emojiRunes(), transparent: true }));
    doorRunes.position.set(0, 6, -149.15 + S); this.door.add(doorRunes); doorRunes.position.set(0, 0, 0.82);
    const title = textSprite('VAULT OF CRINGE', 2.2, { font: IMPACT, weight: 'normal', color: '#ff4fd8' }); title.position.set(0, 19.5, -148.3 + S); add(title);
    // a monumental arch around the door, pilasters along the gate wall
    D.archway(0, -148.4 + S, 10, 12, { depth: 1.4, color: 0x454b53, accent: 0xff4fd8 });
    D.wallDress(-18, -148.5 + S, -7.6, -148.5 + S, { inward: 1, h: 18, every: 5, color: 0x3f454d, accent: 0x5fd8ff });
    D.wallDress(7.6, -148.5 + S, 18, -148.5 + S, { inward: 1, h: 18, every: 5, color: 0x3f454d, accent: 0x5fd8ff });
    pointLight(0, 9, -146 + S, 0xff4fd8, 40, 26);
    D.banner(-8.5, 8, -148.3 + S, 0, { color: 0x5a1030, emblem: '▶', text: 'SUBSCRIBE', h: 6 });
    D.banner(8.5, 8, -148.3 + S, 0, { color: 0x5a1030, emblem: '🔔', text: 'THE BELL', h: 6 });
    addBox(0, -2, -162 + S, 10, 2, 22, stone); addBox(-5.5, 0, -162 + S, 1, 12, 22, gateM); addBox(5.5, 0, -162 + S, 1, 12, 22, gateM);
    pointLight(0, 5, -160 + S, 0xb06cff, 30, 20);
    // atmosphere
    D.dust({ min: [-18, 0.3, -62], max: [18, 10, 10], color: 0xcff4ff, count: 400 });
    D.dust({ min: [-18, 0.3, -150 + S], max: [18, 10, -106 + S], color: 0xcff4ff, count: 500 });
    D.groundFog({ min: [-20, -62], max: [20, 10], y: 0.4, color: 0x8fb8c8, opacity: 0.3, count: 20 });
    D.groundFog({ min: [-20, -160 + S], max: [20, -106 + S], y: 0.4, color: 0x8fb8c8, opacity: 0.3, count: 20 });
    D.groundFog({ min: [-34, -110 + S], max: [34, -56], y: -6, color: 0x9fc8d8, opacity: 0.45, count: 70, size: [18, 30] }); // mist down in the chasm
    D.lightShaft(0, 30, -128 + S, { height: 30, top: 3, bottom: 9, color: 0xcff4ff, opacity: 0.12 });
    D.birds({ center: [0, 0, -80 + S / 2], count: 14, radius: [18, 50], height: [10, 26], color: 0x22262c });
    // a storm rolls in over the Vault
    D.weather('rain', { color: 0xb8c8dc, wind: [3, -1], speed: 24, opacity: 0.4 });
    D.lightning({ every: [9, 20] });
    stone.roughness = 0.4; stone.envMapIntensity = 1.4; // wet stone
    // the ship that dropped you off
    this.ship = makeJumpship(); this.ship.position.set(0, 3.5, 6); add(this.ship);
    // lore Ghosts
    [V(7, 1.3, -40), V(-8, 2.9, -82.5), V(14, 1.3, -147 + S)].forEach((p, i) => addLoreGhost(i, p));
    this.tt = 0; this.gateT = -1; this.section = 0; this.chasmCp = false;
  }
  // THE SHY BRIDGE. The gap is too wide to jump, and a howling headwind shoves anyone airborne back.
  // There *is* a glass bridge, but it only exists while nobody is looking at it: look at a panel and it
  // fades out and stops being solid. Cross it backwards (moonwalk), or staring at the sky.
  buildShyBridge(trim) {
    this.bridge = [];
    const S = this.off, z0 = -94.7 + S, z1 = -106 + S, n = 9, len = (z0 - z1) / n;
    for (let i = 0; i < n; i++) {
      const z = z0 - len * (i + 0.5);
      const m = new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x5fd8ff, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0, depthWrite: false });
      const mesh = addBox(0, -0.25, z, 2.6, 0.25, len * 0.97, m);
      mesh.castShadow = false;
      removeCollider(mesh.userData.box); // starts invisible and not there; the first frame decides
      this.bridge.push({ mesh, m, box: mesh.userData.box, c: V(0, -0.1, z), solid: false, vis: 0 });
    }
    // two posts where the bridge "used to be", and a sign
    for (const s of [-1, 1]) { addBox(s * 1.5, 0, -94.4 + S, 0.25, 1.2, 0.25, std(0x3a3f46, { roughness: 0.9 })); addBox(s * 1.5, 1.2, -94.4 + S, 0.35, 0.1, 0.35, trim, { collide: false }); }
    const wood = std(0x4a3828, { roughness: 0.95 });
    addBox(-2.4, 0, -94.42 + S, 0.12, 1.2, 0.12, wood); addBox(-2.4, 1.15, -94.42 + S, 2.3, 0.85, 0.08, wood, { collide: false });
    const sign = textSprite('BRIDGE OUT', 0.45, { font: IMPACT, weight: 'normal', color: '#ffcc33' }); sign.position.set(-2.4, 1.72, -94.2 + S); add(sign);
    const sub = textSprite("it's only there when you're not", 0.2, { color: '#9fe2ff', font: 'Rajdhani, sans-serif' }); sub.position.set(-2.4, 1.36, -94.2 + S); add(sub);
    this.tinkT = 0; this.gapFails = 0;
  }
  // is any guardian looking its way? Anything ahead of you (within ~53 degrees either side) counts, even
  // the bit just past your toes that's off the bottom of the screen; staring up at the sky doesn't.
  seenBy(c) {
    for (const q of players()) {
      if (!q.alive || (q.pitch || 0) > 0.5) continue;
      const dx = c.x - q.pos.x, dz = c.z - q.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.15 && d < 60 && (-Math.sin(q.yaw) * dx - Math.cos(q.yaw) * dz) / d > 0.6) return true;
    }
    return false;
  }
  // a panel never vanishes out from under someone already standing on it
  occupied(b) {
    for (const q of players()) {
      if (q.alive && Math.abs(q.pos.y - b.max.y) < 0.35 && q.pos.x > b.min.x - 0.3 && q.pos.x < b.max.x + 0.3 && q.pos.z > b.min.z - 0.3 && q.pos.z < b.max.z + 0.3) return true;
    }
    return false;
  }
  updateShyBridge(dt) {
    const p = G.player;
    this.tinkT -= dt;
    for (const b of this.bridge) {
      // either end of the panel counts, so walking forward over one doesn't put it "behind" you mid-step
      const seen = (this.seenBy(_e1.set(0, 0, b.box.min.z)) || this.seenBy(_e1.set(0, 0, b.box.max.z))) && !(b.solid && this.occupied(b.box));
      if (seen && b.solid) { b.solid = false; removeCollider(b.box); }
      else if (!seen && !b.solid) {
        b.solid = true; G.colliders.push(b.box);
        if (this.tinkT <= 0 && p.pos.distanceTo(b.c) < 14) { this.tinkT = 0.12; playAt(b.c, 'tink', 0.6); }
      }
      // it fades fast, so you only ever glimpse it at the edge of your vision
      b.vis += ((seen ? 0 : 1) - b.vis) * Math.min(1, dt * (seen ? 5 : 14)); // it lingers a moment as you turn to it
      b.m.opacity = b.vis * 0.65; b.m.emissiveIntensity = 1.1 + Math.sin(this.tt * 3 + b.c.z) * 0.3;
      b.mesh.visible = b.vis > 0.01;
    }
    // the headwind: only while you're in the air over the gap
    const S = this.off, inGap = p.pos.z < -94.7 + S && p.pos.z > -106 + S && Math.abs(p.pos.x) < 20;
    if (p.alive && inGap && !p.onGround) {
      p.vel.z += 45 * dt; p.vel.x *= 1 - Math.min(1, dt * 1.5);
      if (!this.windSaid) { this.windSaid = true; play('gust'); HUD.ghost('Whoa. That wind is not natural. Nobody is jumping this.'); }
      if (Math.random() < dt * 30) fx.burst(V(p.pos.x + rand(-3, 3), p.pos.y + rand(0, 2.5), p.pos.z - rand(2, 6)), 0xcfe8f4, 1, 2, 0.05, 0.35, 0);
    }
    if (p.alive && p.onGround && p.pos.z < -106 + S && !this.shyChecked) { this.shyChecked = true; if (!this.gapFails) unlock('shy'); }
    if (p.alive && p.onGround && p.pos.z < -106 + S && !this.crossed && this.gapFails + (this.windSaid ? 1 : 0) > 0) {
      this.crossed = true;
      HUD.ghost(pick(['...Did you just moonwalk across an invisible bridge? I am not putting that in the report.', 'You crossed it. Do not tell anyone how. They will not believe you.']));
    }
  }
  gapFall() {
    this.gapFails++;
    const hints = [
      null,
      'Jumping is not going to work. That wind only gets you in the air.',
      'Guardian... I could have sworn there was a bridge there. When I was not looking at it.',
      'The sign said it is only there when you are not. Turn around. Walk backwards. Trust me.',
      'Backwards. Facing me. Walk. BACKWARDS. Or look at the sky, I do not care, just stop looking at it.',
    ];
    const h = hints[Math.min(this.gapFails, hints.length - 1)];
    if (h) HUD.ghost(h);
    return !!h;
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
    const S = this.off;
    put(MoaiKnight, 0, -138 + S, this.plazaGroup); put(Stonks, -8, -130 + S, this.plazaGroup); put(Stonks, 8, -130 + S, this.plazaGroup);
    put(Doge, -4, -120 + S, this.plazaGroup); put(Doge, 4, -121 + S, this.plazaGroup);
    const nyan = spawnEnemy(Nyan, 0, -132 + S, 6); nyan.leash = 32; this.plazaGroup.push(nyan);
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
    this.updateShyBridge(dt);
    // the glitch: it jitters like it didn't load properly; sliding into it noclips you out of the raid
    if (this.glitch) {
      const j = Math.random() < 0.08;
      this.glitch.position.x = this.glitchPos.x + (j ? (Math.random() - 0.5) * 0.15 : 0);
      this.glitchMat.emissiveIntensity = j ? 1.4 : 0.5 + Math.sin(this.tt * 9) * 0.1;
      const d = distXZ(p.pos, this.glitchPos);
      if (p.alive && d < 9 && !this.glitchHinted) { this.glitchHinted = true; HUD.ghost('That wall is... yellow? Nothing in the Vault is that shade of yellow.'); }
      if (p.alive && p.slideT > 0 && d < 1.8 && !this.noclipped) {
        this.noclipped = true;
        if (G.net.isClient) G.net.playerEv(['noclip']); else G.onNoclip?.();
      }
    }
    // missed a jump? your Ghost catches you and puts you back on the last platform you stood on
    const S = this.off;
    if (p.alive && p.pos.y < -5 && p.pos.z < -60 && p.pos.z > -108 + S) {
      const b = this.lastPlat?.box, back = b ? V((b.min.x + b.max.x) / 2, b.max.y + 0.05, (b.min.z + b.max.z) / 2) : V(0, 0.1, -58);
      const fellInGap = p.pos.z < -94 + S;
      p.pos.copy(back); p.vel.set(0, 0, 0);
      fx.spawnFx(p.pos); play('orb');
      this.catches = (this.catches || 0) + 1;
      const gap = fellInGap && this.gapFall();
      if (!gap && (this.catches === 1 || Math.random() < 0.3)) HUD.ghost(pick(['Got you. Try that again.', 'Caught you. You are welcome.', 'I am a Ghost, not a safety net. ...Fine. Safety net.', 'That was a skill issue. Go again.']));
    }
    // checkpoints: falling just sends you back to the last one you reached
    if (p.alive && p.onGround) {
      if (p.pos.z < -58 && this.spawn.z > -55) { this.spawn.set(0, 0.1, -55); HUD.killfeed('Checkpoint reached: The Chasm'); }
      const mid = this.gauntlet[17]?.box;
      if (mid && !this.chasmCp && p.pos.z < mid.max.z && this.lastPlat?.box === mid) { this.chasmCp = true; this.spawn.set((mid.min.x + mid.max.x) / 2, mid.max.y + 0.1, (mid.min.z + mid.max.z) / 2); HUD.killfeed('Checkpoint reached: The Chasm (somehow still)'); }
      if (p.pos.z < -106 + S && this.spawn.z > -110 + S) { this.spawn.set(0, 0.1, -110 + S); HUD.killfeed('Checkpoint reached: The Plaza'); }
    }
    // waypoint + objective by section
    const z = p.pos.z;
    // in the chasm the marker hops to the next platform ahead of you (there are a lot of them)
    let next = null;
    if (z <= -60 && z > -92 + S) for (const pl of this.platforms) if (pl.box.max.z < z - 0.5 && (!next || pl.box.max.z > next.box.max.z) && Math.abs(pl.base.x) < 9) next = pl;
    G.waypoint = this.gateT >= 0 ? V(0, 3, -152 + S) : z > -60 ? V(0, 1.5, -64) : next ? V((next.box.min.x + next.box.max.x) / 2, next.box.max.y + 1.2, (next.box.min.z + next.box.max.z) / 2) : z > -104 + S ? V(0, 1.5, -108 + S) : V(0, 4, -150 + S);
    // the Ghost has opinions about the milestones
    const lp = this.lastPlat;
    if (p.alive && p.onGround && lp?.note != null && !(this.noted ||= new Set()).has(lp.note)) {
      this.noted.add(lp.note);
      const lines = { 4: 'Good. Only... a lot more to go.', 9: 'Guardian, I have been counting. Do not ask me the number.', 15: 'This is the halfway point. I checked. ...I did not check.', 19: 'Who builds a raid entrance like this? Who approved this?', 24: 'I can see the end. I think. It might be fog.', 29: 'The jumps are getting bigger. Double jump. Glide. Pray.', 33: 'The last one. I would cry, but I am a sphere.' };
      if (lines[lp.note]) HUD.ghost(lines[lp.note]);
    }
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
    const S = this.off;
    const sec = this.gateT >= 0 ? 3 : this.plazaGroup.every((e) => !e.alive) ? 2 : players().some((q) => q.pos.z < -104 + S) ? 2 : players().some((q) => q.pos.z < -58) ? 1 : 0;
    const texts = ['Find the entrance to the Vault.', 'Cross the chasm.', 'Clear the plaza.', 'The Vault is open. Enter.'];
    const plazaLeft = this.plazaGroup.filter((e) => e.alive).length;
    HUD.objective(null, sec === 2 && plazaLeft ? `${texts[2]}\nGuardians remaining: ${plazaLeft}` : texts[sec]);
    if (this.gateT < 0 && plazaLeft === 0) {
      this.openGate();
      this.ghost('That is the door. Guardian... it is opening. Of course it is opening. Nothing good ever stays closed.');
    }
    if (this.gateT >= 2.5 && players().some((q) => q.alive && q.pos.z < -153 + S)) this.complete();
    if (p.alive && p.pos.z < -100 + S && !this.plazaWarned) { this.plazaWarned = true; this.ghost('Hostiles in the plaza. They are guarding the door.'); }
  }
  openGate(fromNet = false) {
    if (this.gateT >= 0) return;
    this.gateT = 0;
    removeCollider(this.door.userData.box);
    const g = V(0, 6, -150 + this.off);
    if (!fromNet) { playAt(g, 'rumble', 3.5); playAt(g, 'vineBoom', 0.5); }
    else local(() => playAt(g, 'rumble', 3.5));
  }
  cleanup() { G.waypoint = null; document.getElementById('lore')?.classList.add('hidden'); }
}

// a tiny seeded RNG (mulberry32) so the gauntlet is the same on every machine
function seeded(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
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
