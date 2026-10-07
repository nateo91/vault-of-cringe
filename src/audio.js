// All sound is synthesized with WebAudio (no files). Voices use the browser's TTS.
import { G, share } from './game.js';

let ctx = null, master, sfx, music, reverbIn, noiseBuf, ambBuf, distCurve, comp, shell, conv = null, reverbOut, amb = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = G.settings.volume; master.connect(ctx.destination);
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  // sfx -> "shell shock" lowpass (wide open unless something blew up next to you) -> glue compressor
  shell = ctx.createBiquadFilter(); shell.type = 'lowpass'; shell.frequency.value = 20000; shell.Q.value = 0.6;
  sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(shell); shell.connect(comp); comp.connect(master);
  music = ctx.createGain(); music.gain.value = 0.22; music.connect(master);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // longer, separate noise for looping ambience beds (a 2 s loop would be audible)
  ambBuf = ctx.createBuffer(2, ctx.sampleRate * 7, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const ch = ambBuf.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
  reverbIn = ctx.createGain(); reverbIn.gain.value = 0.5;
  reverbOut = ctx.createGain(); reverbOut.connect(shell);
  setRoom(pendingRoom || 'hall');
  if (pendingAmb) setAmbience(pendingAmb);
  distCurve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 6); }
}

export function setVolume(v) { if (master) master.gain.value = v; }

// ---------- rooms: every arena gets its own synthesized impulse response ----------
// decay = RT60 seconds, size scales the early reflections, damp = how fast highs die (stone vs carpet),
// wet = how much room you hear, slap = discrete late echoes off far walls/cliffs (outdoors).
const ROOMS = {
  hall: { decay: 2.2, size: 1, damp: 3, wet: 0.5 },
  outdoor: { decay: 1.6, size: 2.5, damp: 5, wet: 0.32, slap: [0.32, 0.55] },
  courtyard: { decay: 2.4, size: 2, damp: 3.5, wet: 0.45, slap: [0.22] },
  ship: { decay: 1.1, size: 0.6, damp: 1.6, wet: 0.5 },
  temple: { decay: 4.2, size: 2.2, damp: 1.8, wet: 0.65 },
  livingroom: { decay: 0.7, size: 0.4, damp: 7, wet: 0.35 },
  void: { decay: 5.5, size: 3, damp: 1.2, wet: 0.6, slap: [0.41, 0.83] },
};
let pendingRoom = null, pendingAmb = null;
export function setRoom(name) {
  pendingRoom = name;
  if (!ctx) return;
  const R = ROOMS[name] || ROOMS.hall, sr = ctx.sampleRate;
  const len = Math.floor(sr * Math.min(6, R.decay * 1.2 + 0.2));
  const ir = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.008 * R.size);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      // exponential decay to -60 dB at RT60, highs dying faster (a one-pole lowpass closing over time)
      const a = Math.max(0.03, Math.exp(-t * R.damp));
      y += a * ((Math.random() * 2 - 1) - y);
      ch[i] = y * Math.exp(-6.9 * t / R.decay) * (1.2 - a * 0.4);
    }
    // early reflections: a cluster of discrete taps, different in each ear
    for (let k = 0; k < 14; k++) {
      const t = pre / sr + (0.004 + Math.random() * 0.07) * R.size;
      const i = Math.floor(t * sr);
      if (i < len) ch[i] += (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.45) * Math.exp(-t * 8);
    }
    // late slap echoes off something far away
    for (const sl of R.slap || []) {
      const i = Math.floor((sl + c * 0.013) * sr);
      for (let j = 0; j < sr * 0.03 && i + j < len; j++) ch[i + j] += (Math.random() * 2 - 1) * 0.25 * Math.exp(-j / (sr * 0.008));
    }
  }
  const old = conv;
  conv = ctx.createConvolver();
  conv.buffer = ir;
  reverbIn.connect(conv); conv.connect(reverbOut);
  reverbOut.gain.setTargetAtTime(R.wet * 1.6, ctx.currentTime, 0.1);
  if (old) { try { reverbIn.disconnect(old); } catch (e) { /* already gone */ } setTimeout(() => old.disconnect(), 6000); }
}

