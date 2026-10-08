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

// ---------------- controller (standard gamepad layout, Destiny-style bindings) ----------------
// The pad drives the same synthetic keys / mouse deltas / trigger flags the keyboard does, so the game
// doesn't need to know which one you're holding.
const PAD_BUTTONS = {
  0: ['Space'],          // A: jump
  1: ['KeyC'],           // B: slide (crouch while sprinting)
  2: ['KeyR', 'KeyE'],   // X: reload; hold to interact (revive, chests)
  4: ['KeyQ'],           // LB: grenade
  5: ['KeyV'],           // RB: melee (and finishers)
  12: ['KeyB'], 13: ['KeyN'], 14: ['KeyJ'], 15: ['KeyK'], // d-pad: emotes
};
const padHeld = new Set();
let sprintLatch = false, lastY = false, lastStart = false, bumpT = 0, bumpWas = 0, bumpLock = false;
export const Pad = { active: false, startPressed: false, nav: {} };
const navHeld = {}, navRepeat = {};
const dz = (v, d = 0.14) => (Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d));

export function pollPad(dt, lookSpeed = 1) {
  Pad.startPressed = false; Pad.nav = {};
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find((p) => p && p.connected && p.mapping === 'standard') || [...pads].find((p) => p && p.connected);
  if (!gp) { if (Pad.active) release(); return; }
  const b = (i) => !!gp.buttons[i]?.pressed, val = (i) => gp.buttons[i]?.value || 0;
  const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
  const any = lx || ly || rx || ry || gp.buttons.some((q) => q.pressed);
  if (any) Pad.active = true;
  if (!Pad.active) return;
  const want = new Set();
  // left stick -> movement keys
  if (ly < -0.3) want.add('KeyW'); if (ly > 0.3) want.add('KeyS');
  if (lx < -0.3) want.add('KeyA'); if (lx > 0.3) want.add('KeyD');
  // click the left stick to sprint; it stays on while you keep pushing forward
  if (b(10)) sprintLatch = true;
  if (ly > -0.5) sprintLatch = false;
  if (sprintLatch) want.add('ShiftLeft');
  for (const [i, codes] of Object.entries(PAD_BUTTONS)) if (b(+i)) codes.forEach((c) => want.add(c));
  // both bumpers: super. A lone bumper waits 90 ms first, since nobody presses both on the same frame.
  const bumps = (b(4) ? 1 : 0) + (b(5) ? 2 : 0);
  if (bumps === 3) { want.delete('KeyQ'); want.delete('KeyV'); want.add('KeyF'); bumpLock = true; }
  else if (bumpLock) { want.delete('KeyQ'); want.delete('KeyV'); if (!bumps) bumpLock = false; } // after a super, wait for both to come up
  else if (bumps) {
    if (bumpWas === 0) bumpT = 0;
    bumpT += dt;
    if (bumpT < 0.09) { want.delete('KeyQ'); want.delete('KeyV'); }
  } else if (bumpWas && bumpT < 0.09) Input.pressed.add(bumpWas === 1 ? 'KeyQ' : 'KeyV'); // a quick tap still counts
  bumpWas = bumps;
  for (const c of want) { if (!padHeld.has(c)) Input.pressed.add(c); Input.keys.add(c); } // (re-add: losing pointer lock clears keys)
  for (const c of padHeld) if (!want.has(c)) Input.keys.delete(c);
  padHeld.clear(); want.forEach((c) => padHeld.add(c));
  // triggers
  Input.left = val(7) > 0.35 || (Input.left && !Pad.lastTrig7);
  Pad.lastTrig7 = val(7) > 0.35;
  Input.right = val(6) > 0.35 || (Input.right && !Pad.lastTrig6);
  Pad.lastTrig6 = val(6) > 0.35;
  // Y: swap weapon
  if (b(3) && !lastY) Input.wheel += 1;
  lastY = b(3);
  if (b(9) && !lastStart) Pad.startPressed = true;
  lastStart = b(9);
  // menu navigation: edges for A / B / View, and directions from the d-pad or left stick (held = repeat)
  const nav = Pad.nav = {};
  const edge = (name, on) => { if (on && !navHeld[name]) nav[name] = true; navHeld[name] = on; };
  edge('a', b(0)); edge('b', b(1)); edge('view', b(8));
  const dirs = { up: b(12) || ly < -0.6, down: b(13) || ly > 0.6, left: b(14) || lx < -0.6, right: b(15) || lx > 0.6 };
  for (const [d, on] of Object.entries(dirs)) {
    if (!on) { navRepeat[d] = 0; continue; }
    if (!navRepeat[d]) { nav[d] = true; navRepeat[d] = 0.001; }
    else if ((navRepeat[d] += dt) > 0.4) { nav[d] = true; navRepeat[d] = 0.28; } // first repeat after 0.4 s, then every 0.12 s
  }
  // right stick -> look, with a response curve so small corrections stay small
  const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.8);
  Input.dx += curve(rx) * 1400 * lookSpeed * dt;
  Input.dy += curve(ry) * 950 * lookSpeed * dt;
}
function release() {
  for (const c of padHeld) Input.keys.delete(c);
  padHeld.clear(); Pad.active = false; sprintLatch = false; Input.left = false; Input.right = false;
}

export const down = (c) => Input.keys.has(c);
export const hit = (c) => Input.pressed.has(c);
export function endFrame() { Input.pressed.clear(); Input.dx = 0; Input.dy = 0; Input.wheel = 0; }
