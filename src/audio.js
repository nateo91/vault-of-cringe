// All sound is synthesized with WebAudio (no files). Voices use the browser's TTS.
import { G, share } from './game.js';

let ctx = null, master, sfx, music, reverbIn, noiseBuf, distCurve;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = G.settings.volume; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(comp); comp.connect(master);
  music = ctx.createGain(); music.gain.value = 0.22; music.connect(master);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const conv = ctx.createConvolver();
  const ir = ctx.createBuffer(2, ctx.sampleRate * 2.4, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3); }
  conv.buffer = ir;
  reverbIn = ctx.createGain(); reverbIn.gain.value = 0.5;
  reverbIn.connect(conv); conv.connect(comp);
  distCurve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 6); }
}

export function setVolume(v) { if (master) master.gain.value = v; }
export function duckMusic(k) { if (music) music.gain.setTargetAtTime(0.22 * k, ctx.currentTime, 0.4); }

// While a positional sound is being built, its voices route through that sound's panner.
let dest = null, revScale = 1;
function out(node, rev) {
  node.connect(dest || sfx);
  // distant sounds get proportionally more room echo (reads as "far away")
  const r = Math.min(1, rev * revScale) + (revScale > 1 ? (revScale - 1) * 0.12 : 0);
  if (r > 0) { const g = ctx.createGain(); g.gain.value = r; node.connect(g); g.connect(reverbIn); }
}

function noise({ dur = 0.2, freq = 1000, freqEnd, q = 1, type = 'lowpass', gain = 0.5, attack = 0.002, rev = 0, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); out(g, rev);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}

