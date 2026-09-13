// Checks every puzzle is actually solvable, and that the session judges,
// rewinds and finishes correctly:
//   node tests/puzzles.test.mjs
//
// Solvability is not taken on trust. For each puzzle the test searches the
// placements a piece can really reach from spawn — moves, rotations with SRS
// kicks, and drops — and only accepts a step that appears in that set. A
// puzzle whose answer cannot be reached fails here rather than in front of a
// player.

import { Game, COLS, ROWS, cellsOf, collides } from '../js/engine.js';
import { kicksFor } from '../js/pieces.js';
import { PUZZLES, buildGrid, cellKey, gameOptionsFor, puzzleAt, puzzleById, randomPuzzle } from '../js/puzzles.js';
import { PuzzleSession } from '../js/puzzle-session.js';

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

// Every distinct set of cells the piece can come to rest on.
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
    const moves = [
      { ...piece, x: piece.x - 1 },
      { ...piece, x: piece.x + 1 },
      { ...piece, y: piece.y + 1 },
      tryRotate(grid, piece, 1),
      tryRotate(grid, piece, -1),
    ];
    for (const next of moves) {
      if (!next || collides(grid, next)) continue;
      const key = poseKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      frontier.push(next);
    }
  }
  return landings;
}

// Drives the game to a specific landing and locks it there.
function playPlacement(game, landing) {
  game.current = { type: landing.type, rot: landing.rot, x: landing.x, y: landing.y };
  game.lockPiece();
}

function newGame(puzzle) {
  const game = new Game(gameOptionsFor(puzzle));
  game.start();
  return game;
}

/* ---------- data sanity ---------- */

t('every puzzle has an id, a title and a bag', () => {
  const ids = new Set();
  for (const p of PUZZLES) {
    ok(p.id && !ids.has(p.id), `duplicate or missing id: ${p.id}`);
    ids.add(p.id);
    ok(p.title, `${p.id} has no title`);
    ok(Array.isArray(p.queue) && p.queue.length > 0, `${p.id} has an empty bag`);
    ok(p.mode === 'guided' || p.mode === 'free', `${p.id} has an unknown mode`);
    if (p.mode === 'guided') ok(p.steps?.length > 0, `${p.id} is guided but has no steps`);
    if (p.mode === 'free') ok(p.goal, `${p.id} is free but has no goal`);
  }
});

t('boards parse to a full-height grid', () => {
  for (const p of PUZZLES) {
    const grid = buildGrid(p.board);
    eq(grid.length, ROWS, p.id);
    for (const row of grid) eq(row.length, COLS, p.id);
  }
});

t('no puzzle starts on an already-complete row', () => {
  for (const p of PUZZLES) {
    const grid = buildGrid(p.board);
    const full = grid.findIndex((row) => row.every((c) => c !== null));
    eq(full, -1, `${p.id} row ${full} is already full`);
  }
});

t('a puzzle can be fetched by index and by id', () => {
  eq(puzzleAt(1).id, PUZZLES[0].id);
  eq(puzzleAt(PUZZLES.length).id, PUZZLES[PUZZLES.length - 1].id);
  eq(puzzleAt(0), null);
  eq(puzzleAt(PUZZLES.length + 1), null);
  eq(puzzleById(PUZZLES[2].id).title, PUZZLES[2].title);
  eq(puzzleById('nope'), null);
});

t('random never returns the puzzle it was told to skip', () => {
  const skip = PUZZLES[0].id;
  for (let i = 0; i < 50; i++) ok(randomPuzzle(Math.random, skip).id !== skip);
});

/* ---------- solvability ---------- */

t('every guided step is reachable, in order, from the board before it', () => {
  for (const puzzle of PUZZLES.filter((p) => p.mode === 'guided')) {
    const game = newGame(puzzle);
    const remaining = puzzle.steps.map((s, i) => i);

    for (let move = 0; move < puzzle.steps.length; move++) {
      ok(game.current, `${puzzle.id}: ran out of pieces at move ${move}`);
      const landings = reachablePlacements(game.grid, game.current.type);

      // Ordered puzzles must match the next step; unordered ones any left.
      const candidates = puzzle.ordered === false ? remaining : [remaining[0]];
      const found = candidates.find((i) => landings.has(cellKey(puzzle.steps[i].cells)));
      ok(found !== undefined,
        `${puzzle.id}: step ${move} (${game.current.type}) is not reachable`);

      remaining.splice(remaining.indexOf(found), 1);
      playPlacement(game, landings.get(cellKey(puzzle.steps[found].cells)));
    }
  }
});

