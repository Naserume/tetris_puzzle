// Rules-level tests for the engine. No DOM, no browser:
//   node tests/engine.test.mjs

import { Game, COLS, ROWS, cellsOf, collides, createGrid } from '../js/engine.js';
import { TYPES, SHAPES } from '../js/pieces.js';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + ' -> ' + e.message); } };
const eq = (a, b, m = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${m} ${A} !== ${B}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

t('every piece has 4 cells in all 4 rotations', () => {
  for (const type of TYPES) for (let r = 0; r < 4; r++) eq(SHAPES[type][r].length, 4, `${type}/${r}`);
});

t('rotating 4x returns to spawn state and position (open field)', () => {
  for (const type of TYPES) {
    const g = new Game(); g.start();
    g.current = { type, rot: 0, x: 3, y: 8 };
    const before = JSON.stringify(g.current);
    for (let i = 0; i < 4; i++) ok(g.rotate(1), `${type} rotate ${i}`);
    eq(JSON.parse(JSON.stringify(g.current)), JSON.parse(before), type);
  }
});

t('7-bag yields each piece exactly once per 7', () => {
  const g = new Game(); g.start();
  // Wipe the stack between drops so the run never tops out mid-bag.
  const drawBag = () => {
    const bag = [];
    for (let i = 0; i < 7; i++) { bag.push(g.current.type); g.grid = createGrid(); g.hardDrop(); }
    return bag.sort();
  };
  eq(drawBag(), TYPES.slice().sort(), 'first bag');
  eq(drawBag(), TYPES.slice().sort(), 'second bag');
  eq(drawBag(), TYPES.slice().sort(), 'third bag');
});

t('piece cannot leave the walls', () => {
  const g = new Game(); g.start();
  g.current = { type: 'O', rot: 0, x: 3, y: 5 };
  while (g.move(-1));
  ok(cellsOf(g.current).every(([x]) => x >= 0), 'left wall');
  while (g.move(1));
  ok(cellsOf(g.current).every(([x]) => x < COLS), 'right wall');
});

t('hard drop lands on the floor', () => {
  const g = new Game(); g.start();
  g.current = { type: 'I', rot: 0, x: 3, y: 0 };
  g.hardDrop();
  eq(g.grid[ROWS - 1].slice(3, 7), ['I','I','I','I']);
});

t('a full row is cleared and rows above fall', () => {
  const g = new Game(); g.start();
  for (let x = 0; x < COLS; x++) g.grid[ROWS - 1][x] = 'J';
  g.grid[ROWS - 2][0] = 'L';
  const cleared = g.clearLines();
  eq(cleared.length, 1);
  eq(g.grid[ROWS - 1][0], 'L', 'block fell to bottom');
  eq(g.grid[ROWS - 1][1], null);
});

t('tetris scores 800 at level 1', () => {
  const g = new Game(); g.start();
  g.score = 0;
  g.applyScore([0,1,2,3], null);
  eq(g.score, 800);
  eq(g.lines, 4);
  ok(g.backToBack, 'tetris sets back-to-back');
});

t('back-to-back tetris scores 1200', () => {
  const g = new Game(); g.start();
  g.applyScore([0,1,2,3], null);      // first tetris: 800, combo 0
  const afterFirst = g.score;
  g.applyScore([0,1,2,3], null);      // b2b tetris: 1200 + 50*1 combo
  eq(g.score - afterFirst, 1200 + 50);
});

t('single clear breaks back-to-back', () => {
  const g = new Game(); g.start();
  g.applyScore([0,1,2,3], null);
  g.applyScore([0], null);
  ok(!g.backToBack, 'b2b cleared by a single');
});

t('level rises every 10 lines', () => {
  const g = new Game(); g.start();
  for (let i = 0; i < 5; i++) g.applyScore([0,1], null);
  eq(g.lines, 10);
  eq(g.level, 2);
});

t('gravity speeds up with level', () => {
  const g = new Game(); g.start();
  g.level = 1; const slow = g.gravityMs;
  g.level = 10; const fast = g.gravityMs;
  ok(fast < slow, `${fast} should be < ${slow}`);
  ok(slow > 800 && slow < 1100, 'level 1 is about one second per cell: ' + slow);
});

t('hold swaps the piece and locks out until the next lock', () => {
  const g = new Game(); g.start();
  const first = g.current.type;
  ok(g.holdPiece(), 'first hold works');
  eq(g.hold, first);
  ok(!g.holdPiece(), 'second hold in the same piece is refused');
  g.hardDrop();
  const afterLock = g.current.type;
  ok(g.holdPiece(), 'hold available again after locking');
  eq(g.hold, afterLock, 'hold now stores the piece that was in play');
  eq(g.current.type, first, 'the originally held piece comes back out');
});

t('ghost lands where a hard drop would', () => {
  const g = new Game(); g.start();
  g.current = { type: 'T', rot: 0, x: 3, y: 2 };
  const gy = g.ghostY();
  g.hardDrop();
  eq(gy, ROWS - 2, 'T spawn-state bottom row sits on the floor');
});

// A T standing in a one-wide channel, spun right into a covered slot:
//   y=17   # # #  .  # # # # # #
//   y=18   # #  .  .  .  # # # # #
//   y=19   # # #  .  # # # # # #
function tSpinBoard() {
  const g = new Game(); g.start();
  const fill = (y, holes) => { for (let x = 0; x < COLS; x++) g.grid[y][x] = holes.includes(x) ? null : 'J'; };
  fill(17, [3]);
  fill(18, [2, 3, 4]);
  fill(19, [3]);
  return g;
}

t('a T spun into a covered slot counts as a full T-spin', () => {
  const g = tSpinBoard();
  g.current = { type: 'T', rot: 3, x: 2, y: 17 };
  ok(!collides(g.grid, g.current), 'the T fits in the channel before spinning');
  ok(g.rotate(1), 'spin into the slot');
  eq(g.detectTSpin(), 'full');
});

t('the same placement without a rotation is not a T-spin', () => {
  const g = tSpinBoard();
  g.current = { type: 'T', rot: 0, x: 2, y: 17 };
  g.lastMoveWasRotation = false;
  eq(g.detectTSpin(), null);
});

t('an open-field rotation is not a T-spin', () => {
  const g = new Game(); g.start();
  g.current = { type: 'T', rot: 0, x: 3, y: 8 };
  ok(g.rotate(1));
  eq(g.detectTSpin(), null);
});

t('block out ends the game', () => {
  const g = new Game(); g.start();
  for (let x = 0; x < COLS; x++) { g.grid[0][x] = 'J'; g.grid[1][x] = 'J'; }
  g.spawn('T');
  eq(g.state, 'over');
});

t('gravity moves a piece down one cell per interval', () => {
  const g = new Game(); g.start();
  g.current = { type: 'I', rot: 0, x: 3, y: 0 };
  const y0 = g.current.y;
  g.update(g.gravityMs + 1);
  eq(g.current.y, y0 + 1);
});

t('with auto-spawn off, locking leaves the board empty-handed', () => {
  const g = new Game({ autoSpawn: false });
  g.start();
  ok(g.current, 'the first piece still arrives on start');
  const next = g.queue[0];
  g.hardDrop();
  eq(g.current, null, 'nothing came out to replace it');
  g.spawn();
  eq(g.current.type, next, 'and spawn() hands over the piece that was waiting');
});

t('a grounded piece locks only after the lock delay', () => {
  const g = new Game(); g.start();
  g.current = { type: 'O', rot: 0, x: 3, y: ROWS - 2 };
  g.update(16);
  ok(g.grid[ROWS - 1][4] === null, 'not locked immediately');
  g.update(600);
  eq(g.grid[ROWS - 1][4], 'O');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
