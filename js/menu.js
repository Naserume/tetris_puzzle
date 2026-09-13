// The front page: pick a mode, or walk the taxonomy and open any item directly.

import {
  ITEMS, lessonItems, puzzleItems, itemsIn, indexOfItem,
} from './content.js';
import {
  TIERS, LEVELS, topicsInTier, topicById, levelName, plannedFor,
} from './taxonomy.js';
import { loadProgress, entryFor, clearProgress } from './progress.js';
import { reviewQueue } from './content.js';
import { loadSettings, saveSettings } from './settings.js';
import { SettingsPanel } from './settings-ui.js';

const $ = (id) => document.getElementById(id);

const KIND_LABEL = { lesson: '레슨', puzzle: '퍼즐' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const solvedCount = (items) => items.filter((i) => entryFor(i.id).solved).length;

/* ---------- mode cards ---------- */

function renderCards() {
  const lessons = lessonItems();
  $('meta-lesson').textContent = `${solvedCount(lessons)} / ${lessons.length} 완료`;

  const review = reviewQueue(loadProgress());
  $('meta-review').textContent = review.length
    ? `${review.length}문제 대기`
    : '복습할 문제가 없습니다';
  document.querySelector('.card--review').classList.toggle('is-disabled', review.length === 0);

  const puzzles = puzzleItems();
  $('meta-random').textContent = `퍼즐 ${puzzles.length}문제`;

  const solved = solvedCount(ITEMS);
  $('meta-play').textContent = solved > 0 ? `문제 ${solved}개 해결` : '기록 없음';
}

/* ---------- the taxonomy, walked ---------- */

function itemRow(item) {
  const entry = entryFor(item.id);
  const row = el('li', 'irow' + (entry.solved ? ' is-solved' : ''));

  const link = el('a', 'irow__link');
  link.href = `puzzle.html?n=${indexOfItem(item.id)}`;

  link.append(
    el('span', 'irow__num', String(indexOfItem(item.id)).padStart(2, '0')),
    el('span', 'irow__name', item.title),
    el('span', `irow__kind irow__kind--${item.kind}`, KIND_LABEL[item.kind]),
  );

  const state = el('span', 'irow__state');
  if (item.kind === 'puzzle' && entry.bestPercent !== null) state.textContent = `${entry.bestPercent}점`;
  else if (entry.solved) state.textContent = '해결';
  else if (entry.attempts > 0) state.textContent = `시도 ${entry.attempts}`;
  link.append(state);

  row.append(link);
  return row;
}

// A category is shown when it holds something or when it is on the plan.
// An empty-but-planned slot is information: it says the shape is intended.
function categoryBlock(topic, level) {
  const items = itemsIn(topic.id, level.id);
  const planned = plannedFor(topic.id, level.id);
  if (items.length === 0 && planned.length === 0) return null;

  const block = el('div', 'cat' + (items.length === 0 ? ' is-planned' : ''));

  const head = el('div', 'cat__head');
  head.append(el('span', 'cat__level', levelName(level.id)));
  head.append(el('span', 'cat__count', items.length ? `${items.length}문제` : '준비 중'));
  block.append(head);

  if (items.length) {
    const list = el('ul', 'cat__items');
    list.append(...items.map(itemRow));
    block.append(list);
  } else {
    block.append(el('p', 'cat__planned', planned.join(' · ')));
  }
  return block;
}

function topicBlock(topic) {
  const blocks = LEVELS.map((level) => categoryBlock(topic, level)).filter(Boolean);
  if (blocks.length === 0) return null;

  const section = el('section', 'topic');
  const head = el('h4', 'topic__name', topic.name);
  if (topic.note) head.append(el('span', 'topic__note', topic.note));
  section.append(head, ...blocks);
  return section;
}

function renderTiers() {
  const blocks = TIERS.map((tier) => {
    const topics = topicsInTier(tier.id).map(topicBlock).filter(Boolean);
    if (topics.length === 0) return null;

    const section = el('section', 'tier');
    const head = el('div', 'tier__head');
    head.append(el('h3', 'tier__name', tier.name));
    head.append(el('span', 'tier__tagline', tier.tagline));
    section.append(head, ...topics);
    return section;
  }).filter(Boolean);

  $('tier-list').replaceChildren(...blocks);
}

function render() {
  renderCards();
  renderTiers();
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