// ---------- ambience beds: a quiet, never-repeating background for each arena ----------
export function setAmbience(kind) {
  pendingAmb = kind;
  if (!ctx) return;
  if (amb) { const o = amb; o.out.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => { o.stop(); o.out.disconnect(); }, 3000); amb = null; }
  if (!kind) return;
  const t = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  out.gain.setTargetAtTime(1, t, 1.2);
  const nodes = [], timers = [];
  const src = (rate = 1) => { const s = ctx.createBufferSource(); s.buffer = ambBuf; s.loop = true; s.playbackRate.value = rate; s.start(t, Math.random() * 6); nodes.push(s); return s; };
  const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  const lfo = (rate, depth, param, base) => { const o = ctx.createOscillator(); o.frequency.value = rate; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(param); if (base !== undefined) param.value = base; o.start(t); nodes.push(o); };
  const osc = (type, f, level) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = level; o.connect(g); o.start(t); nodes.push(o); return g; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const wind = (level, f = 380) => {
    const g = gain(level), bp = filt('bandpass', f, 0.5);
    chain(src(0.6), bp, g, out); lfo(0.05 + Math.random() * 0.04, level * 0.7, g.gain, level); lfo(0.08, f * 0.4, bp.frequency, f);
    // a thin whistle that comes and goes
    const wg = gain(0), wf = filt('bandpass', f * 4.5, 14); chain(src(0.9), wf, wg, out); lfo(0.031, level * 0.25, wg.gain, 0); lfo(0.07, 300, wf.frequency, f * 4.5);
  };
  // occasional one-shots (crackles, beeps, distant thuds) on a jittered timer
  const every = (min, max, fn) => { const go = () => { timers.push(setTimeout(() => { if (amb?.out === out) { fn(ctx.currentTime); go(); } }, (min + Math.random() * (max - min)) * 1000)); }; go(); };
  const blip = (when, { f = 2000, q = 4, dur = 0.03, g = 0.08, type = 'bandpass' } = {}) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const bf = filt(type, f, q); const gg = ctx.createGain();
    gg.gain.setValueAtTime(g, when); gg.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    chain(s, bf, gg, out); s.start(when, Math.random()); s.stop(when + dur + 0.02);
  };
  if (kind === 'outdoor') { wind(0.09, 320); every(6, 14, (w) => blip(w, { f: 90, q: 0.7, dur: 1.4, g: 0.05, type: 'lowpass' })); }
  else if (kind === 'courtyard') { wind(0.06, 450); every(3, 8, (w) => blip(w, { f: 3200, q: 6, dur: 0.05, g: 0.02 })); }
  else if (kind === 'ship') {
    // engine hum, air recyclers, the odd console beep
    chain(osc('sawtooth', 48, 0.05), filt('lowpass', 140), out); chain(osc('sine', 96, 0.025), out);
    const v = gain(0.035); chain(src(1), filt('bandpass', 700, 0.8), v, out); lfo(0.2, 0.01, v.gain, 0.035);
    every(5, 12, (w) => { const g = osc('sine', 1400 + Math.floor(Math.random() * 3) * 300, 0); chain(g, out); g.gain.setValueAtTime(0.03, w); g.gain.setValueAtTime(0, w + 0.08); });
  } else if (kind === 'temple') {
    // a deep, slowly beating drone + stone wind
    const trem = gain(1); trem.connect(out);
    osc('sine', 55, 0.05).connect(trem); osc('sine', 82.6, 0.035).connect(trem); osc('triangle', 110.3, 0.012).connect(trem);
    lfo(0.11, 0.3, trem.gain, 0.8);
    wind(0.045, 260);
  } else if (kind === 'livingroom') {
    // a room on fire: low roar, crackles and pops
    const roar = gain(0.08); chain(src(0.5), filt('lowpass', 520), roar, out); lfo(0.4, 0.035, roar.gain, 0.08);
    every(0.05, 0.35, (w) => blip(w, { f: 1500 + Math.random() * 3500, q: 2, dur: 0.012 + Math.random() * 0.02, g: 0.04 + Math.random() * 0.08 }));
    every(2, 6, (w) => blip(w, { f: 260, q: 1.5, dur: 0.18, g: 0.12 }));
  } else if (kind === 'void') {
    // Ohio: two detuned saws beating against each other, a filter that wanders, rushing wind
    const lp = filt('lowpass', 240, 2); lp.connect(out);
    osc('sawtooth', 36.7, 0.04).connect(lp);
    const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 37.3; const bg = gain(0.04); b.connect(bg); bg.connect(lp); b.start(t); nodes.push(b);
    lfo(0.07, 120, lp.frequency, 240); lfo(0.13, 0.6, b.frequency, 37.3);
    wind(0.07, 600);
  }
  amb = { out, stop: () => { nodes.forEach((n) => { try { n.stop(); } catch (e) { /* noop */ } }); timers.forEach(clearTimeout); } };
}

