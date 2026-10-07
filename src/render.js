// Rendering pipeline: PBR environment, sky dome, a separate viewmodel layer, and post-processing
// (bloom → tone mapping → grade: vignette, grain, chromatic aberration, cursed deep-fry → SMAA).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { G, damp } from './game.js';

// GTAO only skips points/lines; sprites, glows, fog and the sky dome must not cast AO either.
class SoftAOPass extends GTAOPass {
  overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      cache.set(o, o.visible);
      const m = o.material;
      if (o.isPoints || o.isLine || o.isSprite || (m && (m.transparent || m.depthWrite === false || m.blending === THREE.AdditiveBlending))) o.visible = false;
    });
  }
}

let composer = null, bloom = null, grade = null, smaa = null, vmPass = null, mainPass = null;
let envTex = null;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 },
    vignette: { value: 0.32 }, grain: { value: 0.035 }, aberration: { value: 0.0006 },
    hurt: { value: 0 }, saturation: { value: 1.08 }, contrast: { value: 1.04 }, posterize: { value: 0 },
    tint: { value: new THREE.Color(1, 1, 1) }, lift: { value: 0.0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time, vignette, grain, aberration, hurt, saturation, contrast, posterize, lift; uniform vec3 tint;
    varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float ab = aberration + hurt * 0.006;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ab).b);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5 + lift;
      c *= tint;
      if (posterize > 0.5) c = floor(c * posterize + 0.5) / posterize;
      float v = smoothstep(0.85, 0.2, length(d) * (1.0 + vignette));
      c *= mix(1.0, v, vignette * 2.2);
      c = mix(c, c * vec3(1.6, 0.35, 0.35), hurt * smoothstep(0.25, 0.75, length(d)));
      c += (rand(vUv * 913.0 + fract(time)) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Per cursed level: how fried the image is.
const GRADES = [
  null,
  { saturation: 1.08, contrast: 1.04, posterize: 0, tint: [1, 1, 1], aberration: 0.0006, grain: 0.03 },
  { saturation: 1.18, contrast: 1.07, posterize: 0, tint: [1, 0.99, 1.02], aberration: 0.0009, grain: 0.035 },
  { saturation: 1.45, contrast: 1.12, posterize: 0, tint: [1.03, 0.97, 1.05], aberration: 0.0015, grain: 0.045 },
  { saturation: 1.9, contrast: 1.25, posterize: 0, tint: [1.08, 0.95, 1.0], aberration: 0.0028, grain: 0.06 },
  { saturation: 2.6, contrast: 1.45, posterize: 18, tint: [1.12, 0.92, 0.98], aberration: 0.005, grain: 0.09 },
];

export function initRenderer(container) {
  const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  r.setSize(innerWidth, innerHeight);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(r.domElement);
  G.renderer = r;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 1500);
  G.scene.add(G.camera);

  // the viewmodel lives in its own scene with its own camera/FOV, drawn on top: no clipping into walls
  G.vmScene = new THREE.Scene();
  G.vmCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
  G.vmScene.add(G.vmCamera);
  G.vmScene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2420, 0.9));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(1.5, 2, 1); G.vmScene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4); rim.position.set(-2, 0.5, -1.5); G.vmScene.add(rim);
  G.vmKey = key;

  // image-based lighting so metal actually looks like metal
  const pmrem = new THREE.PMREMGenerator(r);
  envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  G.scene.environment = envTex; G.scene.environmentIntensity = 0.45;
  G.vmScene.environment = envTex; G.vmScene.environmentIntensity = 0.9;

  applyQuality();
  addEventListener('resize', onResize);
  return r;
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  G.vmCamera.aspect = w / h; G.vmCamera.updateProjectionMatrix();
  G.renderer.setSize(w, h);
  if (composer) { composer.setSize(w, h); bloom?.setSize(w / 2, h / 2); }
}

