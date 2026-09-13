// Checks the content: that the taxonomy is coherent, that every listed answer
// is a move a player can actually make, and that lessons and puzzles judge,
// rewind and score the way they claim to.
//
//   node tests/content.test.mjs
//
// Reachability is not taken on trust. For each board the test searches the
// placements a piece can really arrive at from spawn — moves, rotations with
// SRS kicks, drops — and every answer written down has to appear in that set.
// An answer nobody can reach fails here rather than in front of a player.

import { COLS, ROWS, cellsOf, collides } from '../js/engine.js';
import { kicksFor } from '../js/pieces.js';
import {
  ITEMS, lessonItems, puzzleItems, itemById, itemAt, indexOfItem, itemsIn,
  buildGrid, cellKey, movesOf, bestAnswer, maxScoreOf, gradeOf,
  reviewQueue, lessonQueue, randomItem,
} from '../js/content.js';
import { PuzzleSession } from '../js/puzzle-session.js';
import { TIERS, TOPICS, LEVELS, PLANNED, topicById, levelById, tierOfTopic, compareByTaxonomy } from '../js/taxonomy.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('FAIL  ' + name + ' -> ' + e.message); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m = '') => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m} ${A} !== ${B}`);
};

/* ---------- reachability search ---------- */

function tryRotate(grid, piece, dir) {
  const to = (piece.rot + dir + 4) % 4;
  for (const [dx, dy] of kicksFor(piece.type, piece.rot, to)) {
    const candidate = { ...piece, rot: to, x: piece.x + dx, y: piece.y + dy };
    if (!collides(grid, candidate)) return candidate;
  }
  return null;
}

function reachablePlacements(grid, type) {
  const start = { type, rot: 0, x: 3, y: 0 };
  if (collides(grid, start)) return new Map();

  const poseKey = (p) => `${p.x},${p.y},${p.rot}`;
  const seen = new Set([poseKey(start)]);
  const frontier = [start];
  const landings = new Map();

  while (frontier.length) {
    const piece = frontier.shift();
    if (collides(grid, { ...piece, y: piece.y + 1 })) {
      const cells = cellsOf(piece);
      landings.set(cellKey(cells), { ...piece, cells });
    }
    for (const next of [
      { ...piece, x: piece.x - 1 },
      { ...piece, x: piece.x + 1 },
      { ...piece, y: piece.y + 1 },
      tryRotate(grid, piece, 1),
      tryRotate(grid, piece, -1),
    ]) {
      if (!next || collides(grid, next)) continue;
      const key = poseKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      frontier.push(next);
    }
  }
  return landings;
}

// Drives the session's game to a landing and locks it there.
function play(session, cells) {
  const game = session.game;
  const landing = reachablePlacements(game.grid, game.current.type).get(cellKey(cells));
  if (!landing) throw new Error(`unreachable placement ${cellKey(cells)} for ${game.current.type}`);
  game.current = { type: landing.type, rot: landing.rot, x: landing.x, y: landing.y };
  game.lockPiece();
  return landing;
}

/* ---------- taxonomy ---------- */

t('every topic sits in a real tier', () => {
  for (const topic of TOPICS) {
    ok(TIERS.some((tier) => tier.id === topic.tier), `${topic.id} -> tier ${topic.tier}`);
  }
});

t('planned slots point at real categories', () => {
  for (const slot of PLANNED) {
    ok(topicById(slot.topic), `unknown topic ${slot.topic}`);
    ok(levelById(slot.level), `unknown level ${slot.level}`);
    ok(slot.titles.length > 0, `${slot.topic}/${slot.level} is planned but names nothing`);
  }
});

t('a planned slot is never one that already has content', () => {
  for (const slot of PLANNED) {
    eq(itemsIn(slot.topic, slot.level).length, 0,
      `${slot.topic}/${slot.level} is both planned and populated`);
  }
});

