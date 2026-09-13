// The content index. Lessons and puzzles share one shape and one address
// space, so a mode is only ever a rule for picking from this list.

import { COLS, ROWS } from './engine.js';
import { LESSONS } from './lessons.js';
import { PUZZLES } from './puzzle-bank.js';
import { compareByTaxonomy, tierOfTopic } from './taxonomy.js';

// Board rows are written top-down, '.' for empty and any other letter for a
// filled cell of that colour. Only the bottom rows need listing; the board is
// padded upward to full height.
export function buildGrid(rows) {
  const grid = [];
  for (let i = 0; i < ROWS - rows.length; i++) grid.push(new Array(COLS).fill(null));
  for (const row of rows) {
    const padded = row.padEnd(COLS, '.').slice(0, COLS);
    grid.push([...padded].map((c) => (c === '.' ? null : c)));
  }
  return grid;
}

// Placements are compared as sets of squares, not as (x, y, rotation): two
// rotation states of S, Z or I can cover exactly the same cells, and a player
// who covers the right cells has made the right move whichever way they got
// there.
export function cellKey(cells) {
  return cells.map(([x, y]) => `${x},${y}`).sort().join(' ');
}

export function gameOptionsFor(stage) {
  return {
    grid: buildGrid(stage.board),
    queue: stage.queue.slice(),
    hold: stage.hold || null,
    gravity: false,
  };
}

const tag = (item, kind) => ({ ...item, kind });

export const ITEMS = [
  ...LESSONS.map((l) => tag(l, 'lesson')),
  ...PUZZLES.map((p) => tag(p, 'puzzle')),
].sort(compareByTaxonomy);

export const lessonItems = () => ITEMS.filter((i) => i.kind === 'lesson');
export const puzzleItems = () => ITEMS.filter((i) => i.kind === 'puzzle');

export function itemById(id) {
  return ITEMS.find((i) => i.id === id) || null;
}

// 1-based, so "4번째 문제" is itemAt(4).
export function itemAt(n) {
  return ITEMS[n - 1] || null;
}

export function indexOfItem(id) {
  return ITEMS.findIndex((i) => i.id === id) + 1;
}

export function itemsIn(topic, level) {
  return ITEMS.filter((i) => i.topic === topic && i.level === level);
}

export function randomItem(rng = Math.random, excludeId = null) {
  const pool = puzzleItems().filter((i) => i.id !== excludeId);
  const from = pool.length ? pool : puzzleItems();
  return from[Math.floor(rng() * from.length)] || null;
}

/* ---------- scoring shape ---------- */

export const movesOf = (item) => item.stages.flatMap((stage) => stage.moves);

export function bestAnswer(move) {
  return move.answers.reduce((best, a) => (a.score > best.score ? a : best), move.answers[0]);
}

export function maxScoreOf(item) {
  return movesOf(item).reduce((sum, move) => sum + bestAnswer(move).score, 0);
}

export const moveCountOf = (item) => movesOf(item).length;

// 100 is the best line of play; the bands below it are what the result panel
// calls the attempt.
export function gradeOf(percent) {
  if (percent >= 100) return { id: 'best', name: '최선', tone: 'good' };
  if (percent >= 70) return { id: 'good', name: '좋음', tone: 'good' };
  if (percent >= 40) return { id: 'fair', name: '보통', tone: 'mid' };
  if (percent > 0) return { id: 'weak', name: '아쉬움', tone: 'bad' };
  return { id: 'none', name: '놓침', tone: 'bad' };
}

/* ---------- review ---------- */

// Review rehearses what the lessons you have finished taught: puzzles from the
// same topics, weakest result first. With no lessons done yet it falls back to
// the first-tier puzzles, so the mode is never empty for a new player.
export function reviewQueue(progress = {}, limit = 6) {
  const topics = new Set(
    lessonItems().filter((l) => progress[l.id]?.solved).map((l) => l.topic),
  );

  const matching = puzzleItems().filter((p) => topics.has(p.topic));
  const pool = matching.length
    ? matching
    : puzzleItems().filter((p) => tierOfTopic(p.topic) === 1);

  return [...pool]
    .sort((a, b) => {
      const ea = progress[a.id] || {};
      const eb = progress[b.id] || {};
      const sa = ea.bestPercent ?? -1;
      const sb = eb.bestPercent ?? -1;
      if (sa !== sb) return sa - sb;
      return (ea.lastAt || 0) - (eb.lastAt || 0);
    })
    .slice(0, limit);
}

// Lessons in teaching order, resuming at the first one not yet solved.
export function lessonQueue(progress = {}) {
  const list = lessonItems();
  const at = list.findIndex((l) => !progress[l.id]?.solved);
  return { list, at: at === -1 ? 0 : at };
}
