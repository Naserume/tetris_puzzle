// Runs one attempt at one lesson or puzzle.
//
// The session owns the engine, because an item is a list of stages and a new
// stage means a new board and a new bag. Finishing a stage loads the next one,
// which is how a lesson can carry on past a single correct answer.
//
// Two ways of judging, from the same data:
//
//   lesson — every placement is answered the moment it locks. Only the
//            best-ranked answer counts as right; anything else is explained
//            and rewound, so the player is never stuck and never loses.
//            A right answer pauses: the next piece is withheld until the
//            player says to go on, so there is time to read why it was right.
//   puzzle — nothing is said while you play. Each placement is matched
//            against the ranked answers and scored, and the whole breakdown
//            arrives at the end.
//
// No DOM here. The page decides how long a verdict stays on screen and when to
// move on; this class only says what happened.

import { Game } from './engine.js';
import { cellKey, gameOptionsFor, bestAnswer, maxScoreOf, gradeOf } from './content.js';

export class PuzzleSession {
  constructor(item) {
    this.item = item;
    this.listeners = {};
    this.guided = item.kind === 'lesson';
    this.maxScore = maxScoreOf(item);

    this.results = [];        // every scored placement, across all stages
    this.status = 'playing';  // playing | done
    this.awaitingAdvance = false;
    this.paused = false;      // holding on a right answer, waiting to go on

    this.stageIndex = -1;
    this.game = null;
    this.loadStage(0);
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this.listeners[event] || []) fn(payload);
  }

  /* ---------- stages ---------- */

  get stage() {
    return this.item.stages[this.stageIndex];
  }

  get stageCount() {
    return this.item.stages.length;
  }

  get movesInStage() {
    return this.stage.moves.length;
  }

  loadStage(index) {
    this.stageIndex = index;
    this.history = [];
    this.placements = [];
    this.matched = new Set();
    this.movesMade = 0;
    this.awaitingAdvance = false;
    this.paused = false;

    // Lessons hand out the next piece only when asked; puzzles run straight
    // through, because they are not saying anything between moves anyway.
    this.game = new Game({ ...gameOptionsFor(this.stage), autoSpawn: !this.guided });
    this.game.on('spawn', () => this.recordStart());
    this.game.on('lock', (placement) => this.judge(placement));
    this.game.start();

    this.emit('stage', {
      index,
      total: this.stageCount,
      stage: this.stage,
      game: this.game,
    });
  }

  // One step forward from a pause: the next piece on this board, the next
  // board, or the end. This is what the "다음 수" control calls.
  proceed() {
    if (!this.paused) return false;
    this.paused = false;
    if (this.awaitingAdvance) {
      this.advance();
      return true;
    }
    this.game.spawn();
    return true;
  }

  // Called by the page once it has finished showing whatever the last move
  // deserved. Keeping it out of judge() is what lets a lesson hold a tick on
  // screen before the board is swapped out from under it.
  advance() {
    if (!this.awaitingAdvance) return false;
    this.awaitingAdvance = false;
    if (this.stageIndex + 1 < this.stageCount) {
      this.loadStage(this.stageIndex + 1);
      return true;
    }
    this.finish();
    return false;
  }

  /* ---------- history ---------- */

  // Indexing by movesMade rather than pushing keeps the history consistent
  // after an undo: the next placement simply overwrites the stale entry.
  recordStart() {
    this.history[this.movesMade] = this.game.snapshot();
    this.history.length = this.movesMade + 1;
  }

  get canUndo() {
    return this.movesMade > 0 && this.status === 'playing';
  }

  undo() {
    if (!this.canUndo) return false;
    this.paused = false;
    this.movesMade--;
    this.history.length = this.movesMade + 1;
    this.rewindTo(this.history[this.movesMade]);
    this.emit('undo', { movesMade: this.movesMade });
    return true;
  }

  // Restarts the current stage only; restartAll() goes back to stage one.
  restartStage() {
    if (this.history.length === 0) return false;
    this.paused = false;
    this.movesMade = 0;
    this.history.length = 1;
    this.rewindTo(this.history[0]);
    this.emit('undo', { movesMade: 0 });
    return true;
  }

  restartAll() {
    this.results = [];
    this.status = 'playing';
    this.loadStage(0);
    return true;
  }

  rewindTo(snapshot) {
    this.placements.length = this.movesMade;
    this.results.length = Math.max(0, this.results.length - 1);
    this.awaitingAdvance = false;
    this.paused = false;
    this.status = 'playing';

    // The matched set is rebuilt from the placements that survive, so an
    // unordered stage stays consistent whichever move was taken back.
    this.matched = new Set();
    this.game.restore(snapshot);
    for (const placement of this.placements) {
      const index = this.findMove(cellKey(placement.cells));
      if (index !== -1) this.matched.add(index);
    }
  }

  /* ---------- judging ---------- */

  // Which move of this stage a placement answers, or -1. Ordered stages must
  // be answered in sequence; unordered ones accept any move still open.
  findMove(key) {
    const moves = this.stage.moves;
    const hit = (move) => move.answers.some((a) => cellKey(a.cells) === key);

    if (this.stage.ordered === false) {
      return moves.findIndex((move, i) => !this.matched.has(i) && hit(move));
    }
    const next = this.matched.size;
    return next < moves.length && hit(moves[next]) ? next : -1;
  }

  // The move a placement is scored against — for an ordered stage this is the
  // next unanswered one whether or not the placement matches it.
  currentMoveIndex() {
    return this.stage.ordered === false
      ? this.stage.moves.findIndex((move, i) => !this.matched.has(i))
      : Math.min(this.matched.size, this.stage.moves.length - 1);
  }

  judge(placement) {
    if (this.status !== 'playing') return;

    this.movesMade++;
    this.placements[this.movesMade - 1] = placement;
    this.placements.length = this.movesMade;

    const key = cellKey(placement.cells);
    const moveIndex = this.findMove(key);
    const scoredIndex = moveIndex === -1 ? this.currentMoveIndex() : moveIndex;
    const move = this.stage.moves[Math.max(0, scoredIndex)];
    const answer = move.answers.find((a) => cellKey(a.cells) === key) || null;
    const best = bestAnswer(move);

    if (this.guided) return this.judgeGuided(placement, move, answer, best, moveIndex);
    return this.judgeScored(placement, move, answer, best, scoredIndex);
  }

  // A lesson accepts only the best answer. A lower-ranked one is still wrong,
  // but it gets its own explanation rather than the generic one — "that is a
  // T-spin, just not the biggest one" teaches more than "no".
  judgeGuided(placement, move, answer, best, moveIndex) {
    const correct = moveIndex !== -1 && answer !== null && answer.score >= best.score;

    if (!correct) {
      const known = (move.wrong || []).find((w) => cellKey(w.cells) === cellKey(placement.cells));
      this.emit('verdict', {
        ok: false,
        cells: placement.cells,
        note: answer?.note ?? known?.note ?? move.defaultWrong ?? null,
        label: answer?.label ?? null,
      });
      return;
    }

    this.matched.add(moveIndex);
    this.results.push({ stage: this.stageIndex, move: moveIndex, cells: placement.cells, answer, best });

    const stageDone = this.matched.size >= this.movesInStage;
    const lastStage = this.stageIndex + 1 >= this.stageCount;
    if (stageDone) this.awaitingAdvance = true;

    // Hold here. The next piece is not dealt until proceed() is called, which
    // is what gives the explanation time to be read.
    this.paused = true;

    this.emit('verdict', {
      ok: true,
      cells: placement.cells,
      note: answer.note ?? null,
      label: answer.label ?? null,
      stageDone,
      lastStage,
      next: !stageDone ? 'move' : (lastStage ? 'finish' : 'stage'),
    });
  }

  // A puzzle says nothing now. It records what the placement was worth and
  // keeps going, so a bad move costs points instead of stopping play.
  judgeScored(placement, move, answer, best, scoredIndex) {
    if (scoredIndex !== -1) this.matched.add(scoredIndex);
    this.results.push({
      stage: this.stageIndex,
      move: scoredIndex,
      cells: placement.cells,
      answer,
      best,
      note: answer ? answer.note : (move.defaultWrong ?? null),
    });

    const stageDone = this.movesMade >= this.movesInStage;
    if (stageDone) this.awaitingAdvance = true;
    this.emit('move', { index: this.movesMade, cells: placement.cells, stageDone });
  }

  /* ---------- outcome ---------- */

  get score() {
    return this.results.reduce((sum, r) => sum + (r.answer?.score ?? 0), 0);
  }

  get percent() {
    return this.maxScore === 0 ? 0 : Math.round((this.score / this.maxScore) * 100);
  }

  finish() {
    if (this.status === 'done') return;
    this.status = 'done';
    const percent = this.percent;
    this.emit('finished', {
      ok: this.guided ? true : percent >= 100,
      guided: this.guided,
      score: this.score,
      max: this.maxScore,
      percent,
      grade: gradeOf(percent),
      results: this.results.slice(),
      outro: this.item.outro ?? null,
      moves: this.results.length,
    });
  }
}