function tone({ type = 'sine', freq = 440, freqEnd, dur = 0.2, gain = 0.3, attack = 0.004, rev = 0, delay = 0, dist = false, detune = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let n = o;
  if (dist) { const ws = ctx.createWaveShaper(); ws.curve = distCurve; o.connect(ws); n = ws; }
  n.connect(g); out(g, rev);
  o.start(t); o.stop(t + dur + 0.05);
}

// ---------- SFX ----------
export const sfxs = {
  // layered: transient crack + body + sub thump + room tail
  hc() {
    noise({ dur: 0.05, freq: 6000, type: 'highpass', gain: 0.9 });
    noise({ dur: 0.32, freq: 3200, freqEnd: 260, gain: 1.0, rev: 0.35 });
    tone({ freq: 95, freqEnd: 38, dur: 0.22, gain: 0.75 });
    tone({ type: 'square', freq: 160, freqEnd: 60, dur: 0.06, gain: 0.25 });
    noise({ dur: 0.9, freq: 900, freqEnd: 120, gain: 0.18, delay: 0.04, rev: 0.6 });
  },
  sg() {
    noise({ dur: 0.06, freq: 4500, type: 'highpass', gain: 1.0 });
    noise({ dur: 0.5, freq: 2200, freqEnd: 140, gain: 1.2, rev: 0.4 });
    tone({ freq: 70, freqEnd: 28, dur: 0.32, gain: 0.95 });
    noise({ dur: 1.1, freq: 700, freqEnd: 90, gain: 0.22, delay: 0.05, rev: 0.7 });
  },
  ar() { noise({ dur: 0.04, freq: 6500, type: 'highpass', gain: 0.6 }); noise({ dur: 0.16, freq: 2800, freqEnd: 400, gain: 0.6, rev: 0.2 }); tone({ freq: 120, freqEnd: 50, dur: 0.08, gain: 0.35 }); },
  pr() { noise({ dur: 0.04, freq: 5500, type: 'highpass', gain: 0.6 }); noise({ dur: 0.2, freq: 2400, freqEnd: 300, gain: 0.7, rev: 0.25 }); tone({ type: 'square', freq: 240, freqEnd: 90, dur: 0.06, gain: 0.12 }); },
  sr() { noise({ dur: 0.05, freq: 7000, type: 'highpass', gain: 0.8 }); noise({ dur: 0.35, freq: 3600, freqEnd: 300, gain: 0.9, rev: 0.4 }); tone({ freq: 140, freqEnd: 45, dur: 0.14, gain: 0.5 }); },
  sn() { noise({ dur: 0.07, freq: 8000, type: 'highpass', gain: 1.1 }); noise({ dur: 0.6, freq: 3000, freqEnd: 160, gain: 1.2, rev: 0.6 }); tone({ freq: 80, freqEnd: 28, dur: 0.45, gain: 1.0, dist: true }); noise({ dur: 1.6, freq: 800, freqEnd: 100, gain: 0.25, delay: 0.08, rev: 0.9 }); noise({ dur: 0.06, freq: 2600, type: 'bandpass', q: 6, gain: 0.35, delay: 0.5 }); },
  frCharge() { tone({ type: 'sawtooth', freq: 180, freqEnd: 1400, dur: 0.55, gain: 0.08 }); tone({ type: 'sine', freq: 400, freqEnd: 2600, dur: 0.55, gain: 0.07 }); },
  fr() { for (let i = 0; i < 7; i++) { tone({ type: 'square', freq: 900 - i * 60, freqEnd: 200, dur: 0.06, gain: 0.08, delay: i * 0.035 }); noise({ dur: 0.05, freq: 3000, type: 'bandpass', q: 2, gain: 0.35, delay: i * 0.035 }); } tone({ freq: 90, freqEnd: 40, dur: 0.3, gain: 0.5, dist: true, rev: 0.4 }); },
  mg() { noise({ dur: 0.05, freq: 5000, type: 'highpass', gain: 0.7 }); noise({ dur: 0.22, freq: 2000, freqEnd: 250, gain: 0.9, rev: 0.3 }); tone({ freq: 85, freqEnd: 35, dur: 0.14, gain: 0.7 }); },
  gl() { tone({ freq: 150, freqEnd: 60, dur: 0.18, gain: 0.8 }); noise({ dur: 0.25, freq: 900, freqEnd: 200, type: 'bandpass', q: 0.8, gain: 0.7 }); noise({ dur: 0.06, freq: 3000, type: 'bandpass', q: 5, gain: 0.3, delay: 0.3 }); },
  // the boss-intro stinger: a low brass-ish swell, a hit, and a long tail
  bossSting() {
    [55, 82.4, 110, 130.8].forEach((f, i) => { tone({ type: 'sawtooth', freq: f, dur: 3.2, gain: 0.07, attack: 1.2, rev: 0.6, dist: i === 0 }); });
    tone({ freq: 70, freqEnd: 30, dur: 2, gain: 0.8, delay: 1.25, dist: true, rev: 0.8 });
    noise({ dur: 1.6, freq: 2000, freqEnd: 120, gain: 0.7, delay: 1.25, rev: 0.9 });
  },
  impostor() {
    for (const [d, f] of [[0, 62], [0.55, 58]]) {
      tone({ freq: f, freqEnd: f * 0.6, dur: 0.9, gain: 0.9, delay: d, dist: true, rev: 0.7 });
      noise({ dur: 0.5, freq: 900, freqEnd: 80, gain: 0.8, delay: d, rev: 0.8 });
      tone({ type: 'sawtooth', freq: f * 2, dur: 0.7, gain: 0.08, delay: d, rev: 0.6 });
    }
    tone({ type: 'square', freq: 300, freqEnd: 1200, dur: 1.2, gain: 0.05, delay: 1.1, rev: 0.5 });
  },
  rumble(dur = 2.5) { noise({ dur, freq: 140, type: 'lowpass', gain: 0.9, attack: 0.6, rev: 0.4 }); tone({ freq: 38, freqEnd: 32, dur, gain: 0.5, attack: 0.6 }); },
  engram() { [523, 784, 1046, 1568].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.4, gain: 0.12, delay: i * 0.08, rev: 0.5 })); },
  exotic() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.6, gain: 0.14, delay: i * 0.09, rev: 0.7 })); },
  pump() { noise({ dur: 0.07, freq: 1800, type: 'bandpass', q: 3, gain: 0.45 }); noise({ dur: 0.08, freq: 1200, type: 'bandpass', q: 3, gain: 0.5, delay: 0.12 }); },
  shellIn() { noise({ dur: 0.05, freq: 2600, type: 'bandpass', q: 5, gain: 0.35 }); tone({ type: 'triangle', freq: 420, dur: 0.04, gain: 0.08 }); },
  hcOpen() { noise({ dur: 0.06, freq: 3000, type: 'bandpass', q: 6, gain: 0.4 }); tone({ type: 'triangle', freq: 900, freqEnd: 600, dur: 0.08, gain: 0.08 }); },
  hcClose() { noise({ dur: 0.05, freq: 2200, type: 'bandpass', q: 5, gain: 0.5 }); tone({ type: 'triangle', freq: 500, dur: 0.05, gain: 0.1 }); noise({ dur: 0.05, freq: 3500, type: 'bandpass', q: 8, gain: 0.3, delay: 0.12 }); },
  rlLoad() { noise({ dur: 0.18, freq: 600, freqEnd: 1600, type: 'bandpass', q: 2, gain: 0.5 }); tone({ type: 'square', freq: 130, dur: 0.06, gain: 0.15, delay: 0.2 }); },
  clink() { tone({ type: 'triangle', freq: 2400 + Math.random() * 1200, dur: 0.06, gain: 0.05 }); },
  step() { noise({ dur: 0.07, freq: 380 + Math.random() * 120, type: 'lowpass', gain: 0.16 }); },
  dry() { noise({ dur: 0.03, freq: 4000, type: 'bandpass', q: 8, gain: 0.3 }); },
  slide() { noise({ dur: 0.5, freq: 900, freqEnd: 300, type: 'bandpass', q: 0.7, gain: 0.25 }); },
  land(k = 1) { noise({ dur: 0.12, freq: 300, type: 'lowpass', gain: 0.3 * k }); tone({ freq: 70, freqEnd: 40, dur: 0.1, gain: 0.2 * k }); },
  rl() { noise({ dur: 0.7, freq: 900, freqEnd: 150, type: 'bandpass', q: 0.8, gain: 0.9 }); tone({ type: 'sawtooth', freq: 220, freqEnd: 60, dur: 0.4, gain: 0.25 }); },
  gg() { noise({ dur: 0.5, freq: 5000, freqEnd: 200, gain: 1.1, rev: 0.6 }); tone({ type: 'sawtooth', freq: 600, freqEnd: 80, dur: 0.35, gain: 0.3, dist: true }); },
  explosion(big = 1) { noise({ dur: 1.0 * big, freq: 1800, freqEnd: 50, gain: 1.2, rev: 0.6 }); tone({ freq: 70, freqEnd: 22, dur: 0.9 * big, gain: 0.9, dist: true }); },
  hit() { tone({ type: 'triangle', freq: 1100, dur: 0.05, gain: 0.12 }); },
  crit() { tone({ freq: 2100, dur: 0.12, gain: 0.2 }); tone({ freq: 3150, dur: 0.1, gain: 0.1, delay: 0.005 }); tone({ type: 'triangle', freq: 1400, dur: 0.05, gain: 0.08 }); },
  kill() { tone({ type: 'triangle', freq: 300, freqEnd: 120, dur: 0.2, gain: 0.18 }); noise({ dur: 0.35, freq: 1500, freqEnd: 5000, type: 'bandpass', q: 1.5, gain: 0.18 }); },
  enemyShot() { tone({ type: 'square', freq: 900, freqEnd: 300, dur: 0.12, gain: 0.05 }); },
  laser() { tone({ type: 'sawtooth', freq: 1400, freqEnd: 500, dur: 0.15, gain: 0.05 }); },
  hurt() { noise({ dur: 0.18, freq: 600, gain: 0.5 }); tone({ type: 'square', freq: 120, freqEnd: 70, dur: 0.12, gain: 0.12 }); },
  shieldBreak() { noise({ dur: 0.35, freq: 3500, type: 'highpass', gain: 0.5 }); tone({ freq: 1500, freqEnd: 300, dur: 0.3, gain: 0.15 }); },
  pickup() { tone({ freq: 700, freqEnd: 1400, dur: 0.12, gain: 0.15 }); },
  orb() { tone({ type: 'triangle', freq: 900, dur: 0.1, gain: 0.12 }); tone({ type: 'triangle', freq: 1350, dur: 0.12, gain: 0.1, delay: 0.06 }); },
  jump() { tone({ type: 'sine', freq: 200, freqEnd: 360, dur: 0.1, gain: 0.07 }); },
  reload() { noise({ dur: 0.06, freq: 2500, type: 'bandpass', q: 4, gain: 0.25 }); noise({ dur: 0.06, freq: 1800, type: 'bandpass', q: 4, gain: 0.25, delay: 0.18 }); },
  click() { noise({ dur: 0.03, freq: 3000, type: 'bandpass', q: 6, gain: 0.2 }); },
  spawn() { tone({ type: 'sawtooth', freq: 80, freqEnd: 400, dur: 0.4, gain: 0.08, rev: 0.4 }); },
  superReady() { [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.25, gain: 0.12, delay: i * 0.07 })); },
  superCast() { tone({ type: 'sawtooth', freq: 110, freqEnd: 880, dur: 0.6, gain: 0.2, dist: true, rev: 0.5 }); noise({ dur: 0.8, freq: 300, freqEnd: 5000, type: 'bandpass', gain: 0.5, rev: 0.5 }); },
  // The holy vine boom: deep distorted sine drop + thump + big reverb
  vineBoom(pitch = 1) {
    tone({ freq: 92 * pitch, freqEnd: 34 * pitch, dur: 1.5, gain: 1.0, dist: true, rev: 0.9 });
    tone({ freq: 184 * pitch, freqEnd: 60 * pitch, dur: 0.5, gain: 0.35, rev: 0.5 });
    noise({ dur: 0.35, freq: 500, freqEnd: 60, gain: 1.0, rev: 0.7 });
  },
  airhorn() {
    [0, 0.17, 0.34, 0.55].forEach((d, i) => {
      const dur = i === 3 ? 0.7 : 0.13;
      [466, 587, 698].forEach((f) => tone({ type: 'sawtooth', freq: f, dur, gain: 0.07, delay: d, dist: true }));
    });
  },
  bonk() { tone({ type: 'square', freq: 420, freqEnd: 180, dur: 0.12, gain: 0.25 }); tone({ freq: 900, dur: 0.06, gain: 0.3 }); noise({ dur: 0.05, freq: 2500, type: 'bandpass', q: 2, gain: 0.4 }); },
  bigBonk() { tone({ type: 'square', freq: 260, freqEnd: 60, dur: 0.6, gain: 0.6, dist: true, rev: 0.8 }); noise({ dur: 0.4, freq: 1500, freqEnd: 80, gain: 1.2, rev: 0.8 }); },
  bark() { tone({ type: 'sawtooth', freq: 650, freqEnd: 380, dur: 0.09, gain: 0.08 }); },
  stab() { noise({ dur: 0.25, freq: 900, freqEnd: 200, type: 'bandpass', q: 2, gain: 0.8 }); tone({ type: 'sawtooth', freq: 300, freqEnd: 50, dur: 0.3, gain: 0.25, dist: true }); },
  vent() { noise({ dur: 0.5, freq: 400, freqEnd: 2000, type: 'bandpass', q: 5, gain: 0.5, rev: 0.4 }); tone({ type: 'square', freq: 150, dur: 0.06, gain: 0.15, delay: 0.1 }); tone({ type: 'square', freq: 120, dur: 0.06, gain: 0.15, delay: 0.3 }); },
  alarm() { for (let i = 0; i < 4; i++) { tone({ type: 'square', freq: 880, dur: 0.18, gain: 0.08, delay: i * 0.4 }); tone({ type: 'square', freq: 620, dur: 0.18, gain: 0.08, delay: i * 0.4 + 0.2 }); } },
  wrong() { tone({ type: 'sawtooth', freq: 140, dur: 0.5, gain: 0.25, dist: true }); tone({ type: 'sawtooth', freq: 147, dur: 0.5, gain: 0.2, dist: true }); },
  correct() { tone({ type: 'triangle', freq: 880, dur: 0.12, gain: 0.15 }); tone({ type: 'triangle', freq: 1320, dur: 0.2, gain: 0.15, delay: 0.08 }); },
  tick() { tone({ freq: 1000, dur: 0.06, gain: 0.12 }); },
  flush() { noise({ dur: 2.5, freq: 300, freqEnd: 3000, type: 'bandpass', q: 1, gain: 0.9, rev: 0.8 }); noise({ dur: 2.0, freq: 2000, freqEnd: 200, type: 'lowpass', gain: 0.6, delay: 0.8, rev: 0.5 }); },
  fanfare() { [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ type: 'square', freq: f, dur: 0.22, gain: 0.07, delay: i * 0.12, rev: 0.3 })); },
  wipe() { [392, 370, 349, 330].forEach((f, i) => tone({ type: 'sawtooth', freq: f, freqEnd: f * 0.97, dur: i === 3 ? 1.2 : 0.4, gain: 0.12, delay: i * 0.42, rev: 0.4 })); },
  sus() { tone({ type: 'square', freq: 300, freqEnd: 900, dur: 0.15, gain: 0.08 }); tone({ type: 'square', freq: 900, freqEnd: 300, dur: 0.15, gain: 0.08, delay: 0.16 }); },
  chime(i = 0) { const f = [523, 659, 784, 988][i % 4]; tone({ type: 'triangle', freq: f, dur: 0.3, gain: 0.15, rev: 0.4 }); },
};