export function applyQuality() {
  const q = G.settings.quality || 'high';
  const r = G.renderer;
  r.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 1.5) : 1);
  r.shadowMap.type = q === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  r.shadowMap.needsUpdate = true;
  composer?.dispose?.();
  composer = null; bloom = null; grade = null; smaa = null;
  if (q === 'low') { onResize(); return; }
  composer = new EffectComposer(r);
  mainPass = new RenderPass(G.scene, G.camera);
  composer.addPass(mainPass);
  if (q === 'high') {
    // ambient occlusion: contact shadows in corners and under props
    const ao = new SoftAOPass(G.scene, G.camera, innerWidth, innerHeight);
    ao.blendIntensity = 0.85;
    ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.5, thickness: 1.5, scale: 1.2 });
    composer.addPass(ao);
  }
  vmPass = new RenderPass(G.vmScene, G.vmCamera);
  vmPass.clear = false; vmPass.clearDepth = true;
  composer.addPass(vmPass);
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.55, 0.97);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  if (q === 'high') { smaa = new SMAAPass(innerWidth * r.getPixelRatio(), innerHeight * r.getPixelRatio()); composer.addPass(smaa); }
  setGrade(G.cursed || 1);
  onResize();
}

export function setGrade(level) {
  const g = GRADES[Math.max(1, Math.min(5, level))];
  if (!grade) {
    // low quality fallback: CSS filter
    const css = ['none', 'none', 'saturate(1.2)', 'saturate(1.5) contrast(1.1)', 'saturate(2) contrast(1.25)', 'saturate(3) contrast(1.5)'];
    G.renderer.domElement.style.filter = css[level] || 'none';
    return;
  }
  G.renderer.domElement.style.filter = 'none';
  const u = grade.uniforms;
  u.saturation.value = g.saturation; u.contrast.value = g.contrast; u.posterize.value = g.posterize;
  u.tint.value.setRGB(...g.tint); u.aberration.value = g.aberration; u.grain.value = g.grain;
  if (bloom) bloom.strength = level >= 4 ? 0.85 : 0.55;
}

let hurtFx = 0;
export function hurtPulse(amount) { hurtFx = Math.min(1, hurtFx + amount / 60); }

export function render(dt) {
  hurtFx = damp(hurtFx, 0, 4, dt);
  if (!composer) {
    const r = G.renderer;
    r.autoClear = true; r.render(G.scene, G.camera);
    r.autoClear = false; r.clearDepth(); r.render(G.vmScene, G.vmCamera);
    r.autoClear = true;
    return;
  }
  if (grade) { grade.uniforms.time.value = performance.now() / 1000; grade.uniforms.hurt.value = hurtFx; }
  composer.render(dt);
}

// ---------- sky ----------
const SkyShader = {
  vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
  fragmentShader: /* glsl */`
    uniform vec3 top, horizon, bottom, sunColor, sunDir; uniform float sunSize, haze;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      c += sunColor * (pow(s, 900.0 / sunSize) * 6.0 + pow(s, 12.0) * 0.35 * haze + pow(s, 3.0) * 0.12 * haze);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
// A gradient dome with a sun. Colors are in linear-ish space; they get tone mapped.
export function makeSky({ top = 0x0b1030, horizon = 0x3a4a80, bottom = 0x07070c, sun = 0xffe2b0, sunDir = [0.4, 0.35, -0.6], sunSize = 1, haze = 1 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom) },
      sunColor: { value: new THREE.Color(sun) }, sunDir: { value: new THREE.Vector3(...sunDir).normalize() }, sunSize: { value: sunSize }, haze: { value: haze },
    },
    vertexShader: SkyShader.vertexShader, fragmentShader: SkyShader.fragmentShader,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  m.onBeforeRender = (r, s, cam) => m.position.copy(cam.position);
  return m;
}

// Keep the sun's shadow camera centred on the player so shadows stay crisp.
export function followSun(sun, target) {
  if (!sun) return;
  const off = sun.userData.offset;
  sun.position.set(target.x + off.x, target.y + off.y, target.z + off.z);
  sun.target.position.copy(target);
  // keep the viewmodel key light roughly matching the world sun
  if (G.vmKey) { G.vmKey.color.copy(sun.color); }
}
