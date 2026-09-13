// Lessons: guided, one move at a time, with an explanation on every verdict.
//
// A lesson is a list of stages, and a stage is a board plus a bag plus the
// moves to make on it. Finishing a stage loads the next one, which is how a
// lesson can say "now find the same thing on the other side" instead of
// ending after a single correct answer.
//
// Inside a move, `answers` is ranked best-first. A lesson accepts only the
// best; the lower-ranked entries exist so that a near-miss can be told apart
// from a random drop and answered on its own terms.

export const LESSONS = [
  {
    id: 'lesson-single',
    topic: 'line-clear',
    level: 'beginner',
    order: 1,
    title: '첫 줄 지우기',
    brief: '가로로 놓인 I 조각으로 왼쪽 네 칸을 메우세요.',
    stages: [{
      board: ['....XXXXXX'],
      queue: ['I'],
      moves: [{
        answers: [{
          cells: [[0, 19], [1, 19], [2, 19], [3, 19]],
          score: 100,
          label: '싱글',
          note: '한 줄이 가득 차면 그 줄은 사라집니다. 테트리스의 전부가 여기서 시작합니다.',
        }],
        defaultWrong: '빈 칸은 왼쪽 끝 네 개입니다. 그 네 칸을 정확히 덮어야 줄이 완성됩니다.',
        hint: '왼쪽 끝까지 밀고 그대로 떨어뜨리세요.',
      }],
    }],
  },

  {
    id: 'lesson-double',
    topic: 'line-clear',
    level: 'beginner',
    order: 2,
    title: '두 줄을 한 번에',
    brief: '2×2 구멍에 맞는 조각을 넣어 두 줄을 동시에 지우세요.',
    stages: [{
      board: ['XXXXXXXX..', 'XXXXXXXX..'],
      queue: ['O'],
      moves: [{
        answers: [{
          cells: [[8, 18], [9, 18], [8, 19], [9, 19]],
          score: 100,
          label: '더블',
          note: '한 번에 두 줄. 같은 네 칸을 써도 몇 줄을 지우느냐에 따라 점수가 세 배까지 벌어집니다.',
        }],
        defaultWrong: '구멍은 오른쪽 끝 2×2 입니다. O 조각이 그 모양 그대로입니다.',
        hint: '오른쪽 끝까지 밀면 됩니다.',
      }],
    }],
  },

  {
    id: 'lesson-stagger',
    topic: 'line-clear',
    level: 'intermediate',
    order: 1,
    title: '엇갈린 자리',
    brief: '계단처럼 어긋난 두 줄입니다. S 조각의 모양을 그대로 얹으세요.',
    stages: [{
      board: ['XXXXX..XXX', 'XXXX..XXXX'],
      queue: ['S'],
      moves: [{
        answers: [{
          cells: [[5, 18], [6, 18], [4, 19], [5, 19]],
          score: 100,
          label: '더블',
          note: 'S와 Z는 평평한 바닥에서는 구멍을 만들지만, 어긋난 자리에서는 이렇게 딱 맞습니다.',
        }],
        defaultWrong: '조각을 돌릴 필요는 없습니다. 생긴 모양 그대로 들어가는 자리를 찾으세요.',
        hint: '회전하지 말고 한 칸만 오른쪽으로.',
      }],
    }],
  },

  {
    id: 'lesson-twin-box',
    topic: 'line-clear',
    level: 'intermediate',
    order: 2,
    title: '두 수로 두 줄',
    brief: 'O 조각 두 개로 두 줄을 완성하세요. 순서는 상관없습니다.',
    stages: [{
      board: ['XXX.......', 'XXXXXX....', 'XXXXXX....'],
      queue: ['O', 'O'],
      ordered: false,
      moves: [
        {
          answers: [{
            cells: [[6, 18], [7, 18], [6, 19], [7, 19]],
            score: 100,
            label: '왼쪽 절반',
            note: '왼쪽 절반. 아직 어느 줄도 완성되지 않습니다.',
          }],
          defaultWrong: '네 칸짜리 구멍이 가로로 두 줄입니다. O 두 개를 나란히 붙여야 두 줄이 함께 찹니다.',
          hint: '한 개를 왼쪽 끝, 다른 하나를 그 옆에. 순서는 상관없습니다.',
        },
        {
          answers: [{
            cells: [[8, 18], [9, 18], [8, 19], [9, 19]],
            score: 100,
            label: '오른쪽 절반',
            note: '오른쪽 절반. 이제 두 줄이 동시에 찼습니다.',
          }],
          defaultWrong: '네 칸짜리 구멍이 가로로 두 줄입니다. O 두 개를 나란히 붙여야 두 줄이 함께 찹니다.',
          hint: '남은 두 칸을 채우세요.',
        },
      ],
    }],
    outro: '두 수가 한 묶음이 되는 자리입니다. 첫 수만 보면 아무것도 안 일어난 것처럼 보입니다.',
  },

  {
    id: 'lesson-three-moves',
    topic: 'line-clear',
    level: 'intermediate',
    order: 3,
    title: '세 수 이어 두기',
    brief: '판은 그대로입니다. 한 수를 둘 때마다 확인하고 다음 수로 넘어가세요.',
    stages: [{
      board: ['XXXXXX....', 'XXXXXX....', 'XXXXXX....'],
      queue: ['O', 'O', 'I'],
      ordered: false,
      moves: [
        {
          answers: [{
            cells: [[6, 18], [7, 18], [6, 19], [7, 19]],
            score: 100,
            label: '첫 번째 상자',
            note: '바닥까지 내려앉았습니다. 아직 아무 줄도 차지 않았지만, 이 수가 다음 수의 발판입니다.',
          }],
          defaultWrong: '구멍은 오른쪽 아래 네 칸 × 세 줄입니다. 바닥부터 차곡차곡 메우세요.',
          hint: 'O를 오른쪽 구멍 바닥에 붙이세요.',
        },
        {
          answers: [{
            cells: [[8, 18], [9, 18], [8, 19], [9, 19]],
            score: 100,
            label: '두 번째 상자',
            note: '두 줄이 한 번에 사라졌습니다. 남은 한 줄이 아래로 내려왔습니다 — 이제 마지막 수입니다.',
          }],
          defaultWrong: '남은 두 칸 폭에 O가 그대로 들어갑니다.',
          hint: '첫 상자 옆에 나란히.',
        },
        {
          answers: [{
            cells: [[6, 19], [7, 19], [8, 19], [9, 19]],
            score: 100,
            label: '마무리',
            note: '마지막 네 칸까지. 보드에 아무것도 남지 않았습니다.',
          }],
          defaultWrong: '내려온 줄에 네 칸이 비어 있습니다. I를 눕혀서 그대로 덮으세요.',
          hint: 'I를 눕혀 오른쪽 끝까지.',
        },
      ],
    }],
    outro: '한 수로 끝나는 문제는 드뭅니다. 한 수마다 무엇이 달라졌는지 보고 다음 수를 정하는 것이 실전입니다.',
  },

  {
    id: 'lesson-tetris',
    topic: 'tetris',
    level: 'beginner',
    order: 1,
    title: '테트리스',
    brief: '오른쪽 우물이 네 줄 깊이입니다. I 조각을 세워 넣으세요.',
    stages: [{
      board: ['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'],
      queue: ['I'],
      moves: [{
        answers: [{
          cells: [[9, 16], [9, 17], [9, 18], [9, 19]],
          score: 100,
          label: '테트리스',
          note: '네 줄 동시 삭제 — 이것만을 테트리스라고 부릅니다. 한 줄씩 네 번 지우는 것보다 점수가 두 배입니다.',
        }],
        defaultWrong: '눕히면 우물에 들어가지 않습니다. 세워서 오른쪽 끝으로 넣으세요.',
        hint: '회전해서 세로로 만드세요.',
      }],
    }],
  },

  {
    id: 'lesson-b2b',
    topic: 'b2b',
    level: 'beginner',
    order: 1,
    title: '백투백',
    brief: '우물이 여덟 줄 깊이입니다. 테트리스를 연달아 두 번 만드세요.',
    stages: [{
      board: [
        'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.',
        'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.',
      ],
      queue: ['I', 'I'],
      moves: [
        {
          answers: [{
            cells: [[9, 16], [9, 17], [9, 18], [9, 19]],
            score: 100,
            label: '테트리스',
            note: '첫 번째 테트리스. 네 줄이 사라지면서 위에 남은 네 줄이 그대로 내려왔습니다. 같은 자리가 한 번 더 생겼습니다.',
          }],
          defaultWrong: '세워서 오른쪽 우물에 넣으세요.',
          hint: '세로로 세워 오른쪽 끝까지.',
        },
        {
          answers: [{
            cells: [[9, 16], [9, 17], [9, 18], [9, 19]],
            score: 100,
            label: '백투백 테트리스',
            note: '두 번 연속 테트리스 — 백투백입니다. 사이에 평범한 줄 삭제가 끼지 않으면 점수가 1.5배가 됩니다.',
          }],
          defaultWrong: '내려온 네 줄에 같은 방법을 한 번 더 쓰면 됩니다.',
          hint: '방금과 똑같이.',
        },
      ],
    }],
    outro: '테트리스와 T-스핀만이 백투백을 이어갑니다. 중간에 싱글 하나만 지워도 사슬이 끊깁니다.',
  },

  {
    id: 'lesson-tsd',
    topic: 'tspin',
    level: 'beginner',
    order: 1,
    title: 'T-스핀 더블',
    brief: '덮개 아래 가로 슬롯이 있습니다. 그냥은 들어가지 않습니다 — 넣은 뒤 돌리세요.',
    stages: [
      {
        label: '오른쪽 통로',
        board: ['XXXX..XXXX', 'XXX...XXXX', 'XXXX.XXXXX'],
        queue: ['T'],
        moves: [{
          answers: [
            {
              cells: [[3, 18], [4, 18], [5, 18], [4, 19]],
              score: 100,
              label: 'T-스핀 더블',
              note: '이것이 T-스핀입니다. 회전으로만 닿는 자리에 넣으면 같은 두 줄이라도 점수가 네 배입니다.',
            },
            {
              cells: [[4, 17], [3, 18], [4, 18], [4, 19]],
              score: 55,
              label: 'T-스핀 싱글',
              note: '이것도 T-스핀이지만 한 줄만 지웁니다. 조금 더 깊이 눕히면 두 줄이 함께 사라집니다.',
            },
          ],
          defaultWrong: '왼쪽 위가 덮여 있어서 가로로는 슬롯에 닿을 수 없습니다. 오른쪽 세로 통로로 떨어뜨린 다음 회전으로 밀어 넣어야 합니다.',
          hint: '반시계로 세워 오른쪽 통로에 떨어뜨리고, 바닥에 닿은 뒤 반시계로 한 번 더 돌리세요.',
        }],
      },
      {
        label: '반대쪽',
        board: ['XXXX..XXXX', 'XXXX...XXX', 'XXXXX.XXXX'],
        queue: ['T'],
        moves: [{
          answers: [
            {
              cells: [[4, 18], [5, 18], [6, 18], [5, 19]],
              score: 100,
              label: 'T-스핀 더블',
              note: '좌우가 뒤집혀도 같은 모양입니다. 통로가 왼쪽에 생겼으니 회전 방향만 반대로.',
            },
            {
              cells: [[5, 17], [5, 18], [6, 18], [5, 19]],
              score: 55,
              label: 'T-스핀 싱글',
              note: 'T-스핀은 맞지만 한 줄뿐입니다. 한 칸 더 눕혀야 두 줄입니다.',
            },
          ],
          defaultWrong: '이번에는 통로가 왼쪽입니다. 거기로 떨어뜨린 뒤 시계 방향으로 돌리세요.',
          hint: '왼쪽 통로로 세워 넣고 시계 방향으로.',
        }],
      },
    ],
    outro: 'T-스핀 슬롯은 언제나 이 모양입니다 — 세 칸짜리 가로 홈, 그 위를 덮은 지붕, 옆으로 난 통로.',
  },
];
