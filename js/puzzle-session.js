// Runs one attempt at one puzzle on top of the engine.
//
// It owns three things the endless game has no use for: a record of every
// placement, a verdict on each of them, and the ability to rewind. Rewinding
// works from full snapshots taken as each piece appears — line clears make
// inverse operations messy, and a snapshot is both simpler and exact.
//
// No DOM here. The page decides how long a verdict stays on screen and when
// to call undo(); this class only says what happened.

import { cellKey } from './puzzles.js';

export class PuzzleSession {
  constructor(puzzle, game) {
    this.puzzle = puzzle;
    this.game = game;
    this.listeners = {};

    this.history = [];   // snapshot at the start of each move
    this.moves = [];     // placements made, in order
    this.matched = new Set();
    this.movesMade = 0;
    this.status = 'playing';

    game.on('spawn', () => this.recordStart());
    // A session may be attached to a game that is already under way; without
    // this there would be no snapshot to rewind to for the first move.
    if (game.current) this.recordStart();

    game.on('lock', (placement) => this.judge(placement));
    game.on('exhausted', () => this.finish());
    game.on('gameover', () => this.fail('보드가 넘쳤습니다.'));
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this.listeners[event] || []) fn(payload);
  }

  get totalSteps() {
    return this.puzzle.steps ? this.puzzle.steps.length : 0;
  }

  get stepsDone() {
    return this.matched.size;
  }

  get canUndo() {
    return this.movesMade > 0;
  }

  /* ---------- history ---------- */

  // Indexing by movesMade rather than pushing keeps the history consistent
  // after an undo: the next placement simply overwrites the stale entry.
  recordStart() {
    this.history[this.movesMade] = this.game.snapshot();
    this.history.length = this.movesMade + 1;
  }

  undo() {
    if (this.movesMade === 0) return false;
    this.movesMade--;
    this.history.length = this.movesMade + 1;
    this.rewindTo(this.history[this.movesMade]);
    this.emit('undo', { movesMade: this.movesMade });
    return true;
  }

  restart() {
    if (this.history.length === 0) return false;
    this.movesMade = 0;
    this.history.length = 1;
    this.rewindTo(this.history[0]);
    this.emit('undo', { movesMade: 0 });
    return true;
  }

  rewindTo(snapshot) {
    this.moves.length = this.movesMade;
    // Ordered puzzles match step i with move i, so the matched set shrinks with
    // the move count; unordered ones are rebuilt from whatever moves survive.
    this.matched = new Set();
    this.status = 'playing';
    this.game.restore(snapshot);
    for (const placement of this.moves) this.rematch(placement);
  }

  rematch(placement) {
    if (this.puzzle.mode !== 'guided') return;
    const index = this.findStep(cellKey(placement.cells));
    if (index !== -1) this.matched.add(index);
  }

  /* ---------- judging ---------- */

  findStep(key) {
    const steps = this.puzzle.steps || [];
    if (this.puzzle.ordered === false) {
      return steps.findIndex((step, i) => !this.matched.has(i) && cellKey(step.cells) === key);
    }
    const next = this.matched.size;
    return next < steps.length && cellKey(steps[next].cells) === key ? next : -1;
  }

  judge(placement) {
    if (this.status !== 'playing') return;

    this.movesMade++;
    this.moves[this.movesMade - 1] = placement;
    this.moves.length = this.movesMade;

    if (this.puzzle.mode === 'free') {
      this.emit('move', { placement, movesMade: this.movesMade });
      return;
    }

    const key = cellKey(placement.cells);
    const index = this.findStep(key);

    if (index === -1) {
      const known = (this.puzzle.wrong || []).find((w) => cellKey(w.cells) === key);
      this.emit('verdict', {
        ok: false,
        note: known?.note ?? this.puzzle.defaultWrong ?? null,
        cells: placement.cells,
      });
      return;
    }

    this.matched.add(index);
    const done = this.matched.size >= this.totalSteps;
    this.emit('verdict', {
      ok: true,
      note: this.puzzle.steps[index].note ?? null,
      cells: placement.cells,
      done,
    });
    if (done) this.succeed(this.puzzle.success ?? null);
  }

  /* ---------- outcome ---------- */

  // Called when the bag runs out.
  //
  // Only free puzzles are judged here. A guided puzzle deliberately has no
  // losing end: a wrong move rewinds itself and hands the piece back, so
  // running out is a transient state on the way to a retry, not a failure to
  // announce. Declaring one would slam a result panel over the board at the
  // exact moment the player is reading why their move was wrong.
  finish() {
    if (this.status !== 'playing') return;
    if (this.puzzle.mode !== 'free') return;
    if (this.goalMet()) this.succeed(this.puzzle.success ?? null);
    else this.fail(this.puzzle.failure ?? null);
  }

  goalMet() {
    const goal = this.puzzle.goal || {};
    if (goal.clearAll) return this.game.grid.every((row) => row.every((cell) => cell === null));
    if (goal.lines) return this.game.lines >= goal.lines;
    return true;
  }

  succeed(note) {
    if (this.status === 'solved') return;
    this.status = 'solved';
    this.emit('finished', { ok: true, note, moves: this.movesMade });
  }

  fail(note) {
    if (this.status !== 'playing') return;
    this.status = 'failed';
    this.emit('finished', { ok: false, note, moves: this.movesMade });
  }
}
