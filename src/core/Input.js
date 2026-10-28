import { Settings } from './Settings.js';
import { bus } from './Events.js';
// Unified keyboard / mouse / gamepad input with rebindable actions.
class InputSystem {
  constructor() {
    this.down = new Set(); this.pressed = new Set(); this.released = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; this.mouseButtons = new Set(); this.mousePressed = new Set();
    this.locked = false; this.enabled = true; this.capture = null;
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: [], prev: [] };
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const c = this.capture; this.capture = null; c(e.code); return; }
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) && document.activeElement === document.body) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code); bus.emit('key', e.code);
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.down.clear(); });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
    addEventListener('mousedown', (e) => { this.mouseButtons.add(e.button); this.mousePressed.add(e.button); });
    addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement != null; bus.emit('pointerlock', this.locked); });
  }
  requestLock(el) { if (!this.locked && el.requestPointerLock) { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } }
  releaseLock() { if (document.exitPointerLock) document.exitPointerLock(); }
  code(action) { return Settings.get('bindings')[action]; }
  isDown(action) {
    const c = this.code(action); if (this.down.has(c)) return true;
    if (action === 'sprint' && this.down.has('ShiftRight')) return true;
    return this.padDown(action);
  }
  wasPressed(action) { return this.pressed.has(this.code(action)) || this.padPressed(action); }
  keyPressed(code) { return this.pressed.has(code); }
  padMap(action) { return { jump: 0, enter: 3, interact: 2, insult: 1, sprint: 10, crouch: 11, horn: 10, camera: 8, map: 8, more: 4, shove: 5, phone: 12 }[action]; }
  padDown(action) { const b = this.padMap(action); return b !== undefined && !!this.pad.buttons[b]; }
  padPressed(action) { const b = this.padMap(action); return b !== undefined && !!this.pad.buttons[b] && !this.pad.prev[b]; }
  // Movement axes (-1..1)
  get moveX() { return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0) + this.pad.lx; }
  get moveY() { return (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0) - this.pad.ly; }
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && [...pads].find((p) => p);
    this.pad.prev = this.pad.buttons;
    if (!g) { this.pad.buttons = []; this.pad.lx = this.pad.ly = this.pad.rx = this.pad.ry = this.pad.lt = this.pad.rt = 0; return; }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    this.pad.lx = dz(g.axes[0] || 0); this.pad.ly = dz(g.axes[1] || 0);
    this.pad.rx = dz(g.axes[2] || 0); this.pad.ry = dz(g.axes[3] || 0);
    this.pad.buttons = g.buttons.map((b) => b.pressed);
    this.pad.lt = g.buttons[6] ? g.buttons[6].value : 0; this.pad.rt = g.buttons[7] ? g.buttons[7].value : 0;
    if (this.pad.buttons[9] && !this.pad.prev[9]) bus.emit('key', 'Escape');
  }
  endFrame() { this.pressed.clear(); this.released.clear(); this.mousePressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
  captureNextKey(cb) { this.capture = cb; }
}
export const Input = new InputSystem();
export function keyLabel(code) {
  if (!code) return '?';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('Space', 'Space').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→');
}
