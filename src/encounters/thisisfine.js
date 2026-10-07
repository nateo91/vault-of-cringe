// Encounter 4: THIS IS FINE — the room is on fire. The Dog is in denial (immune) until the fire is too big to ignore.
// Let it burn to break the denial, put it out with extinguishers before it takes everyone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, rand, pick, after, dampAngle, distXZ, alivePlayers, players, playerById, local } from '../game.js';
import * as D from '../dressing.js';
import { Encounter, weightedPick } from './base.js';
import { setEnv, addBox, addCyl, add, std, pointLight } from '../world.js';
import { tileTex, textSprite, emojiSprite, IMPACT } from '../textures.js';
import { Enemy, Doge, Stonks, registerNetType } from '../enemies.js';
import { Shockwave, Pickup } from '../combat.js';
import { rimify } from '../rigs.js';
import { playCinematic } from '../cinematic.js';
import { HUD } from '../hud.js';
import { play, playAt, say } from '../audio.js';
import * as fx from '../fx.js';

// the floor is a grid of tiles that burn
const N = 12, S = 4, HALF = N * S / 2;
const TILES = N * N;
const DENIAL_BREAKS = 0.5, DENIAL_RETURNS = 0.35, ENGULF = 0.9, ENGULF_TIME = 4;
const ENRAGE = 360;
const SPREAD = 0.018;         // ignite chance per burning neighbour per second (grows with the fire)
const WET_TIME = 9;           // doused tiles can't catch for a while
const CHARGE = 44;            // burning tiles one extinguisher can put out
const MOUNTS = [[-22.6, 8], [22.6, 8], [-22.6, -8], [22.6, -8]];
const DENIAL_LINES = ['this is fine.', 'this is fine.', 'i\'m okay with the events that are unfolding currently.', 'that\'s okay, things are going to be okay.', '*sip*', 'everything is fine.'];
const PANIC_LINES = ['OKAY THIS IS NOT FINE', 'MY HAT IS ON FIRE', 'I AM NOT OKAY WITH THE EVENTS THAT ARE UNFOLDING', 'WHY IS IT SO HOT', 'HELP'];
const r2 = (n) => Math.round(n * 100) / 100;
const _t = new THREE.Vector3();
const tileOf = (x, z) => {
  const ix = Math.floor((x + HALF) / S), iz = Math.floor((z + HALF) / S);
  return ix < 0 || iz < 0 || ix >= N || iz >= N ? -1 : iz * N + ix;
};
const tileCenter = (i, out = new THREE.Vector3()) => out.set(-HALF + (i % N + 0.5) * S, 0, -HALF + (Math.floor(i / N) + 0.5) * S);
const pid = (p) => (p === G.player ? G.net.myId : p.id);

// ---------- the fire: instanced crossed-quad flames, 3 per tile, plus a glow decal per tile ----------
const FLAMES_PER = 3;
function makeFireField() {
  const a = new THREE.PlaneGeometry(1, 1); a.translate(0, 0.5, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const geo = mergeGeometries([a, b]);
  const count = TILES * FLAMES_PER;
  const heat = new Float32Array(count), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) seed[i] = Math.random() * 100;
  const ig = new THREE.InstancedBufferGeometry().copy(geo);
  ig.instanceCount = count;
  const heatAttr = new THREE.InstancedBufferAttribute(heat, 1); heatAttr.setUsage(THREE.DynamicDrawUsage);
  ig.setAttribute('aHeat', heatAttr);
  ig.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aHeat; attribute float aSeed;
      uniform float uTime;
      varying vec2 vUv; varying float vHeat; varying float vSeed; varying float vNear;
      void main() {
        vUv = uv; vHeat = aHeat; vSeed = aSeed;
        vec3 p = position;
        float h = aHeat * (0.85 + 0.25 * sin(uTime * 7.0 + aSeed * 3.0));
        p.y *= h; p.xz *= mix(0.4, 1.0, aHeat);
        p.x += sin(uTime * 3.0 + aSeed) * 0.18 * uv.y; p.z += cos(uTime * 2.6 + aSeed) * 0.18 * uv.y;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vNear = smoothstep(0.8, 4.5, -mv.z); // fade flames that are right in your face
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv; varying float vHeat; varying float vSeed; varying float vNear;
      void main() {
        if (vHeat < 0.02 || vNear < 0.01) discard;
        float y = vUv.y;
        float x = (vUv.x - 0.5) * 2.0;
        float n = sin(y * 9.0 - uTime * 7.0 + vSeed * 10.0) * 0.13 + sin(y * 17.0 - uTime * 11.0 + vSeed * 4.0) * 0.06;
        float w = 0.95 * pow(1.0 - y, 0.75) * smoothstep(0.0, 0.18, y + 0.08);
        float shape = 1.0 - smoothstep(w * 0.45, w, abs(x + n * y * 1.6));
        float a = shape * smoothstep(1.0, 0.55, y) * min(1.0, vHeat * 1.4) * vNear * 0.5;
        if (a < 0.01) discard;
        vec3 core = vec3(1.0, 0.62, 0.12) * 1.5, mid = vec3(1.0, 0.24, 0.0) * 1.1, tip = vec3(0.45, 0.03, 0.0);
        vec3 col = mix(core, mid, smoothstep(0.0, 0.45, y + abs(x) * 0.6));
        col = mix(col, tip, smoothstep(0.45, 1.0, y));
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(ig, mat, count);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let t = 0; t < TILES; t++) {
    tileCenter(t, pos);
    for (let k = 0; k < FLAMES_PER; k++) {
      const p = pos.clone().add(new THREE.Vector3(rand(-1.3, 1.3), 0, rand(-1.3, 1.3)));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI));
      const s = rand(1.6, 2.4); sc.set(s, s * rand(0.9, 1.3), s);
      m.compose(p, q, sc); mesh.setMatrixAt(t * FLAMES_PER + k, m);
    }
  }
  mesh.renderOrder = 5;
  // per-tile floor glow (burning embers) / blue sheen (wet)
  const glowMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(S * 0.98, S * 0.98).rotateX(-Math.PI / 2), glowMat, TILES);
  for (let t = 0; t < TILES; t++) { tileCenter(t, pos); pos.y = 0.03; m.compose(pos, q.identity(), sc.set(1, 1, 1)); glow.setMatrixAt(t, m); glow.setColorAt(t, new THREE.Color(0)); }
  glow.frustumCulled = false;
  return { mesh, glow, heat, heatAttr, mat };
}