t('every free puzzle has at least one line of play that meets its goal', () => {
  for (const puzzle of PUZZLES.filter((p) => p.mode === 'free')) {
    const game = newGame(puzzle);
    const session = new PuzzleSession(puzzle, game);

    const solvable = (function search(depth) {
      if (!game.current) return session.goalMet();
      const landings = [...reachablePlacements(game.grid, game.current.type).values()];
      const before = game.snapshot();
      for (const landing of landings) {
        playPlacement(game, landing);
        if (search(depth + 1)) return true;
        game.restore(before);
      }
      return false;
    })(0);

    ok(solvable, `${puzzle.id}: no sequence of legal placements meets the goal`);
  }
});

/* ---------- session behaviour ---------- */

function solveGuided(puzzle, game, session) {
  const remaining = puzzle.steps.map((s, i) => i);
  while (remaining.length && game.current) {
    const landings = reachablePlacements(game.grid, game.current.type);
    const candidates = puzzle.ordered === false ? remaining : [remaining[0]];
    const found = candidates.find((i) => landings.has(cellKey(puzzle.steps[i].cells)));
    if (found === undefined) break;
    remaining.splice(remaining.indexOf(found), 1);
    playPlacement(game, landings.get(cellKey(puzzle.steps[found].cells)));
  }
  return session.status;
}

t('playing the solution solves every guided puzzle', () => {
  for (const puzzle of PUZZLES.filter((p) => p.mode === 'guided')) {
    const game = newGame(puzzle);
    const session = new PuzzleSession(puzzle, game);
    const verdicts = [];
    session.on('verdict', (v) => verdicts.push(v.ok));
    eq(solveGuided(puzzle, game, session), 'solved', puzzle.id);
    ok(verdicts.every(Boolean), `${puzzle.id}: a correct move was judged wrong`);
    eq(verdicts.length, puzzle.steps.length, puzzle.id);
  }
});

t('a wrong move is rejected and carries an explanation', () => {
  const puzzle = puzzleById('lesson-line');
  const game = newGame(puzzle);
  const session = new PuzzleSession(puzzle, game);

  const right = cellKey(puzzle.steps[0].cells);
  const landings = [...reachablePlacements(game.grid, 'I').values()];
  const wrong = landings.find((l) => cellKey(l.cells) !== right);
  ok(wrong, 'expected some other placement to exist');

  let verdict = null;
  session.on('verdict', (v) => { verdict = v; });
  playPlacement(game, wrong);

  eq(verdict.ok, false);
  ok(verdict.note, 'a wrong move should come with a reason');
  eq(session.stepsDone, 0);
});

t('a wrong move in a guided puzzle never ends the attempt', () => {
  // The one-piece lessons run the bag dry the moment a wrong move locks. The
  // player is meant to read the explanation and retry, not be told they lost.
  const puzzle = puzzleById('lesson-line');
  const game = newGame(puzzle);
  const session = new PuzzleSession(puzzle, game);

  const finishes = [];
  session.on('finished', (f) => finishes.push(f));

  const right = cellKey(puzzle.steps[0].cells);
  const wrong = [...reachablePlacements(game.grid, 'I').values()]
    .find((l) => cellKey(l.cells) !== right);
  playPlacement(game, wrong);

  eq(finishes, [], 'no verdict should be announced');
  eq(session.status, 'playing');
  ok(session.undo(), 'the move can still be taken back');
  ok(game.current, 'and the piece is back in hand');
});

t('undo puts the board and the piece back', () => {
  const puzzle = puzzleById('lesson-line');
  const game = newGame(puzzle);
  const session = new PuzzleSession(puzzle, game);

  const before = JSON.stringify(game.grid);
  const beforePiece = game.current.type;
  const landings = [...reachablePlacements(game.grid, 'I').values()];
  playPlacement(game, landings[0]);

  ok(session.canUndo, 'undo should be available after a move');
  ok(session.undo(), 'undo ran');
  eq(JSON.stringify(game.grid), before, 'grid restored');
  eq(game.current.type, beforePiece, 'the same piece is back in play');
  eq(session.movesMade, 0);
  eq(session.canUndo, false);
});

