// Keyboard handling with DAS (delayed auto shift) and ARR (auto repeat rate),
// so holding left/right slides the piece the way players expect instead of
// firing at the browser's own key-repeat rate.
//
// Bindings and timings come from the settings module and can change while the
// game is running, so nothing here is a module constant.

import { bindingLookup } from './settings.js';

export class Input {
  constructor(actions, settings) {
    this.actions = actions;
    this.enabled = true;

    this.held = new Set();
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.softTimer = 0;
    this.direction = 0;

    this.applySettings(settings);

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  applySettings(settings) {
    this.lookup = bindingLookup(settings.bindings);
    this.timing = { ...settings.timing };
    // Keys held under the old bindings would otherwise stay stuck down.
    this.releaseAll();
  }

  attach(target = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  onKeyDown(e) {
    if (!this.enabled) return;
    const action = this.lookup[e.code];
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
    const action = this.lookup[e.code];
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
    if (!this.enabled) return;

    if (this.direction !== 0) {
      this.dasTimer += dt;
      if (this.dasTimer >= this.timing.das) {
        if (this.timing.arr <= 0) {
          // Instant ARR: slide until a wall or the stack stops the piece.
          while (this.actions.move(this.direction));
        } else {
          this.arrTimer += dt;
          while (this.arrTimer >= this.timing.arr) {
            this.arrTimer -= this.timing.arr;
            if (!this.actions.move(this.direction)) break;
          }
        }
      }
    }

    if (this.held.has('softDrop')) {
      if (this.timing.softDrop <= 0) {
        while (this.actions.softDrop());
      } else {
        this.softTimer += dt;
        while (this.softTimer >= this.timing.softDrop) {
          this.softTimer -= this.timing.softDrop;
          if (!this.actions.softDrop()) break;
        }
      }
    }
  }

  releaseAll() {
    this.held.clear();
    this.direction = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.softTimer = 0;
  }
}
