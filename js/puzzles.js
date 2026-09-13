// Puzzle definitions.
//
// A puzzle is three things: the board you start on, the exact bag you are
// given, and what counts as the right answer. Everything the player sees —
// the brief, the praise for a good move, the explanation for a bad one — is
// data here, so adding a puzzle never means touching the player code.
//
// Board rows are written top-down, '.' for empty and any other letter for a
// filled cell of that colour ('X' is scenery). Only the bottom rows need
// listing; the board is padded upward to full height.
//
// Two ways to judge:
//   guided — every placement is checked the moment it locks, with a bubble
//            explaining why, and a wrong move rewinds itself.
//   free   — place what you like; the verdict comes once the bag runs out.

import { COLS, ROWS } from './engine.js';

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

export const PUZZLES = [
  {
    id: 'lesson-line',
    kind: 'lesson',
    mode: 'guided',
    title: '첫 줄 지우기',
    brief: '가로로 놓인 I 조각으로 왼쪽 네 칸을 메우세요.',
    board: [
      '....XXXXXX',
    ],
    queue: ['I'],
    steps: [{
      cells: [[0, 19], [1, 19], [2, 19], [3, 19]],
      note: '한 줄이 가득 차면 그 줄은 사라집니다. 테트리스의 전부가 여기서 시작합니다.',
    }],
    defaultWrong: '빈 칸은 왼쪽 끝 네 개입니다. 그 네 칸을 정확히 덮어야 줄이 완성됩니다.',
    hint: '왼쪽 끝까지 밀고 그대로 떨어뜨리세요.',
  },

  {
    id: 'lesson-double',
    kind: 'lesson',
    mode: 'guided',
    title: '두 줄을 한 번에',
    brief: '2×2 구멍에 맞는 조각을 넣어 두 줄을 동시에 지우세요.',
    board: [
      'XXXXXXXX..',
      'XXXXXXXX..',
    ],
    queue: ['O'],
    steps: [{
      cells: [[8, 18], [9, 18], [8, 19], [9, 19]],
      note: '한 번에 두 줄. 같은 네 칸을 써도 몇 줄을 지우느냐에 따라 점수가 세 배까지 벌어집니다.',
    }],
    defaultWrong: '구멍은 오른쪽 끝 2×2 입니다. O 조각이 그 모양 그대로입니다.',
    hint: '오른쪽 끝까지 밀면 됩니다.',
  },

  {
    id: 'lesson-s-slot',
    kind: 'lesson',
    mode: 'guided',
    title: '엇갈린 자리',
    brief: '계단처럼 어긋난 두 줄입니다. S 조각의 모양을 그대로 얹으세요.',
    board: [
      'XXXXX..XXX',
      'XXXX..XXXX',
    ],
    queue: ['S'],
    steps: [{
      cells: [[5, 18], [6, 18], [4, 19], [5, 19]],
      note: 'S와 Z는 평평한 바닥에서는 구멍을 만들지만, 어긋난 자리에서는 이렇게 딱 맞습니다.',
    }],
    defaultWrong: '조각을 돌릴 필요는 없습니다. 생긴 모양 그대로 들어가는 자리를 찾으세요.',
    hint: '회전하지 말고 한 칸만 오른쪽으로.',
  },

  {
    id: 'lesson-tspin',
    kind: 'lesson',
    mode: 'guided',
    title: 'T-스핀 더블',
    brief: '덮개 아래 가로 슬롯이 있습니다. 그냥은 들어가지 않습니다 — 넣은 뒤 돌리세요.',
    board: [
      'XXXX..XXXX',
      'XXX...XXXX',
      'XXXX.XXXXX',
    ],
    queue: ['T'],
    steps: [{
      cells: [[3, 18], [4, 18], [5, 18], [4, 19]],
      note: '이것이 T-스핀입니다. 회전으로만 닿는 자리에 넣으면 같은 두 줄이라도 점수가 네 배입니다.',
    }],
    defaultWrong: '왼쪽 위가 덮여 있어서 가로로는 슬롯에 닿을 수 없습니다. 오른쪽 세로 통로로 떨어뜨린 다음 회전으로 밀어 넣어야 합니다.',
    hint: '반시계로 세워 오른쪽 통로에 떨어뜨리고, 바닥에 닿은 뒤 반시계로 한 번 더 돌리세요.',
  },

  {
    id: 'lesson-tetris',
    kind: 'lesson',
    mode: 'free',
    title: '테트리스',
    brief: '오른쪽 우물이 네 줄 깊이입니다. 자유롭게 두고, 결과는 마지막에 확인합니다.',
    board: [
      'XXXXXXXXX.',
      'XXXXXXXXX.',
      'XXXXXXXXX.',
      'XXXXXXXXX.',
    ],
    queue: ['I'],
    goal: { lines: 4 },
    success: '네 줄 동시 삭제 — 이것만을 테트리스라고 부릅니다. 한 줄씩 네 번 지우는 것보다 점수가 두 배입니다.',
    failure: 'I 조각을 세워서 오른쪽 우물에 넣으면 네 줄이 한꺼번에 사라집니다.',
    hint: '세로로 세우세요.',
  },

  {
    id: 'puzzle-twin-box',
    kind: 'puzzle',
    mode: 'guided',
    ordered: false,
    title: '상자 두 개',
    brief: 'O 조각 두 개로 두 줄을 완성하세요. 순서는 상관없습니다.',
    board: [
      'XXX.......',
      'XXXXXX....',
      'XXXXXX....',
    ],
    queue: ['O', 'O'],
    steps: [
      {
        cells: [[6, 18], [7, 18], [6, 19], [7, 19]],
        note: '왼쪽 절반. 아직 어느 줄도 완성되지 않습니다.',
      },
      {
        cells: [[8, 18], [9, 18], [8, 19], [9, 19]],
        note: '오른쪽 절반. 이제 두 줄이 동시에 찼습니다.',
      },
    ],
    defaultWrong: '네 칸짜리 구멍이 가로로 두 줄입니다. O 두 개를 나란히 붙여야 두 줄이 함께 찹니다.',
    hint: '한 개를 왼쪽 끝, 다른 하나를 그 옆에. 순서는 상관없습니다.',
  },

  {
    id: 'puzzle-perfect',
    kind: 'puzzle',
    mode: 'free',
    title: '남김없이',
    brief: '보드를 완전히 비우세요. 한 칸이라도 남으면 실패입니다.',
    board: [
      'XXXXXX....',
      'XXXXXX....',
    ],
    queue: ['O', 'O'],
    goal: { clearAll: true },
    success: '퍼펙트 클리어. 보드에 아무것도 남지 않았습니다.',
    failure: '두 O를 4×2 구멍에 나란히 채우면 두 줄이 모두 사라지고 보드가 비워집니다.',
    hint: 'O 두 개를 나란히.',
  },
];

export function puzzleById(id) {
  return PUZZLES.find((p) => p.id === id) || null;
}

// 1-based, so "3번째 퍼즐" is puzzleAt(3).
export function puzzleAt(n) {
  return PUZZLES[n - 1] || null;
}

export function indexOfPuzzle(id) {
  return PUZZLES.findIndex((p) => p.id === id) + 1;
}

export function listByKind(kind) {
  return PUZZLES.filter((p) => p.kind === kind);
}

export function randomPuzzle(rng = Math.random, excludeId = null) {
  const pool = PUZZLES.filter((p) => p.id !== excludeId);
  const from = pool.length ? pool : PUZZLES;
  return from[Math.floor(rng() * from.length)];
}

// The engine options that reproduce this puzzle's starting position.
export function gameOptionsFor(puzzle) {
  return {
    grid: buildGrid(puzzle.board),
    queue: puzzle.queue.slice(),
    hold: puzzle.hold || null,
    gravity: false,
  };
}