// ---------- the boss ----------
function makeFineDog() {
  const g = new THREE.Group();
  const fur = std(0xe0a83e, { detail: false, roughness: 0.85 }), furLight = std(0xf3d08a, { detail: false, roughness: 0.85 }), ear = std(0x7a4a1c, { detail: false, roughness: 0.9 });
  const black = std(0x15120f, { detail: false, roughness: 0.5 }), white = std(0xffffff, { detail: false, roughness: 0.3 }), wood = std(0x7a4b28, { detail: false, roughness: 0.8 });
  const sph = (r, m, x, y, z, sx = 1, sy = 1, sz = 1, parent = g) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
  // chair
  const chair = new THREE.Group(); g.add(chair);
  const box = (w, h, d, m, x, y, z, parent = chair) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  box(3.2, 0.3, 3, wood, 0, 1.7, -0.3); box(3.2, 3.6, 0.3, wood, 0, 3.4, -1.75);
  for (const [x, z] of [[-1.4, 1], [1.4, 1], [-1.4, -1.6], [1.4, -1.6]]) box(0.25, 1.7, 0.25, wood, x, 0.85, z);
  // body (the bob holds everything that breathes)
  const bob = new THREE.Group(); g.add(bob);
  sph(1.35, fur, 0, 3.0, 0, 1, 1.25, 0.95, bob);
  sph(0.95, furLight, 0, 2.9, 0.62, 0.9, 1.1, 0.5, bob);
  for (const sx of [-1, 1]) sph(0.55, fur, sx * 0.8, 1.9, 1.0, 0.9, 0.6, 1.5, bob); // haunches
  const headJ = new THREE.Group(); headJ.position.set(0, 4.55, 0.1); bob.add(headJ);
  sph(1.12, fur, 0, 0.45, 0, 1.05, 0.95, 1, headJ);
  sph(0.62, furLight, 0, 0.12, 0.85, 1.1, 0.75, 1, headJ);
  sph(0.2, black, 0, 0.32, 1.45, 1.2, 0.85, 1, headJ);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16, Math.PI), black); mouth.position.set(0, -0.1, 1.38); mouth.rotation.z = Math.PI; headJ.add(mouth);
  const eyes = [], pupils = [];
  for (const sx of [-1, 1]) {
    const e = sph(0.26, white, sx * 0.42, 0.72, 0.84, 1, 1.15, 0.6, headJ); eyes.push(e);
    pupils.push(sph(0.12, black, sx * 0.42, 0.7, 1.0, 1, 1, 0.5, headJ));
    const earJ = new THREE.Group(); earJ.position.set(sx * 0.95, 0.95, -0.05); earJ.rotation.z = sx * 0.35; headJ.add(earJ);
    sph(0.5, ear, 0, -0.55, 0, 0.45, 1.15, 0.8, earJ);
    eyes.push(earJ);
  }
  // the hat
  const hat = new THREE.Group(); hat.position.set(0, 1.42, -0.05); hat.rotation.x = -0.08; headJ.add(hat);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), black); dome.scale.y = 0.95; hat.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.07, 28), black); hat.add(brim);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.73, 0.73, 0.16, 28, 1, true), std(0x5a3a22, { detail: false })); band.position.y = 0.1; hat.add(band);
  // arm + coffee mug
  const armJ = new THREE.Group(); armJ.position.set(0.95, 3.85, 0.35); bob.add(armJ);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 6, 12), fur); arm.position.set(0, -0.55, 0.3); arm.rotation.x = -0.5; armJ.add(arm);
  const mug = new THREE.Group(); mug.position.set(-0.1, -1.0, 1.0); armJ.add(mug);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.62, 20), white); mug.add(cup);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20).rotateX(-Math.PI / 2), std(0x3b2010, { detail: false })); coffee.position.y = 0.3; mug.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 16), white); handle.position.set(0.36, 0, 0); mug.add(handle);
  const armL = new THREE.Group(); armL.position.set(-0.95, 3.85, 0.35); bob.add(armL);
  const al = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 6, 12), fur); al.position.set(0, -0.6, 0.35); al.rotation.x = -0.6; armL.add(al);
  // the hat catches fire when it stops being fine
  const hatFire = emojiSprite('🔥', 1.6); hatFire.position.set(0, 0.9, 0); hatFire.visible = false; hat.add(hatFire);
  rimify(bob, 0xffb060, 0.3);
  g.userData = { bob, headJ, hat, armJ, armL, mug, eyes, pupils, mouth, hatFire };
  return g;
}

