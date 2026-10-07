// Procedural canvas textures: emoji, meme text, tiles, the cursed face.
import * as THREE from 'three';

const cache = new Map();
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
export const MEME_COLORS = ['#ff3b3b', '#3bff6b', '#3bb5ff', '#ff3bf2', '#fff23b', '#ff9b3b', '#3bfff0'];

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function emojiTex(e, size = 128) {
  const k = 'e' + e + size;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.font = `${Math.floor(size * 0.8)}px ${EMOJI_FONT}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(e, size / 2, size / 2 + size * 0.06);
  const t = canvasTex(c); cache.set(k, t); return t;
}

export function textTex(text, o = {}) {
  const font = o.font || '"Comic Sans MS","Comic Neue",cursive';
  const px = o.px || 64, weight = o.weight || 'bold';
  const k = ['t', text, font, px, o.color, o.stroke, o.bg].join('|');
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); const x = c.getContext('2d');
  x.font = `${weight} ${px}px ${font}`;
  const w = Math.ceil(x.measureText(text).width + px * 0.7), h = Math.ceil(px * 1.5);
  c.width = w; c.height = h;
  x.font = `${weight} ${px}px ${font}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, w, h); }
  if (o.stroke !== null) { x.lineWidth = px * 0.16; x.strokeStyle = o.stroke || '#000'; x.lineJoin = 'round'; x.strokeText(text, w / 2, h / 2); }
  x.fillStyle = o.color || '#fff'; x.fillText(text, w / 2, h / 2);
  const r = { tex: canvasTex(c), aspect: w / h };
  cache.set(k, r); return r;
}

export function makeSprite(tex, w, h, o = {}) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false, fog: o.fog ?? true });
  const s = new THREE.Sprite(m);
  s.scale.set(w, h, 1);
  if (o.depthTest === false) s.renderOrder = 10;
  return s;
}
export function textSprite(text, height, o = {}) { const { tex, aspect } = textTex(text, o); return makeSprite(tex, height * aspect, height, o); }
export function emojiSprite(e, size, o = {}) { return makeSprite(emojiTex(e), size, size, o); }
export const IMPACT = 'Impact, Anton, sans-serif';

export function tileTex({ base = '#3a3d44', line = '#25272d', accent = null, n = 4, size = 512, grain = 18, seed = 1 } = {}) {
  const k = ['tile', base, line, accent, n, size, grain, seed].join('|');
  if (!cache.has(k)) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, size, size);
    let s = seed * 9301;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < size * 6; i++) {
      const v = (r() - 0.5) * grain;
      x.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
      x.fillRect(r() * size, r() * size, 2 + r() * 6, 2 + r() * 6);
    }
    const cell = size / n;
    x.strokeStyle = line; x.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      x.beginPath(); x.moveTo(i * cell, 0); x.lineTo(i * cell, size); x.stroke();
      x.beginPath(); x.moveTo(0, i * cell); x.lineTo(size, i * cell); x.stroke();
    }
    if (accent) {
      x.strokeStyle = accent; x.lineWidth = 3; x.shadowColor = accent; x.shadowBlur = 8;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (r() < 0.18) { x.strokeRect(i * cell + cell * 0.2, j * cell + cell * 0.2, cell * 0.6, cell * 0.6); }
      }
    }
    const t = canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    cache.set(k, t);
  }
  const t = cache.get(k).clone();
  t.needsUpdate = true;
  return t;
}

