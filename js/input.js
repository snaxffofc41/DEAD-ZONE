/* DEAD ZONE — input.js
 * Keyboard/mouse state with rebindable actions, pointer lock, and a fallback
 * look mode (mouse deltas + screen-edge turning + arrow keys) when lock is unavailable. */
DZ.Input = (function () {
  const keys = {};
  const pressed = new Set();
  const mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0, x: 0.5, y: 0.5, inside: false };
  const state = { locked: false, fallback: false, enabled: false, rebinding: null, onRebind: null };

  window.addEventListener('keydown', (e) => {
    if (state.rebinding) {
      e.preventDefault();
      const action = state.rebinding; state.rebinding = null;
      if (e.code !== 'Escape') { DZ.settings.keys[action] = e.code; DZ.saveSettings(); }
      state.onRebind && state.onRebind();
      return;
    }
    if (state.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!keys[e.code]) pressed.add(e.code);
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.left = mouse.right = false; });

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX / window.innerWidth; mouse.y = e.clientY / window.innerHeight; mouse.inside = true;
    if (!state.enabled) return;
    if (state.locked || state.fallback) { mouse.dx += e.movementX || 0; mouse.dy += e.movementY || 0; }
  });
  document.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('mousedown', (e) => {
    if (!state.enabled) return;
    if (e.button === 0) { mouse.left = true; mouse.leftPressed = true; }
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  window.addEventListener('contextmenu', (e) => { if (state.enabled) e.preventDefault(); });
  window.addEventListener('wheel', (e) => { if (state.enabled) mouse.wheel += Math.sign(e.deltaY); }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement != null;
    if (state.locked) state.fallback = false;
    DZ.Input.onLockChange && DZ.Input.onLockChange(state.locked);
  });
  document.addEventListener('pointerlockerror', () => { state.fallback = true; DZ.Input.onLockError && DZ.Input.onLockError(); });

  function requestLock(el) {
    try {
      const p = el.requestPointerLock && el.requestPointerLock();
      if (p && p.catch) p.catch(() => { state.fallback = true; DZ.Input.onLockError && DZ.Input.onLockError(); });
      if (!el.requestPointerLock) state.fallback = true;
    } catch (err) { state.fallback = true; }
  }

  return {
    keys, mouse, state, requestLock,
    action: (name) => !!keys[DZ.settings.keys[name]] || (name === 'sprint' && !!keys.ShiftRight),
    pressed: (name) => { const code = DZ.settings.keys[name]; if (pressed.has(code)) { pressed.delete(code); return true; } return false; },
    pressedCode: (code) => { if (pressed.has(code)) { pressed.delete(code); return true; } return false; },
    endFrame() { pressed.clear(); mouse.dx = 0; mouse.dy = 0; mouse.leftPressed = false; mouse.wheel = 0; },
    keyLabel(code) {
      if (!code) return '—';
      return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R').replace('Space', 'Space');
    },
  };
})();
