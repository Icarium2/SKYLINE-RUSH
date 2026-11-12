const KEY_MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
};

export class Input {
  constructor() {
    this.queue = [];
    this.anyPressed = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.anyPressed = true;
      const action = KEY_MAP[e.code];
      if (action) {
        e.preventDefault();
        this.queue.push(action);
      }
    });

    // Touch swipes for mobile/trackpad demos.
    let startX = 0;
    let startY = 0;
    window.addEventListener(
      'touchstart',
      (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      },
      { passive: true }
    );
    window.addEventListener(
      'touchend',
      (e) => {
        this.anyPressed = true;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          this.queue.push(dx > 0 ? 'right' : 'left');
        } else {
          this.queue.push(dy < 0 ? 'jump' : 'slide');
        }
      },
      { passive: true }
    );
  }

  poll() {
    return this.queue.shift();
  }

  /** True once if any key/touch happened since the last call (menu/restart). */
  consumeAny() {
    const v = this.anyPressed;
    this.anyPressed = false;
    return v;
  }

  clear() {
    this.queue.length = 0;
    this.anyPressed = false;
  }
}
