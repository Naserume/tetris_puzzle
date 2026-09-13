// The front page: pick a mode, or jump straight to a numbered puzzle.

import { PUZZLES, listByKind } from './puzzles.js';
import { loadProgress, entryFor, reviewOrder, clearProgress } from './progress.js';
import { loadSettings, saveSettings } from './settings.js';
import { SettingsPanel } from './settings-ui.js';

const $ = (id) => document.getElementById(id);

const KIND_LABEL = { lesson: '레슨', puzzle: '퍼즐' };
const MODE_LABEL = { guided: '한 수씩', free: '끝까지 두고 채점' };

function countSolved(puzzles) {
  return puzzles.filter((p) => entryFor(p.id).solved).length;
}

function renderCards() {
  const lessons = listByKind('lesson');
  const solvedLessons = countSolved(lessons);
  $('meta-lesson').textContent = `${solvedLessons} / ${lessons.length} 완료`;

  const review = reviewOrder(PUZZLES);
  const unsolved = review.filter((p) => !entryFor(p.id).solved).length;
  $('meta-review').textContent = review.length === 0
    ? '아직 풀어본 문제가 없습니다'
    : `${review.length}문제 · 미해결 ${unsolved}`;

  const card = document.querySelector('.card--review');
  card.classList.toggle('is-disabled', review.length === 0);
  if (review.length === 0) card.setAttribute('aria-disabled', 'true');
  else card.removeAttribute('aria-disabled');

  $('meta-random').textContent = `전체 ${PUZZLES.length}문제`;

  const solvedAll = countSolved(PUZZLES);
  $('meta-play').textContent = solvedAll > 0 ? `퍼즐 ${solvedAll}개 해결` : '기록 없음';
}

// Every puzzle is addressable by its position, so "n번째 문제" is a link.
function renderList() {
  const list = $('puzzle-list');
  const rows = PUZZLES.map((puzzle, i) => {
    const entry = entryFor(puzzle.id);
    const item = document.createElement('li');
    item.className = 'plist__row' + (entry.solved ? ' is-solved' : '');

    const link = document.createElement('a');
    link.className = 'plist__link';
    link.href = `puzzle.html?n=${i + 1}`;

    const num = document.createElement('span');
    num.className = 'plist__num';
    num.textContent = String(i + 1).padStart(2, '0');

    const name = document.createElement('span');
    name.className = 'plist__name';
    name.textContent = puzzle.title;

    const tags = document.createElement('span');
    tags.className = 'plist__tags';
    tags.textContent = `${KIND_LABEL[puzzle.kind] || puzzle.kind} · ${MODE_LABEL[puzzle.mode]}`;

    const state = document.createElement('span');
    state.className = 'plist__state';
    if (entry.solved) state.textContent = `해결 · 최소 ${entry.bestMoves}수`;
    else if (entry.attempts > 0) state.textContent = `시도 ${entry.attempts}회`;
    else state.textContent = '';

    link.append(num, name, tags, state);
    item.append(link);
    return item;
  });
  list.replaceChildren(...rows);
}

function render() {
  renderCards();
  renderList();
}

$('clear-progress').addEventListener('click', () => {
  if (Object.keys(loadProgress()).length === 0) return;
  clearProgress();
  render();
});

const settings = loadSettings();
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
  onChange: (next) => saveSettings(next),
});

render();
