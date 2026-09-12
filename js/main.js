// Wires the engine, renderer and input together and owns the animation loop.

import { Game } from './engine.js';
import { Renderer } from './render.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);

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
};

function formatScore(n) {
  return n.toLocaleString('en-US');
}

function syncStats() {
  ui.score.textContent = formatScore(game.score);
  ui.lines.textContent = game.lines;
  ui.level.textContent = game.level;
}

function showOverlay(title, text, hint) {
  ui.overlayTitle.textContent = title;
  ui.overlayText.textContent = text;
  ui.overlayHint.textContent = hint;
  ui.overlay.hidden = false;
}

function hideOverlay() {
  ui.overlay.hidden = true;
}

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

game.on('state', (state) => {
  if (state === 'paused') showOverlay('일시정지', '', 'P 또는 ESC 로 계속');
  else if (state === 'playing') hideOverlay();
});

game.on('gameover', ({ score, lines }) => {
  input.releaseAll();
  showOverlay('게임 오버', `점수 ${formatScore(score)} · ${lines}줄`, 'R 을 눌러 다시 시작');
});

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
    game.start();
    syncStats();
    hideOverlay();
  },
});
input.attach();

// The title overlay promises "press any key", so intercept the very first
// keypress in the capture phase and spend it on starting rather than letting
// it fall through to Input and, say, hard-drop the opening piece.
window.addEventListener('keydown', (e) => {
  if (game.state !== 'ready') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  startGame();
}, true);

function startGame() {
  game.start();
  syncStats();
  hideOverlay();
}

// On-screen controls for touch devices.
for (const button of document.querySelectorAll('[data-action]')) {
  const action = button.dataset.action;
  const fire = (e) => {
    e.preventDefault();
    if (game.state === 'ready' || game.state === 'over') return startGame();
    switch (action) {
      case 'left': game.move(-1); break;
      case 'right': game.move(1); break;
      case 'down': game.softDrop(); break;
      case 'rotate': game.rotate(1); break;
      case 'drop': game.hardDrop(); break;
      case 'hold': game.holdPiece(); break;
      case 'pause': game.togglePause(); break;
    }
  };
  button.addEventListener('pointerdown', fire);
}

ui.overlay.addEventListener('pointerdown', () => {
  if (game.state === 'ready') startGame();
  else if (game.state === 'paused') game.togglePause();
  else if (game.state === 'over') {
    game.reset();
    startGame();
  }
});

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
showOverlay('테트리스 퍼즐', '', '아무 키나 눌러 시작');
requestAnimationFrame(frame);