// ---------- concussion: a blast right next to you muffles the world and leaves a ringing ----------
export function concuss(k = 1) {
  if (!ctx || k <= 0) return;
  const t = ctx.currentTime;
  shell.frequency.cancelScheduledValues(t);
  shell.frequency.setValueAtTime(Math.max(350, 1400 - k * 1000), t);
  shell.frequency.exponentialRampToValueAtTime(20000, t + 0.6 + k * 1.4);
  const o = ctx.createOscillator(); o.frequency.value = 3700 + Math.random() * 400;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035 * k, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2 + k * 1.3);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 3);
  duckMusic(0.35); setTimeout(() => duckMusic(1), 1200 + k * 1200);
}

export function duckMusic(k) { if (music) music.gain.setTargetAtTime(0.22 * k, ctx.currentTime, 0.4); }

// While a positional sound is being built, its voices route through that sound's panner.
let dest = null, revScale = 1;
function out(node, rev) {
  node.connect(dest || sfx);
  // distant sounds get proportionally more room echo (reads as "far away")
  const r = Math.min(1, rev * revScale) + (revScale > 1 ? (revScale - 1) * 0.12 : 0);
  if (r > 0) { const g = ctx.createGain(); g.gain.value = r; node.connect(g); g.connect(reverbIn); }
}

// Per-shot humanising: while a gun sound is built, every filter/pitch is nudged by the same small random factor.
let jit = 1;
// out() with an optional stereo position (for wide room tails on your own gun)
function outPan(node, rev, pan) {
  if (!pan) return out(node, rev);
  const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); out(p, rev);
}
function noise({ dur = 0.2, freq = 1000, freqEnd, q = 1, type = 'lowpass', gain = 0.5, attack = 0.002, rev = 0, delay = 0, pan = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  freq *= jit; if (freqEnd) freqEnd *= jit;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); outPan(g, rev, pan);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}

