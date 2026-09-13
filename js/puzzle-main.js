// The puzzle player. One page serves lessons, review and random puzzles —
// they differ only in which puzzles they line up and in what order.
//
// The engine runs with gravity off and a fixed bag, so a piece waits as long
// as you need. Every placement is recorded; a wrong one in a guided puzzle
// marks itself, explains itself, and rewinds.

import { Game } from './engine.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { ACTIONS, loadSettings, saveSettings, keyLabel } from './settings.js';
import { SettingsPanel } from './settings-ui.js';
import {
  PUZZLES, listByKind, puzzleAt, puzzleById, randomPuzzle, indexOfPuzzle, gameOptionsFor,
} from './puzzles.js';
import { PuzzleSession } from './puzzle-session.js';
import { recordAttempt, recordSolved, entryFor, reviewOrder } from './progress.js';

const $ = (id) => document.getElementById(id);

// How long a wrong placement stays on the board before it rewinds itself.
// Long enough to see what you did, short enough not to feel like a penalty.
const REWIND_DELAY_MS = 1000;

const MODE_LABEL = { lesson: '레슨', review: '복습', random: '랜덤 퍼즐', single: '퍼즐' };

const ui = {
  mode: $('puzzle-mode'),
  title: $('puzzle-title'),
  num: $('puzzle-num'),
  progress: $('progress'),
  moves: $('moves'),
  brief: $('brief'),
  hint: $('hint'),
  bubble: $('bubble'),
  well: $('well'),
  result: $('result'),
  resultTitle: $('result-title'),
  resultText: $('result-text'),
  helpList: $('help-list'),
  undo: $('btn-undo'),
};

const settings = loadSettings();
const renderer = new Renderer($('board'), $('hold-canvas'), $('next-canvas'));

let route = resolveRoute();
let puzzle = null;
let game = null;
let session = null;
let attemptRecorded = false;
let inputLocked = false;
let rewindTimer = null;
let resultTimer = null;

/* ---------- routing ---------- */

// The URL decides what to play: an explicit puzzle (?n= or ?id=) or a mode
// that supplies its own running order.
function resolveRoute() {
  const params = new URLSearchParams(location.search);
  const byIndex = Number(params.get('n'));
  const byId = params.get('id');

  if (byId && puzzleById(byId)) return { mode: 'single', list: [puzzleById(byId)], at: 0 };
  if (Number.isInteger(byIndex) && puzzleAt(byIndex)) {
    return { mode: 'single', list: PUZZLES.slice(), at: byIndex - 1 };
  }

  const mode = params.get('mode');
  if (mode === 'review') {
    const list = reviewOrder(PUZZLES);
    if (list.length) return { mode: 'review', list, at: 0 };
    return { mode: 'random', list: [randomPuzzle()], at: 0 };
  }
  if (mode === 'random') return { mode: 'random', list: [randomPuzzle()], at: 0 };

  const lessons = listByKind('lesson');
  const firstUnsolved = lessons.findIndex((p) => !entryFor(p.id).solved);
  return { mode: 'lesson', list: lessons, at: firstUnsolved === -1 ? 0 : firstUnsolved };
}

function advance() {
  if (route.mode === 'random') {
    route.list = [randomPuzzle(Math.random, puzzle?.id)];
    route.at = 0;
  } else if (route.at + 1 < route.list.length) {
    route.at += 1;
  } else {
    route.at = 0;
  }
  load(route.list[route.at]);
}

/* ---------- loading a puzzle ---------- */

function load(next) {
  clearTimeout(rewindTimer);
  clearTimeout(resultTimer);
  inputLocked = false;
  attemptRecorded = false;
  puzzle = next;

  game = new Game(gameOptionsFor(puzzle));
  session = new PuzzleSession(puzzle, game);
  wireSession();
  game.start();

  renderer.clearMark();
  hideBubble();
  hideResult();
  paintChrome();

  const url = new URL(location.href);
  url.searchParams.set('id', puzzle.id);
  url.searchParams.delete('n');
  history.replaceState(null, '', url);
}

function paintChrome() {
  ui.mode.textContent = MODE_LABEL[route.mode] || '퍼즐';
  ui.title.textContent = puzzle.title;
  ui.num.textContent = `${indexOfPuzzle(puzzle.id)} / ${PUZZLES.length}`;
  ui.brief.textContent = puzzle.brief || '';
  ui.hint.textContent = puzzle.hint ? `힌트 — ${puzzle.hint}` : '';
  ui.hint.hidden = true;
  $('btn-hint').disabled = !puzzle.hint;
  paintStats();
}

function paintStats() {
  ui.moves.textContent = session.movesMade;
  ui.progress.textContent = puzzle.mode === 'guided'
    ? `${session.stepsDone} / ${session.totalSteps} 수`
    : `조각 ${game.queue.length + (game.current ? 1 : 0)}개 남음`;
  ui.undo.disabled = !session.canUndo;
}

/* ---------- verdicts ---------- */