t('every item is filed under a real topic and level', () => {
  const ids = new Set();
  for (const item of ITEMS) {
    ok(item.id && !ids.has(item.id), `duplicate or missing id: ${item.id}`);
    ids.add(item.id);
    ok(topicById(item.topic), `${item.id} -> unknown topic ${item.topic}`);
    ok(levelById(item.level), `${item.id} -> unknown level ${item.level}`);
    ok(item.title && item.brief, `${item.id} is missing its title or brief`);
    ok(item.kind === 'lesson' || item.kind === 'puzzle', `${item.id} has kind ${item.kind}`);
  }
});

t('the index is ordered tier, then topic, then level', () => {
  for (let i = 1; i < ITEMS.length; i++) {
    ok(compareByTaxonomy(ITEMS[i - 1], ITEMS[i]) <= 0,
      `${ITEMS[i - 1].id} should not come after ${ITEMS[i].id}`);
  }
});

t('items can be fetched by number and by id', () => {
  eq(itemAt(1).id, ITEMS[0].id);
  eq(itemAt(ITEMS.length).id, ITEMS[ITEMS.length - 1].id);
  eq(itemAt(0), null);
  eq(itemAt(ITEMS.length + 1), null);
  eq(indexOfItem(ITEMS[2].id), 3);
  eq(itemById('nope'), null);
});

/* ---------- board and answer sanity ---------- */

t('every stage board is a legal starting position', () => {
  for (const item of ITEMS) {
    for (const [i, stage] of item.stages.entries()) {
      const grid = buildGrid(stage.board);
      eq(grid.length, ROWS, item.id);
      for (const row of grid) eq(row.length, COLS, item.id);
      const full = grid.findIndex((row) => row.every((c) => c !== null));
      eq(full, -1, `${item.id} stage ${i}: row ${full} is already complete`);
      ok(stage.queue.length > 0, `${item.id} stage ${i} has an empty bag`);
    }
  }
});

t('every stage has as many pieces as it has moves', () => {
  for (const item of ITEMS) {
    for (const [i, stage] of item.stages.entries()) {
      eq(stage.queue.length, stage.moves.length, `${item.id} stage ${i}`);
    }
  }
});

t('every move ranks at least one answer, best first', () => {
  for (const item of ITEMS) {
    for (const move of movesOf(item)) {
      ok(move.answers?.length > 0, `${item.id} has a move with no answers`);
      for (const answer of move.answers) {
        eq(answer.cells.length, 4, `${item.id}: an answer is not four cells`);
        ok(typeof answer.score === 'number', `${item.id}: an answer has no score`);
        ok(answer.note, `${item.id}: an answer has no explanation`);
      }
      const scores = move.answers.map((a) => a.score);
      eq(scores, [...scores].sort((a, b) => b - a), `${item.id}: answers are out of order`);
      ok(move.defaultWrong, `${item.id}: a move has no fallback explanation`);
    }
  }
});

t('no two answers in a move describe the same placement', () => {
  for (const item of ITEMS) {
    for (const move of movesOf(item)) {
      const keys = move.answers.map((a) => cellKey(a.cells));
      eq(new Set(keys).size, keys.length, `${item.id} repeats an answer`);
    }
  }
});

/* ---------- every answer is playable ---------- */

t('every ranked answer is a placement a player can actually reach', () => {
  for (const item of ITEMS) {
    const session = new PuzzleSession(item);

    for (let s = 0; s < item.stages.length; s++) {
      const stage = item.stages[s];
      const order = stage.moves.map((_, i) => i);

      for (let step = 0; step < stage.moves.length; step++) {
        const game = session.game;
        ok(game.current, `${item.id} stage ${s}: ran out of pieces at move ${step}`);
        const landings = reachablePlacements(game.grid, game.current.type);

        const candidates = stage.ordered === false ? order : [order[0]];
        const chosen = candidates.find((i) =>
          landings.has(cellKey(bestAnswer(stage.moves[i]).cells)));
        ok(chosen !== undefined,
          `${item.id} stage ${s} move ${step}: the best answer is not reachable`);

        // Every alternative listed for this move has to be playable too —
        // scoring a move nobody can make would be a lie on the result screen.
        for (const answer of stage.moves[chosen].answers) {
          ok(landings.has(cellKey(answer.cells)),
            `${item.id} stage ${s}: "${answer.label}" is not reachable`);
        }

        order.splice(order.indexOf(chosen), 1);
        play(session, bestAnswer(stage.moves[chosen]).cells);
      }
      if (session.awaitingAdvance) session.advance();
    }
  }
});