function tone({ type = 'sine', freq = 440, freqEnd, dur = 0.2, gain = 0.3, attack = 0.004, rev = 0, delay = 0, dist = false, detune = 0, pan = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  freq *= jit; if (freqEnd) freqEnd *= jit;
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let n = o;
  if (dist) { const ws = ctx.createWaveShaper(); ws.curve = distCurve; o.connect(ws); n = ws; }
  n.connect(g); outPan(g, rev, pan);
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
    noise({ dur: 0.9, freq: 900, freqEnd: 120, gain: 0.12, delay: 0.04, rev: 0.6, pan: -0.55 });
    noise({ dur: 0.9, freq: 820, freqEnd: 110, gain: 0.12, delay: 0.06, rev: 0.6, pan: 0.55 });
    noise({ dur: 0.03, freq: 3200, q: 8, type: 'bandpass', gain: 0.12, delay: 0.09 }); // hammer back
  },
  sg() {
    noise({ dur: 0.06, freq: 4500, type: 'highpass', gain: 1.0 });
    noise({ dur: 0.5, freq: 2200, freqEnd: 140, gain: 1.2, rev: 0.4 });
    tone({ freq: 70, freqEnd: 28, dur: 0.32, gain: 0.95 });
    noise({ dur: 1.1, freq: 700, freqEnd: 90, gain: 0.15, delay: 0.05, rev: 0.7, pan: -0.6 });
    noise({ dur: 1.1, freq: 640, freqEnd: 85, gain: 0.15, delay: 0.07, rev: 0.7, pan: 0.6 });
  },
  ar() {
    noise({ dur: 0.04, freq: 6500, type: 'highpass', gain: 0.6 }); noise({ dur: 0.16, freq: 2800, freqEnd: 400, gain: 0.6, rev: 0.2 }); tone({ freq: 120, freqEnd: 50, dur: 0.08, gain: 0.35 });
    noise({ dur: 0.02, freq: 4200, q: 6, type: 'bandpass', gain: 0.08, delay: 0.045 }); // bolt cycling
    noise({ dur: 0.35, freq: 900, freqEnd: 200, gain: 0.05, delay: 0.03, rev: 0.4, pan: Math.random() < 0.5 ? -0.5 : 0.5 });
  },
  pr() { noise({ dur: 0.04, freq: 5500, type: 'highpass', gain: 0.6 }); noise({ dur: 0.2, freq: 2400, freqEnd: 300, gain: 0.7, rev: 0.25 }); tone({ type: 'square', freq: 240, freqEnd: 90, dur: 0.06, gain: 0.12 }); },
  sr() {
    noise({ dur: 0.05, freq: 7000, type: 'highpass', gain: 0.8 }); noise({ dur: 0.35, freq: 3600, freqEnd: 300, gain: 0.9, rev: 0.4 }); tone({ freq: 140, freqEnd: 45, dur: 0.14, gain: 0.5 });
    noise({ dur: 0.6, freq: 1100, freqEnd: 150, gain: 0.08, delay: 0.05, rev: 0.6, pan: -0.5 }); noise({ dur: 0.6, freq: 1000, freqEnd: 140, gain: 0.08, delay: 0.07, rev: 0.6, pan: 0.5 });
    noise({ dur: 0.025, freq: 3600, q: 7, type: 'bandpass', gain: 0.1, delay: 0.12 }); // action
  },
  sn() { noise({ dur: 0.07, freq: 8000, type: 'highpass', gain: 1.1 }); noise({ dur: 0.6, freq: 3000, freqEnd: 160, gain: 1.2, rev: 0.6 }); tone({ freq: 80, freqEnd: 28, dur: 0.45, gain: 1.0, dist: true }); noise({ dur: 1.6, freq: 800, freqEnd: 100, gain: 0.25, delay: 0.08, rev: 0.9 }); noise({ dur: 0.06, freq: 2600, type: 'bandpass', q: 6, gain: 0.35, delay: 0.5 }); },
  frCharge() { tone({ type: 'sawtooth', freq: 180, freqEnd: 1400, dur: 0.55, gain: 0.08 }); tone({ type: 'sine', freq: 400, freqEnd: 2600, dur: 0.55, gain: 0.07 }); },
  fr() { for (let i = 0; i < 7; i++) { tone({ type: 'square', freq: 900 - i * 60, freqEnd: 200, dur: 0.06, gain: 0.08, delay: i * 0.035 }); noise({ dur: 0.05, freq: 3000, type: 'bandpass', q: 2, gain: 0.35, delay: i * 0.035 }); } tone({ freq: 90, freqEnd: 40, dur: 0.3, gain: 0.5, dist: true, rev: 0.4 }); },
  mg() {
    noise({ dur: 0.05, freq: 5000, type: 'highpass', gain: 0.7 }); noise({ dur: 0.22, freq: 2000, freqEnd: 250, gain: 0.9, rev: 0.3 }); tone({ freq: 85, freqEnd: 35, dur: 0.14, gain: 0.7 });
    noise({ dur: 0.02, freq: 2600, q: 5, type: 'bandpass', gain: 0.1, delay: 0.05 }); // belt link
    noise({ dur: 0.5, freq: 800, freqEnd: 150, gain: 0.07, delay: 0.03, rev: 0.5, pan: Math.random() < 0.5 ? -0.55 : 0.55 });
  },
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
  // footsteps by floor: stone scuffs, metal clanks, wood knocks, tile clicks (alternating feet, slightly panned)
  step(surface = 'stone', side = 1) {
    const pan = side * 0.18, r = Math.random();
    if (surface === 'metal') {
      noise({ dur: 0.05, freq: 1700 + r * 500, q: 3, type: 'bandpass', gain: 0.12, pan });
      tone({ type: 'triangle', freq: 380 + r * 90, freqEnd: 320, dur: 0.12, gain: 0.035, pan, rev: 0.2 });
      noise({ dur: 0.08, freq: 300, type: 'lowpass', gain: 0.12, pan });
    } else if (surface === 'wood') {
      tone({ freq: 150 + r * 30, freqEnd: 90, dur: 0.09, gain: 0.16, pan });
      noise({ dur: 0.05, freq: 650 + r * 200, q: 2, type: 'bandpass', gain: 0.12, pan });
    } else if (surface === 'tile') {
      noise({ dur: 0.025, freq: 3200 + r * 800, q: 3, type: 'bandpass', gain: 0.1, pan });
      noise({ dur: 0.06, freq: 450, type: 'lowpass', gain: 0.12, pan });
    } else {
      noise({ dur: 0.07, freq: 380 + r * 120, type: 'lowpass', gain: 0.16, pan });
      noise({ dur: 0.04, freq: 4500, type: 'highpass', gain: 0.03 + r * 0.02, pan, delay: 0.01 }); // grit
    }
  },
  dry() { noise({ dur: 0.03, freq: 4000, type: 'bandpass', q: 8, gain: 0.3 }); },
  slide() { noise({ dur: 0.5, freq: 900, freqEnd: 300, type: 'bandpass', q: 0.7, gain: 0.25 }); },
  land(k = 1, surface = 'stone') {
    noise({ dur: 0.12, freq: 300, type: 'lowpass', gain: 0.3 * k }); tone({ freq: 70, freqEnd: 40, dur: 0.1, gain: 0.2 * k });
    if (surface === 'metal') tone({ type: 'triangle', freq: 260, freqEnd: 200, dur: 0.3, gain: 0.06 * k, rev: 0.3 });
    else if (surface === 'wood') tone({ freq: 120, freqEnd: 70, dur: 0.15, gain: 0.2 * k });
    else if (surface === 'tile') noise({ dur: 0.03, freq: 3000, q: 3, type: 'bandpass', gain: 0.12 * k });
  },
  rl() { noise({ dur: 0.7, freq: 900, freqEnd: 150, type: 'bandpass', q: 0.8, gain: 0.9 }); tone({ type: 'sawtooth', freq: 220, freqEnd: 60, dur: 0.4, gain: 0.25 }); },
  gg() { noise({ dur: 0.5, freq: 5000, freqEnd: 200, gain: 1.1, rev: 0.6 }); tone({ type: 'sawtooth', freq: 600, freqEnd: 80, dur: 0.35, gain: 0.3, dist: true }); },
  explosion(big = 1) {
    noise({ dur: 0.08, freq: 5000, type: 'highpass', gain: 0.9 });                      // the crack
    noise({ dur: 1.0 * big, freq: 1800, freqEnd: 50, gain: 1.2, rev: 0.6 });             // the body
    tone({ freq: 70, freqEnd: 22, dur: 0.9 * big, gain: 0.9, dist: true });              // the thump you feel
    tone({ type: 'sine', freq: 46, freqEnd: 28, dur: 1.4 * big, gain: 0.45, attack: 0.02 });
    for (let i = 0; i < 6; i++) noise({ dur: 0.04, freq: 1500 + Math.random() * 2500, q: 3, type: 'bandpass', gain: 0.12, delay: 0.25 + Math.random() * 0.7, rev: 0.4 }); // debris rattle
  },
  hit() { tone({ type: 'triangle', freq: 1100, dur: 0.05, gain: 0.12 }); },
  crit() { tone({ freq: 2100, dur: 0.12, gain: 0.2 }); tone({ freq: 3150, dur: 0.1, gain: 0.1, delay: 0.005 }); tone({ type: 'triangle', freq: 1400, dur: 0.05, gain: 0.08 }); },
  kill() { tone({ type: 'triangle', freq: 300, freqEnd: 120, dur: 0.2, gain: 0.18 }); noise({ dur: 0.35, freq: 1500, freqEnd: 5000, type: 'bandpass', q: 1.5, gain: 0.18 }); },
  enemyShot() { tone({ type: 'square', freq: 900, freqEnd: 300, dur: 0.12, gain: 0.05 }); },
  laser() { tone({ type: 'sawtooth', freq: 1400, freqEnd: 500, dur: 0.15, gain: 0.05 }); },
  hurt() { noise({ dur: 0.18, freq: 600, gain: 0.5 }); tone({ type: 'square', freq: 120, freqEnd: 70, dur: 0.12, gain: 0.12 }); },
  shieldHit() { tone({ type: 'triangle', freq: 1900, freqEnd: 1500, dur: 0.06, gain: 0.05 }); noise({ dur: 0.04, freq: 6000, type: 'highpass', gain: 0.08 }); },
  shieldHitMatch() { tone({ type: 'square', freq: 900, freqEnd: 600, dur: 0.07, gain: 0.06 }); noise({ dur: 0.08, freq: 2500, q: 2, type: 'bandpass', gain: 0.18 }); },
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
  sip() { noise({ dur: 0.5, freq: 900, freqEnd: 500, q: 4, type: 'bandpass', gain: 0.25 }); tone({ freq: 220, freqEnd: 180, dur: 0.1, gain: 0.08, delay: 0.55 }); },
  fireball() { noise({ dur: 0.6, freq: 500, freqEnd: 1800, gain: 0.5, rev: 0.3 }); tone({ type: 'sawtooth', freq: 70, freqEnd: 40, dur: 0.4, gain: 0.12 }); },
  roar() { tone({ type: 'sawtooth', freq: 140, freqEnd: 90, dur: 0.9, gain: 0.25, dist: true, rev: 0.5 }); noise({ dur: 0.8, freq: 1200, freqEnd: 300, gain: 0.35, rev: 0.4 }); },
  sizzle() { noise({ dur: 0.35, freq: 5000, type: 'highpass', gain: 0.18 }); },
  spray() { noise({ dur: 0.3, freq: 2600, q: 0.7, type: 'bandpass', gain: 0.22, attack: 0.03 }); },
  chime(i = 0) { const f = [523, 659, 784, 988][i % 4]; tone({ type: 'triangle', freq: f, dur: 0.3, gain: 0.15, rev: 0.4 }); },
};

