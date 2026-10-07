export const Input = {
  keys: new Set(), pressed: new Set(),
  left: false, right: false, dx: 0, dy: 0, wheel: 0, locked: false,
};

export function initInput(canvas, onLockChange) {
  addEventListener('keydown', (e) => {
    if (['Space', 'Tab', 'KeyF', 'KeyQ'].includes(e.code) && Input.locked) e.preventDefault();
    if (e.repeat) return;
    Input.keys.add(e.code); Input.pressed.add(e.code);
  });
  addEventListener('keyup', (e) => Input.keys.delete(e.code));
  addEventListener('mousedown', (e) => {
    if (!Input.locked) return;
    if (e.button === 0) Input.left = true;
    if (e.button === 2) Input.right = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) Input.left = false;
    if (e.button === 2) Input.right = false;
  });
  addEventListener('mousemove', (e) => {
    if (!Input.locked) return;
    // Clamp huge spikes (some browsers report a jump when lock engages)
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    Input.dx += e.movementX; Input.dy += e.movementY;
  });
  addEventListener('wheel', (e) => { if (Input.locked) Input.wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    Input.locked = document.pointerLockElement === canvas;
    if (!Input.locked) { Input.left = Input.right = false; Input.keys.clear(); }
    onLockChange(Input.locked);
  });
}

export function lockPointer(canvas) {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    // unadjustedMovement isn't supported everywhere; retry plain. Chrome also refuses for ~1s after Esc.
    if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch (e) { /* cooldown */ } });
  } catch (e) { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch (e2) { /* ignore */ } }
}

export const down = (c) => Input.keys.has(c);
export const hit = (c) => Input.pressed.has(c);
export function endFrame() { Input.pressed.clear(); Input.dx = 0; Input.dy = 0; Input.wheel = 0; }
