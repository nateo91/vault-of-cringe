// The Armory's turntable: a small studio render of the weapon you're looking at. Drag to spin it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildGun } from './player.js';
import { DEFS } from './arsenal.js';

let renderer = null, scene, camera, holder, current = null, canvas, running = false, last = 0;
let spin = 0, spinV = 0.5, tilt = 0.12, dragging = false, lastX = 0;
const cache = new Map();

function init(c) {
  canvas = c;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(1.5, 2, 2); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 2.0); rim.position.set(-2, 1, -2); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2420, 0.6));
  camera = new THREE.PerspectiveCamera(28, 2, 0.01, 20);
  holder = new THREE.Group(); scene.add(holder);
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; spinV = (e.clientX - lastX) * 0.6; spin += (e.clientX - lastX) * 0.012; lastX = e.clientX; });
}

// Show a weapon (by DEFS id). The model is framed to fill the view.
export function showGun(id, c) {
  if (!renderer) init(c);
  if (current === id) return;
  current = id;
  holder.clear();
  const d = DEFS[id];
  if (!d) return;
  let g = cache.get(d.model);
  if (!g) { g = buildGun(d.model).group; cache.set(d.model, g); }
  holder.add(g);
  // frame it: centre the bounds, back the camera off to fit the longest side
  g.position.set(0, 0, 0); g.updateMatrixWorld(true);
  // (only visible meshes: the hidden muzzle-flash sprites would make the gun look tiny)
  const box = new THREE.Box3();
  g.traverse((o) => { if (o.isMesh && o.visible && !o.isSprite) box.expandByObject(o); });
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  g.position.sub(mid);
  // fit both ways (it spins, so the horizontal extent is its longest side); the canvas sets the aspect first
  frame(0);
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * camera.aspect;
  const rH = Math.hypot(size.x, size.z) / 2, rV = Math.max(size.y, Math.hypot(size.x, size.z) * 0.25) / 2;
  const dist = Math.max(rH / th, rV / tv) * 1.2 + rH;
  camera.position.set(0, dist * 0.12, dist);
  camera.lookAt(0, 0, 0);
  spin = -Math.PI / 2 + 0.35; // start side-on, barrel pointing left
  frame(0);
}
// size to the canvas and draw one frame
function frame(dt) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  if (!dragging) { spinV += (0.5 - spinV) * Math.min(1, dt * 2); spin += spinV * dt; }
  holder.rotation.set(tilt, spin, 0);
  renderer.render(scene, camera);
}

export function startView() {
  if (running || !renderer) return;
  running = true; last = performance.now();
  const loop = (now) => {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frame(dt);
  };
  requestAnimationFrame(loop);
}
export function stopView() { running = false; }
export const spinView = (dt) => renderer && frame(dt); // (debug: step the turntable without rAF)
