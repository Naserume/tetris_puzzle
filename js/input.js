// Keyboard handling with DAS (delayed auto shift) and ARR (auto repeat rate),
// so holding left/right slides the piece the way players expect instead of
// firing at the browser's own key-repeat rate.

const DAS_MS = 133;
const ARR_MS = 20;
const SOFT_DROP_MS = 25;

const BINDINGS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
  ControlLeft: 'rotateCCW',
  ControlRight: 'rotateCCW',
  KeyA: 'rotate180',
  Space: 'hardDrop',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyP: 'pause',
  Escape: 'pause',
  KeyR: 'restart',
};

export class Input {
  constructor(actions) {
    this.actions = actions;
    this.held = new Set();
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.softTimer = 0;
    this.direction = 0;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  attach(target = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  onKeyDown(e) {
    const action = BINDINGS[e.code];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;

    this.held.add(action);

    switch (action) {
      case 'left':
      case 'right': {
        this.direction = action === 'left' ? -1 : 1;
        this.dasTimer = 0;
        this.arrTimer = 0;
        this.actions.move(this.direction);
        break;
      }
      case 'softDrop':
        this.softTimer = 0;
        this.actions.softDrop();
        break;
      case 'rotateCW': this.actions.rotate(1); break;
      case 'rotateCCW': this.actions.rotate(-1); break;
      case 'rotate180': this.actions.rotate(2); break;
      case 'hardDrop': this.actions.hardDrop(); break;
      case 'hold': this.actions.hold(); break;
      case 'pause': this.actions.pause(); break;
      case 'restart': this.actions.restart(); break;
    }
  }

  onKeyUp(e) {
    const action = BINDINGS[e.code];
    if (!action) return;
    this.held.delete(action);

    if (action === 'left' || action === 'right') {
      // Releasing one direction while the other is still down hands control
      // back to that key immediately, with a fresh DAS charge.
      const other = action === 'left' ? 'right' : 'left';
      if (this.held.has(other)) {
        this.direction = other === 'left' ? -1 : 1;
        this.dasTimer = 0;
        this.arrTimer = 0;
      } else {
        this.direction = 0;
      }
    }
  }

  update(dt) {
    if (this.direction !== 0) {
      this.dasTimer += dt;
      if (this.dasTimer >= DAS_MS) {
        this.arrTimer += dt;
        while (this.arrTimer >= ARR_MS) {
          this.arrTimer -= ARR_MS;
          if (!this.actions.move(this.direction)) break;
        }
      }
    }

    if (this.held.has('softDrop')) {
      this.softTimer += dt;
      while (this.softTimer >= SOFT_DROP_MS) {
        this.softTimer -= SOFT_DROP_MS;
        if (!this.actions.softDrop()) break;
      }
    }
  }

  releaseAll() {
    this.held.clear();
    this.direction = 0;
  }
}