/* ---------- lessons ---------- */

function solveLesson(item) {
  const session = new PuzzleSession(item);
  const verdicts = [];
  const stages = [];
  session.on('verdict', (v) => verdicts.push(v));
  session.on('stage', (s) => stages.push(s.index));
  session.on('finished', (f) => { session.last = f; });

  for (let s = 0; s < item.stages.length; s++) {
    const stage = item.stages[s];
    const order = stage.moves.map((_, i) => i);
    for (let step = 0; step < stage.moves.length; step++) {
      const landings = reachablePlacements(session.game.grid, session.game.current.type);
      const candidates = stage.ordered === false ? order : [order[0]];
      const chosen = candidates.find((i) => landings.has(cellKey(bestAnswer(stage.moves[i]).cells)));
      order.splice(order.indexOf(chosen), 1);
      play(session, bestAnswer(stage.moves[chosen]).cells);
    }
    session.advance();
  }
  return { session, verdicts, stages };
}

t('playing the best answers completes every lesson', () => {
  for (const item of lessonItems()) {
    const { session, verdicts } = solveLesson(item);
    ok(verdicts.every((v) => v.ok), `${item.id}: a best answer was judged wrong`);
    eq(verdicts.length, movesOf(item).length, item.id);
    eq(session.status, 'done', item.id);
    ok(session.last.ok, `${item.id}: finished without success`);
    eq(session.last.percent, 100, item.id);
  }
});

t('a multi-stage lesson loads its next board when the first is done', () => {
  const item = itemById('lesson-tsd');
  eq(item.stages.length, 2, 'this lesson is meant to have two stages');

  const session = new PuzzleSession(item);
  const boards = [JSON.stringify(session.game.grid)];
  session.on('stage', () => boards.push(JSON.stringify(session.game.grid)));

  eq(session.stageIndex, 0);
  play(session, bestAnswer(item.stages[0].moves[0]).cells);
  ok(session.awaitingAdvance, 'the stage should be waiting to move on');
  eq(session.stageIndex, 0, 'it does not switch boards on its own');

  session.advance();
  eq(session.stageIndex, 1, 'advance loads the next stage');
  ok(boards[1] !== boards[0], 'the second stage is a different board');
  ok(session.game.current, 'and it comes with its own piece');
});

t('a wrong move is explained, rewinds, and never ends the lesson', () => {
  const item = itemById('lesson-single');
  const session = new PuzzleSession(item);
  const finishes = [];
  let verdict = null;
  session.on('verdict', (v) => { verdict = v; });
  session.on('finished', (f) => finishes.push(f));

  const right = cellKey(bestAnswer(item.stages[0].moves[0]).cells);
  const landings = [...reachablePlacements(session.game.grid, 'I').values()];
  const wrong = landings.find((l) => cellKey(l.cells) !== right);
  play(session, wrong.cells);

  eq(verdict.ok, false);
  ok(verdict.note, 'a wrong move should come with a reason');
  eq(finishes, [], 'no verdict on the whole attempt');
  eq(session.status, 'playing');

  ok(session.undo(), 'the move can be taken back');
  ok(session.game.current, 'and the piece is back in hand');
  eq(session.movesMade, 0);
});