t('undo after a line clear restores the cleared rows', () => {
  const puzzle = puzzleById('lesson-double');
  const game = newGame(puzzle);
  const session = new PuzzleSession(puzzle, game);

  const before = JSON.stringify(game.grid);
  const landing = reachablePlacements(game.grid, 'O').get(cellKey(puzzle.steps[0].cells));
  playPlacement(game, landing);
  eq(game.lines, 2, 'two rows went away');

  session.undo();
  eq(JSON.stringify(game.grid), before, 'the rows came back');
  eq(game.lines, 0, 'the line count rewound too');
  eq(session.stepsDone, 0, 'the solved step was un-solved');
});

t('restart rewinds a multi-move puzzle all the way', () => {
  const puzzle = puzzleById('puzzle-twin-box');
  const game = newGame(puzzle);
  const session = new PuzzleSession(puzzle, game);
  const before = JSON.stringify(game.grid);

  const landings = reachablePlacements(game.grid, 'O');
  playPlacement(game, landings.get(cellKey(puzzle.steps[0].cells)));
  eq(session.movesMade, 1);

  session.restart();
  eq(session.movesMade, 0);
  eq(JSON.stringify(game.grid), before);
  eq(session.stepsDone, 0);
});

t('an unordered puzzle accepts its steps in either order', () => {
  const puzzle = puzzleById('puzzle-twin-box');
  eq(puzzle.ordered, false, 'this puzzle is meant to be unordered');

  const game = newGame(puzzle);
  const session = new PuzzleSession(puzzle, game);
  const verdicts = [];
  session.on('verdict', (v) => verdicts.push(v.ok));

  // Deliberately play the second step first.
  const first = reachablePlacements(game.grid, 'O').get(cellKey(puzzle.steps[1].cells));
  ok(first, 'step 2 must be reachable on the opening board');
  playPlacement(game, first);
  const second = reachablePlacements(game.grid, 'O').get(cellKey(puzzle.steps[0].cells));
  ok(second, 'step 1 must still be reachable afterwards');
  playPlacement(game, second);

  ok(verdicts.every(Boolean), 'both orders should be accepted');
  eq(session.status, 'solved');
});

t('a free puzzle is judged only when the bag runs out', () => {
  const puzzle = puzzleById('puzzle-perfect');
  const game = newGame(puzzle);
  const session = new PuzzleSession(puzzle, game);

  const outcomes = [];
  session.on('verdict', () => outcomes.push('verdict'));
  session.on('finished', (f) => outcomes.push(f.ok ? 'solved' : 'failed'));

  // Two O pieces side by side clears both rows and empties the board.
  const a = reachablePlacements(game.grid, 'O').get(cellKey([[6, 18], [7, 18], [6, 19], [7, 19]]));
  ok(a, 'the left box placement should be reachable');
  playPlacement(game, a);
  eq(outcomes.length, 0, 'nothing is said mid-attempt in free mode');

  const b = reachablePlacements(game.grid, 'O').get(cellKey([[8, 18], [9, 18], [8, 19], [9, 19]]));
  ok(b, 'the right box placement should be reachable');
  playPlacement(game, b);

  eq(outcomes, ['solved'], 'the verdict arrives once, at the end');
  ok(game.grid.every((row) => row.every((c) => c === null)), 'board is empty');
});

t('a free puzzle that misses its goal fails at the end', () => {
  const puzzle = puzzleById('lesson-tetris');
  const game = newGame(puzzle);
  const session = new PuzzleSession(puzzle, game);
  let result = null;
  session.on('finished', (f) => { result = f; });

  // Lay the I flat instead of standing it in the well.
  const flat = [...reachablePlacements(game.grid, 'I').values()]
    .find((l) => new Set(l.cells.map(([, y]) => y)).size === 1);
  ok(flat, 'a horizontal placement should exist');
  playPlacement(game, flat);

  eq(result.ok, false);
  ok(result.note, 'a failed attempt should explain what was wanted');
});

t('gravity is off for puzzles, so a piece never falls on its own', () => {
  const game = newGame(puzzleById('lesson-line'));
  const y = game.current.y;
  game.update(10000);
  eq(game.current.y, y, 'the piece stayed where it was');
  ok(game.grid[ROWS - 1].every((c, i) => (i < 4 ? c === null : c !== null)), 'nothing locked');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
