// Photo mode (P): the world freezes (solo), the HUD and gun go away, and you fly a free camera.
// Mouse looks, WASD flies, Space/C up/down, Shift for speed, the wheel zooms; depth of field focuses on what's
// under the centre of the screen.
import * as THREE from 'three';
import { G, clamp } from './game.js';
import { Input, down } from './input.js';
import { HUD } from './hud.js';
import { raycast } from './combat.js';

let yaw = 0, pitch = 0, fov = 60, hint = null;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export function togglePhoto() {
  G.photo = !G.photo;
  hint ||= Object.assign(document.createElement('div'), { id: 'photohint', innerHTML: '📷 PHOTO MODE · <b>mouse</b> look · <b>WASD</b> fly · <b>SPACE</b>/<b>C</b> up/down · <b>SHIFT</b> fast · <b>wheel</b> zoom · <b>P</b> exit' });
  if (!hint.parentNode) document.body.appendChild(hint);
  hint.style.display = G.photo ? '' : 'none';
  const cam = G.camera;
  if (G.photo) {
    _e.setFromQuaternion(cam.quaternion, 'YXZ'); yaw = _e.y; pitch = _e.x; fov = cam.fov;
    HUD.show(false); G.vmScene.visible = false;
    document.getElementById('deepfry').style.visibility = 'hidden';
  } else {
    HUD.show(true); G.vmScene.visible = true;
    document.getElementById('deepfry').style.visibility = '';
    cam.fov = G.player?.fov || 74; cam.updateProjectionMatrix();
  }
}

export function photoUpdate(dt) {
  const cam = G.camera;
  yaw -= Input.dx * 0.0022 * (G.settings.sens || 1) * (fov / 70);
  pitch = clamp(pitch - Input.dy * 0.0022 * (G.settings.sens || 1) * (fov / 70), -1.55, 1.55);
  if (Input.wheel) fov = clamp(fov + Input.wheel * 4, 12, 100);
  cam.rotation.set(pitch, yaw, 0, 'YXZ');
  _f.set(0, 0, -1).applyEuler(cam.rotation); _r.set(1, 0, 0).applyEuler(cam.rotation);
  const sp = (down('ShiftLeft') ? 18 : 6) * dt;
  if (down('KeyW')) cam.position.addScaledVector(_f, sp);
  if (down('KeyS')) cam.position.addScaledVector(_f, -sp);
  if (down('KeyD')) cam.position.addScaledVector(_r, sp);
  if (down('KeyA')) cam.position.addScaledVector(_r, -sp);
  if (down('Space')) cam.position.y += sp;
  if (down('KeyC') || down('ControlLeft')) cam.position.y -= sp;
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
  // focus on whatever is in the middle of the frame
  const h = raycast(cam.position, _f, 200);
  G.photoFocus = h.dist;
}
