// Core tetris rules: board state, piece movement, locking, scoring.
// This module is pure logic — it never touches the DOM, so the same engine
// can later drive puzzle mode, a solver, or tests.

import { TYPES, SHAPES, T_CORNERS, kicksFor } from './pieces.js';

export const COLS = 10;
export const ROWS = 20;

const SPAWN_X = 3;
const SPAWN_Y = 0;

const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;
const NEXT_COUNT = 5;

// Guideline gravity: seconds per cell at a given level.
function gravityMsForLevel(level) {
  const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  return Math.max(seconds * 1000, 16);
}

export function createGrid(rows = ROWS, cols = COLS) {
  return Array.from({ length: rows }, () => new Array(cols).fill(null));
}

export function cellsOf(piece) {
  return SHAPES[piece.type][piece.rot].map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
}

export function collides(grid, piece) {
  for (const [x, y] of cellsOf(piece)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && grid[y][x]) return true;
  }
  return false;
}

// Shuffled 7-bag: every seven pieces contains each tetromino exactly once.
class BagRandomizer {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.bag = [];
  }

  next() {
    if (this.bag.length === 0) {
      this.bag = TYPES.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }
}

export class Game {
  constructor(options = {}) {
    this.options = options;
    this.listeners = {};
    this.reset();
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this.listeners[event] || []) fn(payload);
  }

  reset() {
    this.grid = createGrid();
    this.bag = new BagRandomizer(this.options.rng);
    this.queue = [];
    this.refillQueue();

    this.current = null;
    this.hold = null;
    this.holdUsed = false;

    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.backToBack = false;

    this.state = 'ready';
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.lastMoveWasRotation = false;
    this.lastKickIndex = 0;

    this.emit('reset');
  }

  start() {
    if (this.state === 'playing') return;
    if (this.state === 'ready' || this.state === 'over') {
      if (this.state === 'over') this.reset();
      this.state = 'playing';
      this.spawn();
    } else {
      this.state = 'playing';
    }
    this.emit('state', this.state);
  }

  togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
    else return;
    this.emit('state', this.state);
  }

  refillQueue() {
    while (this.queue.length < NEXT_COUNT + 1) this.queue.push(this.bag.next());
  }

  spawn(type = null) {
    const next = type || this.queue.shift();
    this.refillQueue();

    this.current = { type: next, rot: 0, x: SPAWN_X, y: SPAWN_Y };
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.lastMoveWasRotation = false;

    // Block out: the new piece has nowhere to sit.
    if (collides(this.grid, this.current)) {
      this.state = 'over';
      this.emit('state', this.state);
      this.emit('gameover', { score: this.score, lines: this.lines, level: this.level });
      return false;
    }
    this.emit('spawn', this.current);
    return true;
  }

  get gravityMs() {
    return gravityMsForLevel(this.level);
  }

  update(dt) {
    if (this.state !== 'playing' || !this.current) return;

    const grounded = this.isGrounded();
    if (grounded !== this.grounded) {
      this.grounded = grounded;
      if (grounded) this.lockTimer = 0;
    }

    if (grounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY_MS) this.lockPiece();
      return;
    }

    this.dropTimer += dt;
    const step = this.gravityMs;
    while (this.dropTimer >= step) {
      this.dropTimer -= step;
      if (!this.shift(0, 1)) break;
    }
  }

  isGrounded() {
    const probe = { ...this.current, y: this.current.y + 1 };
    return collides(this.grid, probe);
  }

  // Low-level move. Returns whether it succeeded.
  shift(dx, dy) {
    if (!this.current) return false;
    const moved = { ...this.current, x: this.current.x + dx, y: this.current.y + dy };
    if (collides(this.grid, moved)) return false;
    this.current = moved;
    this.lastMoveWasRotation = false;
    this.touchLockTimer();
    return true;
  }

  // Any successful move or rotation while grounded buys more time, but only
  // MAX_LOCK_RESETS times — otherwise a piece could be stalled forever.
  touchLockTimer() {
    if (!this.isGrounded()) return;
    if (this.lockResets < MAX_LOCK_RESETS) {
      this.lockResets++;
      this.lockTimer = 0;
    }
  }

  move(dx) {
    if (this.state !== 'playing') return false;
    const ok = this.shift(dx, 0);
    if (ok) this.emit('move');
    return ok;
  }

  softDrop() {
    if (this.state !== 'playing') return false;
    const ok = this.shift(0, 1);
    if (ok) {
      this.score += 1;
      this.dropTimer = 0;
      this.emit('score');
    }
    return ok;
  }

  hardDrop() {
    if (this.state !== 'playing' || !this.current) return;
    let distance = 0;
    while (!collides(this.grid, { ...this.current, y: this.current.y + 1 })) {
      this.current.y++;
      distance++;
    }
    if (distance > 0) {
      this.score += distance * 2;
      this.lastMoveWasRotation = false;
      this.emit('score');
    }
    this.emit('harddrop', { distance });
    this.lockPiece();
  }

  // dir: 1 = clockwise, -1 = counter-clockwise, 2 = 180.
  rotate(dir) {
    if (this.state !== 'playing' || !this.current) return false;
    const from = this.current.rot;
    const to = (from + dir + 4) % 4;

    // 180 spins are not in the SRS tables; try in place, then a simple nudge.
    const kicks = dir === 2
      ? [[0, 0], [0, -1], [1, 0], [-1, 0]]
      : kicksFor(this.current.type, from, to);

    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      const candidate = { ...this.current, rot: to, x: this.current.x + dx, y: this.current.y + dy };
      if (collides(this.grid, candidate)) continue;
      this.current = candidate;
      this.lastMoveWasRotation = true;
      this.lastKickIndex = i;
      this.touchLockTimer();
      this.emit('rotate');
      return true;
    }
    return false;
  }

  holdPiece() {
    if (this.state !== 'playing' || !this.current || this.holdUsed) return false;
    const held = this.hold;
    this.hold = this.current.type;
    this.holdUsed = true;
    if (held) {
      this.current = { type: held, rot: 0, x: SPAWN_X, y: SPAWN_Y };
      this.dropTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.grounded = false;
      if (collides(this.grid, this.current)) {
        this.state = 'over';
        this.emit('state', this.state);
        this.emit('gameover', { score: this.score, lines: this.lines, level: this.level });
      }
    } else {
      this.spawn();
    }
    this.emit('hold');
    return true;
  }

  ghostY() {
    if (!this.current) return 0;
    let y = this.current.y;
    while (!collides(this.grid, { ...this.current, y: y + 1 })) y++;
    return y;
  }

  // A T-spin requires the last movement to be a rotation and at least three of
  // the T's four corners to be occupied. If only the two back corners are
  // filled it is a "mini" — unless the rotation needed the last kick offset.
  detectTSpin() {
    if (!this.lastMoveWasRotation || this.current.type !== 'T') return null;
    const corners = T_CORNERS[this.current.rot];
    const filled = corners.map(([dx, dy]) => {
      const x = this.current.x + dx;
      const y = this.current.y + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      return y >= 0 && !!this.grid[y][x];
    });
    const total = filled.filter(Boolean).length;
    if (total < 3) return null;
    const frontFilled = filled[0] && filled[1];
    if (!frontFilled && this.lastKickIndex < 4) return 'mini';
    return 'full';
  }

  lockPiece() {
    if (!this.current) return;
    const tspin = this.detectTSpin();

    for (const [x, y] of cellsOf(this.current)) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) this.grid[y][x] = this.current.type;
    }

    const cleared = this.clearLines();
    this.applyScore(cleared, tspin);

    this.emit('lock', { type: this.current.type, cleared, tspin });
    this.holdUsed = false;
    this.current = null;
    this.spawn();
  }

  clearLines() {
    const kept = [];
    const clearedRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.grid[y].every((cell) => cell !== null)) clearedRows.push(y);
      else kept.push(this.grid[y]);
    }
    if (clearedRows.length === 0) return [];

    while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null));
    this.grid = kept;
    this.emit('clear', clearedRows);
    return clearedRows;
  }

  applyScore(clearedRows, tspin) {
    const n = clearedRows.length;

    if (n === 0) {
      this.combo = -1;
      // A T-spin with no clear still scores, and does not break back-to-back.
      if (tspin) {
        this.score += (tspin === 'mini' ? 100 : 400) * this.level;
        this.emit('score');
      }
      return;
    }

    let base;
    let difficult = false;
    if (tspin === 'full') {
      base = [0, 800, 1200, 1600][n];
      difficult = true;
    } else if (tspin === 'mini') {
      base = [0, 200, 400, 0][n] || 200;
      difficult = true;
    } else {
      base = [0, 100, 300, 500, 800][n];
      difficult = n === 4;
    }

    let points = base * this.level;
    if (difficult && this.backToBack) points = Math.floor(points * 1.5);

    this.combo++;
    if (this.combo > 0) points += 50 * this.combo * this.level;

    this.backToBack = difficult;
    this.score += points;
    this.lines += n;

    const newLevel = Math.floor(this.lines / 10) + 1;
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.emit('level', this.level);
    }
    this.emit('score');
  }
}
