// Canvas drawing for the playfield and the hold / next previews.

import { COLORS, SHAPES } from './pieces.js';
import { COLS, ROWS, cellsOf } from './engine.js';

const GRID_LINE = 'rgba(255, 255, 255, 0.05)';
const WELL_BG = '#0c1020';

// Sizes the backing store to the element's CSS box times the device pixel
// ratio, so the board stays sharp on retina displays and after a resize.
function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function drawCell(ctx, x, y, size, color, opts = {}) {
  const { ghost = false, inset = 1 } = opts;
  const px = x * size + inset;
  const py = y * size + inset;
  const s = size - inset * 2;

  if (ghost) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
    ctx.globalAlpha = 1;
    return;
  }

  ctx.fillStyle = color;
  ctx.fillRect(px, py, s, s);

  // A light top-left edge and dark bottom-right edge read as a bevel without
  // needing gradients per cell.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(px, py, s, Math.max(2, s * 0.12));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(px, py + s - Math.max(2, s * 0.12), s, Math.max(2, s * 0.12));
}

export class Renderer {
  constructor(boardCanvas, holdCanvas, nextCanvas) {
    this.board = boardCanvas;
    this.holdCanvas = holdCanvas;
    this.nextCanvas = nextCanvas;
    this.flashRows = [];
    this.flashUntil = 0;
    this.marker = null;
    // Where the well was last drawn, in CSS pixels, so the page can hang a
    // speech bubble off a particular square.
    this.layout = { size: 0, offsetX: 0, offsetY: 0 };
  }

  flash(rows) {
    this.flashRows = rows;
    this.flashUntil = performance.now() + 140;
  }

  // Puzzle verdicts: a tick or a cross drawn over the squares just played.
  // It outlives the placement on purpose — after a wrong move the board has
  // already rewound, and the mark is what shows where the move went.
  mark(cells, ok, ms = 2400) {
    this.marker = { cells, ok, until: performance.now() + ms };
  }

  clearMark() {
    this.marker = null;
  }

  cellRect(x, y) {
    const { size, offsetX, offsetY } = this.layout;
    return { left: offsetX + x * size, top: offsetY + y * size, size };
  }

  draw(game) {
    this.drawBoard(game);
    this.drawHold(game);
    this.drawNext(game);
  }

  drawBoard(game) {
    const { ctx, width, height } = fitCanvas(this.board);
    const size = Math.min(width / COLS, height / ROWS);
    const offsetX = (width - size * COLS) / 2;
    const offsetY = (height - size * ROWS) / 2;

    this.layout = { size, offsetX, offsetY };

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(offsetX, offsetY);

    ctx.fillStyle = WELL_BG;
    ctx.fillRect(0, 0, size * COLS, size * ROWS);

    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(Math.round(x * size) + 0.5, 0);
      ctx.lineTo(Math.round(x * size) + 0.5, size * ROWS);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, Math.round(y * size) + 0.5);
      ctx.lineTo(size * COLS, Math.round(y * size) + 0.5);
    }
    ctx.stroke();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = game.grid[y][x];
        if (cell) drawCell(ctx, x, y, size, COLORS[cell]);
      }
    }

    if (game.current && game.state !== 'over') {
      const ghostY = game.ghostY();
      if (ghostY !== game.current.y) {
        const ghost = { ...game.current, y: ghostY };
        for (const [x, y] of cellsOf(ghost)) {
          if (y >= 0) drawCell(ctx, x, y, size, COLORS[ghost.type], { ghost: true });
        }
      }
      for (const [x, y] of cellsOf(game.current)) {
        if (y >= 0) drawCell(ctx, x, y, size, COLORS[game.current.type]);
      }
    }

    if (performance.now() < this.flashUntil) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      for (const y of this.flashRows) ctx.fillRect(0, y * size, size * COLS, size);
    }

    this.drawMarker(ctx, size);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size * COLS - 2, size * ROWS - 2);
    ctx.restore();
  }

  drawMarker(ctx, size) {
    if (!this.marker) return;
    if (performance.now() >= this.marker.until) {
      this.marker = null;
      return;
    }

    const { cells, ok } = this.marker;
    const stroke = ok ? '#4ade80' : '#f87171';
    const fill = ok ? 'rgba(74, 222, 128, 0.22)' : 'rgba(248, 113, 113, 0.24)';

    ctx.save();
    for (const [x, y] of cells) {
      if (y < 0) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(x * size, y * size, size, size);
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    for (const [x, y] of cells) {
      if (y < 0) continue;
      ctx.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
    }

    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const cx = ((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * size;
    const cy = ((Math.min(...ys) + Math.max(...ys)) / 2 + 0.5) * size;

    ctx.font = `700 ${Math.round(size * 1.3)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(7, 9, 18, 0.85)';
    ctx.strokeText(ok ? '✓' : '✕', cx, cy);
    ctx.fillStyle = stroke;
    ctx.fillText(ok ? '✓' : '✕', cx, cy);
    ctx.restore();
  }

  // Draws one tetromino centred in a small preview canvas.
  drawPreview(canvas, type, dim = false) {
    const { ctx, width, height } = fitCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    if (!type) return;

    const cells = SHAPES[type][0];
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

    const size = Math.min(width / (w + 0.6), height / (h + 0.6));
    const offsetX = (width - w * size) / 2 - minX * size;
    const offsetY = (height - h * size) / 2 - minY * size;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.globalAlpha = dim ? 0.35 : 1;
    for (const [x, y] of cells) drawCell(ctx, x, y, size, COLORS[type]);
    ctx.restore();
  }

  drawHold(game) {
    this.drawPreview(this.holdCanvas, game.hold, game.holdUsed);
  }

  drawNext(game) {
    const { ctx, width, height } = fitCanvas(this.nextCanvas);
    ctx.clearRect(0, 0, width, height);

    const slots = Math.min(5, game.queue.length);
    // The panel is a tall column on desktop and a short strip on phones;
    // stack the queue along whichever axis is longer.
    const horizontal = width > height;
    const slotW = horizontal ? width / slots : width;
    const slotH = horizontal ? height : height / 5;

    for (let i = 0; i < slots; i++) {
      const type = game.queue[i];
      const cells = SHAPES[type][0];
      const xs = cells.map((c) => c[0]);
      const ys = cells.map((c) => c[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;

      const scale = i === 0 ? 1 : 0.82;
      // Widest spawn shape is 4 cells (I), tallest is 2; the extra margin
      // keeps neighbouring previews from touching.
      const size = Math.min(slotW / 4.5, slotH / 2.7) * scale;
      const offsetX = (horizontal ? i * slotW : 0) + (slotW - w * size) / 2 - minX * size;
      const offsetY = (horizontal ? 0 : i * slotH) + (slotH - h * size) / 2 - minY * size;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.globalAlpha = i === 0 ? 1 : 0.62;
      for (const [x, y] of cells) drawCell(ctx, x, y, size, COLORS[type]);
      ctx.restore();
    }
  }
}