function wireSession() {
  session.on('verdict', (verdict) => {
    markAttempt();
    renderer.mark(verdict.cells, verdict.ok);
    showBubble(verdict.note, verdict.cells, verdict.ok);
    paintStats();

    if (verdict.ok) return;

    // Hold the wrong placement on screen, then put it back so the player can
    // simply try again — no button to press, no lost position.
    inputLocked = true;
    rewindTimer = setTimeout(() => {
      session.undo();
      inputLocked = false;
      paintStats();
    }, REWIND_DELAY_MS);
  });

  session.on('move', () => {
    markAttempt();
    paintStats();
  });

  session.on('undo', () => paintStats());

  session.on('finished', ({ ok, note, moves }) => {
    if (ok) recordSolved(puzzle.id, moves);
    paintStats();
    // Let the tick and its bubble stand for a moment first — the result panel
    // blurs the board, and covering the winning move instantly robs it.
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => showResult(ok, note), puzzle.mode === 'guided' ? 950 : 300);
  });
}

function markAttempt() {
  if (attemptRecorded) return;
  attemptRecorded = true;
  recordAttempt(puzzle.id);
}

/* ---------- speech bubble ---------- */

function hideBubble() {
  ui.bubble.hidden = true;
}

// Anchored to the squares that were just played, above them when there is
// room and below them when there is not.
function showBubble(note, cells, ok) {
  if (!note) return hideBubble();

  ui.bubble.textContent = note;
  ui.bubble.classList.toggle('is-good', ok);
  ui.bubble.classList.toggle('is-bad', !ok);
  ui.bubble.hidden = false;

  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const anchorX = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5;

  requestAnimationFrame(() => {
    if (ui.bubble.hidden) return;
    const top = renderer.cellRect(anchorX, Math.min(...ys));
    const bottom = renderer.cellRect(anchorX, Math.max(...ys));
    const width = ui.bubble.offsetWidth;
    const height = ui.bubble.offsetHeight;
    const wellWidth = ui.well.clientWidth;

    const left = Math.max(8, Math.min(wellWidth - width - 8, top.left - width / 2));
    const above = top.top - height - 14;
    const below = above < 8;

    ui.bubble.style.left = `${left}px`;
    ui.bubble.style.top = `${below ? bottom.top + bottom.size + 14 : above}px`;
    ui.bubble.style.setProperty('--tail', `${Math.max(12, Math.min(width - 12, top.left - left))}px`);
    ui.bubble.classList.toggle('is-below', below);
  });
}

/* ---------- result ---------- */

function hideResult() {
  ui.result.hidden = true;
}

function showResult(ok, note) {
  ui.resultTitle.textContent = ok ? '해결' : '아직입니다';
  ui.resultText.textContent = note || (ok ? '' : '되돌려서 다시 시도해 보세요.');
  ui.result.classList.toggle('is-good', ok);
  ui.result.classList.toggle('is-bad', !ok);
  ui.result.hidden = false;
}

/* ---------- controls ---------- */

const actions = {
  undo: () => {
    if (inputLocked) return;
    clearTimeout(rewindTimer);
    clearTimeout(resultTimer);
    hideBubble();
    renderer.clearMark();
    hideResult();
    session.undo();
    paintStats();
  },
  restart: () => {
    clearTimeout(rewindTimer);
    clearTimeout(resultTimer);
    inputLocked = false;
    hideBubble();
    renderer.clearMark();
    hideResult();
    session.restart();
    paintStats();
  },
};

ui.undo.addEventListener('click', actions.undo);
$('btn-restart').addEventListener('click', actions.restart);
$('btn-next').addEventListener('click', advance);
$('btn-hint').addEventListener('click', () => { ui.hint.hidden = !ui.hint.hidden; });
$('result-retry').addEventListener('click', actions.restart);
$('result-next').addEventListener('click', advance);

const input = new Input({
  move: (dir) => !inputLocked && game.move(dir),
  softDrop: () => !inputLocked && game.softDrop(),
  hardDrop: () => { if (!inputLocked) game.hardDrop(); },
  rotate: (dir) => !inputLocked && game.rotate(dir),
  hold: () => !inputLocked && game.holdPiece(),
  undo: actions.undo,
  restart: actions.restart,
  pause: () => {},
}, settings);
input.attach();

for (const button of document.querySelectorAll('[data-action]')) {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (inputLocked) return;
    switch (action) {
      case 'left': game.move(-1); break;
      case 'right': game.move(1); break;
      case 'down': game.softDrop(); break;
      case 'rotate': game.rotate(1); break;
      case 'drop': game.hardDrop(); break;
      case 'hold': game.holdPiece(); break;
    }
  });
}

/* ---------- key legend ---------- */

const PAGE_ACTIONS = new Set([
  'left', 'right', 'softDrop', 'hardDrop',
  'rotateCW', 'rotateCCW', 'rotate180', 'hold', 'undo', 'restart',
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
    dd.textContent = id === 'restart' ? '처음으로' : short;
    row.append(dt, dd);
    return [row];
  });
  ui.helpList.replaceChildren(...rows);
}

new SettingsPanel({
  root: $('settings'),
  keymap: $('keymap'),
  sliders: $('sliders'),
  note: $('settings-note'),
  open: $('settings-open'),
  close: $('settings-close'),
  reset: $('settings-reset'),
  done: $('settings-done'),
}, settings, {
  onOpen: () => { input.enabled = false; input.releaseAll(); },
  onClose: () => { input.enabled = true; },
  onChange: (next) => {
    saveSettings(next);
    input.applySettings(next);
    renderHelp();
  },
});

/* ---------- loop ---------- */

function frame() {
  renderer.draw(game);
  requestAnimationFrame(frame);
}

renderHelp();
load(route.list[route.at]);
requestAnimationFrame(frame);
