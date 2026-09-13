// What the player has attempted and solved, kept in localStorage.
// Review mode is built on this, and the menu uses it for its counters.
// Storage can be unavailable, so every call degrades to "no progress yet"
// rather than throwing.

const STORAGE_KEY = 'tetris-puzzle:progress:v1';

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
  return entry && typeof entry === 'object'
    ? { attempts: 0, solved: false, bestMoves: null, lastAt: 0, ...entry }
    : { attempts: 0, solved: false, bestMoves: null, lastAt: 0 };
}

export function isSolved(id) {
  return entryFor(id).solved === true;
}

export function recordAttempt(id) {
  const data = read();
  const entry = { attempts: 0, solved: false, bestMoves: null, lastAt: 0, ...(data[id] || {}) };
  entry.attempts += 1;
  entry.lastAt = Date.now();
  data[id] = entry;
  write(data);
  return entry;
}

export function recordSolved(id, moves) {
  const data = read();
  const entry = { attempts: 0, solved: false, bestMoves: null, lastAt: 0, ...(data[id] || {}) };
  entry.solved = true;
  entry.lastAt = Date.now();
  // "Best" is the fewest placements it took, retries included.
  if (entry.bestMoves === null || moves < entry.bestMoves) entry.bestMoves = moves;
  data[id] = entry;
  write(data);
  return entry;
}

export function attemptedIds() {
  const data = read();
  return Object.keys(data).filter((id) => (data[id]?.attempts || 0) > 0);
}

// Review order: anything still unsolved first, then least recently seen.
export function reviewOrder(puzzles) {
  const data = read();
  return puzzles
    .filter((p) => (data[p.id]?.attempts || 0) > 0)
    .sort((a, b) => {
      const ea = data[a.id] || {};
      const eb = data[b.id] || {};
      if (!!ea.solved !== !!eb.solved) return ea.solved ? 1 : -1;
      return (ea.lastAt || 0) - (eb.lastAt || 0);
    });
}

export function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