t('a lower-ranked answer is refused, but in its own words', () => {
  const item = itemById('lesson-tsd');
  const move = item.stages[0].moves[0];
  ok(move.answers.length > 1, 'this lesson lists a near-miss');

  const session = new PuzzleSession(item);
  let verdict = null;
  session.on('verdict', (v) => { verdict = v; });
  play(session, move.answers[1].cells);

  eq(verdict.ok, false, 'only the best answer counts in a lesson');
  eq(verdict.note, move.answers[1].note, 'and it is answered on its own terms');
  eq(verdict.label, move.answers[1].label);
});

t('undo after a line clear restores the cleared rows', () => {
  const item = itemById('lesson-double');
  const session = new PuzzleSession(item);
  const before = JSON.stringify(session.game.grid);

  play(session, bestAnswer(item.stages[0].moves[0]).cells);
  eq(session.game.lines, 2, 'two rows went away');

  session.undo();
  eq(JSON.stringify(session.game.grid), before, 'the rows came back');
  eq(session.game.lines, 0, 'the line count rewound too');
  eq(session.matched.size, 0, 'the credited move was un-credited');
});

t('an unordered stage accepts its moves in either order', () => {
  const item = itemById('lesson-twin-box');
  eq(item.stages[0].ordered, false, 'this lesson is meant to be unordered');

  const session = new PuzzleSession(item);
  const verdicts = [];
  session.on('verdict', (v) => verdicts.push(v.ok));

  play(session, bestAnswer(item.stages[0].moves[1]).cells);
  play(session, bestAnswer(item.stages[0].moves[0]).cells);

  eq(verdicts, [true, true], 'both orders should be accepted');
  ok(session.awaitingAdvance);
});

t('restarting the whole item goes back to the first stage', () => {
  const item = itemById('lesson-tsd');
  const session = new PuzzleSession(item);
  play(session, bestAnswer(item.stages[0].moves[0]).cells);
  session.advance();
  eq(session.stageIndex, 1);

  session.restartAll();
  eq(session.stageIndex, 0);
  eq(session.movesMade, 0);
  eq(session.results.length, 0);
});

/* ---------- puzzles ---------- */

t('a puzzle says nothing until the last piece is down', () => {
  const item = itemById('puzzle-perfect');
  const session = new PuzzleSession(item);
  const events = [];
  session.on('verdict', () => events.push('verdict'));
  session.on('finished', () => events.push('finished'));

  play(session, bestAnswer(item.stages[0].moves[0]).cells);
  eq(events, [], 'nothing is said mid-attempt');

  play(session, bestAnswer(item.stages[0].moves[1]).cells);
  eq(events, [], 'still nothing until the page moves on');
  session.advance();
  eq(events, ['finished'], 'the verdict arrives once, at the end');
});

t('the best line of play scores 100', () => {
  for (const item of puzzleItems()) {
    const session = new PuzzleSession(item);
    let result = null;
    session.on('finished', (f) => { result = f; });

    for (const stage of item.stages) {
      const order = stage.moves.map((_, i) => i);
      for (let step = 0; step < stage.moves.length; step++) {
        const landings = reachablePlacements(session.game.grid, session.game.current.type);
        const candidates = stage.ordered === false ? order : [order[0]];
        const chosen = candidates.find((i) => landings.has(cellKey(bestAnswer(stage.moves[i]).cells)));
        order.splice(order.indexOf(chosen), 1);
        play(session, bestAnswer(stage.moves[chosen]).cells);
      }
      session.advance();
    }
    eq(result.percent, 100, item.id);
    eq(result.grade.id, 'best', item.id);
    eq(result.results.length, movesOf(item).length, item.id);
  }
});

t('a second-best move scores what it is listed as', () => {
  const item = itemById('puzzle-tspin-choice');
  const move = item.stages[0].moves[0];
  const second = move.answers[1];

  const session = new PuzzleSession(item);
  let result = null;
  session.on('finished', (f) => { result = f; });

  play(session, second.cells);
  session.advance();

  eq(result.score, second.score, 'the listed score is what it pays');
  eq(result.percent, Math.round((second.score / maxScoreOf(item)) * 100));
  eq(result.results[0].answer.label, second.label, 'the breakdown names the move played');
  eq(result.results[0].best.label, move.answers[0].label, 'and what the best was');
  ok(!result.ok, 'short of the best line is not a clean solve');
});