class FineDog extends Enemy {
  constructor(enc) {
    super({ name: 'THE DOG, WHO IS FINE', ash: 0xffa040, hp: 6000, radius: 2.4, height: 6.3, rank: 'boss', gib: 0xe0a83e });
    this.enc = enc; this.knockable = false; this.immune = true;
    this.model = makeFineDog(); this.mesh.add(this.model);
    this.hb(0, 3, 0.2, 1.5).hb(0, 5.0, 0.4, 1.15, true);
    const sm = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(4.2, 32, 20), sm); this.shield.position.y = 3.6; this.mesh.add(this.shield);
    this.bubble = textSprite('this is fine.', 0.7, { font: 'Comic Sans MS, Comic Neue, cursive', color: '#111', bg: '#fff', pad: 18 });
    this.bubble.position.set(1.8, 7.6, 0); this.bubble.visible = false; this.mesh.add(this.bubble);
    this.panic = 0; this.sipT = rand(2, 4); this.lineT = 3; this.takeCd = 5; this.waveCd = 9;
  }
  pose() { return null; }
  netVis() { return [r2(this.panic), this.bubble.visible ? this.lineIdx : -1, this.sipping ? 1 : 0]; }
  applyVis(v) { this.panic = v[0]; this.setLine(v[1]); this.sipping = !!v[2]; }
  setLine(i) {
    if (i === this.lineIdx && this.bubble.visible === i >= 0) return;
    this.lineIdx = i;
    if (i < 0) { this.bubble.visible = false; return; }
    const txt = i >= 100 ? PANIC_LINES[i - 100] : DENIAL_LINES[i];
    const old = this.bubble;
    this.bubble = textSprite(txt, i >= 100 ? 0.8 : 0.6, { font: i >= 100 ? IMPACT : 'Comic Sans MS, Comic Neue, cursive', weight: 'normal', color: i >= 100 ? '#c00' : '#111', bg: '#fff', pad: 18 });
    this.bubble.position.copy(old.position);
    this.mesh.remove(old); old.material.map?.dispose(); old.material.dispose();
    this.mesh.add(this.bubble);
  }
  say(i, dur = 2.6) { this.setLine(i); this.lineHide = this.t + dur; }
  animate(dt) {
    const u = this.model.userData, P = this.panic;
    this.shield.visible = this.immune;
    this.shield.material.opacity = 0.12 + Math.sin(this.t * 2.5) * 0.04;
    u.bob.position.y = Math.sin(this.t * 1.6) * 0.04 + (P > 0.5 ? Math.abs(Math.sin(this.t * 18)) * 0.12 * P : 0);
    u.bob.rotation.z = P * Math.sin(this.t * 23) * 0.05;
    u.headJ.rotation.y = P ? Math.sin(this.t * 9) * 0.35 * P : Math.sin(this.t * 0.4) * 0.12;
    u.headJ.rotation.x = -this.flinch * 0.2;
    // sip: lift the mug to the snout
    const sip = this.sipping ? Math.min(1, (this.sipK = Math.min(1, (this.sipK || 0) + dt * 2.5))) : (this.sipK = Math.max(0, (this.sipK || 0) - dt * 2));
    u.armJ.rotation.x = -sip * 1.1 + P * Math.sin(this.t * 14) * 0.5;
    u.armL.rotation.x = P * Math.sin(this.t * 13 + 1) * 0.7;
    u.armL.rotation.z = -P * 0.8;
    u.mug.rotation.x = sip * 0.9;
    // wide eyes + flying hat when it stops being fine
    for (const p of u.pupils) p.scale.setScalar(1 - P * 0.6);
    u.hat.position.y = 1.42 + P * (0.25 + Math.abs(Math.sin(this.t * 12)) * 0.35);
    u.hatFire.visible = P > 0.5;
    u.mouth.scale.set(1 + P * 0.8, 1 + P * 2.5, 1); u.mouth.rotation.z = P > 0.5 ? 0 : Math.PI;
    if (this.lineHide && this.t > this.lineHide) { this.lineHide = 0; if (!G.net.isClient) this.setLine(-1); }
    this.bubble.position.y = 7.6 + Math.sin(this.t * 2) * 0.1;
  }
  think(dt) {
    const enc = this.enc;
    const p = this.tgt();
    this.yaw = dampAngle(this.yaw, P0(this, p), 0.8, dt);
    const panicking = !this.immune;
    this.panic = Math.max(0, Math.min(1, this.panic + (panicking ? dt * 3 : -dt * 1.5)));
    // denial: sip, say it's fine
    this.sipT -= dt;
    if (this.sipT <= 0 && !panicking) { this.sipping = !this.sipping; this.sipT = this.sipping ? 1.4 : rand(4, 7); if (this.sipping) playAt(this.top(), 'sip'); }
    if (panicking) this.sipping = false;
    this.lineT -= dt;
    if (this.lineT <= 0) {
      this.lineT = panicking ? rand(3, 5) : rand(6, 9);
      const i = panicking ? 100 + Math.floor(Math.random() * PANIC_LINES.length) : Math.floor(Math.random() * DENIAL_LINES.length);
      this.say(i, panicking ? 2.2 : 3);
      if (i < 2 && Math.random() < 0.5) say('this is fine', 'boss', false);
    }
    // hot takes: flaming coffee lobbed at guardians, lights up the floor where it lands
    this.takeCd -= dt;
    if (this.takeCd <= 0 && p.alive) {
      this.takeCd = panicking ? rand(2.4, 3.4) : rand(4.5, 6.5);
      const targets = alivePlayers();
      const n = panicking ? Math.min(3, targets.length + 1) : 1;
      for (let i = 0; i < n; i++) {
        const tg = targets[i % targets.length];
        after(i * 0.35, () => {
          if (!this.alive || !tg.alive) return;
          this.fire(this.hbWorld({ off: _t.set(0.9, 4.6, 1.6) }, new THREE.Vector3()), {
            at: tg, aimY: 0, speed: 19, gravity: 16, spread: 0.06, dmg: 22, splash: 2.6, color: 0xff6a10, size: 0.42, trail: 0xff8a20, explodeColor: 0xff5a00,
            source: 'a hot take (it was too hot)', onHit: (pos) => enc.ignite(pos, 1),
          });
          playAt(this.top(), 'fireball');
        });
      }
    }
    // when it isn't fine any more it flails out a shockwave ("jump!")
    if (panicking) {
      this.waveCd -= dt;
      if (this.waveCd <= 0) {
        this.waveCd = rand(8, 11);
        new Shockwave({ center: this.pos.clone().setY(0.1), speed: 12, maxR: 32, dmg: 35, height: 0.9, color: 0xff7a20, source: 'a full-body panic (you had to jump)' });
        playAt(this.pos, 'roar'); G.shake += 0.4;
        fx.floatText(this.top().clone(), 'NOT FINE', { height: 1.2, color: '#ff4020' });
      }
    } else this.waveCd = Math.min(this.waveCd, 4);
  }
}
const P0 = (e, p) => Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);