// A wide-eyed grinning head. Uncanny on purpose.
export function cursedFaceTex() {
  if (cache.has('face')) return cache.get('face');
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S * 0.45, S * 0.1, S / 2, S / 2, S * 0.48);
  g.addColorStop(0, '#f2c9a5'); g.addColorStop(1, '#c48a64');
  x.fillStyle = g; x.beginPath(); x.ellipse(S / 2, S / 2, S * 0.42, S * 0.48, 0, 0, Math.PI * 2); x.fill();
  // hair
  x.fillStyle = '#2b1a10'; x.beginPath(); x.ellipse(S / 2, S * 0.12, S * 0.36, S * 0.14, 0, Math.PI, 0); x.fill();
  x.fillRect(S * 0.14, S * 0.08, S * 0.72, S * 0.07);
  // eyebrows (raised, unhinged)
  x.strokeStyle = '#2b1a10'; x.lineWidth = 16; x.lineCap = 'round';
  x.beginPath(); x.moveTo(S * 0.22, S * 0.28); x.quadraticCurveTo(S * 0.32, S * 0.18, S * 0.43, S * 0.26); x.stroke();
  x.beginPath(); x.moveTo(S * 0.57, S * 0.26); x.quadraticCurveTo(S * 0.68, S * 0.18, S * 0.78, S * 0.28); x.stroke();
  // eyes
  for (const ex of [0.34, 0.66]) {
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(S * ex, S * 0.37, S * 0.09, S * 0.075, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(200,0,0,.5)'; x.lineWidth = 2;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(S * ex + Math.cos(i) * S * 0.085, S * 0.37 + Math.sin(i * 2) * S * 0.06); x.lineTo(S * ex + Math.cos(i) * S * 0.03, S * 0.37); x.stroke(); }
    x.fillStyle = '#111'; x.beginPath(); x.arc(S * ex, S * 0.375, S * 0.022, 0, Math.PI * 2); x.fill();
  }
  // nose
  x.strokeStyle = '#9a6040'; x.lineWidth = 8;
  x.beginPath(); x.moveTo(S * 0.5, S * 0.42); x.lineTo(S * 0.46, S * 0.55); x.lineTo(S * 0.53, S * 0.56); x.stroke();
  // mouth: huge open grin
  x.fillStyle = '#4a0606'; x.beginPath(); x.ellipse(S / 2, S * 0.72, S * 0.24, S * 0.13, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff';
  x.fillRect(S * 0.3, S * 0.6, S * 0.4, S * 0.05);
  x.fillRect(S * 0.33, S * 0.79, S * 0.34, S * 0.04);
  x.fillStyle = '#e06a7a'; x.beginPath(); x.ellipse(S / 2, S * 0.78, S * 0.12, S * 0.05, 0, 0, Math.PI * 2); x.fill();
  const t = canvasTex(c); cache.set('face', t); return t;
}

// Derive a tangent-space normal map from a canvas texture's brightness (grout lines become grooves).
const normalCache = new WeakMap();
export function normalMapFor(tex, strength = 2.5) {
  const img = tex.image;
  if (!img || !img.getContext) return null;
  let base = normalCache.get(img);
  if (!base) {
    const w = img.width, h = img.height;
    const src = img.getContext('2d').getImageData(0, 0, w, h).data;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); const out = x.createImageData(w, h);
    const L = (i, j) => { const k = (((j + h) % h) * w + ((i + w) % w)) * 4; return (src[k] * 0.3 + src[k + 1] * 0.59 + src[k + 2] * 0.11) / 255; };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (L(i + 1, j) - L(i - 1, j)) * strength, dy = (L(i, j + 1) - L(i, j - 1)) * strength;
      const n = Math.hypot(dx, dy, 1);
      const k = (j * w + i) * 4;
      out.data[k] = (-dx / n * 0.5 + 0.5) * 255; out.data[k + 1] = (dy / n * 0.5 + 0.5) * 255; out.data[k + 2] = (1 / n * 0.5 + 0.5) * 255; out.data[k + 3] = 255;
    }
    x.putImageData(out, 0, 0);
    base = new THREE.CanvasTexture(c); base.wrapS = base.wrapT = THREE.RepeatWrapping;
    normalCache.set(img, base);
  }
  const t = base.clone(); t.needsUpdate = true;
  t.repeat.copy(tex.repeat); t.offset.copy(tex.offset); t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  return t;
}