t('an unlisted move scores nothing but still finishes the puzzle', () => {
  const item = itemById('puzzle-tspin-choice');
  const listed = new Set(item.stages[0].moves[0].answers.map((a) => cellKey(a.cells)));

  const session = new PuzzleSession(item);
  let result = null;
  session.on('finished', (f) => { result = f; });

  const stray = [...reachablePlacements(session.game.grid, 'T').values()]
    .find((l) => !listed.has(cellKey(l.cells)));
  play(session, stray.cells);
  session.advance();

  eq(result.score, 0);
  eq(result.percent, 0);
  eq(result.grade.id, 'none');
  eq(result.results[0].answer, null, 'nothing matched');
  ok(result.results[0].note, 'but the breakdown still says something');
});

t('grades band the way the result panel expects', () => {
  eq(gradeOf(100).id, 'best');
  eq(gradeOf(99).id, 'good');
  eq(gradeOf(70).id, 'good');
  eq(gradeOf(69).id, 'fair');
  eq(gradeOf(40).id, 'fair');
  eq(gradeOf(39).id, 'weak');
  eq(gradeOf(0).id, 'none');
});

/* ---------- modes ---------- */

t('lesson mode resumes at the first unsolved lesson', () => {
  const all = lessonItems();
  eq(lessonQueue({}).at, 0, 'a new player starts at the beginning');

  const progress = { [all[0].id]: { solved: true } };
  eq(lessonQueue(progress).at, 1, 'a solved lesson is skipped');

  const done = Object.fromEntries(all.map((l) => [l.id, { solved: true }]));
  eq(lessonQueue(done).at, 0, 'with everything solved it starts over');
});

t('review picks puzzles from the topics whose lessons are done', () => {
  const tsd = itemById('lesson-tsd');
  const queue = reviewQueue({ [tsd.id]: { solved: true } });
  ok(queue.length > 0, 'review should not be empty');
  ok(queue.every((p) => p.kind === 'puzzle'), 'review is made of puzzles');
  ok(queue.every((p) => p.topic === tsd.topic), 'and of the topic just learned');
});

t('review falls back to first-tier puzzles for a new player', () => {
  const queue = reviewQueue({});
  ok(queue.length > 0, 'a new player still gets something to review');
  ok(queue.every((p) => tierOfTopic(p.topic) === 1), 'and it is first-tier material');
});

t('review puts the weakest result first', () => {
  const tsd = itemById('lesson-tsd');
  const puzzles = puzzleItems().filter((p) => p.topic === tsd.topic);
  ok(puzzles.length >= 1);

  const progress = { [tsd.id]: { solved: true } };
  progress[puzzles[0].id] = { bestPercent: 100, lastAt: 1 };
  const queue = reviewQueue(progress);
  eq(queue[queue.length - 1].id, puzzles[0].id, 'a perfect score sinks to the bottom');
});

t('random only ever offers a puzzle, never a lesson', () => {
  for (let i = 0; i < 50; i++) eq(randomItem().kind, 'puzzle');
});

/* ---------- engine behaviour under puzzle options ---------- */

t('gravity is off, so a piece never falls or locks on its own', () => {
  const session = new PuzzleSession(itemById('lesson-single'));
  const y = session.game.current.y;
  session.game.update(10000);
  eq(session.game.current.y, y, 'the piece stayed where it was');
  eq(session.movesMade, 0, 'and nothing locked');
});

t('every stage board is drawn as garbage, not as loose tetrominoes', () => {
  for (const item of ITEMS) {
    for (const stage of item.stages) {
      for (const row of stage.board) {
        for (const cell of row) {
          ok(cell === '.' || cell === 'X',
            `${item.id}: board uses '${cell}'; preset blocks should be grey garbage`);
        }
      }
    }
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