const GUNS = new Set(['hc', 'sg', 'ar', 'pr', 'sr', 'sn', 'fr', 'mg', 'gl', 'rl', 'enemyShot']);
function run(name, args) {
  if (!GUNS.has(name)) return sfxs[name](...args);
  jit = 0.94 + Math.random() * 0.12;
  try { sfxs[name](...args); } finally { jit = 1; }
}
export function play(name, ...args) { share(['snd', name, args]); if (ctx && sfxs[name]) run(name, args); }

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
  try { run(name, args); } finally { dest = pd; revScale = pr; }
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
// A small synth band: kick/snare/hats, a sub + saw bass and detuned-saw pads that pump with the kick, an
// arpeggio through a tempo-synced echo, and a lead hook. Layers come in with intensity (how much is trying
// to kill you) and the cursed level (later encounters are faster, darker and more broken).
let musicTimer = null, nextNote = 0, step = 0, level = 1, musicBus = null, pumpBus = null, echoIn = null, padF = null, echoNodes = [];
let intensity = 0.4, intensityTarget = 0.4;
export function setMusicIntensity(x) { intensityTarget = Math.max(0, Math.min(1, x)); }

// chord roots (semitones above the key) + quality, one chord per bar
const PROGS = {
  1: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']],   // i VI III VII: heroic-ish
  2: [[0, 'm'], [5, 'm'], [8, 'M'], [7, 'M']],    // i iv VI V: sus
  3: [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'M']],   // the Andalusian cadence, for the temple
  4: [[0, 'm'], [1, 'M'], [0, 'm'], [6, 'd']],    // phrygian dread (it is not fine)
  5: [[0, 'm'], [6, 'd'], [1, 'M'], [11, 'd']],   // Ohio: tritones all the way down
};
const CHORD = { m: [0, 3, 7], M: [0, 4, 7], d: [0, 3, 6] };
const KEY = [0, 55, 51.9, 49, 46.25, 43.65];     // bass roots, a semitone darker each level
const BPM = [0, 96, 104, 112, 122, 136];
const BASS_HITS = [0, 3, 6, 8, 11, 14];
const HOOK = [7, 0, 3, 7, 10, 7, 12, 10];        // scale degrees (semitones) for the lead, two per bar

