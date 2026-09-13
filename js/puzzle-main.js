// The player for lessons and puzzles. One page serves every mode — they differ
// only in which items they line up and in what order.
//
// The engine runs with gravity off and a fixed bag, so a piece waits as long as
// you need. The session owns the engine, because an item can span several
// boards; this file reads session.game rather than holding one of its own.

import { Renderer } from './render.js';
import { Input } from './input.js';
import { ACTIONS, loadSettings, saveSettings, keyLabel } from './settings.js';
import { SettingsPanel } from './settings-ui.js';
import {
  ITEMS, itemAt, itemById, indexOfItem, randomItem,
  lessonQueue, reviewQueue, moveCountOf,
} from './content.js';
import { categoryName } from './taxonomy.js';
import { PuzzleSession } from './puzzle-session.js';
import { loadProgress, recordAttempt, recordResult } from './progress.js';

const $ = (id) => document.getElementById(id);

// How long a wrong placement stays on the board before it rewinds itself:
// long enough to see what you did, short enough not to feel like a penalty.
const REWIND_DELAY_MS = 1000;

const MODE_LABEL = { lesson: '레슨', review: '복습', random: '랜덤 퍼즐', single: '문제' };

// A right answer in a lesson holds the position. What the button says depends
// on what is waiting on the other side of the pause.
const NEXT_LABEL = { move: '다음 수 →', stage: '다음 판 →', finish: '완료 →' };

