// Puzzles: scored rather than pass/fail.
//
// Every move stores the moves worth playing, ranked — the best one and the
// ones that are merely good — with what each is worth and why. Nothing is
// said while you play; at the end you get your move-by-move breakdown against
// those answers and a score out of 100.
//
// The rankings are not guesses. Each board was run through a search of every
// placement the piece can actually reach, and the entries below are the ones
// that search turned up, ordered by lines cleared, spin, and holes left behind.

export const PUZZLES = [
  {
    id: 'puzzle-tspin-choice',
    topic: 'tspin',
    level: 'beginner',
    order: 2,
    title: '어느 쪽이 최선인가',
    brief: 'T 하나. 놓을 자리가 여럿입니다. 가장 값비싼 자리를 고르세요.',
    stages: [{
      board: ['XXXX..XXXX', 'XXX...XXXX', 'XXXX.XXXXX'],
      queue: ['T'],
      moves: [{
        answers: [
          {
            cells: [[3, 18], [4, 18], [5, 18], [4, 19]],
            score: 100,
            label: 'T-스핀 더블',
            note: '최선. 두 줄을 지우면서 T-스핀까지 성립해 점수가 네 배입니다. 남는 구멍도 없습니다.',
          },
          {
            cells: [[4, 17], [3, 18], [4, 18], [4, 19]],
            score: 55,
            label: 'T-스핀 싱글',
            note: 'T-스핀은 성립하지만 한 줄뿐입니다. 한 칸 더 깊이 눕혔으면 더블이었습니다.',
          },
          {
            cells: [[5, 16], [4, 17], [5, 17], [5, 18]],
            score: 30,
            label: '평범한 싱글',
            note: '한 줄은 지워지고 구멍도 안 남지만, 스핀이 아니라 점수는 최소입니다.',
          },
          {
            cells: [[4, 17], [3, 18], [4, 18], [5, 18]],
            score: 15,
            label: '미니 T-스핀',
            note: '미니로 인정되어 한 줄을 지우지만 아래에 구멍이 하나 남습니다. 구멍은 나중에 값을 치릅니다.',
          },
        ],
        defaultWrong: '줄이 하나도 지워지지 않았습니다. 슬롯은 아래쪽 세 칸짜리 가로 홈입니다.',
        hint: '지붕 아래로 밀어 넣는 방법을 찾으세요.',
      }],
    }],
  },

  {
    id: 'puzzle-perfect',
    topic: 'line-clear',
    level: 'intermediate',
    order: 3,
    title: '남김없이',
    brief: 'O 두 개로 보드를 완전히 비우세요. 채점은 마지막에 한 번에 합니다.',
    stages: [{
      board: ['XXXXXX....', 'XXXXXX....'],
      queue: ['O', 'O'],
      ordered: false,
      moves: [
        {
          answers: [{
            cells: [[6, 18], [7, 18], [6, 19], [7, 19]],
            score: 50,
            label: '구멍 왼쪽 절반',
            note: '구멍에 정확히 내려앉았습니다.',
          }],
          defaultWrong: '구멍 밖에 쌓으면 그만큼 보드가 높아지고, 아래는 영영 못 채웁니다.',
          hint: '4×2 구멍을 O 두 개로 정확히 나눠 채우세요.',
        },
        {
          answers: [{
            cells: [[8, 18], [9, 18], [8, 19], [9, 19]],
            score: 50,
            label: '구멍 오른쪽 절반',
            note: '두 줄이 모두 차면서 보드에 아무것도 남지 않습니다 — 퍼펙트 클리어입니다.',
          }],
          defaultWrong: '남은 절반은 오른쪽 끝 2×2 입니다.',
          hint: '남은 두 칸을 채우세요.',
        },
      ],
    }],
    outro: '보드를 완전히 비우는 것을 퍼펙트 클리어라고 합니다. 실전에서는 큰 보너스가 붙습니다.',
  },

  {
    id: 'puzzle-downstack',
    topic: 'downstack',
    level: 'beginner',
    order: 1,
    title: '방해줄 걷어내기',
    brief: '아래가 방해줄로 막혔습니다. J 하나로 최대한 걷어내세요.',
    stages: [{
      board: ['XXXXXXX.XX', 'XXXXXXX.XX', 'XXXXXX..XX'],
      queue: ['J'],
      moves: [{
        answers: [
          {
            cells: [[7, 16], [8, 16], [7, 17], [7, 18]],
            score: 100,
            label: '두 줄',
            note: '최선. 세로 기둥이 두 줄을 관통해 한 번에 걷어냅니다. 맨 아래 한 칸은 이 조각만으로는 어쩔 수 없습니다.',
          },
          {
            cells: [[5, 16], [6, 16], [7, 16], [7, 17]],
            score: 40,
            label: '한 줄',
            note: '한 줄은 지워지지만 아래에 구멍이 셋 생깁니다. 다운스택에서 구멍은 지워진 줄보다 비쌉니다.',
          },
        ],
        defaultWrong: '줄이 지워지지 않았습니다. 좁은 세로 틈에 기둥을 세워 넣어야 합니다.',
        hint: 'J를 세워서 오른쪽 틈에 맞추세요.',
      }],
    }],
  },
];
