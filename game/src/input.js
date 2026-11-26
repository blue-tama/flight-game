// Keyboard and mouse input. Held keys steer; one-shot presses (start,
// pause, restart, mission choice) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted
// twice. The mouse steers too: hold the left button and the plane banks and
// pitches toward the pointer, for fine work on final approach.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MISSION_1 = 8;
export const ACTION_MISSION_2 = 16;
export const ACTION_MISSION_3 = 32;
export const ACTION_MUTE = 64;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const BANK_LEFT = new Set(['ArrowLeft', 'KeyA']);
const BANK_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['KeyQ', 'ControlLeft', 'ControlRight']);
const BRAKE = new Set(['Space']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);
const MISSION_KEYS = new Map([['Digit1', ACTION_MISSION_1], ['Digit2', ACTION_MISSION_2], ['Digit3', ACTION_MISSION_3]]);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener('keydown', (event) => {
    if (MISSION_KEYS.has(event.code)) {
      if (!event.repeat) actions |= MISSION_KEYS.get(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (
      PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code) ||
      BANK_LEFT.has(event.code) || BANK_RIGHT.has(event.code) ||
      THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code) ||
      BRAKE.has(event.code)
    ) {
      held.add(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseX = event.clientX / window.innerWidth;
    mouseY = event.clientY / window.innerHeight;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX / window.innerWidth;
    mouseY = event.clientY / window.innerHeight;
  });
  target.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function hasAny(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Pitch target in radians: positive climbs. */
    pitch() {
      if (mouseDown) return (0.5 - mouseY) * 0.5;
      return (hasAny(PITCH_UP) ? 1 : 0) - (hasAny(PITCH_DOWN) ? 1 : 0);
    },
    /** Bank target in radians: positive banks right. */
    bank() {
      if (mouseDown) return (mouseX - 0.5) * 1.4;
      return (hasAny(BANK_RIGHT) ? 1 : 0) - (hasAny(BANK_LEFT) ? 1 : 0);
    },
    /** Throttle change this frame: +1 up, -1 down, 0 held. */
    throttleDelta() {
      return (hasAny(THROTTLE_UP) ? 1 : 0) - (hasAny(THROTTLE_DOWN) ? 1 : 0);
    },
    brake() {
      return hasAny(BRAKE);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