export function play(name, ...args) { share(['snd', name, args]); if (ctx && sfxs[name]) sfxs[name](...args); }

// ---------- 3D sound ----------
// A sound that happens somewhere in the world: panned with HRTF (front/back/up/down), quieter with distance,
// duller with distance (air absorbs highs), and wetter with distance.
const lis = { x: 0, y: 0, z: 0 };
export function playAt(pos, name, ...args) {
  const x = pos.x ?? pos[0], y = pos.y ?? pos[1], z = pos.z ?? pos[2];
  share(['snd3', [+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)], name, args]);
  if (!ctx || !sfxs[name]) return;
  const d = Math.hypot(x - lis.x, y - lis.y, z - lis.z);
  if (d > 220) return;
  const panner = ctx.createPanner();
  panner.panningModel = G.settings.quality === 'low' ? 'equalpower' : 'HRTF';
  panner.distanceModel = 'inverse'; panner.refDistance = 5; panner.rolloffFactor = 1.15; panner.maxDistance = 250;
  if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; } else panner.setPosition(x, y, z);
  const air = ctx.createBiquadFilter();
  air.type = 'lowpass'; air.frequency.value = Math.max(900, 20000 * Math.exp(-d / 40)); air.Q.value = 0.5;
  air.connect(panner); panner.connect(sfx);
  const pd = dest, pr = revScale;
  dest = air; revScale = 1 + Math.min(2.5, d / 25);
  try { sfxs[name](...args); } finally { dest = pd; revScale = pr; }
  setTimeout(() => { air.disconnect(); panner.disconnect(); }, 3500);
}
// Called every frame with the camera: the listener is your head.
export function updateListener(cam) {
  if (!ctx) return;
  const e = cam.matrixWorld.elements, L = ctx.listener;
  lis.x = e[12]; lis.y = e[13]; lis.z = e[14];
  const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
  if (L.positionX) {
    const t = ctx.currentTime;
    L.positionX.setTargetAtTime(lis.x, t, 0.02); L.positionY.setTargetAtTime(lis.y, t, 0.02); L.positionZ.setTargetAtTime(lis.z, t, 0.02);
    L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(fy, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02);
    L.upX.setTargetAtTime(ux, t, 0.02); L.upY.setTargetAtTime(uy, t, 0.02); L.upZ.setTargetAtTime(uz, t, 0.02);
  } else { L.setPosition(lis.x, lis.y, lis.z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
}

// ---------- Text to speech ----------
let lastVoice = 0;
export function say(text, voice = 'ghost', interrupt = true) {
  share(['say', text, voice, interrupt]);
  if (!G.settings.voice || !window.speechSynthesis) return;
  const now = performance.now();
  if (!interrupt && speechSynthesis.speaking) return;
  if (interrupt) speechSynthesis.cancel();
  lastVoice = now;
  const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,!?'-]/gu, ''));
  u.volume = Math.min(1, G.settings.volume * 1.4);
  if (voice === 'ghost') { u.pitch = 1.55; u.rate = 1.12; }
  else if (voice === 'boss') { u.pitch = 0.05; u.rate = 0.72; }
  else if (voice === 'bruh') { u.pitch = 0.4; u.rate = 0.8; }
  else if (voice === 'hype') { u.pitch = 1.9; u.rate = 1.35; }
  speechSynthesis.speak(u);
}

// ---------- Procedural music ----------
let musicTimer = null, nextNote = 0, step = 0, level = 1, musicBus = null;
const BASS = [0, 0, 12, 0, 3, 0, 7, 5, 0, 0, 12, 0, 10, 8, 7, 3];
const LEAD = [12, 15, 19, 15, 24, 19, 15, 19, 12, 15, 22, 15, 20, 19, 15, 12];

export function startMusic(lvl) {
  stopMusic();
  if (!ctx || !G.settings.music) return;
  level = lvl;
  musicBus = ctx.createGain(); musicBus.gain.value = 1;
  if (lvl >= 5) { const ws = ctx.createWaveShaper(); ws.curve = distCurve; musicBus.connect(ws); ws.connect(music); }
  else musicBus.connect(music);
  nextNote = ctx.currentTime + 0.1; step = 0;
  musicTimer = setInterval(schedule, 25);
}
export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (musicBus) { const b = musicBus; setTimeout(() => b.disconnect(), 400); musicBus = null; }
}
function schedule() {
  if (!ctx || !musicBus) return;
  if (G.paused || G.state !== 'playing') { nextNote = ctx.currentTime + 0.05; return; }
  const bpm = 92 + level * 10;
  const spb = 60 / bpm / 4;
  while (nextNote < ctx.currentTime + 0.12) { playStep(step, nextNote); nextNote += spb; step = (step + 1) % 64; }
}
function mtone(t, type, freq, dur, gain, freqEnd) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.02);
}
function mnoise(t, dur, gain, freq, type = 'highpass') {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}
function playStep(s, t) {
  const root = level >= 4 ? 49 : 55; // drops a semitone when it gets cursed
  if (s % 4 === 0) mtone(t, 'sine', 150, 0.25, 0.9, 40);
  if (s % 2 === 1) mnoise(t, 0.04, 0.15, 7000);
  if (level >= 2 && s % 8 === 4) mnoise(t, 0.18, 0.5, 1500, 'bandpass');
  if (s % 2 === 0) { const n = BASS[(s / 2) % 16]; mtone(t, 'sawtooth', root * Math.pow(2, n / 12), 0.18, 0.18); }
  if (level >= 3 && s % 2 === 0 && Math.floor(s / 32) % 2 === 1) { const n = LEAD[(s / 2) % 16]; mtone(t, 'square', root * 4 * Math.pow(2, n / 12), 0.12, 0.05); }
  if (level >= 4 && s % 16 === 0) mtone(t, 'sine', 92, 1.0, 0.6, 34); // a little vine boom in the beat. why not.
}