// While play is held, any key that would have moved a piece means "go on" —
// there is no piece to move, and reaching for the drop key to continue is the
// natural thing to do. Undo and restart keep doing their own jobs.
const CONTINUE_ACTIONS = new Set([
  'left', 'right', 'softDrop', 'hardDrop', 'rotateCW', 'rotateCCW', 'rotate180', 'hold',
]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const ui = {
  mode: $('puzzle-mode'),
  title: $('puzzle-title'),
  cat: $('puzzle-cat'),
  num: $('puzzle-num'),
  progress: $('progress'),
  stage: $('stage'),
  moves: $('moves'),
  brief: $('brief'),
  hint: $('hint'),
  bubble: $('bubble'),
  stagecard: $('stagecard'),
  well: $('well'),
  result: $('result'),
  resultTitle: $('result-title'),
  resultScore: $('result-score'),
  resultText: $('result-text'),
  resultOutro: $('result-outro'),
  breakdown: $('result-breakdown'),
  helpList: $('help-list'),
  undo: $('btn-undo'),
};

const settings = loadSettings();
const renderer = new Renderer($('board'), $('hold-canvas'), $('next-canvas'));

let route = resolveRoute();
let item = null;
let session = null;
let attemptRecorded = false;
let inputLocked = false;
let rewindTimer = null;
let cardTimer = null;

/* ---------- routing ---------- */

// The URL decides what to play: an explicit item (?n= or ?id=) or a mode that
// supplies its own running order.
function resolveRoute() {
  const params = new URLSearchParams(location.search);
  const byId = params.get('id');
  const byIndex = Number(params.get('n'));

  if (byId && itemById(byId)) {
    return { mode: 'single', list: ITEMS.slice(), at: indexOfItem(byId) - 1 };
  }
  if (Number.isInteger(byIndex) && itemAt(byIndex)) {
    return { mode: 'single', list: ITEMS.slice(), at: byIndex - 1 };
  }

  const progress = loadProgress();
  const mode = params.get('mode');

  if (mode === 'review') {
    const list = reviewQueue(progress);
    if (list.length) return { mode: 'review', list, at: 0 };
    return { mode: 'random', list: [randomItem()], at: 0 };
  }
  if (mode === 'random') return { mode: 'random', list: [randomItem()], at: 0 };

  const { list, at } = lessonQueue(progress);
  return { mode: 'lesson', list, at };
}

function advanceItem() {
  if (route.mode === 'random') {
    route.list = [randomItem(Math.random, item?.id)];
    route.at = 0;
  } else {
    route.at = (route.at + 1) % route.list.length;
  }
  load(route.list[route.at]);
}

/* ---------- loading ---------- */

function clearTimers() {
  clearTimeout(rewindTimer);
  clearTimeout(cardTimer);
}

function load(next) {
  clearTimers();
  inputLocked = false;
  attemptRecorded = false;
  item = next;

  session = new PuzzleSession(item);
  wireSession();

  renderer.clearMark();
  hideBubble();
  hideResult();
  paintChrome();

  const url = new URL(location.href);
  url.searchParams.set('id', item.id);
  url.searchParams.delete('n');
  history.replaceState(null, '', url);
}

function paintChrome() {
  ui.mode.textContent = MODE_LABEL[route.mode] || '문제';
  ui.title.textContent = item.title;
  ui.cat.textContent = categoryName(item.topic, item.level);
  ui.num.textContent = `${indexOfItem(item.id)} / ${ITEMS.length}`;
  ui.brief.textContent = item.brief || '';
  ui.hint.hidden = true;

  paintStats();
}

function paintStats() {
  ui.moves.textContent = session.movesMade;
  ui.stage.textContent = `${session.stageIndex + 1} / ${session.stageCount}`;
  ui.progress.textContent = session.guided
    ? `${session.matched.size} / ${session.movesInStage} 수`
    : `${session.movesMade} / ${session.movesInStage} 수`;
  ui.undo.disabled = !session.canUndo;
  paintHint();
}

// The hint belongs to the move you are about to make, not to the first move of
// the board. If the player had it open, it stays open and simply changes.
function paintHint() {
  const move = session.stage.moves[session.currentMoveIndex()] ?? session.stage.moves[0];
  const hint = move?.hint;
  const wasOpen = !ui.hint.hidden;

  ui.hint.textContent = hint ? `힌트 — ${hint}` : '';
  $('btn-hint').disabled = !hint;
  ui.hint.hidden = hint ? !wasOpen : true;
}

/* ---------- verdicts ---------- */

function wireSession() {
  session.on('stage', ({ index, stage }) => {
    renderer.clearMark();
    hideBubble();
    paintChrome();
    if (index > 0 && stage.label) showStageCard(stage.label);
  });

  session.on('verdict', (verdict) => {
    markAttempt();
    renderer.mark(verdict.cells, verdict.ok);
    paintStats();

    if (!verdict.ok) {
      // Hold the wrong placement on screen, then put it back so the player can
      // simply try again — no button to press, no lost position.
      showBubble(verdict.note, verdict.cells, false);
      inputLocked = true;
      rewindTimer = setTimeout(() => {
        session.undo();
        inputLocked = false;
        paintStats();
      }, REWIND_DELAY_MS);
      return;
    }

    // Right answer: the session is holding the position and no next piece has
    // been dealt. Nothing moves again until the player says so.
    inputLocked = true;
    showBubble(verdict.note, verdict.cells, true, {
      label: NEXT_LABEL[verdict.next] ?? '계속 →',
      onGo: proceed,
    });
  });

  // Puzzles stay quiet while you play; everything is said at the end.
  session.on('move', ({ stageDone }) => {
    markAttempt();
    paintStats();
    if (stageDone) session.advance();
  });

  session.on('undo', () => paintStats());
  session.on('finished', (result) => {
    recordResult(item.id, {
      solved: result.ok,
      percent: result.percent,
      moves: result.moves,
    });
    showResult(result);
    paintStats();
  });
}

function markAttempt() {
  if (attemptRecorded) return;
  attemptRecorded = true;
  recordAttempt(item.id);
}

/* ---------- speech bubble ---------- */

function hideBubble() {
  ui.bubble.hidden = true;
}

// Anchored to the squares that were just played, above them when there is
// room and below them when there is not. The continue control lives inside it
// so that it sits where the move was, and so a move with nothing to say still
// gets a button through the same code path.
function showBubble(note, cells, ok, action = null) {
  if (!note && !action) return hideBubble();

  ui.bubble.replaceChildren();
  if (note) ui.bubble.append(el('p', 'bubble__text', note));
  if (action) {
    const go = el('button', 'bubble__go', action.label);
    go.type = 'button';
    go.addEventListener('click', action.onGo);
    ui.bubble.append(go);
  }

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

// A brief banner when a lesson swaps the board out from under the player.
function showStageCard(label) {
  ui.stagecard.textContent = label;
  ui.stagecard.hidden = false;
  cardTimer = setTimeout(() => { ui.stagecard.hidden = true; }, 1400);
}

/* ---------- result ---------- */

function hideResult() {
  ui.result.hidden = true;
}

function showResult(result) {
  const { guided, ok, percent, grade, results, outro } = result;

  ui.resultTitle.textContent = guided ? '레슨 완료' : grade.name;
  ui.result.querySelector('.modal__sheet').dataset.tone = guided ? 'good' : grade.tone;

  ui.resultScore.hidden = guided;
  ui.resultScore.textContent = `${percent}점`;

  ui.resultText.textContent = guided
    ? '모든 수를 맞게 두었습니다.'
    : (ok ? '최선의 수만 골랐습니다.' : '각 수가 최선과 얼마나 달랐는지 아래에 있습니다.');

  // Puzzles show the move-by-move comparison; a lesson has already said
  // everything it had to say, one bubble at a time.
  ui.breakdown.hidden = guided;
  if (!guided) ui.breakdown.replaceChildren(...results.map(breakdownRow));

  ui.resultOutro.hidden = !outro;
  ui.resultOutro.textContent = outro || '';

  ui.result.hidden = false;
}

function breakdownRow(entry, index) {
  const row = document.createElement('li');
  row.className = 'bdrow';
  const matchedBest = entry.answer && entry.answer.score >= entry.best.score;
  row.dataset.tone = matchedBest ? 'good' : entry.answer ? 'mid' : 'bad';

  const head = document.createElement('div');
  head.className = 'bdrow__head';

  const num = document.createElement('span');
  num.className = 'bdrow__num';
  num.textContent = `${index + 1}수`;

  const name = document.createElement('span');
  name.className = 'bdrow__name';
  name.textContent = entry.answer ? entry.answer.label : '기록에 없는 수';

  const score = document.createElement('span');
  score.className = 'bdrow__score';
  score.textContent = `${entry.answer?.score ?? 0} / ${entry.best.score}`;

  head.append(num, name, score);

  const note = document.createElement('p');
  note.className = 'bdrow__note';
  note.textContent = entry.answer?.note ?? entry.note ?? '';

  row.append(head, note);

  if (!matchedBest) {
    const best = document.createElement('p');
    best.className = 'bdrow__best';
    best.textContent = `최선 — ${entry.best.label}: ${entry.best.note}`;
    row.append(best);
  }
  return row;
}

/* ---------- controls ---------- */

// One step out of a pause: the next piece on this board, the next board, or
// the result. Everything that resumes play goes through here.
function proceed() {
  if (!session.paused) return;
  clearTimeout(cardTimer);
  hideBubble();
  renderer.clearMark();
  session.proceed();
  inputLocked = false;
  paintStats();
}

const actions = {
  undo: () => {
    if (inputLocked) return;
    clearTimers();
    hideBubble();
    renderer.clearMark();
    hideResult();
    session.undo();
    paintStats();
  },
  restart: () => {
    clearTimers();
    inputLocked = false;
    hideBubble();
    renderer.clearMark();
    hideResult();
    session.restartAll();
    paintStats();
  },
};

ui.undo.addEventListener('click', actions.undo);
$('btn-restart').addEventListener('click', actions.restart);
$('btn-next').addEventListener('click', advanceItem);
$('btn-hint').addEventListener('click', () => { ui.hint.hidden = !ui.hint.hidden; });
$('result-retry').addEventListener('click', actions.restart);
$('result-next').addEventListener('click', advanceItem);

const input = new Input({
  move: (dir) => !inputLocked && session.game.move(dir),
  softDrop: () => !inputLocked && session.game.softDrop(),
  hardDrop: () => { if (!inputLocked) session.game.hardDrop(); },
  rotate: (dir) => !inputLocked && session.game.rotate(dir),
  hold: () => !inputLocked && session.game.holdPiece(),
  undo: actions.undo,
  restart: actions.restart,
  pause: () => {},
}, settings);
input.attach();

// Held-position keyboard: Enter, or any key that would have moved a piece.
// Capture phase, so it is spent on continuing rather than reaching Input.
window.addEventListener('keydown', (e) => {
  if (!session || !session.paused) return;
  const bound = input.lookup[e.code];
  if (e.code !== 'Enter' && !(bound && CONTINUE_ACTIONS.has(bound))) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  proceed();
}, true);

for (const button of document.querySelectorAll('[data-action]')) {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (session.paused) return proceed();
    if (inputLocked) return;
    switch (action) {
      case 'left': session.game.move(-1); break;
      case 'right': session.game.move(1); break;
      case 'down': session.game.softDrop(); break;
      case 'rotate': session.game.rotate(1); break;
      case 'drop': session.game.hardDrop(); break;
      case 'hold': session.game.holdPiece(); break;
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
  renderer.draw(session.game);
  requestAnimationFrame(frame);
}

renderHelp();
load(route.list[route.at]);
requestAnimationFrame(frame);