// ---------- Hot Take: a walking bad opinion. Sets the floor alight as it goes, and when it dies. ----------
class HotTake extends Enemy {
  constructor() {
    super({ name: 'Hot Take', hp: 85, radius: 0.55, height: 1.6, speed: rand(5, 6.2), gib: 0xff6a10, ash: 0xff4010, deathLines: ['got ratioed', 'cooled off', 'was, in fact, a bad take', 'has been fact-checked'] });
    this.model = new THREE.Group(); this.mesh.add(this.model);
    this.flame = emojiSprite('🔥', 2.1); this.flame.position.y = 1.05; this.model.add(this.flame);
    this.face = emojiSprite(pick(['😡', '🤬', '😤', '🤓']), 0.8); this.face.position.set(0, 0.85, 0.15); this.model.add(this.face);
    this.light = new THREE.PointLight(0xff6a10, 8, 6, 2); this.light.position.y = 1; this.model.add(this.light);
    this.sign = textSprite(pick(['UNPOPULAR OPINION', 'HOT TAKE', 'WELL ACTUALLY', 'RATIO', 'L + BOZO', 'NOBODY:']), 0.32, { font: IMPACT, weight: 'normal', color: '#ffd23f' });
    this.sign.position.y = 2.25; this.model.add(this.sign);
    this.hb(0, 0.8, 0, 0.6).hb(0, 1.15, 0.1, 0.32, true);
    this.burnT = rand(0.5, 1.2);
  }
  animate(dt) {
    const k = 1 + Math.sin(this.t * 12) * 0.07;
    this.flame.scale.set(2.1 * k, 2.1 / k, 1);
    this.model.position.y = Math.abs(Math.sin(this.t * 7)) * 0.15;
    this.light.intensity = 7 + Math.sin(this.t * 20) * 2;
  }
  think(dt) {
    const p = this.tgt();
    const d = this.steer(p.pos.x, p.pos.z, this.speed, dt, { stopDist: 0.6 });
    this.burnT -= dt;
    if (this.burnT <= 0) { this.burnT = rand(1.0, 1.5); this.enc()?.ignite(this.pos, 0); }
    if (d < 1.5 && p.alive && Math.abs(p.pos.y - this.pos.y) < 1.8) {
      this.blewUp = true; this.drops = false;
      this.die();
    }
  }
  enc() { return G.encounter instanceof ThisIsFine ? G.encounter : null; }
  onDeathFx(c) {
    // a take this hot doesn't die quietly
    fx.explosion(c, 3.2, 0xff5a00);
    playAt(c, 'explosion', 0.8);
    if (!G.net.isClient) {
      this.enc()?.ignite(this.pos, 1);
      for (const q of alivePlayers()) if (distXZ(q.pos, this.pos) < 3.4) this.enc()?.hurt(q, this.blewUp ? 30 : 15, 'a Hot Take (it went off)');
    }
  }
}

