// Mouse and keyboard for LUXWARD. One-shot presses (begin wave, pause,
// mute, restart, boon picks) are queued as bit flags and taken once by the
// loop, so a press between frames is never lost or counted twice. Pointer
// position is kept in canvas pixels; the main loop converts it to field
// coordinates. Clicks are reported as a queued click event with their
// position, so placement, selection and button presses all flow through one
// path.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_SPEED = 8;
export const ACTION_RESTART = 16;
export const ACTION_DESELECT = 32;

const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const SPEED = new Set(['KeyF']);
const RESTART = new Set(['KeyR']);
const CONFIRM = new Set(['Space', 'Enter']);
const LAMP_KEYS = new Set(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']);
const BOON_KEYS = new Set(['Digit1', 'Digit2', 'Digit3']);

export function createInput(target) {
  let actions = 0;
  let lampKey = null;
  let boonKey = null;
  let click = null;
  let pointerX = 0;
  let pointerY = 0;
  let pointerSeen = false;

  function keyDown(event) {
    if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (SPEED.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SPEED;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (LAMP_KEYS.has(event.code)) {
      lampKey = Number(event.code.slice(-1));
      boonKey = Number(event.code.slice(-1));
    } else if (event.code === 'Escape') {
      actions |= ACTION_DESELECT;
    } else return;
    event.preventDefault();
  }

  function trackPointer(event) {
    const rect = target.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
    pointerSeen = true;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('blur', () => { lampKey = null; });
  target.addEventListener('pointermove', trackPointer);
  target.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    click = { x: pointerX, y: pointerY };
  });

  return {
    pointer() {
      return pointerSeen ? { x: pointerX, y: pointerY } : null;
    },
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    takeLampKey() {
      const taken = lampKey;
      lampKey = null;
      return taken;
    },
    takeBoonKey() {
      const taken = boonKey;
      boonKey = null;
      return taken;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