export function startMusic(lvl) {
  stopMusic();
  if (!ctx || !G.settings.music) return;
  level = Math.max(1, Math.min(5, lvl || 1));
  musicBus = ctx.createGain(); musicBus.gain.value = 1;
  if (level >= 5) { const ws = ctx.createWaveShaper(); ws.curve = distCurve; const pre = ctx.createGain(); pre.gain.value = 0.6; musicBus.connect(pre); pre.connect(ws); ws.connect(music); }
  else musicBus.connect(music);
  // the pump: bass + pads duck on every kick (sidechain feel)
  pumpBus = ctx.createGain(); pumpBus.connect(musicBus);
  padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 900; padF.Q.value = 0.8; padF.connect(pumpBus);
  // a dotted-eighth echo for arps, leads and the odd snare
  const spb = 60 / BPM[level] / 4;
  echoIn = ctx.createGain();
  const dl = ctx.createDelay(2); dl.delayTime.value = spb * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(musicBus);
  echoNodes = [echoIn, dl, fb, lp, wet];
  nextNote = ctx.currentTime + 0.1; step = 0;
  musicTimer = setInterval(schedule, 25);
}
export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (musicBus) {
    const b = musicBus, e = echoNodes;
    b.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => { b.disconnect(); e.forEach((n) => n.disconnect()); }, 600);
    musicBus = null; echoNodes = [];
  }
}
function schedule() {
  if (!ctx || !musicBus) return;
  if (G.paused || G.state !== 'playing') { nextNote = ctx.currentTime + 0.05; return; }
  intensity += (intensityTarget - intensity) * 0.015;
  padF.frequency.setTargetAtTime(600 + intensity * 2200 + level * 150, ctx.currentTime, 0.5);
  const spb = 60 / BPM[level] / 4;
  while (nextNote < ctx.currentTime + 0.12) { playStep(step, nextNote, spb); nextNote += spb; step = (step + 1) % 128; }
}

