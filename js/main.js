// Wires the engine, renderer, input and settings together and owns the loop.

import { Game } from './engine.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { ACTIONS, loadSettings, saveSettings, keyLabel } from './settings.js';
import { SettingsPanel } from './settings-ui.js';

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
const game = new Game();
const renderer = new Renderer($('board'), $('hold-canvas'), $('next-canvas'));

const ui = {
  score: $('score'),
  lines: $('lines'),
  level: $('level'),
  overlay: $('overlay'),
  overlayTitle: $('overlay-title'),
  overlayText: $('overlay-text'),
  overlayHint: $('overlay-hint'),
  toast: $('toast'),
  helpList: $('help-list'),
};

function formatScore(n) {
  return n.toLocaleString('en-US');
}

function syncStats() {
  ui.score.textContent = formatScore(game.score);
  ui.lines.textContent = game.lines;
  ui.level.textContent = game.level;
}

// "←" or "P / Esc" — whatever the action is bound to right now, or null if the
// player has unbound it entirely.
function keyHint(actionId) {
  const codes = settings.bindings[actionId] || [];
  return codes.length ? codes.map(keyLabel).join(' / ') : null;
}

/* ---------- overlay ---------- */

function showOverlay(title, text, hint) {
  ui.overlayTitle.textContent = title;
  ui.overlayText.textContent = text;
  ui.overlayHint.textContent = hint;
  ui.overlay.hidden = false;
}

// The overlay is a pure function of game state plus the current bindings, so
// rebinding a key while paused updates the hint underneath the dialog.
function paintOverlay() {
  if (game.state === 'ready') {
    showOverlay('테트리스 퍼즐', '', '아무 키나 눌러 시작');
  } else if (game.state === 'paused') {
    const key = keyHint('pause');
    showOverlay('일시정지', '', key ? `${key} 로 계속` : '화면을 클릭해 계속');
  } else if (game.state === 'over') {
    const key = keyHint('restart');
    showOverlay('게임 오버', `점수 ${formatScore(game.score)} · ${game.lines}줄`,
      key ? `${key} 을 눌러 다시 시작` : '화면을 클릭해 다시 시작');
  } else {
    ui.overlay.hidden = true;
  }
}

/* ---------- key legend ---------- */

// Actions this page actually responds to; `undo` belongs to the puzzle pages.
const PAGE_ACTIONS = new Set([
  'left', 'right', 'softDrop', 'hardDrop',
  'rotateCW', 'rotateCCW', 'rotate180', 'hold', 'pause', 'restart',
]);

function renderHelp() {
  const rows = ACTIONS.flatMap(({ id, short }) => {
    if (!PAGE_ACTIONS.has(id)) return [];
    const codes = settings.bindings[id] || [];
    if (codes.length === 0) return [];

    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = codes.map(keyLabel).join(' / ');
    const dd = document.createElement('dd');
    dd.textContent = short;
    row.append(dt, dd);
    return [row];
  });
  ui.helpList.replaceChildren(...rows);
}

/* ---------- toasts ---------- */

let toastTimer = null;
function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('is-visible'), 900);
}

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

game.on('clear', (rows) => renderer.flash(rows));

game.on('lock', ({ cleared, tspin }) => {
  const n = cleared.length;
  if (!tspin && n === 0) return;

  const parts = [];
  if (tspin) parts.push(tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN');
  if (n > 0) parts.push(CLEAR_NAMES[n]);
  if (n > 0 && game.combo > 0) parts.push(`${game.combo}x COMBO`);
  if (n > 0 && game.backToBack && (tspin || n === 4)) parts.unshift('B2B');
  toast(parts.join(' · '));
});

game.on('score', syncStats);
game.on('level', (level) => toast(`LEVEL ${level}`));
game.on('state', paintOverlay);
game.on('gameover', () => {
  input.releaseAll();
  paintOverlay();
});

/* ---------- input ---------- */

function startGame() {
  game.start();
  syncStats();
}

const input = new Input({
  move: (dir) => game.move(dir),
  softDrop: () => game.softDrop(),
  hardDrop: () => game.hardDrop(),
  rotate: (dir) => game.rotate(dir),
  hold: () => game.holdPiece(),
  pause: () => {
    if (game.state === 'ready') startGame();
    else game.togglePause();
  },
  restart: () => {
    game.reset();
    startGame();
  },
}, settings);
input.attach();

/* ---------- settings ---------- */

const panel = new SettingsPanel({
  root: $('settings'),
  keymap: $('keymap'),
  sliders: $('sliders'),
  note: $('settings-note'),
  open: $('settings-open'),
  close: $('settings-close'),
  reset: $('settings-reset'),
  done: $('settings-done'),
}, settings, {
  onOpen: () => {
    // Rebinding while pieces are falling would be unfair and confusing.
    if (game.state === 'playing') game.togglePause();
    input.enabled = false;
    input.releaseAll();
  },
  onClose: () => {
    input.enabled = true;
  },
  onChange: (next) => {
    saveSettings(next);
    input.applySettings(next);
    renderHelp();
    paintOverlay();
  },
});

// The title overlay promises "press any key", so intercept the very first
// keypress in the capture phase and spend it on starting rather than letting
// it fall through to Input and, say, hard-drop the opening piece.
window.addEventListener('keydown', (e) => {
  if (panel.isOpen || game.state !== 'ready') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  startGame();
}, true);

/* ---------- pointer controls ---------- */

for (const button of document.querySelectorAll('[data-action]')) {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (game.state === 'ready' || game.state === 'over') {
      if (game.state === 'over') game.reset();
      return startGame();
    }
    switch (action) {
      case 'left': game.move(-1); break;
      case 'right': game.move(1); break;
      case 'down': game.softDrop(); break;
      case 'rotate': game.rotate(1); break;
      case 'drop': game.hardDrop(); break;
      case 'hold': game.holdPiece(); break;
      case 'pause': game.togglePause(); break;
    }
  });
}

ui.overlay.addEventListener('pointerdown', () => {
  if (game.state === 'ready') startGame();
  else if (game.state === 'paused') game.togglePause();
  else if (game.state === 'over') {
    game.reset();
    startGame();
  }
});

/* ---------- loop ---------- */

let last = performance.now();
function frame(now) {
  // Clamp dt so a backgrounded tab does not resume with a huge catch-up step.
  const dt = Math.min(now - last, 100);
  last = now;

  if (game.state === 'playing') {
    input.update(dt);
    game.update(dt);
  }
  renderer.draw(game);
  requestAnimationFrame(frame);
}

// Pause automatically when the tab loses focus mid-game.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.togglePause();
});

syncStats();
renderHelp();
paintOverlay();
requestAnimationFrame(frame);
