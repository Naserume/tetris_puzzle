// User-configurable controls: key bindings and auto-shift timing.
// Persisted in localStorage, which can be unavailable (private windows, blocked
// site data), so every read and write is guarded and falls back to defaults.

const STORAGE_KEY = 'tetris-puzzle:settings:v1';

export const ACTIONS = [
  { id: 'left',      label: '왼쪽으로 이동',    short: '왼쪽' },
  { id: 'right',     label: '오른쪽으로 이동',  short: '오른쪽' },
  { id: 'softDrop',  label: '소프트 드롭',      short: '소프트 드롭' },
  { id: 'hardDrop',  label: '하드 드롭',        short: '하드 드롭' },
  { id: 'rotateCW',  label: '시계 방향 회전',   short: '시계 회전' },
  { id: 'rotateCCW', label: '반시계 방향 회전', short: '반시계 회전' },
  { id: 'rotate180', label: '180° 회전',        short: '180° 회전' },
  { id: 'hold',      label: '홀드',             short: '홀드' },
  { id: 'pause',     label: '일시정지',         short: '일시정지' },
  { id: 'restart',   label: '다시 시작',        short: '다시 시작' },
  { id: 'undo',      label: '한 수 되돌리기',   short: '되돌리기' },
];

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  softDrop: ['ArrowDown'],
  hardDrop: ['Space'],
  rotateCW: ['ArrowUp', 'KeyX'],
  rotateCCW: ['KeyZ', 'ControlLeft'],
  rotate180: ['KeyA'],
  hold: ['KeyC', 'ShiftLeft'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  undo: ['Backspace', 'KeyU'],
};

export const DEFAULT_TIMING = { das: 133, arr: 20, softDrop: 25 };

export const TIMING_FIELDS = [
  {
    id: 'das', label: 'DAS', min: 0, max: 300, step: 1,
    hint: '좌우 키를 누른 뒤 자동 이동이 걸리기까지 기다리는 시간',
  },
  {
    id: 'arr', label: 'ARR', min: 0, max: 100, step: 1,
    hint: '자동 이동 중 한 칸당 간격. 0 이면 벽까지 한 번에',
  },
  {
    id: 'softDrop', label: '소프트 드롭', min: 0, max: 100, step: 1,
    hint: '아래 키를 누르고 있을 때 한 칸당 간격. 0 이면 바닥까지 한 번에',
  },
];

// Key codes whose e.code is unreadable on its own.
const KEY_LABELS = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'Space', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Num Enter',
  Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps',
  ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
  ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
  AltLeft: 'L Alt', AltRight: 'R Alt',
  MetaLeft: 'L Cmd', MetaRight: 'R Cmd',
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';',
  Quote: "'", BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Backquote: '`',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num −',
  NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Insert: 'Ins', Delete: 'Del',
};

export function keyLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export function defaultSettings() {
  return {
    bindings: Object.fromEntries(ACTIONS.map(({ id }) => [id, [...DEFAULT_BINDINGS[id]]])),
    timing: { ...DEFAULT_TIMING },
  };
}

function clamp(value, { min, max }, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// Reads whatever is in storage but trusts none of it: unknown actions are
// dropped, key lists are de-duplicated, timings are clamped to their sliders.
export function loadSettings() {
  const settings = defaultSettings();

  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return settings;
  }
  if (!raw) return settings;

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return settings;
  }
  if (!stored || typeof stored !== 'object') return settings;

  if (stored.bindings && typeof stored.bindings === 'object') {
    for (const { id } of ACTIONS) {
      const codes = stored.bindings[id];
      if (!Array.isArray(codes)) continue;
      const clean = [...new Set(codes.filter((c) => typeof c === 'string' && c))];
      settings.bindings[id] = clean;
    }
  }

  if (stored.timing && typeof stored.timing === 'object') {
    for (const field of TIMING_FIELDS) {
      settings.timing[field.id] = clamp(stored.timing[field.id], field, DEFAULT_TIMING[field.id]);
    }
  }

  return settings;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

// A key drives exactly one action, so binding it anywhere clears it everywhere
// else. Returns the action it was taken from, if any, so the UI can say so.
export function assignKey(settings, actionId, slot, code) {
  let stolenFrom = null;

  for (const { id } of ACTIONS) {
    const codes = settings.bindings[id];
    const at = codes.indexOf(code);
    if (at === -1) continue;
    if (id === actionId && at === slot) continue;
    codes.splice(at, 1);
    stolenFrom = id;
  }

  const target = settings.bindings[actionId];
  if (slot >= 0 && slot < target.length) target[slot] = code;
  else target.push(code);

  return stolenFrom === actionId ? null : stolenFrom;
}

export function unassignKey(settings, actionId, slot) {
  settings.bindings[actionId].splice(slot, 1);
}

export function bindingLookup(bindings) {
  const lookup = {};
  for (const { id } of ACTIONS) {
    for (const code of bindings[id] || []) lookup[code] = id;
  }
  return lookup;
}