// ---- instruments ----
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function osc(t, type, f, dur, peak, dest, { a = 0.004, fEnd, detune = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
  return g;
}
function nz(t, dur, peak, f, type, dest, q = 0.8) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.002, peak, dur);
  s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function kick(t) {
  osc(t, 'sine', 165, 0.32, 0.95, musicBus, { fEnd: 42 });
  nz(t, 0.012, 0.35, 3500, 'highpass', musicBus);
  // sidechain pump
  pumpBus.gain.cancelScheduledValues(t);
  pumpBus.gain.setValueAtTime(0.3, t); pumpBus.gain.setTargetAtTime(1, t + 0.02, 0.07);
}
function snare(t, k = 1) {
  nz(t, 0.2, 0.42 * k, 1900, 'bandpass', musicBus, 0.7);
  osc(t, 'triangle', 200, 0.09, 0.28 * k, musicBus, { fEnd: 150 });
  if (k > 0.8) nz(t, 0.1, 0.12, 2200, 'bandpass', echoIn);
}
function hat(t, open = false, k = 1) { nz(t, open ? 0.22 : 0.035, (open ? 0.12 : 0.1) * k, 8500, 'highpass', musicBus); }
function bass(t, f, dur) {
  osc(t, 'sine', f, dur, 0.5, pumpBus, { a: 0.005 });
  // a filtered saw an octave up for bite
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * 2;
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 4;
  fl.frequency.setValueAtTime(300 + intensity * 900, t); fl.frequency.exponentialRampToValueAtTime(140, t + dur);
  const g = ctx.createGain(); env(g, t, 0.005, 0.16, dur);
  o.connect(fl); fl.connect(g); g.connect(pumpBus); o.start(t); o.stop(t + dur + 0.05);
}
function pad(t, freqs, dur) {
  for (const f of freqs) for (const dt of [-9, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt + (Math.random() - 0.5) * 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.35); g.gain.setValueAtTime(0.035, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    o.connect(g); g.connect(padF); o.start(t); o.stop(t + dur + 0.3);
  }
}
function pluck(t, f, k = 1, type = 'square') {
  const g = osc(t, type, f, 0.11, 0.045 * k, musicBus);
  g.connect(echoIn);
}

function playStep(s, t, spb) {
  const bar = Math.floor(s / 16), b = s % 16, I = intensity;
  const prog = PROGS[level], [deg, q] = prog[bar % prog.length];
  const root = KEY[level] * Math.pow(2, deg / 12);
  const tones = CHORD[q].map((n) => root * Math.pow(2, n / 12));
  const fill = bar % 8 === 7 && b >= 12;
  // drums
  if (I > 0.6 ? b % 4 === 0 : (b === 0 || b === 10)) kick(t);
  if (fill) snare(t, 0.5 + (b - 12) * 0.15);
  else if (b === 4 || b === 12) { if (I > 0.35) snare(t); else if (b === 12) snare(t, 0.4); }
  if (I > 0.2 && b % 2 === 0) hat(t, b === 14 && I > 0.5, b % 4 === 2 ? 1 : 0.6);
  else if (I > 0.7 && level >= 2) hat(t, false, 0.35);
  // bass: a syncopated root/octave line
  if (BASS_HITS.includes(b)) bass(t, b === 6 || b === 14 ? root * 2 : root, spb * (b === 0 ? 2.5 : 1.6));
  // pads: one chord per bar, voiced in the middle register
  if (b === 0) pad(t, tones.map((f) => f * 4), spb * 16);
  // arpeggio once things heat up
  if (level >= 2 && I > 0.5) {
    const pat = [0, 1, 2, 1, 0, 2, 1, 2];
    const n = pat[b % 8], oct = b >= 8 ? 8 : 4;
    pluck(t, tones[n] * oct, 0.6 + I * 0.4, level >= 4 ? 'sawtooth' : 'square');
  }
  // the lead hook, in the back half of each 8-bar phrase
  if (level >= 3 && I > 0.72 && bar % 8 >= 4 && (b === 0 || b === 6 || b === 10)) {
    const h = HOOK[(bar * 2 + (b > 6 ? 1 : 0)) % HOOK.length];
    const f = KEY[level] * 8 * Math.pow(2, h / 12);
    const g = osc(t, 'square', f, spb * 3, 0.04, musicBus, { a: 0.01, detune: level >= 5 ? (Math.random() - 0.5) * 60 : 0 });
    g.connect(echoIn);
  }
  // a little vine boom in the beat at the cursed end. why not.
  if (level >= 4 && b === 0 && bar % 2 === 0) osc(t, 'sine', 92, 1.0, 0.5, musicBus, { fEnd: 34 });
}
