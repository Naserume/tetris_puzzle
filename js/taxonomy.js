// The shared classification. Lessons, review and puzzles all hang off it, so
// a topic is defined once and every mode agrees on what it means.
//
//   단계 (tier)  — a line drawn between kinds of skill, not a difficulty ramp.
//                 3단계 is not "harder" than 2단계; it is a different concern.
//   유형 (topic) — what the item is about. Lives inside exactly one tier.
//   난이도 (level) — the real difficulty ladder, and it runs inside a topic.
//                 T-스핀 고급 is harder than T-스핀 초급; comparing it with
//                 다운스택 초급 is meaningless.

export const TIERS = [
  { id: 1, name: '1단계', tagline: '조각을 넣고 줄을 지우는 법' },
  { id: 2, name: '2단계', tagline: '점수를 만드는 기술' },
  { id: 3, name: '3단계', tagline: '판 전체를 끌고 가는 법' },
];

export const TOPICS = [
  { id: 'line-clear',  tier: 1, name: '줄 지우기' },
  { id: 'spin-basics', tier: 1, name: '스핀 기초', note: 'SRS' },
  { id: 'spin-mid',    tier: 2, name: '스핀 중급', note: 'SRS' },
  { id: 'tspin',       tier: 2, name: 'T-스핀' },
  { id: 'tetris',      tier: 2, name: '테트리스' },
  { id: 'b2b',         tier: 2, name: '백투백' },
  { id: 'opening',     tier: 3, name: '오프닝' },
  { id: 'downstack',   tier: 3, name: '다운스택' },
];

export const LEVELS = [
  { id: 'beginner',     name: '초급' },
  { id: 'intermediate', name: '중급' },
  { id: 'advanced',     name: '고급' },
];

// Slots that exist in the plan but have no content yet. They are listed in the
// menu, greyed out, so the shape of what is coming is visible rather than
// implied — an empty category is information, a missing one is not.
export const PLANNED = [
  { topic: 'spin-basics', level: 'intermediate', titles: ['I 조각 벽 차기', 'L·J 스핀'] },
  { topic: 'spin-mid',    level: 'beginner',     titles: ['S·Z 스핀', '이중 벽 차기'] },
  { topic: 'spin-mid',    level: 'intermediate', titles: ['O 없는 우물 처리'] },
  { topic: 'tspin',       level: 'intermediate', titles: ['mechanical TSD', '계단 활용', 'TD 어택'] },
  { topic: 'tspin',       level: 'advanced',     titles: ['미니 T-스핀', '방해줄 활용 (1)', '방해줄 활용 (2)'] },
  { topic: 'tetris',      level: 'intermediate', titles: ['우물 바꾸기', '4단 유지'] },
  { topic: 'b2b',         level: 'intermediate', titles: ['B2B 사슬 잇기'] },
  { topic: 'opening',     level: 'beginner',     titles: ['PCO', 'TKI', 'DT 캐논'] },
  { topic: 'downstack',   level: 'intermediate', titles: ['구멍 파내기', '표면 고르기'] },
];

const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));
const TIER_BY_ID = new Map(TIERS.map((t) => [t.id, t]));

export const topicById = (id) => TOPIC_BY_ID.get(id) || null;
export const levelById = (id) => LEVEL_BY_ID.get(id) || null;
export const tierById = (id) => TIER_BY_ID.get(id) || null;

export const topicName = (id) => topicById(id)?.name ?? id;
export const levelName = (id) => levelById(id)?.name ?? id;

export function tierOfTopic(id) {
  return topicById(id)?.tier ?? null;
}

// "T-스핀 · 초급"
export function categoryName(topic, level) {
  return `${topicName(topic)} · ${levelName(level)}`;
}

export function topicsInTier(tier) {
  return TOPICS.filter((t) => t.tier === tier);
}

export function plannedFor(topic, level) {
  return PLANNED.find((p) => p.topic === topic && p.level === level)?.titles ?? [];
}

// Sort key so a mixed list always comes out tier → topic → level.
export function sortKey(item) {
  const topicIndex = TOPICS.findIndex((t) => t.id === item.topic);
  const levelIndex = LEVELS.findIndex((l) => l.id === item.level);
  return [tierOfTopic(item.topic) ?? 99, topicIndex, levelIndex];
}

export function compareByTaxonomy(a, b) {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return (a.order ?? 0) - (b.order ?? 0);
}
