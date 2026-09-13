// What the player has attempted, solved and scored, kept in localStorage.
// The menu counts from it and review mode orders by it.
//
// Storage can be unavailable (private windows, blocked site data), so every
// call degrades to "no progress yet" rather than throwing.

const STORAGE_KEY = 'tetris-puzzle:progress:v2';

const EMPTY = { attempts: 0, solved: false, bestPercent: null, bestMoves: null, lastAt: 0 };

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadProgress() {
  return read();
}

export function entryFor(id) {
  const entry = read()[id];
  return entry && typeof entry === 'object' ? { ...EMPTY, ...entry } : { ...EMPTY };
}

export function isSolved(id) {
  return entryFor(id).solved === true;
}

export function recordAttempt(id) {
  const data = read();
  const entry = { ...EMPTY, ...(data[id] || {}) };
  entry.attempts += 1;
  entry.lastAt = Date.now();
  data[id] = entry;
  write(data);
  return entry;
}

// One finished attempt. `solved` means a lesson was completed or a puzzle was
// played perfectly; `percent` is what the attempt scored out of the best line.
export function recordResult(id, { solved = false, percent = null, moves = null } = {}) {
  const data = read();
  const entry = { ...EMPTY, ...(data[id] || {}) };
  entry.lastAt = Date.now();
  if (solved) entry.solved = true;
  if (percent !== null && (entry.bestPercent === null || percent > entry.bestPercent)) {
    entry.bestPercent = percent;
  }
  if (moves !== null && (entry.bestMoves === null || moves < entry.bestMoves)) {
    entry.bestMoves = moves;
  }
  data[id] = entry;
  write(data);
  return entry;
}

export function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