export class ThisIsFine extends Encounter {
  static title = 'THIS IS FINE';
  cursed = 4;
  build() {
    this.spawn.set(0, 0.1, 21); this.spawnYaw = 0;
    setEnv({ sky: 0x2a1408, fog: 0x3a2214, near: 18, far: 110, hemi: [0xffd0a0, 0x301408, 0.75], sun: { color: 0xffb070, int: 1.2, pos: [20, 45, 30] }, shadowSize: 40,
      dome: { top: 0x120804, horizon: 0x8a3a10, bottom: 0x100604, sun: 0xffa050, sunSize: 3, haze: 1.5 } });
    this.fogBase = new THREE.Color(0x3a2214); this.fogHot = new THREE.Color(0x8a3a12);
    // a cozy cartoon room. wood floor, yellow wallpaper, it's lovely, it's fine
    const ft = tileTex({ base: '#8a5a32', line: '#5e3a1e', n: 12, seed: 41, grain: 26 }); ft.repeat.set(4, 4);
    const wt = tileTex({ base: '#d9b44a', line: '#c49a32', accent: '#e8c860', n: 6, seed: 42 }); wt.repeat.set(6, 1);
    const floor = std(0xffffff, { map: ft, roughness: 0.7 }), wall = std(0xffffff, { map: wt, roughness: 0.9 });
    addBox(0, -2, 0, HALF * 2 + 4, 2, HALF * 2 + 4, floor);
    const W = HALF + 1, H = 13;
    addBox(0, 0, -W, W * 2 + 2, H, 2, wall); addBox(0, 0, W, W * 2 + 2, H, 2, wall);
    addBox(-W, 0, 0, 2, H, W * 2, wall); addBox(W, 0, 0, 2, H, W * 2, wall);
    // baseboards + a picture rail
    const trim = std(0x6a3e1c);
    for (const [x, z, w, d] of [[0, -W + 1.05, W * 2, 0.1], [0, W - 1.05, W * 2, 0.1], [-W + 1.05, 0, 0.1, W * 2], [W - 1.05, 0, 0.1, W * 2]]) {
      addBox(x, 0, z, w, 0.5, d, trim, { collide: false }); addBox(x, 8.5, z, w, 0.2, d, trim, { collide: false });
    }
    // the table, the chair (the dog brings its own), some furniture for cover (and for standing on when the floor is lava. sorry. fire.)
    const wood = std(0x7a4b28, { roughness: 0.8 });
    addBox(0, 2.2, -11.2, 6.5, 0.3, 3.2, wood);
    for (const [x, z] of [[-2.9, -12.5], [2.9, -12.5], [-2.9, -9.9], [2.9, -9.9]]) addBox(x, 0, z, 0.3, 2.2, 0.3, wood, { collide: false });
    const sofa = std(0x6a2a2a, { roughness: 0.9 }), shelf = std(0x5a3a22);
    // sofas: low cover you can hop onto
    addBox(-13, 0, 6, 7, 1.3, 2.6, sofa); addBox(-13, 1.3, 7.1, 7, 1.4, 0.5, sofa);
    addBox(13, 0, 6, 7, 1.3, 2.6, sofa); addBox(13, 1.3, 7.1, 7, 1.4, 0.5, sofa);
    // bookshelves + side tables
    addBox(-16, 0, -14, 2.2, 5.5, 6, shelf); addBox(16, 0, -14, 2.2, 5.5, 6, shelf);
    addBox(-6, 0, 14, 2.6, 1.6, 2.6, wood); addBox(6, 0, 14, 2.6, 1.6, 2.6, wood);
    addBox(0, 0, 2, 5, 1.0, 1.6, wood); // coffee table
    // books on the shelves
    for (const sx of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
      const c = pick([0xaa3322, 0x2255aa, 0x22aa55, 0xddaa22, 0x7733aa, 0xeeeeee]);
      addBox(sx * 14.85, 0.9 + row * 1.6, -16.6 + i * 0.6, 0.3, rand(0.9, 1.3), 0.45, std(c), { collide: false, shadow: false });
    }
    // picture frames: very relatable art
    const frame = (x, z, rotY, e, w = 3) => {
      const g = new THREE.Group(); g.position.set(x, 6.2, z); g.rotation.y = rotY; add(g);
      const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, w * 0.8 + 0.4, 0.15), std(0x3a2414)); g.add(f);
      const pic = emojiSprite(e, w * 0.7); pic.position.z = 0.12; g.add(pic);
    };
    frame(-9, -W + 1.1, 0, '🌻'); frame(9, -W + 1.1, 0, '🐶'); frame(-W + 1.1, -2, Math.PI / 2, '🏠'); frame(W - 1.1, -2, -Math.PI / 2, '☕');
    frame(-W + 1.1, 15, Math.PI / 2, '🙂', 2.4); frame(W - 1.1, 15, -Math.PI / 2, '👍', 2.4);
    const sign = textSprite('THIS IS FINE', 2.2, { font: IMPACT, weight: 'normal', color: '#fff', stroke: '#000' }); sign.position.set(0, 10.6, -W + 1.3); add(sign);
    // smoke up top, fog of war down low
    D.groundFog({ min: [-HALF, -HALF], max: [HALF, HALF], y: 9, color: 0x2a2420, opacity: 0.55, count: 30, size: [12, 20] });
    D.dust({ min: [-HALF, 0.3, -HALF], max: [HALF, 11, HALF], color: 0xffa040, count: 500, size: 0.07, opacity: 0.8 });
    D.lamp(-20, 20, { color: 0xffc070 }); D.lamp(20, 20, { color: 0xffc070 });
    // the fire
    this.field = makeFireField();
    add(this.field.mesh); add(this.field.glow);
    this.lights = [[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([x, z]) => {
      const l = new THREE.PointLight(0xff7a20, 0, 26, 1.6); l.position.set(x, 3, z); add(l); return l;
    });
    this.fire = new Uint8Array(TILES);      // 0 nothing, 1 burning, 2 wet
    this.wetT = new Float32Array(TILES);
    this.tileT = 0;
    // extinguisher wall mounts
    this.mounts = MOUNTS.map(([x, z]) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; add(g);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.12), std(0xdddddd)); plate.position.set(0, 2.2, -0.05); g.add(plate);
      const ext = makeExtinguisher(); ext.position.set(0, 1.35, 0.35); g.add(ext);
      const tag = textSprite('🧯 FIRE EXTINGUISHER', 0.38, { color: '#fff', bg: '#c0141c', pad: 10 }); tag.position.set(0, 3.7, 0.3); g.add(tag);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.6, 12, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      g.add(beam); beam.position.set(0, 6, 0.6);
      const light = new THREE.PointLight(0xff3040, 0, 8, 2); light.position.set(0, 2, 1); g.add(light);
      return { g, ext, tag, beam, light, pos: new THREE.Vector3(x + (x < 0 ? 1.2 : -1.2), 0, z) };
    });
    this.carrier = null; this.charge = 0; this.mount = -1; this.mountT = 30;
    this.phase = 'denial'; this.frac = 0; this.engulfT = 0;
    // a 🧯 over whoever is carrying
    this.carryTag = emojiSprite('🧯', 0.9); this.carryTag.visible = false; add(this.carryTag);
    this.vmExt = makeExtinguisher(); this.vmExt.scale.setScalar(0.22); this.vmExt.position.set(0.26, -0.3, -0.62); this.vmExt.rotation.set(0.5, -0.4, 0.15);
    this.vmExt.visible = false; G.vmCamera.add(this.vmExt);
    this.spawners = [[-18, -18], [18, -18], [-19, 2], [19, 2], [-16, 18], [16, 18]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  }
  start() {
    this.boss = new FineDog(this);
    this.boss.pos.set(0, 0, -15.2);
    G.enemies.push(this.boss);
    this.enrageT = ENRAGE; this.addT = 6; this.mountT = 22;
    // it starts small. it's fine.
    for (const i of [tileOf(-14, -6), tileOf(14, -6), tileOf(-6, -18), tileOf(6, -18), tileOf(0, -6)]) this.fire[i] = 1;
    HUD.objective(ThisIsFine.title, 'The room is on fire. That is fine.');
    if (!G.introsSeen.has('finedog')) { G.introsSeen.add('finedog'); this.ev('intro'); }
    after(0.8, () => this.ghost('Guardian... the room is on fire. And that dog is just... sitting there.'));
    after(6, () => this.ghost('He is in denial. Nothing can hurt him while he thinks this is fine. We have to let it get bad enough that he notices.'));
    after(14, () => this.ghost('But not too bad. If the whole floor goes up, so do we. Grab the extinguishers off the walls when they light up!'));
  }
  ev_intro() {
    const b = this.boss || G.enemies.find((e) => e instanceof FineDog);
    if (!b) return;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    let sipped = false, lit = false;
    playCinematic({
      duration: 8.6, sting: 'bossSting',
      shots: [
        { t: [0, 3.0], path: [V(-14, 2.4, 14), V(-8, 2.8, 4), V(-4, 3.2, -3)], look: [V(0, 3, -12), V(0, 4.5, -15)], fov: [60, 50] },
        { t: [3.0, 5.6], path: [V(1.8, 5.4, -9.8), V(1.0, 5.3, -10.6)], look: [V(0, 5.0, -15)], fov: [42, 34] },
        { t: [5.6, 8.6], path: [V(0, 6, -6), V(0, 9, 4), V(0, 11, 14)], look: [V(0, 4, -15), V(0, 2, -10)], fov: [50, 66] },
      ],
      card: { at: 4.4, name: 'THE DOG, WHO IS FINE', sub: 'KEEPER OF COPE · HE WHO DRINKS COFFEE IN TRYING TIMES' },
      lines: [[3.4, 'this is fine', 'boss']],
      choreo: (t, dt, snap) => {
        if (snap) t = 99;
        b.sipping = t > 1.2 && t < 3.0;
        if (t > 3.3 && t < 6.5) { if (b.lineIdx !== 0) b.setLine(0); } else if (b.lineIdx === 0 && !snap) b.setLine(-1);
        if (t > 1.2 && !sipped) { sipped = true; if (!snap) playAt(b.top(), 'sip'); }
        // the fire roars up around the room
        if (t > 5.6 && !lit) {
          lit = true;
          if (!snap) { play('fireball'); G.shake += 0.5; for (let i = 0; i < 6; i++) fx.burst(V(rand(-20, 20), 1, rand(-20, 10)), 0xff6a10, 10, 6, 0.2, 0.8, -3); }
        }
        this.cineHeat = t > 5.6 ? Math.min(1, (t - 5.6) / 1.2) : 0;
        if (snap) { b.sipping = false; b.setLine(-1); this.cineHeat = 0; }
      },
      onEnd: () => { b.sipping = false; b.setLine(-1); this.cineHeat = 0; },
    });
  }
  cineTick(dt) { this.drawFire(dt); }

  // ---------- fire (host) ----------
  ignite(pos, radius = 0) {
    const c = tileOf(pos.x, pos.z);
    if (c < 0) return;
    const cx = c % N, cz = Math.floor(c / N);
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const i = z * N + x;
      if (this.fire[i] === 0) this.fire[i] = 1;
    }
  }
  hurt(q, amt, cause) { if (q === G.player) q.hurt(amt, cause); else G.net.sendTo(q.id, ['hurt', amt, cause]); }
  stepFire(dt) {
    let burning = 0;
    for (let i = 0; i < TILES; i++) if (this.fire[i] === 1) burning++;
    this.frac = burning / TILES;
    const p = SPREAD * (1 + 1.5 * this.frac) * dt;
    const next = this.fire.slice();
    for (let i = 0; i < TILES; i++) {
      if (this.fire[i] === 2) { this.wetT[i] -= dt; if (this.wetT[i] <= 0) next[i] = 0; continue; }
      if (this.fire[i] !== 1) continue;
      const x = i % N, z = Math.floor(i / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Z = z + dz;
        if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
        const j = Z * N + X;
        if (this.fire[j] === 0 && Math.random() < p) next[j] = 1;
      }
    }
    // the slow-burn: a random spark somewhere so it never fully dies out
    if (Math.random() < 0.06 * dt) { const j = Math.floor(Math.random() * TILES); if (next[j] === 0) next[j] = 1; }
    this.fire = next;
  }
  douse(pos) {
    const c = tileOf(pos.x, pos.z);
    if (c < 0) return 0;
    const cx = c % N, cz = Math.floor(c / N);
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const i = z * N + x;
      if (this.fire[i] === 1) n++;
      if (this.fire[i] !== 2) { this.fire[i] = 2; this.wetT[i] = WET_TIME; }
    }
    return n;
  }

  update(dt) {
    this.t += dt;
    if (this.done || this.won) return;
    const b = this.boss;
    if (!b.alive) { this.won = true; return this.win(); }
    this.tileT += dt;
    if (this.tileT >= 0.25) { this.stepFire(this.tileT); this.tileT = 0; }
    // the denial breaks at 50% and comes back under 35%
    if (b.immune && this.frac >= DENIAL_BREAKS) {
      b.immune = false; this.phase = 'panic';
      play('airhorn');
      HUD.bigText('THIS IS NOT FINE', 'the dog has noticed. HURT IT.', 2.5, 'good');
      this.ghost(pick(['He finally noticed! Light him up! ...More. You know what I mean.', 'Reality has set in! Damage phase!']));
      b.lineT = 0;
      // ammo for the damage phase (not every flip, or you could farm it by fanning the flames)
      if (this.t - (this.lastDrop ?? -99) > 25) {
        this.lastDrop = this.t;
        for (let i = 0; i < 2; i++) new Pickup('heavy', new THREE.Vector3(rand(-5, 5), 2, rand(4, 9)));
        new Pickup('special', new THREE.Vector3(rand(-5, 5), 2, rand(4, 9)));
      }
    } else if (!b.immune && this.frac < DENIAL_RETURNS) {
      b.immune = true; this.phase = 'denial';
      HUD.bigText('...THIS IS FINE', 'he is back in denial. let it burn.', 2.2, 'warn');
      b.lineT = 0.5;
    }
    // too much fire: everyone burns
    this.engulfT = this.frac >= ENGULF ? this.engulfT + dt : Math.max(0, this.engulfT - dt * 2);
    if (this.engulfT > 0 && Math.floor(this.engulfT * 2) !== this.lastWarn) { this.lastWarn = Math.floor(this.engulfT * 2); play('tick'); }
    if (this.engulfT >= ENGULF_TIME && this.phase !== 'engulfed') { this.phase = 'engulfed'; this.ev('engulf', 'the room (it was not fine)'); }
    this.enrageT -= dt;
    if (this.enrageT <= 0 && this.phase !== 'engulfed') {
      this.phase = 'engulfed';
      HUD.bigText('THE COFFEE IS COLD', 'and so are you', 3, 'warn');
      this.ev('engulf', 'cold coffee (enrage)');
    }
    // the extinguisher
    const carrier = this.carrier && playerById(this.carrier);
    if (this.carrier && (!carrier || !carrier.alive)) this.dropExtinguisher('dropped');
    if (carrier && carrier.alive) {
      this.sprayT = (this.sprayT || 0) - dt;
      this.carryT -= dt;
      if (this.sprayT <= 0) {
        this.sprayT = 0.2;
        this.charge -= this.douse(carrier.pos);
        if (this.charge <= 0 || this.carryT <= 0) this.dropExtinguisher('empty');
      }
    } else if (this.mount < 0) {
      this.mountT -= dt;
      if (this.mountT <= 0) {
        this.mount = Math.floor(Math.random() * this.mounts.length);
        play('chime', 2);
        HUD.bigText('🧯 EXTINGUISHER READY', `${this.mount % 2 ? 'east' : 'west'} wall`, 2, 'good');
        G.waypoint = this.mounts[this.mount].pos.clone().setY(2);
      }
    } else {
      const m = this.mounts[this.mount];
      for (const q of alivePlayers()) {
        if (distXZ(q.pos, m.pos) < 2.2 && q.pos.y < 3) {
          this.carrier = pid(q); this.charge = CHARGE; this.carryT = 40; this.mount = -1; G.waypoint = null;
          play('pickup');
          const who = q === G.player ? (G.net.active ? G.net.name : 'You') : q.name;
          HUD.bigText(`${who} grabbed the 🧯`, 'walk through the fire to put it out. no shooting while you carry it.', 2.4, 'good');
          break;
        }
      }
    }
    // adds: hot takes keep the fire going; doges keep you honest
    this.addT -= dt;
    if (this.addT <= 0) {
      this.addT = rand(4, 6.5);
      if (this.hostiles((e) => e !== b) < 6) {
        const T = weightedPick([[HotTake, this.count(HotTake) < 3 ? 4 : 0], [Doge, 3], [Stonks, 1.5]]);
        this.spawnAway(T, this.spawners, 14);
      }
    }
    // HUD
    const pct = Math.round(this.frac * 100);
    const bar = '▰'.repeat(Math.round(this.frac * 10)) + '▱'.repeat(10 - Math.round(this.frac * 10));
    const mm = Math.floor(Math.max(0, this.enrageT) / 60), ss = String(Math.floor(Math.max(0, this.enrageT) % 60)).padStart(2, '0');
    const ext = this.carrier ? `🧯 ${Math.max(0, Math.ceil(this.charge / CHARGE * 100))}% left` : this.mount >= 0 ? '🧯 extinguisher on the wall: go get it' : `🧯 next extinguisher in ${Math.ceil(this.mountT)}s`;
    const hint = this.engulfT > 0 ? `⚠ EVERYTHING IS BURNING: ${Math.max(0, ENGULF_TIME - this.engulfT).toFixed(1)}s ⚠` : b.immune ? `Let it burn to ${DENIAL_BREAKS * 100}% to break his denial.` : `DAMAGE HIM! Keep the fire under ${ENGULF * 100}%.`;
    HUD.objective(null, `🔥 FIRE ${pct}%  ${bar}\n${hint}\n${ext}\nThe coffee gets cold in ${mm}:${ss}`);
    HUD.boss(b.name, b.hp / b.maxHp, { immune: b.immune, sub: b.immune ? 'IN DENIAL: this is fine' : 'IT IS NOT FINE' });
  }
  dropExtinguisher(why) {
    this.carrier = null; this.charge = 0; this.mountT = why === 'empty' ? 6 : 4;
    HUD.bigText(why === 'empty' ? '🧯 EMPTY' : '🧯 DROPPED', 'another one is coming', 1.6, 'warn');
  }
  ev_engulf(cause) {
    play('explosion', 1.6); G.shake += 1.5;
    for (let i = 0; i < 10; i++) local(() => fx.burst(new THREE.Vector3(rand(-20, 20), 1, rand(-20, 20)), 0xff5a00, 12, 8, 0.25, 1, -4));
    HUD.bigText('EVERYTHING IS FINE', 'you are on fire', 3, 'warn');
    if (G.player.alive) { G.player.revives = 0; local(() => G.player.die(cause)); }
  }

  // ---------- co-op sync ----------
  netState() {
    return { f: String.fromCharCode(...this.fire.map((v) => 48 + v)), c: this.carrier || 0, ch: Math.round(this.charge), m: this.mount, mt: Math.round(this.mountT), ph: this.phase, e: r2(this.engulfT) };
  }
  applyNet(s) {
    if (!s) return;
    for (let i = 0; i < TILES; i++) this.fire[i] = s.f.charCodeAt(i) - 48;
    this.carrier = s.c || null; this.charge = s.ch; this.mount = s.m; this.mountT = s.mt; this.phase = s.ph; this.engulfT = s.e;
    G.waypoint = this.mount >= 0 ? this.mounts[this.mount].pos.clone().setY(2) : null;
  }

  // ---------- every machine: visuals + what your own guardian feels ----------
  drawFire(dt) {
    const f = this.field, heat = f.heat;
    f.mat.uniforms.uTime.value += dt;
    let burning = 0;
    const qh = [0, 0, 0, 0];
    // (frac is recomputed here so clients have it too)
    const c = new THREE.Color();
    for (let t = 0; t < TILES; t++) {
      const target = this.fire[t] === 1 ? 1 : (this.cineHeat && (t * 7919) % 5 < 2 ? this.cineHeat : 0);
      if (this.fire[t] === 1) { burning++; qh[(t % N < N / 2 ? 0 : 1) + (t < TILES / 2 ? 0 : 2)]++; }
      for (let k = 0; k < FLAMES_PER; k++) {
        const i = t * FLAMES_PER + k;
        heat[i] += (target - heat[i]) * Math.min(1, dt * (target > heat[i] ? 1.8 + k * 0.6 : 5));
      }
      const h = heat[t * FLAMES_PER];
      if (this.fire[t] === 2) c.setRGB(0.04, 0.12, 0.3); else c.setRGB(0.55 * h, 0.16 * h, 0.02 * h);
      f.glow.setColorAt(t, c);
    }
    f.heatAttr.needsUpdate = true; f.glow.instanceColor.needsUpdate = true;
    if (!this.won) this.frac = burning / TILES;
    const frac = Math.max(burning / TILES, this.cineHeat || 0);
    this.lights.forEach((l, i) => { l.intensity = (qh[i] / (TILES / 4)) * 32 * (0.85 + Math.random() * 0.3) + (this.cineHeat || 0) * 16; });
    if (G.scene.fog) G.scene.fog.color.copy(this.fogBase).lerp(this.fogHot, frac);
    // extinguisher mounts: the live one glows and pulses
    const T = G.time;
    this.mounts.forEach((m, i) => {
      const on = this.mount === i;
      m.ext.visible = on;
      m.tag.visible = on;
      m.light.intensity = on ? 20 + Math.sin(T * 6) * 8 : 0;
      m.beam.material.opacity = on ? 0.16 + Math.sin(T * 4) * 0.05 : 0;
    });
  }
  localUpdate(dt) {
    if (!this.host) this.t += dt;
    this.drawFire(dt);
    const p = G.player;
    // burning floor
    const ti = tileOf(p.pos.x, p.pos.z);
    const onFire = p.alive && ti >= 0 && this.fire[ti] === 1 && p.pos.y < 0.6 && !this.won;
    if (onFire) {
      p.hurt(28 * dt, 'the floor (it was, in fact, not fine)');
      this.singeT = (this.singeT || 0) - dt;
      if (this.singeT <= 0) { this.singeT = 0.6; play('sizzle'); }
    }
    if (this.won) { HUD.clearDebuff('fire'); }
    else HUD.setDebuff('fire', onFire ? '🔥 ON FIRE — get off the burning floor' : `🔥 ROOM ${Math.round(this.frac * 100)}%`, onFire || this.engulfT > 0);
    // carrying the extinguisher: no gun, spray instead
    const me = !!(this.carrier && this.carrier === G.net.myId && p.alive);
    p.carry = me ? 'extinguisher' : null;
    this.vmExt.visible = me;
    if (me) {
      this.vmExt.position.y = -0.3 + Math.sin(G.time * 30) * 0.006;
      this.hissT = (this.hissT || 0) - dt;
      if (this.hissT <= 0) { this.hissT = 0.22; play('spray'); }
    }
    if (me) HUD.setDebuff('ext', `🧯 CARRYING: walk over the fire (${Math.max(0, Math.ceil(this.charge / CHARGE * 100))}%) — can't shoot`);
    else HUD.clearDebuff('ext');
    // the spray + the tag over the carrier, for everyone
    const cq = this.carrier && playerById(this.carrier);
    this.carryTag.visible = !!(cq && cq.alive && cq !== p);
    if (cq && cq.alive) {
      if (this.carryTag.visible) this.carryTag.position.set(cq.pos.x, cq.pos.y + 2.9, cq.pos.z);
      this.sprayFx = (this.sprayFx || 0) - dt;
      if (this.sprayFx <= 0) {
        this.sprayFx = 0.06;
        const a = Math.random() * Math.PI * 2, r = rand(0.5, 3.5);
        local(() => fx.burst(new THREE.Vector3(cq.pos.x + Math.cos(a) * r, 0.4, cq.pos.z + Math.sin(a) * r), 0xf4f8ff, 3, 2.5, 0.3, 0.7, -1.5));
      }
    }
  }
  cleanup() {
    G.player.carry = null;
    G.vmCamera.remove(this.vmExt);
    G.waypoint = null;
  }
  win() {
    play('airhorn');
    HUD.hideBoss();
    HUD.bigText('THE DOG IS NO LONGER FINE', 'it is, however, deceased', 4, 'meme');
    this.ghost('He is down. And the fire... is going out? Huh. It was a metaphor all along.');
    this.ev('putOut');
    after(2.5, () => this.complete());
  }
  ev_putOut() {
    this.won = true;
    for (let i = 0; i < TILES; i++) if (this.fire[i] === 1) { this.fire[i] = 2; this.wetT[i] = 99; }
    this.carrier = null; this.mount = -1; G.waypoint = null;
  }
}

function makeExtinguisher() {
  const g = new THREE.Group();
  const red = std(0xd01818, { detail: false, roughness: 0.35, metalness: 0.3 }), black = std(0x181818, { detail: false, roughness: 0.5 }), steel = std(0xbbbbbb, { detail: false, metalness: 0.8, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 8, 16), red); body.position.y = 0; g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 12), steel); neck.position.y = 0.72; g.add(neck);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.5), black); lever.position.set(0, 0.86, 0.12); lever.rotation.x = -0.2; g.add(lever);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 16, Math.PI * 1.2), black); hose.position.set(0.2, 0.45, 0); hose.rotation.set(0, Math.PI / 2, 0.3); g.add(hose);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.3, 10), black); nozzle.position.set(0.2, 0.75, 0.3); nozzle.rotation.x = 1.2; g.add(nozzle);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), std(0xffffff, { detail: false })); label.position.set(0, 0.05, 0.285); g.add(label);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

registerNetType(FineDog, () => new FineDog(G.encounter));
registerNetType(HotTake);
